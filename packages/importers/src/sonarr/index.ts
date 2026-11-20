// SPDX-License-Identifier: AGPL-3.0-only
// @highsea-tv/importers/sonarr: the one-time Sonarr importer (Phase 5 C1, ADR 0041's 2026-11-19
// section), beside Radarr's and in its shape. It reads Sonarr's API v3 with GET requests only and
// emulates nothing (ADR 0011).
//
//   const sonarr = createSonarrImporter(deps)
//   await sonarr.connect(conn)                 → { version, series }   (a test of the URL and key)
//   await sonarr.preview(conn, mappings)       → what comes across, with the profile mapping
//   sonarr.run(conn, { pathMappings, profiles })  → the job starts; progress on `migration.updated`
//   sonarr.status()                            → the last or current run
//
// What comes across: each series as a show, by TMDB id (Sonarr v4 keeps it) or found through TMDB's
// Find by TheTVDB's id (https://developer.themoviedb.org/reference/find-by-id), as the library
// import finds shows; its monitoring, each season's and each episode's; its quality profile mapped
// as Radarr's are; its tags; its files, attached where they are through the path mappings and
// probed again by highsea. Nothing on disk is moved, renamed or deleted, and nothing in Sonarr
// changes.
//
// What doesn't: Sonarr's download history and blocklist, its indexers and download clients (highsea
// has its own), its naming format, its "monitor new seasons" choice (highsea monitors a new
// episode when its season is), and its language profiles (Sonarr v3's; v4 dropped them). Daily and
// anime series come across as shows; their episodes are matched by Sonarr's season and episode
// numbers, and the ones TMDB numbers otherwise are left unmatched, with why.
//
// The job is safe to repeat (ADR 0022), and a second run changes only what differs: a show in the
// library is found rather than added again, its monitoring and profile written where they differ,
// a file filed under the same episodes isn't probed again. The connection rides in the job's
// payload sealed, as Radarr's does.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  AppError,
  type Clock,
  type EventBus,
  type Fetch,
  type Logger,
  type Sealer,
} from '@highsea-tv/core'
import type { Db } from '@highsea-tv/db'
import type { JobQueue } from '@highsea-tv/jobs'
import type { Media } from '@highsea-tv/media/shared'
import type { Shows } from '@highsea-tv/media/shows'
import { z } from 'zod'
import { mapPath, type PathMapping, pathMappingSchema, within } from '../shared/paths.ts'
import { IDLE, MAX_FAILURES, type MigrationState, progressRow, step } from '../shared/state.ts'
import {
  createSonarrClient,
  readSonarr,
  type SonarrClient,
  type SonarrConnection,
  type SonarrData,
  type SonarrSeries,
} from './client.ts'
import { nearestToSonarr, profileFromSonarr, sonarrCutoff } from './profiles.ts'

export type { SonarrConnection } from './client.ts'
export { createSonarrClient } from './client.ts'
export {
  asRadarr,
  nearestToSonarr,
  profileFromSonarr,
  sonarrCutoff,
  sonarrQualityName,
} from './profiles.ts'

export const SONARR_IMPORT_JOB = 'importers.sonarr'
export const SONARR_IMPORT_KEY = 'sonarrImport'

/** The preview's choice that brings a Sonarr profile across as it is, in place of a profile id. */
export const COPY_PROFILE = 'copy'

export type SonarrImportState = MigrationState & {
  /** Episode files filed in this run. */
  files: number
  /** Episodes and files that couldn't be placed in shows that did come across, with why. */
  unmatched: { name: string; message: string }[]
}

export const SONARR_IDLE: SonarrImportState = { ...IDLE, files: 0, unmatched: [] }

export type SonarrDeps = {
  db: Db
  jobs: JobQueue
  clock: Clock
  events: EventBus
  logger: Logger
  /** Sonarr is reached through the fetch seam (ADR 0029). */
  fetch: Fetch
  sealer: Sealer
  media: Pick<Media, 'profiles' | 'customFormats' | 'rootFolders'>
  shows: Pick<Shows, 'migrate'>
  /** Folders a root folder may be added in: the data root. */
  allowedRoots(): string[]
}

export type SonarrRootFolderPlan = {
  /** Sonarr's path. */
  sonarr: string
  /** Through the path mappings. */
  path: string
  /** `root-folder`: one of highsea's Shows folders; `add`: added when the import runs; `outside`. */
  status: 'root-folder' | 'add' | 'outside'
  series: number
}

export type SonarrPreview = {
  version: string
  series: {
    total: number
    withFiles: number
    inLibrary: number
    ready: number
    /** Episodes Sonarr lists, and how many have files, across every series. */
    episodes: number
    files: number
  }
  profiles: {
    sonarrId: number
    name: string
    cutoff: string
    series: number
    /** highsea's profiles, nearest first; `copy`, last, brings Sonarr's across as it is. */
    options: string[]
  }[]
  rootFolders: SonarrRootFolderPlan[]
  tags: number
  /** Series Sonarr numbers by air date or absolute number: matched by season and episode. */
  numbering: { daily: number; anime: number }
  /** Series that can't come across as things stand, the first 200. */
  problems: { title: string; message: string }[]
}

export type SonarrRunOptions = {
  pathMappings: PathMapping[]
  /** Sonarr's profile id → highsea's, or `copy`; one left out takes the nearest. */
  profiles?: Record<string, string>
}

const Payload = z.object({
  connection: z.string(),
  pathMappings: z.array(pathMappingSchema),
  profiles: z.record(z.string(), z.string()),
})

const MAX_PROBLEMS = 200

const nameOf = (s: SonarrSeries) =>
  s.year && !s.title.endsWith(`(${s.year})`) ? `${s.title} (${s.year})` : s.title

const outsideMessage = (folder: string) =>
  `${folder} isn’t in one of highsea’s Shows root folders or the data folder. Add a path mapping.`

export function createSonarrImporter(deps: SonarrDeps) {
  const { jobs, clock, sealer } = deps
  const log = deps.logger.child('importers')
  const row = progressRow(deps, SONARR_IMPORT_KEY, SONARR_IDLE)
  const clientFor = (conn: SonarrConnection) => createSonarrClient(deps.fetch, conn)

  const sonarrRootOf = (s: SonarrSeries) =>
    s.rootFolderPath || s.path.replace(/\/+$/, '').replace(/\/[^/]*$/, '') || '/'

  /** The Shows root folder a series' folder is in, or the Sonarr root it would add. */
  function rootFor(
    folder: string,
    sonarrRoot: string,
    mappings: readonly PathMapping[],
  ): { status: SonarrRootFolderPlan['status']; root: string } {
    const all = deps.media.rootFolders.list()
    const shows = all.filter((r) => r.kind === 'shows').map((r) => r.path)
    const inShows = shows.find((r) => within(r, folder))
    if (inShows) return { status: 'root-folder', root: inShows }
    const mapped = mapPath(sonarrRoot, mappings)
    const allowed = deps.allowedRoots().some((a) => within(a, mapped))
    // a Movies or Music root folder in the way, either side, can't become a Shows one
    const overlaps = all.some((r) => within(mapped, r.path) || within(r.path, mapped))
    if (allowed && !overlaps && within(mapped, folder) && existsSync(mapped))
      return { status: 'add', root: mapped }
    return { status: 'outside', root: mapped }
  }

  /**
   * TMDB's id for a series: Sonarr's own, else TMDB's Find by TheTVDB's id. `null` with why when
   * there's none.
   */
  async function tmdbIdOf(s: SonarrSeries): Promise<{ id: number } | { problem: string }> {
    if (s.tmdbId && s.tmdbId > 0) return { id: s.tmdbId }
    if (!s.tvdbId) return { problem: 'Sonarr has neither a TMDB nor a TheTVDB id for it.' }
    try {
      const id = await deps.shows.migrate.byTvdb(s.tvdbId)
      return id
        ? { id }
        : { problem: `TMDB has no show for TheTVDB’s id ${s.tvdbId}, and Sonarr has no TMDB id.` }
    } catch (e) {
      return {
        problem: `TMDB couldn’t be asked for TheTVDB’s id ${s.tvdbId}: ${(e as Error).message}`,
      }
    }
  }

  async function connect(conn: SonarrConnection) {
    const client = clientFor(conn)
    const status = await client.status()
    if (status.appName && status.appName !== 'Sonarr')
      throw new AppError('invalid', `That address is ${status.appName}, not Sonarr.`, {
        field: 'url',
        reason: 'not-sonarr',
      })
    const series = await client.series()
    return { version: status.version, series: series.length }
  }

  async function preview(
    conn: SonarrConnection,
    pathMappings: readonly PathMapping[],
  ): Promise<SonarrPreview> {
    const client = clientFor(conn)
    const data = await readSonarr(client)
    const ours = deps.media.profiles.list()
    const roots = new Map<string, SonarrRootFolderPlan>()
    const problems: SonarrPreview['problems'] = []
    const ids = new Map<number, number>()
    const unfound = new Map<number, string>()
    for (const s of data.series) {
      const found = await tmdbIdOf(s)
      if ('id' in found) ids.set(s.id, found.id)
      else unfound.set(s.id, found.problem)
    }
    const here = deps.shows.migrate.inLibrary([...ids.values()])
    let ready = 0
    for (const s of data.series) {
      const folder = mapPath(s.path, pathMappings)
      const plan = rootFor(folder, sonarrRootOf(s), pathMappings)
      const key = sonarrRootOf(s)
      const entry = roots.get(key) ?? {
        sonarr: key,
        path: plan.status === 'root-folder' ? plan.root : mapPath(key, pathMappings),
        status: plan.status,
        series: 0,
      }
      entry.series++
      if (plan.status === 'outside') entry.status = 'outside'
      roots.set(key, entry)
      const tmdbId = ids.get(s.id)
      const at = tmdbId ? deps.shows.migrate.folderOf(tmdbId) : null
      let problem: string | null = null
      if (!tmdbId) problem = unfound.get(s.id) ?? 'Sonarr has no TMDB id for it.'
      else if (plan.status === 'outside') problem = outsideMessage(folder)
      else if (at && at !== folder) problem = `The show is already in the library, in ${at}.`
      if (problem) {
        if (problems.length < MAX_PROBLEMS) problems.push({ title: nameOf(s), message: problem })
      } else if (!here.has(tmdbId as number)) ready++
    }
    const stat = (s: SonarrSeries, k: 'episodeFileCount' | 'episodeCount') => s.statistics?.[k] ?? 0
    return {
      version: data.status.version,
      series: {
        total: data.series.length,
        withFiles: data.series.filter((s) => stat(s, 'episodeFileCount') > 0).length,
        inLibrary: data.series.filter((s) => here.has(ids.get(s.id) ?? 0)).length,
        ready,
        episodes: data.series.reduce((n, s) => n + stat(s, 'episodeCount'), 0),
        files: data.series.reduce((n, s) => n + stat(s, 'episodeFileCount'), 0),
      },
      profiles: data.profiles.map((p) => ({
        sonarrId: p.id,
        name: p.name,
        cutoff: sonarrCutoff(p).name,
        series: data.series.filter((s) => s.qualityProfileId === p.id).length,
        options: [
          ...nearestToSonarr(p, ours),
          ...(profileFromSonarr(p, deps.media.customFormats()) ? [COPY_PROFILE] : []),
        ],
      })),
      rootFolders: [...roots.values()].sort((a, b) => a.sonarr.localeCompare(b.sonarr)),
      tags: data.tags.length,
      numbering: {
        daily: data.series.filter((s) => s.seriesType === 'daily').length,
        anime: data.series.filter((s) => s.seriesType === 'anime').length,
      },
      problems,
    }
  }

  function run(conn: SonarrConnection, options: SonarrRunOptions): SonarrImportState {
    if (row.status().state === 'running')
      throw new AppError('conflict', 'A Sonarr import is already running.', { reason: 'running' })
    // the connection is checked now, so a typo fails here rather than in the job
    createSonarrClient(deps.fetch, conn)
    const known = new Set(deps.media.profiles.list().map((p) => p.id))
    for (const id of Object.values(options.profiles ?? {}))
      if (id !== COPY_PROFILE && !known.has(id))
        throw new AppError('not-found', 'One of those quality profiles doesn’t exist.', {
          reason: 'unknown-quality-profile',
        })
    const jobId = jobs.enqueue(SONARR_IMPORT_JOB, {
      connection: sealer.seal(JSON.stringify(conn)),
      pathMappings: options.pathMappings,
      profiles: options.profiles ?? {},
    })
    const next: SonarrImportState = {
      ...SONARR_IDLE,
      state: 'running',
      jobId,
      startedAt: clock.now(),
    }
    row.write(next)
    log.info('Sonarr import started')
    return next
  }

  /**
   * Each Sonarr profile the owner chose to bring across as it is, as a highsea profile: its id is
   * `qp-sonarr-{id}`, so a second run finds the first copy. A name another profile has gets
   * " (Sonarr)". One that can't be made falls back to the nearest, and says so.
   */
  function copyProfiles(
    data: SonarrData,
    choices: Record<string, string>,
    failed: (name: string, message: string) => void,
  ): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [sonarrId, choice] of Object.entries(choices)) {
      if (choice !== COPY_PROFILE) continue
      const sonarr = data.profiles.find((x) => String(x.id) === sonarrId)
      const id = `qp-sonarr-${sonarrId}`
      const ours = deps.media.profiles.list()
      if (ours.some((x) => x.id === id)) {
        out[sonarrId] = id
        continue
      }
      const input = sonarr ? profileFromSonarr(sonarr, deps.media.customFormats()) : null
      const fallback = sonarr ? nearestToSonarr(sonarr, ours)[0] : ours[0]?.id
      const fall = (message: string) => {
        failed(`Quality profile ${sonarr?.name ?? sonarrId}`, message)
        if (fallback) out[sonarrId] = fallback
      }
      if (!input) {
        fall('It wants no quality highsea knows, so its shows use the nearest profile.')
        continue
      }
      const taken = (n: string) => ours.some((x) => x.name.toLowerCase() === n.toLowerCase())
      let name = taken(input.name) ? `${input.name} (Sonarr)` : input.name
      for (let n = 2; taken(name); n++) name = `${input.name} (Sonarr ${n})`
      try {
        out[sonarrId] = deps.media.profiles.add({ ...input, name }, { id }).id
      } catch (e) {
        fall(`${(e as Error).message} Its shows use the nearest profile.`)
      }
    }
    return out
  }

  type Outcome = {
    outcome: 'imported' | 'skipped' | { name: string; message: string }
    files: number
    unmatched: { name: string; message: string }[]
  }

  async function importSeries(
    s: SonarrSeries,
    p: z.infer<typeof Payload>,
    data: SonarrData,
    client: SonarrClient,
  ): Promise<Outcome> {
    const name = nameOf(s)
    const fail = (message: string): Outcome => ({
      outcome: { name, message },
      files: 0,
      unmatched: [],
    })
    const found = await tmdbIdOf(s)
    if ('problem' in found) return fail(found.problem)
    const folder = mapPath(s.path, p.pathMappings)
    const plan = rootFor(folder, sonarrRootOf(s), p.pathMappings)
    if (plan.status === 'outside') return fail(outsideMessage(folder))
    const at = deps.shows.migrate.folderOf(found.id)
    if (at && at !== folder) return fail(`The show is already in the library, in ${at}.`)
    if (plan.status === 'add') {
      try {
        deps.media.rootFolders.add({ path: plan.root, kind: 'shows' })
      } catch (e) {
        // two series in one new root folder: the second finds it added
        if ((e as { details?: { reason?: string } }).details?.reason !== 'exists')
          return fail((e as Error).message)
      }
    }
    const profiles = deps.media.profiles.list()
    const sonarrProfile = data.profiles.find((x) => x.id === s.qualityProfileId)
    const chosen =
      p.profiles[String(s.qualityProfileId)] ??
      (sonarrProfile ? nearestToSonarr(sonarrProfile, profiles)[0] : profiles[0]?.id)
    if (!chosen) return fail('Add a quality profile first.')

    const [episodes, episodeFiles] = await Promise.all([
      client.episodes(s.id),
      client.episodeFiles(s.id),
    ])
    const files = episodeFiles.flatMap((f) => {
      const path = f.path ?? (f.relativePath ? join(s.path, f.relativePath) : null)
      if (!path) return []
      return [
        {
          path: mapPath(path, p.pathMappings),
          episodes: episodes
            .filter((e) => e.episodeFileId === f.id)
            .map((e) => ({ season: e.seasonNumber, episode: e.episodeNumber })),
          sceneName: f.sceneName ?? null,
        },
      ]
    })
    const tags = (s.tags ?? [])
      .map((id) => data.tags.find((t) => t.id === id)?.label)
      .filter((l): l is string => !!l)
    const result = await deps.shows.migrate.addInPlace({
      tmdbId: found.id,
      rootFolder: plan.root,
      folder,
      monitored: s.monitored,
      seasonFolders: s.seasonFolder,
      qualityProfileId: chosen,
      seasons: (s.seasons ?? []).map((x) => ({ season: x.seasonNumber, monitored: x.monitored })),
      episodes: episodes.map((e) => ({
        season: e.seasonNumber,
        episode: e.episodeNumber,
        monitored: e.monitored,
      })),
      files,
      tags,
      message: 'Imported from Sonarr, where it was.',
    })
    const unmatched = result.unmatched.map((u) => ({
      name: `${name}: ${u.what}`,
      message: u.message,
    }))
    const touched = result.added || result.changed || result.files.filed > 0
    return { outcome: touched ? 'imported' : 'skipped', files: result.files.filed, unmatched }
  }

  jobs.define({
    type: SONARR_IMPORT_JOB,
    payload: Payload,
    attempts: 3,
    // probing every episode of a large library on a NAS's disks takes a while
    timeoutMs: 12 * 60 * 60 * 1000,
    async run(p, jobCtx) {
      const conn = JSON.parse(sealer.open(p.connection)) as SonarrConnection
      const client = clientFor(conn)
      const data = await readSonarr(client)
      let state = row.read()
      if (state.jobId !== jobCtx.jobId)
        state = { ...SONARR_IDLE, state: 'running', jobId: jobCtx.jobId, startedAt: clock.now() }
      state = { ...state, total: data.series.length }
      row.write(state)

      // the Sonarr profiles brought across as they are, once; a show mapped to one uses the copy
      const copied = copyProfiles(data, p.profiles, (name, message) => {
        state = { ...state, failures: [...state.failures, { name, message }] }
      })
      const mapped = { ...p, profiles: { ...p.profiles, ...copied } }

      for (let i = state.done; i < data.series.length; i++) {
        if (jobCtx.signal.aborted) throw new Error('The Sonarr import was stopped.')
        const s = data.series[i] as SonarrSeries
        let out: Outcome
        try {
          out = await importSeries(s, mapped, data, client)
        } catch (e) {
          out = {
            outcome: { name: nameOf(s), message: (e as Error).message },
            files: 0,
            unmatched: [],
          }
        }
        state = step(state, out.outcome)
        state = {
          ...state,
          files: state.files + out.files,
          unmatched: [...state.unmatched, ...out.unmatched].slice(0, MAX_FAILURES),
        }
        row.write(state)
      }
      row.write({ ...state, state: 'done', finishedAt: clock.now() })
      log.info('Sonarr import finished', {
        imported: state.imported,
        skipped: state.skipped,
        files: state.files,
        unmatched: state.unmatched.length,
        failed: state.failures.length,
      })
    },
  })

  return { connect, preview, run, status: row.status }
}

export type SonarrImporter = ReturnType<typeof createSonarrImporter>

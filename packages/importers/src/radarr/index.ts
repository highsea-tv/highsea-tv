// SPDX-License-Identifier: AGPL-3.0-only
// @highsea/importers/radarr: the one-time Radarr importer (checkpoint 6b, ADR 0041). It reads
// Radarr's API v3 and emulates nothing (ADR 0011).
//
//   const radarr = createRadarrImporter(deps)
//   await radarr.connect(conn)                 → { version, movies }   (a test of the URL and key)
//   await radarr.preview(conn, mappings)       → what comes across, with the profile mapping
//   radarr.run(conn, { pathMappings, profiles, settings })  → the job starts; progress on `migration.updated`
//   radarr.status()                            → the last or current run
//   radarr.grabs()                             → info hash → TMDB id, for the qBittorrent importer
//
// What comes across: movies by TMDB id with monitored, minimum availability and a profile; their
// files, probed again by highsea and adopted in place; tags; the naming format and file settings;
// the blocklist; root folders inside the folders highsea may use. What can't: indexer and
// download-client credentials, which Radarr's API returns as `********` (SchemaBuilder.cs).
//
// The job is safe to repeat (ADR 0022): a movie in the library is found rather than added again, a
// file is recorded by path, a tag link and a blocklist entry are written once. The connection
// rides in the job's payload sealed, as indexer secrets are.
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import {
  AppError,
  type Clock,
  type EventBus,
  type Fetch,
  type Logger,
  type Sealer,
} from '@highsea/core'
import { type Db, readSetting, schema, writeSetting } from '@highsea/db'
import type { Downloads } from '@highsea/downloads'
import type { JobQueue } from '@highsea/jobs'
import type { Movies } from '@highsea/media/movies'
import { checkFormat } from '@highsea/media/naming'
import type { Media } from '@highsea/media/shared'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { mapPath, type PathMapping, pathMappingSchema, within } from '../shared/paths.ts'
import { IDLE, type MigrationState, progressRow, step } from '../shared/state.ts'
import {
  createRadarrClient,
  type RadarrConnection,
  type RadarrData,
  type RadarrMovie,
  readRadarr,
} from './client.ts'
import { nearestProfiles, radarrCutoff } from './profiles.ts'

export { mapPath, type PathMapping, pathMappingSchema } from '../shared/paths.ts'
export { MIGRATION_TOPIC, type MigrationState } from '../shared/state.ts'
export type { RadarrConnection } from './client.ts'
export { createRadarrClient } from './client.ts'
export { highseaCutoff, nearestProfiles, radarrCutoff } from './profiles.ts'

export const RADARR_IMPORT_JOB = 'importers.radarr'
export const RADARR_IMPORT_KEY = 'radarrImport'
/** Radarr's grabs, info hash (lowercase) → TMDB id, kept for the qBittorrent importer. */
export const RADARR_GRABS_KEY = 'radarrGrabs'

export type RadarrDeps = {
  db: Db
  jobs: JobQueue
  clock: Clock
  events: EventBus
  logger: Logger
  /** Radarr is reached through the fetch seam (ADR 0029). */
  fetch: Fetch
  sealer: Sealer
  media: Pick<Media, 'profiles' | 'rootFolders' | 'mediaManagement'>
  movies: Pick<Movies, 'migrate' | 'inLibrary'>
  downloads: Pick<Downloads, 'importBlock'>
  /** Folders a root folder may be added in: the data root. */
  allowedRoots(): string[]
}

export type RootFolderPlan = {
  /** Radarr's path. */
  radarr: string
  /** Through the path mappings. */
  path: string
  /** `root-folder`: one of highsea's; `add`: added when the import runs; `outside`: not usable. */
  status: 'root-folder' | 'add' | 'outside'
  movies: number
}

export type RadarrPreview = {
  version: string
  movies: { total: number; withFiles: number; inLibrary: number; ready: number }
  profiles: {
    radarrId: number
    name: string
    cutoff: string
    movies: number
    /** highsea's profiles, nearest first; the first is the suggestion. */
    options: string[]
  }[]
  rootFolders: RootFolderPlan[]
  tags: number
  blocklist: number
  naming: { rename: boolean; folderFormat: string; fileFormat: string; problem: string | null }
  /** Credentials Radarr's API keeps back: the indexers and download clients they belong to. */
  kept: { indexers: string[]; downloadClients: string[] }
  /** Movies that can't come across as things stand, the first 200. */
  problems: { title: string; message: string }[]
}

export type RadarrRunOptions = {
  pathMappings: PathMapping[]
  /** Radarr's profile id → highsea's; one left out takes the nearest. */
  profiles?: Record<string, string>
  /** Bring the naming format and file settings across. On by default. */
  settings?: boolean
}

const Payload = z.object({
  connection: z.string(),
  pathMappings: z.array(pathMappingSchema),
  profiles: z.record(z.string(), z.string()),
  settings: z.boolean(),
})

/** Radarr's `MovieStatusType` values for minimum availability; `tba` and `preDB` are retired. */
const AVAILABILITY: Record<string, 'announced' | 'in-cinemas' | 'released'> = {
  tba: 'announced',
  announced: 'announced',
  inCinemas: 'in-cinemas',
  released: 'released',
  preDB: 'released',
}

/** Radarr's `ColonReplacementFormat` names, as its API spells them. */
const COLONS = {
  delete: 'delete',
  dash: 'dash',
  spaceDash: 'space-dash',
  spaceDashSpace: 'space-dash-space',
  smart: 'smart',
} as const

const MAX_PROBLEMS = 200

export function createRadarrImporter(deps: RadarrDeps) {
  const { db, jobs, clock, sealer } = deps
  const log = deps.logger.child('importers')
  const row = progressRow(deps, RADARR_IMPORT_KEY, IDLE)
  const clientFor = (conn: RadarrConnection) => createRadarrClient(deps.fetch, conn)

  /** The highsea root folder a movie's folder is in, or the Radarr root it would add. */
  function rootFor(
    folder: string,
    radarrRoot: string,
    mappings: readonly PathMapping[],
  ): { status: RootFolderPlan['status']; root: string } {
    const ours = deps.media.rootFolders.list().map((r) => r.path)
    const inOurs = ours.find((r) => within(r, folder))
    if (inOurs) return { status: 'root-folder', root: inOurs }
    const mapped = mapPath(radarrRoot, mappings)
    const allowed = deps.allowedRoots().some((a) => within(a, mapped))
    const overlaps = ours.some((r) => within(mapped, r))
    if (allowed && !overlaps && within(mapped, folder) && existsSync(mapped))
      return { status: 'add', root: mapped }
    return { status: 'outside', root: mapped }
  }

  const radarrRootOf = (m: RadarrMovie) => m.rootFolderPath || dirname(m.path)

  /** The movie's file in highsea's terms: Radarr's full path, or its folder and relative path. */
  function fileOf(m: RadarrMovie, mappings: readonly PathMapping[]): string | null {
    const f = m.movieFile
    if (!f) return null
    if (f.path) return mapPath(f.path, mappings)
    if (f.relativePath) return mapPath(join(m.path, f.relativePath), mappings)
    return null
  }

  /** Why Radarr's formats can't be used as they are (a token highsea doesn't know), or null. */
  function namingProblem(data: RadarrData): string | null {
    const folder = checkFormat(data.naming.movieFolderFormat ?? '', 'folder')
    if (folder) return `Folder format: ${folder}`
    const file = checkFormat(data.naming.standardMovieFormat ?? '', 'file')
    return file ? `File format: ${file}` : null
  }

  function namingOf(data: RadarrData) {
    const n = data.naming
    return {
      rename: n.renameMovies,
      folderFormat: n.movieFolderFormat,
      fileFormat: n.standardMovieFormat,
      ...(n.colonReplacementFormat && n.colonReplacementFormat in COLONS
        ? { colonReplacement: COLONS[n.colonReplacementFormat as keyof typeof COLONS] }
        : {}),
    }
  }

  function fileSettingsOf(data: RadarrData, mappings: readonly PathMapping[]) {
    const m = data.mediaManagement
    return {
      ...(m.copyUsingHardlinks !== undefined ? { hardlinks: m.copyUsingHardlinks } : {}),
      ...(m.autoUnmonitorPreviouslyDownloadedMovies !== undefined
        ? { unmonitorDeleted: m.autoUnmonitorPreviouslyDownloadedMovies }
        : {}),
      ...(m.setPermissionsLinux !== undefined ? { permissions: m.setPermissionsLinux } : {}),
      ...(m.chmodFolder && /^[0-7]{3}$/.test(m.chmodFolder) ? { chmod: m.chmodFolder } : {}),
      ...(m.recycleBin !== undefined
        ? { recycleBin: m.recycleBin ? mapPath(m.recycleBin, mappings) : '' }
        : {}),
      ...(m.recycleBinCleanupDays !== undefined
        ? { recycleBinDays: Math.min(3650, Math.max(0, m.recycleBinCleanupDays)) }
        : {}),
    }
  }

  async function connect(conn: RadarrConnection) {
    const client = clientFor(conn)
    const status = await client.status()
    if (status.appName && status.appName !== 'Radarr')
      throw new AppError('invalid', `That address is ${status.appName}, not Radarr.`, {
        field: 'url',
        reason: 'not-radarr',
      })
    const movies = await client.movies()
    return { version: status.version, movies: movies.length }
  }

  async function preview(
    conn: RadarrConnection,
    pathMappings: readonly PathMapping[],
  ): Promise<RadarrPreview> {
    const client = clientFor(conn)
    const data = await readRadarr(client)
    const [blocklist, indexers, downloadClients] = await Promise.all([
      client.blocklist(),
      client.indexers().catch(() => []),
      client.downloadClients().catch(() => []),
    ])
    const ours = deps.media.profiles.list()
    const here = deps.movies.inLibrary(data.movies.map((m) => m.tmdbId))
    const roots = new Map<string, RootFolderPlan>()
    const problems: RadarrPreview['problems'] = []
    let ready = 0
    for (const m of data.movies) {
      const folder = mapPath(m.path, pathMappings)
      const plan = rootFor(folder, radarrRootOf(m), pathMappings)
      const key = radarrRootOf(m)
      const entry = roots.get(key) ?? {
        radarr: key,
        path: plan.status === 'root-folder' ? plan.root : mapPath(key, pathMappings),
        status: plan.status,
        movies: 0,
      }
      entry.movies++
      // a root with some movies outside reads as outside: the owner sees what to map
      if (plan.status === 'outside') entry.status = 'outside'
      roots.set(key, entry)
      const problem = !m.tmdbId
        ? 'Radarr has no TMDB id for it.'
        : plan.status === 'outside'
          ? `${folder} isn’t in one of highsea’s root folders or the data folder. Add a path mapping.`
          : null
      if (problem) {
        if (problems.length < MAX_PROBLEMS) problems.push({ title: m.title, message: problem })
      } else if (!here.has(m.tmdbId)) ready++
    }
    return {
      version: data.status.version,
      movies: {
        total: data.movies.length,
        withFiles: data.movies.filter((m) => m.hasFile || m.movieFile).length,
        inLibrary: data.movies.filter((m) => here.has(m.tmdbId)).length,
        ready,
      },
      profiles: data.profiles.map((p) => ({
        radarrId: p.id,
        name: p.name,
        cutoff: radarrCutoff(p).name,
        movies: data.movies.filter((m) => m.qualityProfileId === p.id).length,
        options: nearestProfiles(p, ours),
      })),
      rootFolders: [...roots.values()].sort((a, b) => a.radarr.localeCompare(b.radarr)),
      tags: data.tags.length,
      blocklist: blocklist.length,
      naming: { ...namingOf(data), problem: namingProblem(data) },
      kept: {
        indexers: indexers.map((i) => i.name),
        downloadClients: downloadClients.map((d) => d.name),
      },
      problems,
    }
  }

  function run(conn: RadarrConnection, options: RadarrRunOptions): MigrationState {
    if (row.status().state === 'running')
      throw new AppError('conflict', 'A Radarr import is already running.', { reason: 'running' })
    // the connection is checked now, so a typo fails here rather than in the job
    createRadarrClient(deps.fetch, conn)
    const ids = new Set(deps.media.profiles.list().map((p) => p.id))
    for (const id of Object.values(options.profiles ?? {}))
      if (!ids.has(id))
        throw new AppError('not-found', 'One of those quality profiles doesn’t exist.', {
          reason: 'unknown-quality-profile',
        })
    const jobId = jobs.enqueue(RADARR_IMPORT_JOB, {
      connection: sealer.seal(JSON.stringify(conn)),
      pathMappings: options.pathMappings,
      profiles: options.profiles ?? {},
      settings: options.settings ?? true,
    })
    const next: MigrationState = {
      ...IDLE,
      state: 'running',
      jobId,
      startedAt: clock.now(),
    }
    row.write(next)
    log.info('Radarr import started')
    return next
  }

  /** The library row's id for a TMDB id, or null. */
  const itemOf = (tmdbId: number) =>
    db
      .select({ id: schema.mediaItems.id })
      .from(schema.mediaItems)
      .where(and(eq(schema.mediaItems.type, 'movie'), eq(schema.mediaItems.tmdbId, tmdbId)))
      .get()?.id ?? null

  async function importMovie(
    m: RadarrMovie,
    p: z.infer<typeof Payload>,
    data: RadarrData,
    client: ReturnType<typeof clientFor>,
  ): Promise<'imported' | 'skipped' | { name: string; message: string }> {
    const name = m.year ? `${m.title} (${m.year})` : m.title
    if (!m.tmdbId) return { name, message: 'Radarr has no TMDB id for it.' }
    const folder = mapPath(m.path, p.pathMappings)
    const plan = rootFor(folder, radarrRootOf(m), p.pathMappings)
    if (plan.status === 'outside')
      return {
        name,
        message: `${folder} isn’t in one of highsea’s root folders or the data folder. Add a path mapping.`,
      }
    if (plan.status === 'add') {
      try {
        deps.media.rootFolders.add(plan.root)
      } catch (e) {
        // two movies in one new root folder: the second finds it added
        if ((e as { details?: { reason?: string } }).details?.reason !== 'exists')
          return { name, message: (e as Error).message }
      }
    }
    const profiles = deps.media.profiles.list()
    const radarrProfile = data.profiles.find((x) => x.id === m.qualityProfileId)
    const chosen =
      p.profiles[String(m.qualityProfileId)] ??
      (radarrProfile ? nearestProfiles(radarrProfile, profiles)[0] : profiles[0]?.id)
    if (!chosen) return { name, message: 'Add a quality profile first.' }
    // Radarr's movie list embeds the file; an older one may not, so it's read on its own then
    let withFile = m
    if (m.hasFile && !m.movieFile) {
      const files = await client.movieFiles(m.id).catch(() => [])
      if (files[0]) withFile = { ...m, movieFile: files[0] }
    }
    const file = fileOf(withFile, p.pathMappings)
    const tagLabels = (m.tags ?? [])
      .map((id) => data.tags.find((t) => t.id === id)?.label)
      .filter((l): l is string => !!l)
    const result = await deps.movies.migrate.addInPlace({
      tmdbId: m.tmdbId,
      rootFolder: plan.root,
      folder,
      monitored: m.monitored,
      minimumAvailability: AVAILABILITY[m.minimumAvailability] ?? 'released',
      qualityProfileId: chosen,
      file,
      sourceTitle:
        withFile.movieFile?.sceneName ||
        (withFile.movieFile?.originalFilePath
          ? basename(withFile.movieFile.originalFilePath).replace(/\.[^.]+$/, '')
          : null),
      tags: tagLabels,
      message: 'Imported from Radarr, where it was.',
    })
    if (typeof result.file === 'object')
      return {
        name,
        message: result.added
          ? `Added, without its file: ${result.file.problem}`
          : result.file.problem,
      }
    if (!result.added && result.file !== 'imported') return 'skipped'
    return 'imported'
  }

  /** Radarr's blocklist, for the movies now in the library. Safe to repeat. */
  async function importBlocklist(client: ReturnType<typeof clientFor>, data: RadarrData) {
    const byId = new Map(data.movies.map((m) => [m.id, m.tmdbId]))
    let added = 0
    for (const b of await client.blocklist()) {
      const tmdbId = byId.get(b.movieId)
      const itemId = tmdbId ? itemOf(tmdbId) : null
      if (!itemId) continue
      const date = Date.parse(b.date)
      if (
        deps.downloads.importBlock({
          itemId,
          releaseTitle: b.sourceTitle,
          indexer: b.indexer ?? null,
          quality: b.quality?.quality.name ?? null,
          reason: b.message?.trim() || 'Blocklisted in Radarr.',
          date: Number.isFinite(date) ? date : clock.now(),
        })
      )
        added++
    }
    return added
  }

  /** Radarr's grabs: a torrent's info hash (lowercase) → its movie's TMDB id. */
  async function importGrabs(client: ReturnType<typeof clientFor>, data: RadarrData) {
    const byId = new Map(data.movies.map((m) => [m.id, m.tmdbId]))
    const grabs: Record<string, number> = { ...grabsRow() }
    for (const h of await client.grabs()) {
      const tmdbId = byId.get(h.movieId)
      const hash = h.downloadId?.trim().toLowerCase()
      if (tmdbId && hash && /^[0-9a-f]{40}$/.test(hash)) grabs[hash] = tmdbId
    }
    writeSetting(db, RADARR_GRABS_KEY, grabs, clock.now())
  }

  const grabsRow = () => readSetting<Record<string, number>>(db, RADARR_GRABS_KEY, {})

  jobs.define({
    type: RADARR_IMPORT_JOB,
    payload: Payload,
    attempts: 3,
    // probing every file of a large library on a slow disk takes a while
    timeoutMs: 6 * 60 * 60 * 1000,
    async run(p, jobCtx) {
      const conn = JSON.parse(sealer.open(p.connection)) as RadarrConnection
      const client = clientFor(conn)
      const data = await readRadarr(client)
      let state = row.read()
      if (state.jobId !== jobCtx.jobId)
        state = { ...IDLE, state: 'running', jobId: jobCtx.jobId, startedAt: clock.now() }
      state = { ...state, total: data.movies.length }
      row.write(state)

      if (p.settings && state.done === 0) {
        // formats with a token highsea doesn't know stay highsea's; the file settings still come
        const problem = namingProblem(data)
        const failed = (message: string) => {
          state = {
            ...state,
            failures: [...state.failures, { name: 'Naming and file settings', message }],
          }
        }
        try {
          deps.media.mediaManagement.save({
            ...(problem ? {} : namingOf(data)),
            ...fileSettingsOf(data, p.pathMappings),
          })
        } catch (e) {
          failed((e as Error).message)
        }
        if (problem) failed(`${problem} highsea kept its own naming format.`)
      }

      for (let i = state.done; i < data.movies.length; i++) {
        if (jobCtx.signal.aborted) throw new Error('The Radarr import was stopped.')
        const m = data.movies[i] as RadarrMovie
        let outcome: Awaited<ReturnType<typeof importMovie>>
        try {
          outcome = await importMovie(m, p, data, client)
        } catch (e) {
          outcome = { name: m.title, message: (e as Error).message }
        }
        state = step(state, outcome)
        row.write(state)
      }
      try {
        await importBlocklist(client, data)
        await importGrabs(client, data)
      } catch (e) {
        state = {
          ...state,
          failures: [...state.failures, { name: 'Blocklist', message: (e as Error).message }],
        }
      }
      row.write({ ...state, state: 'done', finishedAt: clock.now() })
      log.info('Radarr import finished', {
        imported: state.imported,
        skipped: state.skipped,
        failed: state.failures.length,
      })
    },
  })

  return { connect, preview, run, status: row.status, grabs: grabsRow }
}

export type RadarrImporter = ReturnType<typeof createRadarrImporter>

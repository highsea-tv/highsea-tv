// SPDX-License-Identifier: AGPL-3.0-only
// @highsea-tv/importers/qbittorrent: the one-time qBittorrent importer (checkpoint 6b, ADR 0041). It
// reads qBittorrent's WebUI API v2 and emulates nothing (ADR 0011).
//
//   const qbt = createQbittorrentImporter(deps)
//   await qbt.connect(conn)              → { version, webApi, torrents }  (refused below 4.5.0)
//   await qbt.preview(conn, mappings)    → what comes across
//   qbt.run(conn, { pathMappings })      → the job starts; progress on `migration.updated`
//   qbt.status()                         → the last or current run, with how many wait paused
//   qbt.resume()                         → resumes them, once the owner has stopped qBittorrent
//
// Each torrent comes across with its save path (through a path mapping), category, ratio and
// seed-time limits, and its uploaded and downloaded totals; categories with their folders. Its
// `.torrent` comes from `torrents/export`. Torrents are added **paused**: qBittorrent keeps running
// until the owner stops it, and two clients must never write the same files. Fast-resume data isn't
// in the API, so the engine checks each torrent's data once, in the background, one after another
// (its check queue), before it seeds. A torrent Radarr grabbed for a movie now in the library is
// linked to it.
//
// The job is safe to repeat (ADR 0022): a torrent already in Downloads is skipped, a category is
// saved by name. The connection rides in the job's payload sealed.

import { posix } from 'node:path'
import {
  AppError,
  type Clock,
  type EventBus,
  type Fetch,
  type Logger,
  type Sealer,
} from '@highsea-tv/core'
import { type Db, schema } from '@highsea-tv/db'
import type { Downloads } from '@highsea-tv/downloads'
import type { JobQueue } from '@highsea-tv/jobs'
import type { Priority, SeedRule, TorrentEngine } from '@highsea-tv/torrent'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { mapPath, type PathMapping, pathMappingSchema } from '../shared/paths.ts'
import { IDLE, type MigrationState, progressRow, step } from '../shared/state.ts'
import { openQbt, type QbtConnection, type QbtFile, type QbtTorrent } from './client.ts'

export { mapPath, type PathMapping, pathMappingSchema } from '../shared/paths.ts'
export { MIGRATION_TOPIC, type MigrationState } from '../shared/state.ts'
export {
  createQbtClient,
  MIN_QBITTORRENT,
  MIN_WEB_API,
  openQbt,
  type QbtConnection,
  versionAtLeast,
} from './client.ts'

export const QBITTORRENT_IMPORT_JOB = 'importers.qbittorrent'
export const QBITTORRENT_IMPORT_KEY = 'qbittorrentImport'

export type QbtState = MigrationState & {
  /** The torrents this importer added, for Resume. */
  torrentIds: string[]
  resumedAt: number | null
}

export type QbtStatus = QbtState & { paused: number; checking: number }

const QBT_IDLE: QbtState = { ...IDLE, torrentIds: [], resumedAt: null }

export type QbittorrentDeps = {
  db: Db
  jobs: JobQueue
  clock: Clock
  events: EventBus
  logger: Logger
  fetch: Fetch
  sealer: Sealer
  downloads: Pick<
    Downloads,
    'adoptTorrent' | 'categories' | 'saveCategory' | 'settings' | 'resumeTorrent'
  >
  engine: Pick<TorrentEngine, 'idOf' | 'has' | 'get'>
  /** A folder inside the folders highsea may write to (the data root, the downloads folder), or it throws. */
  checkFolder(path: string): string
  /** Radarr's grabs from its importer: info hash → TMDB id. */
  grabs(): Record<string, number>
}

export type QbtPreview = {
  version: string
  webApi: string
  torrents: { total: number; ready: number; inDownloads: number; outside: number; linked: number }
  categories: { qbittorrent: string; name: string; folder: string | null }[]
  /** Each save path, where it lands, and whether highsea may use it. */
  savePaths: { qbittorrent: string; path: string; ok: boolean; torrents: number }[]
  /** The first 500 torrents. */
  list: {
    hash: string
    name: string
    size: number
    category: string
    savePath: string
    status: 'ready' | 'in-downloads' | 'outside'
    movie: number | null
  }[]
}

const Payload = z.object({ connection: z.string(), pathMappings: z.array(pathMappingSchema) })

const RESERVED = ['movies', 'manual', 'shows', 'music']
const LIST_MAX = 500

/**
 * highsea's name for a qBittorrent category: letters, digits, spaces, dots, dashes and underscores,
 * up to 40 (a subcategory's `/` becomes `-`); a name highsea keeps for itself gains `-qbittorrent`.
 * No category is `manual`.
 */
export function categoryName(qbt: string): string {
  const cleaned = qbt
    .trim()
    .replace(/[^\p{L}\p{N} ._-]/gu, '-')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .slice(0, 40)
    .trim()
  if (!cleaned) return 'manual'
  return RESERVED.includes(cleaned.toLowerCase()) ? `${cleaned.slice(0, 28)}-qbittorrent` : cleaned
}

/** qBittorrent's file priorities: 0 is skipped, 6 and 7 high, the rest normal. */
export const priorityOf = (p: number): Priority => (p === 0 ? 'skip' : p >= 6 ? 'high' : 'normal')

/** A limit of -2 is qBittorrent's global one (highsea's default rule stands in), -1 none. */
function limit(value: number, fallback: number | null): number | null {
  if (value === -2) return fallback
  if (value < 0) return null
  return value
}

export function createQbittorrentImporter(deps: QbittorrentDeps) {
  const { db, jobs, clock, sealer, engine } = deps
  const log = deps.logger.child('importers')
  const row = progressRow(deps, QBITTORRENT_IMPORT_KEY, QBT_IDLE)

  const mappedSavePath = (t: QbtTorrent, mappings: readonly PathMapping[]) =>
    mapPath(t.save_path, mappings)
  const usable = (path: string) => {
    try {
      deps.checkFolder(path)
      return true
    } catch {
      return false
    }
  }
  const itemOf = (tmdbId: number) =>
    db
      .select({ id: schema.mediaItems.id })
      .from(schema.mediaItems)
      .where(and(eq(schema.mediaItems.type, 'movie'), eq(schema.mediaItems.tmdbId, tmdbId)))
      .get()?.id ?? null
  /** A torrent's movie: Radarr grabbed it, and the movie is in the library. */
  const movieFor = (hash: string, grabs: Record<string, number>) => {
    const tmdbId = grabs[hash.toLowerCase()]
    return tmdbId && itemOf(tmdbId) ? tmdbId : null
  }

  async function connect(conn: QbtConnection) {
    const { client, version, webApi } = await openQbt(deps.fetch, conn)
    return { version, webApi, torrents: (await client.torrents()).length }
  }

  async function preview(
    conn: QbtConnection,
    pathMappings: readonly PathMapping[],
  ): Promise<QbtPreview> {
    const { client, version, webApi } = await openQbt(deps.fetch, conn)
    const [torrents, categories] = await Promise.all([client.torrents(), client.categories()])
    const grabs = deps.grabs()
    const paths = new Map<string, QbtPreview['savePaths'][number]>()
    const counts = { total: torrents.length, ready: 0, inDownloads: 0, outside: 0, linked: 0 }
    const list: QbtPreview['list'] = []
    for (const t of torrents) {
      const path = mappedSavePath(t, pathMappings)
      const ok = usable(path)
      const entry = paths.get(t.save_path) ?? { qbittorrent: t.save_path, path, ok, torrents: 0 }
      entry.torrents++
      paths.set(t.save_path, entry)
      const there = engine.idOf(t.hash) !== null
      const status = there ? 'in-downloads' : ok ? 'ready' : 'outside'
      const movie = movieFor(t.hash, grabs)
      if (status === 'ready') counts.ready++
      else if (status === 'in-downloads') counts.inDownloads++
      else counts.outside++
      if (movie && status === 'ready') counts.linked++
      if (list.length < LIST_MAX)
        list.push({
          hash: t.hash,
          name: t.name,
          size: t.size,
          category: categoryName(t.category),
          savePath: path,
          status,
          movie,
        })
    }
    return {
      version,
      webApi,
      torrents: counts,
      categories: Object.values(categories)
        .map((c) => {
          const folder = c.savePath ? mapPath(c.savePath, pathMappings) : null
          return {
            qbittorrent: c.name,
            name: categoryName(c.name),
            folder: folder && usable(folder) ? folder : null,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
      savePaths: [...paths.values()].sort((a, b) => a.qbittorrent.localeCompare(b.qbittorrent)),
      list,
    }
  }

  function run(conn: QbtConnection, options: { pathMappings: PathMapping[] }): QbtState {
    if (row.status().state === 'running')
      throw new AppError('conflict', 'A qBittorrent import is already running.', {
        reason: 'running',
      })
    const previous = row.read()
    const jobId = jobs.enqueue(QBITTORRENT_IMPORT_JOB, {
      connection: sealer.seal(JSON.stringify(conn)),
      pathMappings: options.pathMappings,
    })
    const next: QbtState = {
      ...QBT_IDLE,
      state: 'running',
      jobId,
      startedAt: clock.now(),
      // a second run keeps the first's torrents, so Resume still covers them
      torrentIds: previous.torrentIds,
    }
    row.write(next)
    log.info('qBittorrent import started')
    return next
  }

  function status(): QbtStatus {
    const s = row.status()
    let paused = 0
    let checking = 0
    for (const id of s.torrentIds) {
      if (!engine.has(id)) continue
      const state = engine.get(id).state
      if (state === 'paused') paused++
      else if (state === 'checking') checking++
    }
    return { ...s, paused, checking }
  }

  /** Resumes the imported torrents still paused: the owner has stopped qBittorrent. */
  function resume(): QbtStatus {
    if (row.status().state === 'running')
      throw new AppError('conflict', 'Wait for the qBittorrent import to finish.', {
        reason: 'running',
      })
    const s = row.read()
    for (const id of s.torrentIds)
      if (engine.has(id) && engine.get(id).state === 'paused') deps.downloads.resumeTorrent(id)
    row.write({ ...s, resumedAt: clock.now() })
    log.info('resumed the torrents brought across from qBittorrent')
    return status()
  }

  /** qBittorrent's categories as highsea's, folders through the mappings. Safe to repeat. */
  function importCategories(
    categories: Record<string, { name: string; savePath: string }>,
    mappings: readonly PathMapping[],
  ) {
    const have = new Set(deps.downloads.categories().map((c) => c.name.toLowerCase()))
    for (const c of Object.values(categories)) {
      const name = categoryName(c.name)
      if (name === 'manual' || have.has(name.toLowerCase())) continue
      const folder = c.savePath ? mapPath(c.savePath, mappings) : null
      try {
        deps.downloads.saveCategory({ name, folder: folder && usable(folder) ? folder : null })
        have.add(name.toLowerCase())
      } catch (e) {
        log.warn('a qBittorrent category couldn’t come across', {
          category: c.name,
          error: (e as Error).message,
        })
      }
    }
  }

  /** Whether any of the torrent's files is a file the library records: then it isn't linked. */
  function sharesLibraryFile(savePath: string, files: readonly QbtFile[]) {
    for (const f of files) {
      const path = posix.join(savePath, f.name)
      if (
        db
          .select({ id: schema.mediaFiles.id })
          .from(schema.mediaFiles)
          .where(eq(schema.mediaFiles.path, path))
          .get()
      )
        return true
    }
    return false
  }

  async function importTorrent(
    t: QbtTorrent,
    p: z.infer<typeof Payload>,
    client: Awaited<ReturnType<typeof openQbt>>['client'],
    grabs: Record<string, number>,
  ): Promise<{ outcome: 'imported' | 'skipped' | { name: string; message: string }; id?: string }> {
    const existing = engine.idOf(t.hash)
    if (existing) return { outcome: 'skipped', id: existing }
    const [props, files, torrent] = await Promise.all([
      client.properties(t.hash),
      client.files(t.hash),
      client.export(t.hash),
    ])
    const savePath = mapPath(props.save_path || t.save_path, p.pathMappings)
    if (!usable(savePath))
      return {
        outcome: {
          name: t.name,
          message: `Its folder, ${savePath}, isn’t inside the data folder or the downloads folder. Add a path mapping.`,
        },
      }
    const defaults = deps.downloads.settings()
    const rule: SeedRule = {
      ratio: limit(t.ratio_limit, defaults.seedRatio),
      minutes: limit(t.seeding_time_limit, defaults.seedMinutes),
      minMinutes: null,
    }
    const ordered = [...files].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    const tmdbId = movieFor(t.hash, grabs)
    // a torrent whose file is the library's own file isn't linked: letting it go after seeding
    // would remove that file
    const itemId = tmdbId && !sharesLibraryFile(savePath, files) ? itemOf(tmdbId) : null
    const category = categoryName(t.category)
    const added = await deps.downloads.adoptTorrent({
      torrent,
      savePath,
      category: deps.downloads.categories().some((c) => c.name === category) ? category : 'manual',
      rule,
      totals: {
        uploaded: props.total_uploaded ?? t.uploaded,
        downloaded: props.total_downloaded ?? t.downloaded,
        seedingMs: (props.seeding_time ?? t.seeding_time ?? 0) * 1000,
      },
      priorities: ordered.map((f) => priorityOf(f.priority)),
      link: itemId ? { itemId, releaseTitle: t.name } : null,
    })
    return { outcome: added.existing ? 'skipped' : 'imported', id: added.id }
  }

  jobs.define({
    type: QBITTORRENT_IMPORT_JOB,
    payload: Payload,
    attempts: 3,
    timeoutMs: 2 * 60 * 60 * 1000,
    async run(p, jobCtx) {
      const conn = JSON.parse(sealer.open(p.connection)) as QbtConnection
      const { client } = await openQbt(deps.fetch, conn)
      const [torrents, categories] = await Promise.all([client.torrents(), client.categories()])
      let state = row.read()
      if (state.jobId !== jobCtx.jobId)
        state = {
          ...QBT_IDLE,
          state: 'running',
          jobId: jobCtx.jobId,
          startedAt: clock.now(),
          torrentIds: state.torrentIds,
        }
      state = { ...state, total: torrents.length }
      row.write(state)
      importCategories(categories, p.pathMappings)
      const grabs = deps.grabs()
      for (let i = state.done; i < torrents.length; i++) {
        if (jobCtx.signal.aborted) throw new Error('The qBittorrent import was stopped.')
        const t = torrents[i] as QbtTorrent
        let result: Awaited<ReturnType<typeof importTorrent>>
        try {
          result = await importTorrent(t, p, client, grabs)
        } catch (e) {
          result = { outcome: { name: t.name, message: (e as Error).message } }
        }
        state = step(state, result.outcome)
        // a torrent skipped because this run added it before a restart is still this importer's
        // to resume; one that was in Downloads before the run isn't
        const ours =
          result.id &&
          (result.outcome === 'imported' ||
            (engine.has(result.id) && engine.get(result.id).addedAt >= (state.startedAt ?? 0)))
        if (result.id && ours && !state.torrentIds.includes(result.id))
          state = { ...state, torrentIds: [...state.torrentIds, result.id] }
        row.write(state)
      }
      row.write({ ...state, state: 'done', finishedAt: clock.now() })
      log.info('qBittorrent import finished', {
        imported: state.imported,
        skipped: state.skipped,
        failed: state.failures.length,
      })
    },
  })

  return { connect, preview, run, status, resume }
}

export type QbittorrentImporter = ReturnType<typeof createQbittorrentImporter>

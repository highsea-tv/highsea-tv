// SPDX-License-Identifier: AGPL-3.0-only
// Downloads (checkpoint 6, ADR 0038): a grab takes a release from the last search by its guid,
// fetches it through its indexer, and hands it to the torrent engine for a movie's version. The
// monitor follows the engine's events; anything slow or that can fail runs as a job, never in the
// event handler (parent plan, Known pitfalls): the import, a refused release's replacement, and
// letting go after seeding. A download that stalls for 2 hours says so; at 3 it is blocklisted and
// replaced (activity-downloads.md). Every job checks what already happened, so it's safe to repeat.
import { isAbsolute, join, resolve } from 'node:path'
import {
  AppError,
  type Clock,
  type EventBus,
  type Fetch,
  iso,
  type Logger,
  newId,
} from '@highsea-tv/core'
import { type Db, readSetting, schema, writeSetting } from '@highsea-tv/db'
import {
  fetchRelease,
  type GrabbedRelease,
  type Indexers,
  type ReleaseView,
} from '@highsea-tv/indexers'
import type { JobQueue } from '@highsea-tv/jobs'
import type {
  EngineEvent,
  EngineState,
  Priority,
  SeedRule,
  TorrentEngine,
  TorrentSnapshot,
  TrackerStatus,
} from '@highsea-tv/torrent'
import { and, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { categoryFolder, createCategories, MANUAL_CATEGORY, MOVIES_CATEGORY } from './categories.ts'
import {
  DEFAULT_DOWNLOAD_CLIENT,
  DOWNLOAD_CLIENT_KEY,
  type DownloadClientSettings,
  downloadClientSchema,
} from './settings.ts'

const { downloads, blocklist } = schema

export const QUEUE_TOPIC = 'queue.updated'
export const TORRENTS_TOPIC = 'torrents.updated'
export const HISTORY_TOPIC = 'history.updated'

export const DOWNLOADS_IMPORT_JOB = 'downloads.import'
export const DOWNLOADS_REPLACE_JOB = 'downloads.replace'
export const DOWNLOADS_SETTLE_JOB = 'downloads.settle'
export const DOWNLOADS_STALL_JOB = 'downloads.stall'

/** No data and no seeds this long is stalled; this long again and a half is replaced. */
export const STALL_MS = 2 * 60 * 60 * 1000
export const REPLACE_MS = 3 * 60 * 60 * 1000
const STALL_CHECK_EVERY_MS = 5 * 60 * 1000
/** The Network widget's sparkline: the last 10 minutes, a sample a second. */
const SPEED_SAMPLES = 600

/** The prototype's `TorrentState`: the engine's states, plus the ones only downloads knows. */
export type QueueState = EngineState | 'stalled' | 'importing' | 'import-blocked'

export type QueueItem = {
  id: string
  torrentId: string | null
  /** The movie's TMDB id, as the API addresses movies; null once it's left the library. */
  movieId: number | null
  title: string
  year: number | null
  release: string
  quality: string | null
  size: number
  progress: number
  downRate: number
  upRate: number
  eta: number | null
  ratio: number
  state: QueueState
  stateReason: string | null
}

export type TorrentFileView = { path: string; size: number; progress: number; priority: Priority }

export type TorrentView = {
  id: string
  name: string
  infoHash: string
  movieId: number | null
  category: string
  /** Added by hand (or from the watch folder), not grabbed for the library. */
  manual: boolean
  size: number
  downloaded: number
  uploaded: number
  progress: number
  downRate: number
  upRate: number
  eta: number | null
  peers: { connected: number; total: number }
  seeds: { connected: number; total: number }
  ratio: number
  state: QueueState
  stateReason: string | null
  indexer: string | null
  quality: string | null
  addedAt: string
  completedAt: string | null
  savePath: string
  private: boolean
  files: TorrentFileView[]
  trackers: Omit<TrackerStatus, 'seeders' | 'leechers'>[]
  seedingRule: SeedRule
}

export type BlocklistEntry = {
  id: string
  movieId: number | null
  title: string | null
  year: number | null
  sourceTitle: string
  indexer: string | null
  quality: string | null
  reason: string
  date: string
}

export type GrabBestOptions = {
  /** When a release must wait until, or null when it may go now. */
  hold?: (release: ReleaseView) => number | null
  onHold?: (until: number, release: ReleaseView) => void
}

/** What downloads records in an item's history; the runtime writes it with the media package. */
export type HistoryEntry = {
  itemId: string
  type: 'grabbed' | 'blocklisted' | 'download-failed'
  sourceTitle: string
  quality: string | null
  indexer: string | null
  message: string | null
  downloadId: string
  data?: Record<string, unknown>
}

export type ImportInput = {
  downloadId: string
  itemId: string
  versionId: string | null
  /** The torrent's content: its file, or its folder. */
  path: string
  releaseTitle: string
  quality: string | null
  indexer: string | null
  /** Import without a blocked file (the queue's Import without the blocked file). */
  force: boolean
}

export type ImportOutcome =
  | { ok: true; transfer: 'hardlink' | 'reflink' | 'copy' | 'move' }
  /** `replace`: the release can never import (a password-protected archive): blocklist it and grab another. */
  | { ok: false; reason: string; replace?: boolean }

export type DownloadsDeps = {
  db: Db
  clock: Clock
  logger: Logger
  events: EventBus
  jobs: JobQueue
  engine: TorrentEngine
  indexers: Pick<Indexers, 'grab' | 'releases'>
  /** A manual torrent's URL is fetched through it. */
  fetch: Fetch
  /** The movie an item is, for its tmdb id and the queue's title. */
  movie(itemId: string): { tmdbId: number; title: string; year: number | null } | null
  /** A new search for a movie's version, when the last one's releases are gone. */
  search(itemId: string, versionId: string | null): Promise<ReleaseView[]>
  /** The setup's downloads folder. */
  downloadsFolder(): string
  history(entry: HistoryEntry): void
  /**
   * A download was blocklisted and given up on (8b's "download failed" notification): stalled, or
   * refused by the import. Not called for a person's own Find another.
   */
  failed?(failure: DownloadFailure): void
  importer(input: ImportInput): Promise<ImportOutcome>
  /**
   * A folder the owner typed (a category's, the watch folder), absolute and inside the folders
   * highsea may write to, or it throws. The runtime passes media's `checkPath` over the data root
   * and the downloads folder; without it, any absolute path passes.
   */
  checkFolder?(path: string): string
}

export type DownloadFailure = {
  downloadId: string
  itemId: string
  releaseTitle: string
  reason: string
  /** Another release was grabbed in its place. */
  replaced: boolean
}

export type GrabInput = {
  itemId: string
  versionId: string | null
  indexerId: string
  guid: string
  /** Grab anyway: take a release the decision engine rejected, or one on the blocklist. */
  force?: boolean
}

export type AddTorrentInput = {
  source: { torrent: Uint8Array } | { magnet: string } | { url: string }
  paused?: boolean
  /** A category for manual torrents (6b); `manual` when none is given. */
  category?: string
}

/** A torrent another client had, brought across by the qBittorrent importer (6b). */
export type AdoptTorrentInput = {
  torrent: Uint8Array
  /** Where its data already is: the other client's save path, through the owner's path mapping. */
  savePath: string
  /** `manual` or one of the owner's categories; a linked torrent may be in any. */
  category: string
  rule: SeedRule
  totals: { uploaded: number; downloaded: number; seedingMs: number }
  priorities?: Priority[]
  /** The library movie it was grabbed for, when the other program's history says so. */
  link?: { itemId: string; releaseTitle: string } | null
}

/** A blocklist entry brought across from Radarr: no guid or hash, so it matches by title. */
export type ImportedBlock = {
  itemId: string
  releaseTitle: string
  indexer: string | null
  quality: string | null
  reason: string
  date: number
}

type Row = typeof downloads.$inferSelect

const ACTIVE = ['downloading', 'importing', 'import-blocked'] as const
/**
 * What's in Activity › Queue: the active states, and completed downloads still seeding. Written as
 * the partial index `downloads_queue` is, constants and all, so SQLite can use it
 * (https://sqlite.org/partialindex.html#queries_using_partial_indexes); with bound parameters it
 * can't, and the queue would scan every download there has ever been.
 */
const IN_QUEUE = sql`state IN ('downloading', 'importing', 'import-blocked') OR (state = 'completed' AND torrent_id IS NOT NULL)`

export function createDownloads(deps: DownloadsDeps) {
  const { db, clock, events, engine } = deps
  const logger = deps.logger.child('downloads')
  const speeds: { at: number; down: number; up: number }[] = []

  const settings = () => readSetting(db, DOWNLOAD_CLIENT_KEY, DEFAULT_DOWNLOAD_CLIENT)
  const row = (id: string) => db.select().from(downloads).where(eq(downloads.id, id)).get()
  const required = (id: string): Row => {
    const r = row(id)
    if (!r) throw new AppError('not-found', 'That download isn’t in the queue any more.')
    return r
  }
  const byTorrent = (torrentId: string) =>
    db.select().from(downloads).where(eq(downloads.torrentId, torrentId)).get()
  const snapshot = (torrentId: string | null): TorrentSnapshot | null =>
    torrentId && engine.has(torrentId) ? engine.get(torrentId) : null
  const checkFolder =
    deps.checkFolder ??
    ((path: string) => {
      if (!isAbsolute(path)) throw new AppError('invalid', `${path} isn’t an absolute path.`)
      return resolve(path)
    })
  const categories = createCategories({
    db,
    clock,
    events,
    engine,
    downloadsFolder: deps.downloadsFolder,
    checkFolder,
    topic: TORRENTS_TOPIC,
  })

  function announce(opts: { queue?: string[]; torrents?: string[]; history?: boolean }) {
    if (opts.queue) events.emit({ topic: QUEUE_TOPIC, ids: opts.queue })
    if (opts.torrents) events.emit({ topic: TORRENTS_TOPIC, ids: opts.torrents })
    if (opts.history) events.emit({ topic: HISTORY_TOPIC })
  }

  function update(id: string, values: Partial<Row>) {
    db.update(downloads)
      .set({ ...values, updatedAt: clock.now() })
      .where(eq(downloads.id, id))
      .run()
  }

  /** The indexer's rule where it has one, field by field, else the global default. */
  function ruleOf(seeding: GrabbedRelease['seeding'] | null): SeedRule {
    const s = settings()
    const own = seeding && (seeding.ratio !== null || seeding.minutes !== null)
    return {
      ratio: own ? seeding.ratio : s.seedRatio,
      minutes: own ? seeding.minutes : s.seedMinutes,
      minMinutes: seeding?.minMinutes ?? null,
    }
  }

  // ------------------------------------------------------------------ the blocklist

  function isBlocked(
    itemId: string,
    release: {
      indexerId?: string | null
      guid?: string | null
      infoHash?: string | null
      title?: string | null
    },
  ): boolean {
    const byHash = release.infoHash ? eq(blocklist.infoHash, release.infoHash) : undefined
    const byGuid =
      release.guid && release.indexerId
        ? and(eq(blocklist.guid, release.guid), eq(blocklist.indexerId, release.indexerId))
        : undefined
    // an entry brought across from Radarr has neither (its API leaves the hash out): it matches by
    // the release's title, as Radarr's own blocklist does for a torrent without a hash
    const byTitle = release.title
      ? and(
          isNull(blocklist.guid),
          isNull(blocklist.infoHash),
          eq(blocklist.releaseTitle, release.title),
        )
      : undefined
    const parts = [byHash, byGuid, byTitle].filter((x) => x !== undefined)
    const match = parts.length > 1 ? or(...parts) : parts[0]
    if (!match) return false
    return !!db
      .select({ id: blocklist.id })
      .from(blocklist)
      .where(and(eq(blocklist.itemId, itemId), match))
      .get()
  }

  function addToBlocklist(d: Row, reason: string) {
    if (isBlocked(d.itemId, d)) return
    db.insert(blocklist)
      .values({
        id: newId('blk'),
        itemId: d.itemId,
        releaseTitle: d.releaseTitle,
        indexerId: d.indexerId,
        indexerName: d.indexerName,
        guid: d.guid,
        infoHash: d.infoHash,
        quality: d.quality,
        reason,
        date: clock.now(),
      })
      .run()
    deps.history({
      itemId: d.itemId,
      type: 'blocklisted',
      sourceTitle: d.releaseTitle,
      quality: d.quality,
      indexer: d.indexerName,
      message: reason,
      downloadId: d.id,
    })
  }

  // ------------------------------------------------------------------ grabbing

  async function grab(input: GrabInput): Promise<QueueItem> {
    const movie = deps.movie(input.itemId)
    if (!movie) throw new AppError('not-found', 'That movie isn’t in the library.')
    const view = deps.indexers
      .releases(movie.tmdbId)
      .find((r) => r.indexerId === input.indexerId && r.guid === input.guid)
    if (!view)
      throw new AppError(
        'not-found',
        'That release is no longer in the search results. Search again.',
      )
    if (!input.force && !view.approved) {
      const why = view.reasons.find((r) => r.kind === 'rejected')?.message
      throw new AppError(
        'conflict',
        `That release was rejected${why ? `: ${why}` : ''}. Grab anyway takes it.`,
      )
    }
    if (!input.force && isBlocked(input.itemId, { ...input, title: view.title }))
      throw new AppError('conflict', 'That release is blocklisted. Grab anyway takes it.')
    const got = await deps.indexers.grab({
      tmdbId: movie.tmdbId,
      indexerId: input.indexerId,
      guid: input.guid,
    })
    const added = await engine.add({
      source: got.source,
      savePath: join(deps.downloadsFolder(), MOVIES_CATEGORY),
      category: MOVIES_CATEGORY,
      rule: ruleOf(got.seeding),
    })
    if (added.existing)
      throw new AppError(
        'conflict',
        byTorrent(added.id)
          ? 'That release is already downloading.'
          : 'That torrent is already in Downloads.',
      )
    if (!input.force && isBlocked(input.itemId, { infoHash: added.infoHash })) {
      await engine.remove(added.id, true)
      throw new AppError('conflict', 'That release is blocklisted. Grab anyway takes it.')
    }
    const now = clock.now()
    const id = newId('dl')
    const rejected = !view.approved
    db.insert(downloads)
      .values({
        id,
        torrentId: added.id,
        itemId: input.itemId,
        versionId: input.versionId,
        indexerId: input.indexerId,
        indexerName: view.indexer,
        guid: input.guid,
        infoHash: added.infoHash,
        releaseTitle: view.title,
        quality: view.quality,
        size: view.size ?? engine.get(added.id).size,
        release: { ...got.release, grabbedAnyway: rejected },
        state: 'downloading',
        stateReason: null,
        progressAt: now,
        grabbedAt: now,
        updatedAt: now,
      })
      .run()
    deps.history({
      itemId: input.itemId,
      type: 'grabbed',
      sourceTitle: view.title,
      quality: view.quality,
      indexer: view.indexer,
      message: rejected
        ? `Grabbed anyway; the decision engine rejected it: ${
            view.reasons.find((r) => r.kind === 'rejected')?.message ?? 'no reason given'
          }`
        : null,
      downloadId: id,
      data: { guid: input.guid, infoHash: added.infoHash, versionId: input.versionId },
    })
    logger.info('grabbed a release', { download: id, release: view.title })
    announce({ queue: [id], torrents: [added.id], history: true })
    return queueItem(required(id))
  }

  /**
   * Grabs the best approved release left for a version: from the last search, else a new one.
   * With `hold` (8c's Wait before grabbing, for RSS and the sweep), the best release may be held
   * back until a time: then nothing is grabbed, not even a lesser release, and `onHold` hears when
   * to look again, as Radarr grabs "the single release which best matches" once the delay is up
   * (https://wiki.servarr.com/radarr/settings#how-delay-profiles-work).
   */
  async function grabBest(
    itemId: string,
    versionId: string | null,
    options: GrabBestOptions = {},
  ): Promise<QueueItem | null> {
    const movie = deps.movie(itemId)
    if (!movie) return null
    // one download per version at a time: a search job that finds something while one runs waits
    const busy = db
      .select({ id: downloads.id, versionId: downloads.versionId })
      .from(downloads)
      .where(
        and(eq(downloads.itemId, itemId), inArray(downloads.state, ['downloading', 'importing'])),
      )
      .all()
      .some((d) => d.versionId === versionId)
    if (busy) return null
    const tried = new Set(
      db
        .select({ indexerId: downloads.indexerId, guid: downloads.guid })
        .from(downloads)
        .where(eq(downloads.itemId, itemId))
        .all()
        .map((d) => `${d.indexerId}|${d.guid}`),
    )
    const usable = (r: ReleaseView) =>
      r.approved && !tried.has(`${r.indexerId}|${r.guid}`) && !isBlocked(itemId, r)
    let candidates = deps.indexers.releases(movie.tmdbId).filter(usable)
    if (!candidates.length) candidates = (await deps.search(itemId, versionId)).filter(usable)
    const best = candidates[0]
    const until = best && options.hold ? options.hold(best) : null
    if (best && until) {
      logger.info('holding a release back', { release: best.title, until })
      options.onHold?.(until, best)
      return null
    }
    for (const c of candidates) {
      try {
        return await grab({ itemId, versionId, indexerId: c.indexerId, guid: c.guid })
      } catch (e) {
        logger.warn('a replacement grab failed; trying the next release', {
          release: c.title,
          error: (e as Error).message,
        })
      }
    }
    return null
  }

  /** Blocklists a download's release, drops its torrent and data, and grabs another. */
  async function replace(
    d: Row,
    reason: string,
    { byPerson = false } = {},
  ): Promise<QueueItem | null> {
    if (d.state === 'failed' || d.state === 'completed') return null
    addToBlocklist(d, reason)
    const torrentId = d.torrentId
    if (torrentId && engine.has(torrentId)) await engine.remove(torrentId, true)
    update(d.id, { state: 'failed', stateReason: reason, torrentId: null })
    announce({ queue: [d.id], torrents: torrentId ? [torrentId] : undefined, history: true })
    const next = await grabBest(d.itemId, d.versionId)
    if (!next)
      deps.history({
        itemId: d.itemId,
        type: 'download-failed',
        sourceTitle: d.releaseTitle,
        quality: d.quality,
        indexer: d.indexerName,
        message: 'No other approved release was found. highsea will try again on the next search.',
        downloadId: d.id,
      })
    if (!byPerson)
      try {
        deps.failed?.({
          downloadId: d.id,
          itemId: d.itemId,
          releaseTitle: d.releaseTitle,
          reason,
          replaced: next !== null,
        })
      } catch (e) {
        logger.warn('a failure listener failed', { download: d.id, error: (e as Error).message })
      }
    return next
  }

  // ------------------------------------------------------------------ views

  function stalled(d: Row, snap: TorrentSnapshot | null, now = clock.now()): boolean {
    if (d.state !== 'downloading' || snap?.state !== 'downloading') return false
    const last = Math.max(d.progressAt, snap.lastDataAt ?? 0)
    return snap.seeds.connected === 0 && now - last >= STALL_MS
  }

  function stateOf(
    d: Row | undefined,
    snap: TorrentSnapshot | null,
  ): {
    state: QueueState
    reason: string | null
  } {
    if (d?.state === 'importing') return { state: 'importing', reason: null }
    if (d?.state === 'import-blocked') return { state: 'import-blocked', reason: d.stateReason }
    if (d?.state === 'failed') return { state: 'error', reason: d.stateReason }
    if (!snap) return { state: 'completed', reason: null }
    if (d && stalled(d, snap))
      return {
        state: 'stalled',
        reason: 'No seeds for 2 hours. highsea will search for another release at 3 hours.',
      }
    return { state: snap.state, reason: snap.message }
  }

  function queueItem(d: Row): QueueItem {
    const snap = snapshot(d.torrentId)
    const movie = deps.movie(d.itemId)
    const { state, reason } = stateOf(d, snap)
    return {
      id: d.id,
      torrentId: snap ? d.torrentId : null,
      movieId: movie?.tmdbId ?? null,
      title: movie?.title ?? d.releaseTitle,
      year: movie?.year ?? null,
      release: d.releaseTitle,
      quality: d.quality,
      size: snap?.size || d.size,
      progress: snap?.progress ?? (d.state === 'completed' ? 1 : 0),
      downRate: snap?.downRate ?? 0,
      upRate: snap?.upRate ?? 0,
      eta: state === 'stalled' ? null : (snap?.eta ?? null),
      ratio: snap?.ratio ?? 0,
      state,
      stateReason: reason,
    }
  }

  function torrentView(snap: TorrentSnapshot): TorrentView {
    const d = byTorrent(snap.id)
    const { state, reason } = stateOf(d?.state === 'completed' ? undefined : d, snap)
    return {
      id: snap.id,
      name: snap.name,
      infoHash: snap.infoHash,
      movieId: d ? (deps.movie(d.itemId)?.tmdbId ?? null) : null,
      category: snap.category,
      manual: snap.manual,
      size: snap.size,
      downloaded: snap.downloaded,
      uploaded: snap.uploaded,
      progress: snap.progress,
      downRate: snap.downRate,
      upRate: snap.upRate,
      eta: state === 'stalled' ? null : snap.eta,
      peers: snap.peers,
      seeds: snap.seeds,
      ratio: snap.ratio,
      state,
      stateReason: reason,
      indexer: d?.indexerName ?? null,
      quality: d?.quality ?? null,
      addedAt: iso(snap.addedAt),
      completedAt: snap.completedAt ? iso(snap.completedAt) : null,
      savePath: snap.savePath,
      private: snap.private,
      files: snap.files.map((f) => ({
        path: f.path,
        size: f.size,
        progress: f.progress,
        priority: f.priority,
      })),
      trackers: snap.trackers.map(({ url, status, peers, message }) => ({
        url,
        status,
        peers,
        message,
      })),
      seedingRule: snap.rule,
    }
  }

  // ------------------------------------------------------------------ jobs

  async function runImport(downloadId: string, force: boolean) {
    const d = row(downloadId)
    if (d?.state !== 'importing') return
    const snap = snapshot(d.torrentId)
    if (!snap) {
      update(d.id, { state: 'import-blocked', stateReason: 'The download’s files are gone.' })
      announce({ queue: [d.id] })
      return
    }
    let outcome: ImportOutcome
    try {
      outcome = await deps.importer({
        downloadId: d.id,
        itemId: d.itemId,
        versionId: d.versionId,
        path: join(snap.savePath, snap.name),
        releaseTitle: d.releaseTitle,
        quality: d.quality,
        indexer: d.indexerName,
        force,
      })
    } catch (e) {
      outcome = { ok: false, reason: (e as Error).message }
    }
    if (!outcome.ok && outcome.replace) {
      logger.warn('a release can’t be imported; replacing it', {
        download: d.id,
        reason: outcome.reason,
      })
      await replace(d, outcome.reason)
      return
    }
    if (!outcome.ok) {
      update(d.id, { state: 'import-blocked', stateReason: outcome.reason })
      logger.warn('an import was blocked', { download: d.id, reason: outcome.reason })
      announce({ queue: [d.id], torrents: [snap.id], history: true })
      return
    }
    update(d.id, {
      state: 'completed',
      stateReason: null,
      importedAt: clock.now(),
      transfer: outcome.transfer,
    })
    announce({ queue: [d.id], torrents: [snap.id], history: true })
    await settle(snap.id)
  }

  /**
   * Lets go of a library torrent when it's done with: as soon as its import moved the files, or
   * once its seeding rules are met, with its data (the library has its own link or copy).
   */
  async function settle(torrentId: string) {
    const d = byTorrent(torrentId)
    if (d?.state !== 'completed' || !engine.has(torrentId)) return
    const snap = engine.get(torrentId)
    const moved = d.transfer === 'move'
    if (!moved && snap.state !== 'completed') return
    await engine.remove(torrentId, true)
    logger.info(moved ? 'removed a moved download' : 'removed a torrent after seeding', {
      download: d.id,
    })
    announce({ queue: [d.id], torrents: [torrentId] })
  }

  async function checkStalls() {
    const now = clock.now()
    const active = db
      .select()
      .from(downloads)
      .where(and(eq(downloads.state, 'downloading'), isNotNull(downloads.torrentId)))
      .all()
    for (const d of active) {
      const snap = snapshot(d.torrentId)
      if (!snap) continue
      // a torrent that isn't trying (queued, paused, checking, or the network down) isn't stalling
      const trying = snap.state === 'downloading'
      const progressed = (snap.lastDataAt ?? 0) > d.progressAt || snap.seeds.connected > 0
      if (!trying || progressed) {
        update(d.id, { progressAt: trying ? Math.max(snap.lastDataAt ?? 0, now) : now })
        continue
      }
      const idle = now - d.progressAt
      if (idle >= REPLACE_MS) {
        logger.info('replacing a stalled download', { download: d.id })
        await replace(d, 'No seeds for 3 hours.')
      } else if (idle >= STALL_MS) announce({ queue: [d.id], torrents: [snap.id] })
    }
  }

  // ------------------------------------------------------------------ the engine's events

  function onEngineEvent(e: EngineEvent) {
    switch (e.type) {
      case 'changed': {
        const ids = e.ids
        const mine = ids.length
          ? db
              .select({ id: downloads.id })
              .from(downloads)
              .where(inArray(downloads.torrentId, ids))
              .all()
              .map((r) => r.id)
          : []
        announce({ torrents: ids, queue: mine.length ? mine : undefined })
        return
      }
      case 'finished': {
        const d = byTorrent(e.id)
        if (d?.state !== 'downloading') return
        update(d.id, { state: 'importing', stateReason: null })
        deps.jobs.enqueue(
          DOWNLOADS_IMPORT_JOB,
          { downloadId: d.id, force: false },
          { dedupeKey: `import:${d.id}` },
        )
        announce({ queue: [d.id] })
        return
      }
      case 'refused':
        // the row may not be written yet when a .torrent is refused as it's added
        deps.jobs.enqueue(
          DOWNLOADS_REPLACE_JOB,
          { torrentId: e.id, reason: e.reason },
          { dedupeKey: `replace:${e.id}` },
        )
        return
      case 'seeded':
        deps.jobs.enqueue(
          DOWNLOADS_SETTLE_JOB,
          { torrentId: e.id },
          { dedupeKey: `settle:${e.id}` },
        )
        return
      default:
        return
    }
  }

  function sample() {
    const s = engine.status()
    speeds.push({ at: clock.now(), down: s.downRate, up: s.upRate })
    if (speeds.length > SPEED_SAMPLES) speeds.shift()
  }

  /** The watch folder inside the folders highsea may write to, and a category it can add to. */
  function checkWatch(s: DownloadClientSettings) {
    const typed = s.watchFolder?.trim()
    let watchFolder: string | null = null
    if (typed)
      try {
        watchFolder = checkFolder(typed)
      } catch {
        throw new AppError(
          'invalid',
          `${typed} isn’t inside the data folder or the downloads folder.`,
          { field: 'watchFolder' },
        )
      }
    if (s.watchCategory === MOVIES_CATEGORY || !categoryFolder(db, '', s.watchCategory))
      throw new AppError('invalid', 'Choose one of your categories, or manual.', {
        field: 'watchCategory',
      })
    return { watchFolder, watchCategory: s.watchCategory }
  }

  function applySettings(s: DownloadClientSettings) {
    engine.setLimits({
      downloadRate: s.downloadRate,
      uploadRate: s.uploadRate,
      maxActive: s.maxActive,
    })
    // 6b: encryption and uTP for new connections, and the router's mapping when the UPnP switch
    // moved
    engine.setEncryption(s.encryption)
    engine.setUtp(s.utp)
    void engine.refreshPortMapping()
  }

  return {
    defineJobs() {
      deps.jobs.define({
        type: DOWNLOADS_IMPORT_JOB,
        payload: z.object({ downloadId: z.string(), force: z.boolean() }),
        attempts: 3,
        timeoutMs: 60 * 60 * 1000,
        run: ({ downloadId, force }) => runImport(downloadId, force),
      })
      deps.jobs.define({
        type: DOWNLOADS_REPLACE_JOB,
        payload: z.object({ torrentId: z.string(), reason: z.string() }),
        attempts: 3,
        async run({ torrentId, reason }) {
          const d = byTorrent(torrentId)
          if (d) await replace(d, reason)
        },
      })
      deps.jobs.define({
        type: DOWNLOADS_SETTLE_JOB,
        payload: z.object({ torrentId: z.string() }),
        attempts: 3,
        run: ({ torrentId }) => settle(torrentId),
      })
      deps.jobs.define({
        type: DOWNLOADS_STALL_JOB,
        payload: z.object({}),
        attempts: 2,
        run: () => checkStalls(),
      })
    },

    schedule() {
      deps.jobs.schedule(DOWNLOADS_STALL_JOB, STALL_CHECK_EVERY_MS)
    },

    /**
     * Applies the saved settings, picks up what a restart left half done, and samples the rates
     * for the Network widget. Returns the stop function.
     */
    start(): () => void {
      applySettings(settings())
      // an import that was running when the server stopped runs again (the job checks itself)
      for (const d of db
        .select({ id: downloads.id })
        .from(downloads)
        .where(eq(downloads.state, 'importing'))
        .all())
        deps.jobs.enqueue(
          DOWNLOADS_IMPORT_JOB,
          { downloadId: d.id, force: false },
          { dedupeKey: `import:${d.id}` },
        )
      // the clock restarts for downloads that were waiting when the server stopped
      db.update(downloads)
        .set({ progressAt: clock.now() })
        .where(and(eq(downloads.state, 'downloading'), lt(downloads.progressAt, clock.now())))
        .run()
      const timer = setInterval(sample, 1000)
      timer.unref?.()
      return () => clearInterval(timer)
    },

    onEngineEvent,
    grab,
    grabBest,
    isBlocked,

    // -------------------------------------------------------------- Activity › Queue

    queue(): QueueItem[] {
      return db
        .select()
        .from(downloads)
        .where(IN_QUEUE)
        .orderBy(desc(downloads.grabbedAt))
        .all()
        .map(queueItem)
    },

    /** An item's downloads in the queue, for A6's In the queue card. */
    queueFor(itemId: string): QueueItem[] {
      return db
        .select()
        .from(downloads)
        .where(and(eq(downloads.itemId, itemId), inArray(downloads.state, [...ACTIVE])))
        .orderBy(desc(downloads.grabbedAt))
        .all()
        .map(queueItem)
    },

    pause(id: string): QueueItem {
      const d = required(id)
      if (d.torrentId && engine.has(d.torrentId)) engine.pause(d.torrentId)
      update(d.id, { progressAt: clock.now() })
      announce({ queue: [id], torrents: d.torrentId ? [d.torrentId] : undefined })
      return queueItem(required(id))
    },

    resume(id: string): QueueItem {
      const d = required(id)
      if (d.torrentId && engine.has(d.torrentId)) engine.resume(d.torrentId)
      update(d.id, { progressAt: clock.now() })
      announce({ queue: [id], torrents: d.torrentId ? [d.torrentId] : undefined })
      return queueItem(required(id))
    },

    /** Remove from the queue: the download stops and its data goes; the movie stays monitored. */
    async remove(id: string, options: { deleteData: boolean; blocklist: boolean }) {
      const d = required(id)
      if (options.blocklist) addToBlocklist(d, 'Removed from the queue and blocklisted.')
      const torrentId = d.torrentId
      if (torrentId && engine.has(torrentId)) await engine.remove(torrentId, options.deleteData)
      if (d.state !== 'completed')
        update(d.id, { state: 'failed', stateReason: 'Removed from the queue.', torrentId: null })
      announce({ queue: [id], torrents: torrentId ? [torrentId] : undefined, history: true })
    },

    /** Import without the blocked file. */
    forceImport(id: string): QueueItem {
      const d = required(id)
      if (d.state !== 'import-blocked')
        throw new AppError('conflict', 'Only a blocked import can be forced.')
      update(d.id, { state: 'importing', stateReason: null })
      deps.jobs.enqueue(
        DOWNLOADS_IMPORT_JOB,
        { downloadId: d.id, force: true },
        { dedupeKey: `import:${d.id}:force` },
      )
      announce({ queue: [id] })
      return queueItem(required(id))
    },

    /** Find another / Replace: blocklist and grab the best remaining release, in one step. */
    async searchAlternative(id: string, given?: string): Promise<{ replaced: QueueItem | null }> {
      const d = required(id)
      if (d.state === 'completed' || d.state === 'failed')
        throw new AppError('conflict', 'That download has already finished.')
      const reason = given?.trim() || d.stateReason || 'Replaced from Activity.'
      return { replaced: await replace(d, reason, { byPerson: true }) }
    },

    // -------------------------------------------------------------- Downloads (A8)

    torrents(): TorrentView[] {
      return engine.list().map(torrentView)
    },

    torrent(id: string): TorrentView {
      return torrentView(engine.get(id))
    },

    /** Add torrent: a magnet, a `.torrent`, or its URL. Manual torrents aren't imported. */
    async add(input: AddTorrentInput): Promise<TorrentView> {
      const category = input.category ?? MANUAL_CATEGORY
      if (category === MOVIES_CATEGORY)
        throw new AppError(
          'invalid',
          'movies is for the library’s grabs. Choose another category.',
          {
            field: 'category',
          },
        )
      const savePath = categoryFolder(db, deps.downloadsFolder(), category)
      if (!savePath)
        throw new AppError('invalid', `There’s no category named ${category}.`, {
          field: 'category',
        })
      let source: { torrent: Uint8Array } | { magnet: string }
      if ('url' in input.source) {
        try {
          source = await fetchRelease(
            {
              fetch: deps.fetch,
              timeoutMs: 30_000,
              now: clock.now,
              beforeRequest: async () => {},
              origin: '',
              cookie: null,
            },
            input.source.url,
          )
        } catch (e) {
          throw new AppError('unavailable', `Couldn’t fetch that torrent: ${(e as Error).message}`)
        }
      } else source = input.source
      const added = await engine.add({
        source,
        savePath,
        category,
        manual: true,
        paused: input.paused,
        rule: ruleOf(null),
      })
      if (added.existing) throw new AppError('conflict', 'That torrent is already in Downloads.')
      announce({ torrents: [added.id] })
      return torrentView(engine.get(added.id))
    },

    /**
     * The qBittorrent importer's add (6b): paused, at the data's own folder, with the totals the
     * other client counted. The engine checks the data that's there once, in the background, since
     * no other client's resume data can be trusted (ADR 0041). Safe to repeat: a torrent already in
     * Downloads is returned with `existing`, and its link is written once.
     */
    async adoptTorrent(input: AdoptTorrentInput): Promise<{ id: string; existing: boolean }> {
      if (input.category !== MANUAL_CATEGORY && input.category !== MOVIES_CATEGORY)
        if (!categoryFolder(db, deps.downloadsFolder(), input.category))
          throw new AppError('invalid', `There’s no category named ${input.category}.`, {
            field: 'category',
          })
      const added = await engine.add({
        source: { torrent: input.torrent },
        savePath: checkFolder(input.savePath),
        category: input.category,
        manual: !input.link,
        paused: true,
        rule: input.rule,
        priorities: input.priorities,
        totals: input.totals,
      })
      if (input.link && !byTorrent(added.id)) {
        const snap = engine.get(added.id)
        const now = clock.now()
        // completed: it's the movie's record of where its file came from, never imported again
        db.insert(downloads)
          .values({
            id: newId('dl'),
            torrentId: added.id,
            itemId: input.link.itemId,
            versionId: null,
            indexerId: null,
            indexerName: null,
            guid: null,
            infoHash: added.infoHash,
            releaseTitle: input.link.releaseTitle,
            quality: null,
            size: snap.size,
            release: { importedFrom: 'qbittorrent' },
            state: 'completed',
            stateReason: null,
            progressAt: now,
            grabbedAt: snap.addedAt,
            importedAt: now,
            updatedAt: now,
          })
          .run()
      }
      announce({ torrents: [added.id] })
      return { id: added.id, existing: added.existing }
    },

    /** Brings one of Radarr's blocklist entries across. Safe to repeat: the same entry is kept once. */
    importBlock(entry: ImportedBlock): boolean {
      const there = db
        .select({ id: blocklist.id })
        .from(blocklist)
        .where(
          and(
            eq(blocklist.itemId, entry.itemId),
            eq(blocklist.releaseTitle, entry.releaseTitle),
            isNull(blocklist.guid),
            isNull(blocklist.infoHash),
          ),
        )
        .get()
      if (there) return false
      db.insert(blocklist)
        .values({
          id: newId('blk'),
          itemId: entry.itemId,
          releaseTitle: entry.releaseTitle,
          indexerId: null,
          indexerName: entry.indexer,
          guid: null,
          infoHash: null,
          quality: entry.quality,
          reason: entry.reason,
          date: entry.date,
        })
        .run()
      announce({ history: true })
      return true
    },

    async deleteTorrent(id: string, deleteData: boolean) {
      engine.get(id)
      const d = byTorrent(id)
      await engine.remove(id, deleteData)
      if (d && d.state !== 'completed')
        update(d.id, { state: 'failed', stateReason: 'Removed from Downloads.', torrentId: null })
      announce({ torrents: [id], queue: d ? [d.id] : undefined })
    },

    pauseTorrent(id: string) {
      engine.pause(id)
      announce({ torrents: [id] })
    },

    resumeTorrent(id: string) {
      engine.resume(id)
      announce({ torrents: [id] })
    },

    /** Pauses downloads; seeding continues (activity-downloads.md). */
    pauseAll() {
      const ids: string[] = []
      for (const t of engine.list())
        if (t.state === 'downloading' || t.state === 'queued' || t.state === 'checking') {
          engine.pause(t.id)
          ids.push(t.id)
        }
      announce({ torrents: ids })
    },

    resumeAll() {
      const ids: string[] = []
      for (const t of engine.list())
        if (t.state === 'paused') {
          engine.resume(t.id)
          ids.push(t.id)
        }
      announce({ torrents: ids })
    },

    setFilePriority(id: string, path: string, priority: Priority): TorrentView {
      const snap = engine.get(id)
      if (!snap.files.some((f) => f.path === path))
        throw new AppError('not-found', 'That file isn’t in the torrent.')
      engine.setPriorities(
        id,
        snap.files.map((f) => (f.path === path ? priority : f.priority)),
      )
      announce({ torrents: [id] })
      return torrentView(engine.get(id))
    },

    limits(): { downloadRate: number; uploadRate: number } {
      const s = settings()
      return { downloadRate: s.downloadRate, uploadRate: s.uploadRate }
    },

    setLimits(patch: { downloadRate?: number; uploadRate?: number }) {
      const next = downloadClientSchema.parse({ ...settings(), ...patch })
      writeSetting(db, DOWNLOAD_CLIENT_KEY, next, clock.now())
      applySettings(next)
      return { downloadRate: next.downloadRate, uploadRate: next.uploadRate }
    },

    // -------------------------------------------------------------- Settings › Download client

    settings,

    async saveSettings(value: DownloadClientSettings): Promise<DownloadClientSettings> {
      const parsed = downloadClientSchema.parse(value)
      const next = { ...parsed, ...checkWatch(parsed) }
      const before = settings()
      writeSetting(db, DOWNLOAD_CLIENT_KEY, next, clock.now())
      applySettings(next)
      if (next.port !== before.port) await engine.setPort(next.port)
      events.emit({ topic: 'settings.updated' })
      return next
    },

    // -------------------------------------------------------------- categories (6b)

    categories: categories.list,
    saveCategory: categories.save,
    removeCategory: categories.remove,
    /** The owner's categories' folders: A17 may browse and import from them. */
    categoryFolders: categories.folders,

    // -------------------------------------------------------------- the blocklist

    blocklist(): BlocklistEntry[] {
      return db
        .select()
        .from(blocklist)
        .orderBy(desc(blocklist.date), desc(blocklist.id))
        .all()
        .map((b) => {
          const movie = deps.movie(b.itemId)
          return {
            id: b.id,
            movieId: movie?.tmdbId ?? null,
            title: movie?.title ?? null,
            year: movie?.year ?? null,
            sourceTitle: b.releaseTitle,
            indexer: b.indexerName,
            quality: b.quality,
            reason: b.reason,
            date: iso(b.date),
          }
        })
    },

    unblock(id: string) {
      const r = db.delete(blocklist).where(eq(blocklist.id, id)).returning().get()
      if (!r) throw new AppError('not-found', 'That release isn’t on the blocklist any more.')
      announce({ history: true })
    },

    // -------------------------------------------------------------- System and the dashboard

    /** The last 10 minutes of total rates, a sample a second. */
    speeds() {
      return speeds.map((s) => ({ at: iso(s.at), down: s.down, up: s.up }))
    },

    issues(): { id: string; level: 'warning' | 'error'; message: string; since: number }[] {
      const out: { id: string; level: 'warning' | 'error'; message: string; since: number }[] = []
      const status = engine.status()
      if (status.problem)
        out.push({
          id: 'torrent-client',
          level: 'error',
          message: `The torrent client can’t accept connections: ${status.problem}`,
          since: clock.now(),
        })
      const blocked = db.select().from(downloads).where(eq(downloads.state, 'import-blocked')).all()
      for (const d of blocked)
        out.push({
          id: `import-blocked-${d.id}`,
          level: 'warning',
          message: `${d.releaseTitle} couldn’t be imported: ${d.stateReason ?? 'no reason given'}`,
          since: d.updatedAt,
        })
      return out
    },
  }
}

export type Downloads = ReturnType<typeof createDownloads>

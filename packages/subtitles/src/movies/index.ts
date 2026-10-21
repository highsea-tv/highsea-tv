// SPDX-License-Identifier: AGPL-3.0-only
// `@highsea/subtitles/movies`: subtitles for the movie library (checkpoint 7a). One service the
// runtime creates once: language profiles, providers and their accounts, the wanted list, search,
// downloads, the import's hooks, the sync (ADR 0044) and the jobs.
import type { ClientSubtitle } from '@highsea/api-contract'
import { schema } from '@highsea/db'
import { and, avg, count, eq, gte, inArray, sql } from 'drizzle-orm'
import { languageList, languageName } from '../shared/languages.ts'
import { createProfiles, profileNotFound } from '../shared/profiles.ts'
import { createSettings } from '../shared/settings.ts'
import { sync as syncInProcess } from '../sync/worker.ts'
import { createAccounts } from './accounts.ts'
import { createBundled } from './bundled.ts'
import { announce, type SubtitlesDeps } from './context.ts'
import { createJobs } from './jobs.ts'
import { createSearch } from './search.ts'
import { createSync, type RunSync } from './sync.ts'
import { createTracks, type TrackView } from './tracks.ts'
import { createWanted } from './wanted.ts'

const { mediaItems, subtitleFiles } = schema

export type SubtitleStats = {
  syncedToday: number
  waiting: number
  avgOffsetMs: number
  avgConfidence: number
}

const startOfUtcDay = (now: number) => now - (now % (24 * 60 * 60_000))

export function createSubtitles(deps: SubtitlesDeps) {
  const { db, clock, events } = deps
  const log = deps.logger.child('subtitles')
  const profiles = createProfiles(deps)
  const settings = createSettings(deps)
  const accounts = createAccounts(deps)
  const tracks = createTracks(deps)
  const wanted = createWanted(deps, tracks, profiles)
  const search = createSearch(deps, { accounts, tracks, wanted, profiles, settings })
  // the runtime runs the engine in its worker pool; without one (tests) it runs here
  const run: RunSync = deps.sync ?? ((task, signal) => syncInProcess(task, { signal }))
  const sync = createSync(deps, { tracks, settings, run })
  // the hooks queue searches and syncs through the jobs, which are made after them
  let queueSearch: (fileId: string) => void = () => {}
  let queueResync: (fileId: string) => void = () => {}
  const bundled = createBundled(deps, tracks, wanted, {
    queueSearch: (fileId) => queueSearch(fileId),
    queueResync: (fileId) => queueResync(fileId),
  })
  const jobs = createJobs(deps, { search, wanted, bundled, settings, sync })
  queueSearch = (fileId) => void jobs.queueSearch(fileId)
  queueResync = (fileId) => void jobs.queueResync(fileId)

  /** Re-sync: queues the sync and answers with the track, waiting for it. */
  function requestSync(trackId: string): TrackView {
    const request = sync.request(trackId)
    jobs.queueSync(request)
    const row = tracks.track(trackId)
    const item = tracks.item(row.itemId)
    if (item) announce(events, [item.tmdbId])
    return tracks.view(row, item?.tmdbId ?? 0)
  }

  /** Use: the download, then its sync. */
  async function download(tmdbId: number, resultId: string): Promise<TrackView> {
    const view = await search.use(tmdbId, resultId)
    if (view.sync.status === 'queued')
      jobs.queueSync({ trackId: view.id, requestedAt: tracks.track(view.id).updatedAt })
    return view
  }

  /** A10's stats card. "Today" is the server's UTC day. */
  function stats(): SubtitleStats {
    const since = startOfUtcDay(clock.now())
    const synced = db
      .select({
        n: count(),
        offset: avg(sql`abs(${subtitleFiles.syncOffsetMs})`),
        confidence: avg(subtitleFiles.syncConfidence),
      })
      .from(subtitleFiles)
      .where(and(eq(subtitleFiles.syncStatus, 'synced'), gte(subtitleFiles.syncedAt, since)))
      .get()
    const waiting =
      db
        .select({ n: count() })
        .from(subtitleFiles)
        .where(inArray(subtitleFiles.syncStatus, ['queued', 'syncing']))
        .get()?.n ?? 0
    return {
      syncedToday: synced?.n ?? 0,
      waiting,
      avgOffsetMs: Math.round(Number(synced?.offset ?? 0)),
      avgConfidence: Number(synced?.confidence ?? 0),
    }
  }

  /** Delete: the sidecar and its row. A bundled track can go; an embedded stream can't (it isn't one). */
  async function remove(trackId: string): Promise<void> {
    const row = tracks.track(trackId)
    const item = tracks.item(row.itemId)
    await tracks.unlink(row.path)
    if (row.format === 'idx') await tracks.unlink(`${row.path.slice(0, -4)}.sub`)
    db.delete(subtitleFiles).where(eq(subtitleFiles.id, trackId)).run()
    if (item) {
      deps.media.history.write({
        itemId: item.id,
        type: 'subtitle-deleted',
        sourceTitle: tracks.nameOf(row.path),
        message: `Deleted ${languageName(row.language)} subtitles`,
        data: { trackId },
      })
      wanted.refresh(item.id)
      announce(events, [item.tmdbId], { history: true })
    }
  }

  const label = (t: { language: string; forced: boolean; hi: boolean }) =>
    languageName(t.language) + (t.forced ? ' (forced)' : t.hi ? ' (SDH)' : '')

  /** The client API's tracks for a file: its own streams, then the sidecars highsea keeps. */
  function clientTracks(fileId: string): ClientSubtitle[] {
    const file = tracks.file(fileId)
    if (!file) return []
    return [
      ...tracks.embedded(file).map((t) => ({
        id: `${fileId}:${t.index}`,
        language: t.language,
        label: label(t),
        forced: t.forced,
        hi: t.hi,
        format: t.format,
        kind: 'embedded' as const,
      })),
      ...tracks.rowsOf(fileId).map((t) => ({
        id: t.id,
        language: t.language,
        label: label(t),
        forced: t.forced,
        hi: t.hi,
        format: t.format,
        kind: t.kind,
      })),
    ]
  }

  /** Bulk: points movies at a profile, then rewrites their rows. */
  function profileChanged(itemIds: string[]) {
    for (const id of itemIds) jobs.queueRefresh(id)
  }

  const profileService = {
    list: profiles.list,
    get: profiles.get,
    find: profiles.find,
    save(input: unknown, id?: string) {
      const saved = profiles.save(input, id)
      // the rules changed for every movie using it
      if (id) jobs.queueRefresh()
      events.emit({ topic: 'subtitles.updated' })
      return saved
    },
    remove(id: string) {
      profiles.remove(id)
      events.emit({ topic: 'subtitles.updated' })
    },
    fromSetup: profiles.fromSetup,
    /** Whether an id names a profile, for the library's checks. */
    exists: (id: string) => profiles.find(id) !== null,
    check(id: string) {
      if (!profiles.find(id)) throw profileNotFound()
    },
  }

  /**
   * Follows the library: a movie changed (its profile, its status, its file) and its rows are
   * rewritten. Events carry TMDB ids, or none for many.
   */
  function follow(): () => void {
    const pending = new Set<NodeJS.Immediate>()
    const off = events.subscribe((e) => {
      if (e.topic !== 'movies.updated') return
      const ids = e.ids
      // after the bus has handed this event to every listener: queueing announces a job, and
      // that event mustn't reach subscribers before the one that caused it
      const later = setImmediate(() => {
        pending.delete(later)
        if (!ids) {
          jobs.queueRefresh()
          return
        }
        const tmdbIds = ids.map(Number).filter(Number.isInteger)
        if (tmdbIds.length === 0) return
        for (const row of db
          .select({ id: mediaItems.id })
          .from(mediaItems)
          .where(and(eq(mediaItems.type, 'movie'), inArray(mediaItems.tmdbId, tmdbIds)))
          .all())
          jobs.queueRefresh(row.id)
      })
      pending.add(later)
    })
    // stopping drops what's still waiting, so nothing reaches a closed database
    return () => {
      off()
      for (const later of pending) clearImmediate(later)
      pending.clear()
    }
  }

  function seed() {
    profiles.seed()
    accounts.seed()
  }

  return {
    seed,
    profiles: profileService,
    settings: {
      get: settings.get,
      save(patch: Parameters<typeof settings.save>[0]) {
        const saved = settings.save(patch)
        events.emit({ topic: 'subtitles.updated' })
        return saved
      },
    },
    providers: {
      list: accounts.list,
      get: accounts.get,
      toggle(id: Parameters<typeof accounts.toggle>[0], enabled: boolean) {
        const view = accounts.toggle(id, enabled)
        events.emit({ topic: 'subtitles.updated' })
        return view
      },
      save(id: Parameters<typeof accounts.save>[0], given: Record<string, string>) {
        const view = accounts.save(id, given)
        events.emit({ topic: 'subtitles.updated' })
        return view
      },
      test: accounts.test,
    },
    languages: languageList,
    stats,
    wanted: (cursor?: string, limit?: number) => wanted.list(cursor, limit),
    searchAllMissing: () => ({ queued: jobs.searchAllMissing() }),
    forItem: (tmdbId: number): TrackView[] => tracks.forItem(tmdbId),
    search: search.searchItem,
    download,
    sync: requestSync,
    setOffset: sync.setOffset,
    delete: remove,
    clientTracks,
    embedded: tracks.embedded,
    profileChanged,
    /** The movie import's hooks: bundled files, the hash, replaced files. */
    hooks: bundled.hooks,
    issues: accounts.issues,
    defineJobs: jobs.define,
    schedule: jobs.schedule,
    /** Boot: the one-time hash job, and following the library. Returns the stop function. */
    start(): () => void {
      jobs.start()
      const stop = follow()
      log.debug('subtitles started')
      return stop
    },
    /** For tests: what's wanted, rewritten now. */
    refreshWanted: wanted.refresh,
    refreshAllWanted: wanted.refreshAll,
    /** For tests and the scale check. */
    wantedRows: wanted.rows,
  }
}

export type Subtitles = ReturnType<typeof createSubtitles>

export { NO_APP_KEY, type ProviderView } from './accounts.ts'
export { trackFromName } from './bundled.ts'
export type { SidecarFs, SubtitlesDeps } from './context.ts'
export { TOPICS } from './context.ts'
export { JOBS, SYNC_TIMEOUT_MS, UPGRADE_EVERY_MS, WANTED_EVERY_MS } from './jobs.ts'
export type { ResultView } from './search.ts'
export { correctionDetail, MAX_NUDGE_MS, type RunSync } from './sync.ts'
export type { EmbeddedTrack, TrackView } from './tracks.ts'
export { BACKOFF_DAYS, type WantedMovie, type WantedPage } from './wanted.ts'

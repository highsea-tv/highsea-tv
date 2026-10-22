// SPDX-License-Identifier: AGPL-3.0-only
// The subtitle jobs (checkpoint 7's plan, "Jobs"). Each is safe to repeat (ADR 0022): a search
// asks only for what's still wanted when it runs, a download finds the row it wrote, and a refresh
// rewrites rows from the current state.
import { schema } from '@highsea-tv/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Settings } from '../shared/settings.ts'
import type { Bundled } from './bundled.ts'
import { DAY, type SubtitlesDeps } from './context.ts'
import type { DownloadPayload, Search } from './search.ts'
import type { Sync } from './sync.ts'
import type { Wanted } from './wanted.ts'

const { mediaFiles, subtitleFiles } = schema

export const JOBS = {
  refresh: 'subtitles.wanted.refresh',
  search: 'subtitles.search',
  download: 'subtitles.download',
  wanted: 'subtitles.wanted',
  upgrade: 'subtitles.upgrade',
  hash: 'subtitles.moviehash',
  sync: 'subtitles.sync',
  resync: 'subtitles.resync',
} as const

/** A sync's limits (checkpoint 7, Where it runs): one at a time, 15 minutes, two tries. */
export const SYNC_TIMEOUT_MS = 15 * 60_000
const SYNC_ATTEMPTS = 2

/** The prototype's interval for the wanted search (`j-subs`). */
export const WANTED_EVERY_MS = 6 * 60 * 60_000
/** Bazarr's default `upgrade_frequency`. */
export const UPGRADE_EVERY_MS = 12 * 60 * 60_000
/** How many files one wanted run searches; the rest wait for the next. */
const WANTED_BATCH = 200

const candidate = z.object({
  result: z.record(z.string(), z.unknown()),
  score: z.number(),
  matches: z.array(z.string()),
  fallback: z.boolean(),
})

const flagsOf = (p: DownloadPayload) => {
  const r = p.candidate.result
  return `${r.language}:${r.forced ? 'f' : ''}${r.hi && !p.candidate.fallback ? 'h' : ''}`
}

export function createJobs(
  deps: SubtitlesDeps,
  {
    search,
    wanted,
    bundled,
    settings,
    sync,
  }: { search: Search; wanted: Wanted; bundled: Bundled; settings: Settings; sync: Sync },
) {
  const { jobs, db, clock } = deps
  const log = deps.logger.child('subtitles')

  const queueSearch = (fileId: string) =>
    jobs.enqueue(JOBS.search, { fileId }, { dedupeKey: `search:${fileId}` })

  const queueDownload = (p: DownloadPayload) =>
    jobs.enqueue(JOBS.download, p, { dedupeKey: `download:${p.fileId}:${flagsOf(p)}` })

  const queueSync = (request: { trackId: string; requestedAt: number }) =>
    jobs.enqueue(JOBS.sync, request, { dedupeKey: `sync:${request.trackId}` })

  /** A replaced file's tracks: rescored and synced again. */
  const queueResync = (fileId: string) =>
    jobs.enqueue(JOBS.resync, { fileId }, { dedupeKey: `resync:${fileId}` })

  /** One movie (by its library id), or every movie when there's none. */
  const queueRefresh = (itemId?: string) =>
    jobs.enqueue(
      JOBS.refresh,
      { itemId: itemId ?? null },
      { dedupeKey: `refresh:${itemId ?? 'all'}` },
    )

  function define() {
    jobs.define({
      type: JOBS.refresh,
      payload: z.object({ itemId: z.string().nullable() }),
      attempts: 3,
      async run({ itemId }, ctx) {
        if (itemId) wanted.refresh(itemId)
        else await wanted.refreshAll(ctx.signal)
      },
    })
    jobs.define({
      type: JOBS.search,
      payload: z.object({ fileId: z.string() }),
      attempts: 2,
      timeoutMs: 5 * 60_000,
      async run({ fileId }, ctx) {
        const picks = await search.searchFile(fileId, ctx.signal)
        for (const p of picks) queueDownload(p)
      },
    })
    jobs.define({
      type: JOBS.download,
      payload: z.object({
        fileId: z.string(),
        candidate,
        chosen: z.boolean(),
        replaces: z.string().nullable(),
      }) as unknown as z.ZodType<DownloadPayload>,
      attempts: 3,
      timeoutMs: 5 * 60_000,
      run: async (p, ctx) => {
        const kept = await search.keep(p, ctx.signal)
        // a rerun finds the row already queued, and the dedupe key holds one sync
        if (kept.syncStatus === 'queued')
          queueSync({ trackId: kept.id, requestedAt: kept.updatedAt })
      },
    })
    jobs.define({
      type: JOBS.sync,
      payload: z.object({ trackId: z.string(), requestedAt: z.number() }),
      concurrency: 1,
      attempts: SYNC_ATTEMPTS,
      timeoutMs: SYNC_TIMEOUT_MS,
      run: (p, ctx) =>
        sync.syncTrack(p, {
          jobId: ctx.jobId,
          signal: ctx.signal,
          attempt: ctx.attempt,
          attempts: SYNC_ATTEMPTS,
        }),
    })
    jobs.define({
      type: JOBS.resync,
      payload: z.object({ fileId: z.string() }),
      attempts: 3,
      async run({ fileId }) {
        for (const request of sync.replaced(fileId)) queueSync(request)
      },
    })
    jobs.define({
      type: JOBS.wanted,
      payload: z.object({}),
      attempts: 1,
      async run() {
        for (const fileId of wanted.dueFiles(WANTED_BATCH)) queueSearch(fileId)
      },
    })
    jobs.define({
      type: JOBS.upgrade,
      payload: z.object({}),
      attempts: 1,
      timeoutMs: 60 * 60_000,
      async run(_, ctx) {
        const files = db
          .selectDistinct({ fileId: subtitleFiles.mediaFileId })
          .from(subtitleFiles)
          .where(
            and(
              eq(subtitleFiles.kind, 'external'),
              eq(subtitleFiles.chosen, false),
              sql`${subtitleFiles.score} < 100`,
              sql`${subtitleFiles.createdAt} >= ${clock.now() - settings.get().upgradeDays * DAY}`,
            ),
          )
          .all()
        for (const { fileId } of files) {
          ctx.signal.throwIfAborted()
          try {
            for (const p of await search.upgradeFile(fileId, ctx.signal)) queueDownload(p)
          } catch (e) {
            log.warn('upgrade search failed', { fileId, error: (e as Error).message })
          }
        }
      },
    })
    jobs.define({
      // files imported before 7a get their moviehash once
      type: JOBS.hash,
      payload: z.object({}),
      attempts: 2,
      timeoutMs: 6 * 60 * 60_000,
      async run(_, ctx) {
        for (;;) {
          ctx.signal.throwIfAborted()
          const batch = db
            .select({ id: mediaFiles.id, path: mediaFiles.path })
            .from(mediaFiles)
            .where(isNull(sql`json_type(${mediaFiles.mediaInfo}, '$.moviehash')`))
            .limit(100)
            .all()
          if (batch.length === 0) return
          for (const f of batch) await bundled.hash(f.id, f.path)
        }
      },
    })
  }

  function schedule() {
    jobs.schedule(JOBS.wanted, WANTED_EVERY_MS)
    jobs.schedule(JOBS.upgrade, UPGRADE_EVERY_MS)
  }

  /** On boot: syncs a stop left waiting, and the one-time hash job when a file still lacks one. */
  function start() {
    for (const request of sync.waiting()) queueSync(request)
    const unhashed = db
      .select({ id: mediaFiles.id })
      .from(mediaFiles)
      .where(isNull(sql`json_type(${mediaFiles.mediaInfo}, '$.moviehash')`))
      .get()
    if (unhashed) jobs.enqueue(JOBS.hash, {}, { dedupeKey: 'moviehash' })
  }

  /** Search all: every file with a wanted row, now. */
  function searchAllMissing(): number {
    const files = wanted.allFiles()
    for (const fileId of files) queueSearch(fileId)
    return files.length
  }

  return {
    define,
    schedule,
    start,
    queueSearch,
    queueDownload,
    queueRefresh,
    queueSync,
    queueResync,
    searchAllMissing,
  }
}

export type Jobs = ReturnType<typeof createJobs>

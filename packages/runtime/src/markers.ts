// SPDX-License-Identifier: AGPL-3.0-only
// `media.markers` (Phase 5 C2, ADR 0067): each episode file's intro and where its credits start,
// found a season at a time, at the lowest priority (`@highsea-tv/stream/markers`).
//
// - A season is looked at when one of its episode files has no row for its present size: a new
//   file, one replaced, or one whose marks the owner had found again. The import's and the scan's
//   hook queue the job, and boot does when anything is missing, which is how a library from
//   before this gets looked at: the newest season first, one at a time, with a pause between.
// - Each file's chapters come first (`chapterMarkers`). Where they don't give both marks, the
//   file's opening and ending are fingerprinted (ffmpeg's `chromaprint` muxer, at `nice` 19) and
//   laid against the nearest episodes' that have files, up to three, and the stretch they share
//   is the intro, or where the credits start. The comparing runs in the worker pool. A pilot or
//   specials' season 0 rarely share an opening: season 0 takes chapters alone.
// - The owner's word on a mark (`owner`) is never changed. A file that can't be read keeps its
//   error and isn't tried again until it changes.
// - A season with a file being played or transcoded waits: the job takes another season, or
//   comes back in ten minutes.
// - An ffmpeg without the muxer gives chapters only, said once in the log; its rows say so, and
//   are looked at again when the server starts with one that has it.
// It reads what's stored and writes whole rows, so it's safe to repeat (ADR 0022).
import type { Clock, Logger } from '@highsea-tv/core'
import { type Db, schema } from '@highsea-tv/db'
import type { JobQueue } from '@highsea-tv/jobs'
import { probeOf } from '@highsea-tv/media/shared'
import { MARKERS_JOB, queueMarkers } from '@highsea-tv/media/shows'
import {
  CREDITS_STRETCH,
  chapterMarkers,
  fingerprint,
  hasChromaprint,
  headSeconds,
  INTRO_STRETCH,
  MARKERS_WORKER,
  type Markers,
  type Range,
  readChapters,
  type StretchOptions,
  tailSeconds,
} from '@highsea-tv/stream/markers'
import { and, asc, desc, eq, isNull, ne, or } from 'drizzle-orm'
import { z } from 'zod'
import type { WorkerPool } from './workers.ts'

export { MARKERS_JOB }

const { mediaFiles, mediaItems, versions, episodeMarkers } = schema

/** Why a file got chapters alone: this ffmpeg has no `chromaprint` muxer. */
export const NO_CHROMAPRINT = 'This ffmpeg can’t fingerprint sound (no chromaprint muxer).'

/** The episodes compared with each, nearest first. */
const PARTNERS = 3
/** The rest between seasons, so a first pass over a library leaves the NAS room. */
const SEASON_PAUSE_MS = 30_000
/** How long a season being played waits. */
const BUSY_WAIT_MS = 10 * 60_000

/** A file's marks while its season is looked at, with where each came from. */
type Found = Markers & { introFrom: 'chapters' | 'audio'; creditsFrom: 'chapters' | 'audio' }

type EpisodeFile = {
  fileId: string
  path: string
  size: number
  duration: number | null
  hasAudio: boolean
  number: number
  row: typeof episodeMarkers.$inferSelect | undefined
}

export function createMarkers(deps: {
  db: Db
  jobs: JobQueue
  clock: Clock
  logger: Logger
  ffmpeg: string
  ffprobe: string
  workers: Pick<WorkerPool, 'run'>
  /** The files being played or transcoded now. */
  busy?: () => ReadonlySet<string>
  /** Whether this ffmpeg has the muxer; asked once. */
  chromaprint?: () => Promise<boolean>
  /** The rest between seasons. */
  pauseMs?: number
}) {
  const { db, jobs, clock } = deps
  const log = deps.logger.child('markers')
  const pause = deps.pauseMs ?? SEASON_PAUSE_MS
  let chromaprint: Promise<boolean> | null = null
  let closed = false
  const canFingerprint = () => {
    chromaprint ??= (deps.chromaprint ?? (() => hasChromaprint(deps.ffmpeg)))().then((ok) => {
      if (!ok)
        log.warn(
          'this ffmpeg has no chromaprint muxer, so intros and credits come from chapters alone',
        )
      return ok
    })
    return chromaprint
  }

  /** Episode files with no row for their present size, newest first: their seasons' turn. */
  function waiting(limit: number) {
    return db
      .selectDistinct({ showId: mediaItems.showId, season: mediaItems.seasonNumber })
      .from(versions)
      .innerJoin(mediaItems, eq(mediaItems.id, versions.itemId))
      .innerJoin(mediaFiles, eq(mediaFiles.id, versions.fileId))
      .leftJoin(episodeMarkers, eq(episodeMarkers.fileId, mediaFiles.id))
      .where(
        and(
          eq(mediaItems.type, 'episode'),
          or(isNull(episodeMarkers.fileId), ne(episodeMarkers.size, mediaFiles.size)),
        ),
      )
      .orderBy(desc(mediaFiles.addedAt))
      .limit(limit)
      .all()
      .flatMap((r) => (r.showId ? [{ showId: r.showId, season: r.season ?? 0 }] : []))
  }

  /** A season's episodes with files: each file once, under its first episode. */
  function seasonFiles(showId: string, season: number): EpisodeFile[] {
    const rows = db
      .select({
        number: mediaItems.episodeNumber,
        fileId: mediaFiles.id,
        path: mediaFiles.path,
        size: mediaFiles.size,
        mediaInfo: mediaFiles.mediaInfo,
        row: episodeMarkers,
      })
      .from(mediaItems)
      .innerJoin(versions, eq(versions.itemId, mediaItems.id))
      .innerJoin(mediaFiles, eq(mediaFiles.id, versions.fileId))
      .leftJoin(episodeMarkers, eq(episodeMarkers.fileId, mediaFiles.id))
      .where(
        and(
          eq(mediaItems.type, 'episode'),
          eq(mediaItems.showId, showId),
          eq(mediaItems.seasonNumber, season),
        ),
      )
      .orderBy(asc(mediaItems.episodeNumber), asc(versions.position))
      .all()
    const seen = new Set<string>()
    return rows.flatMap((r) => {
      if (seen.has(r.fileId)) return []
      seen.add(r.fileId)
      const probe = probeOf(r.mediaInfo)
      return [
        {
          fileId: r.fileId,
          path: r.path,
          size: r.size,
          duration: probe?.duration ?? null,
          hasAudio: (probe?.audio.length ?? 0) > 0,
          number: r.number ?? 0,
          row: r.row ?? undefined,
        },
      ]
    })
  }

  const needs = (f: EpisodeFile) => !f.row || f.row.size !== f.size

  /** Writes a file's row, keeping the owner's marks. */
  function record(f: EpisodeFile, found: Found, error: string | null) {
    const was = db.select().from(episodeMarkers).where(eq(episodeMarkers.fileId, f.fileId)).get()
    const intro =
      was?.introSource === 'owner'
        ? {}
        : {
            introStart: found.intro?.start ?? null,
            introEnd: found.intro?.end ?? null,
            introSource: found.intro ? found.introFrom : null,
          }
    const credits =
      was?.creditsSource === 'owner'
        ? {}
        : {
            credits: found.credits,
            creditsSource: found.credits !== null ? found.creditsFrom : null,
          }
    const row = { size: f.size, error, checkedAt: clock.now(), ...intro, ...credits }
    try {
      db.insert(episodeMarkers)
        .values({ fileId: f.fileId, ...row })
        .onConflictDoUpdate({ target: episodeMarkers.fileId, set: row })
        .run()
    } catch {
      // the file left the library while it was looked at
    }
  }

  /** Looks at one season: chapters first, then the sound its episodes share. */
  async function season(showId: string, number: number, signal: AbortSignal) {
    const files = seasonFiles(showId, number)
    const work = files.filter(needs)
    if (!work.length) return
    const started = clock.now()
    const marks = new Map<string, Found>()
    const errors = new Map<string, string>()
    for (const f of work) {
      const m: Found = { intro: null, credits: null, introFrom: 'audio', creditsFrom: 'audio' }
      marks.set(f.fileId, m)
      if (!f.hasAudio || !f.duration) {
        errors.set(f.fileId, f.duration ? 'It has no sound.' : 'It hasn’t been read yet.')
        continue
      }
      try {
        const chapters = chapterMarkers(
          await readChapters(deps.ffprobe, f.path, signal),
          f.duration,
        )
        if (chapters.intro) {
          m.intro = chapters.intro
          m.introFrom = 'chapters'
        }
        if (chapters.credits !== null) {
          m.credits = chapters.credits
          m.creditsFrom = 'chapters'
        }
      } catch (e) {
        if (signal.aborted) throw e
        // no chapters read is no chapters: the sound may still say
      }
    }

    const fingerprints = number > 0 && (await canFingerprint())
    if (fingerprints) {
      const readable = files.filter((f) => f.hasAudio && f.duration)
      const heads = new Map<string, Promise<Uint32Array | null>>()
      const tails = new Map<string, Promise<Uint32Array | null>>()
      const read = (f: EpisodeFile, end: 'head' | 'tail') => {
        const memo = end === 'head' ? heads : tails
        let p = memo.get(f.fileId)
        if (!p) {
          const duration = f.duration as number
          const seconds = end === 'head' ? headSeconds(duration) : tailSeconds(duration)
          p = fingerprint({
            ffmpeg: deps.ffmpeg,
            input: f.path,
            from: end === 'head' ? 0 : duration - seconds,
            seconds,
            signal,
          }).catch((e: Error) => {
            if (signal.aborted) throw e
            if (!errors.has(f.fileId)) errors.set(f.fileId, e.message)
            log.warn('couldn’t fingerprint an episode', { file: f.fileId, error: e.message })
            return null
          })
          memo.set(f.fileId, p)
        }
        return p
      }
      const compare = (a: Uint32Array, b: Uint32Array, options: StretchOptions) =>
        deps.workers.run<{ a: Range; b: Range } | null>(
          { module: MARKERS_WORKER, fn: 'compare', input: { a, b, options } },
          { signal },
        )
      for (const f of work) {
        const m = marks.get(f.fileId) as Found
        if (errors.has(f.fileId) || (m.intro && m.credits !== null)) continue
        const duration = f.duration as number
        const partners = readable
          .filter((o) => o.fileId !== f.fileId)
          .sort((x, y) => Math.abs(x.number - f.number) - Math.abs(y.number - f.number))
          .slice(0, PARTNERS)
        for (const o of partners) {
          if (!m.intro) {
            const [a, b] = await Promise.all([read(f, 'head'), read(o, 'head')])
            const found = a && b ? await compare(a, b, INTRO_STRETCH) : null
            if (found) m.intro = found.a
          }
          if (m.credits === null) {
            const [a, b] = await Promise.all([read(f, 'tail'), read(o, 'tail')])
            const found = a && b ? await compare(a, b, CREDITS_STRETCH) : null
            const from = duration - tailSeconds(duration)
            // credits start in the episode's second half, after its intro
            if (found && from + found.a.start > duration / 2)
              m.credits = Math.round((from + found.a.start) * 10) / 10
          }
          if (m.intro && m.credits !== null) break
        }
      }
    }

    for (const f of work) {
      const m = marks.get(f.fileId) as Found
      const missing = !m.intro || m.credits === null
      const error =
        errors.get(f.fileId) ?? (number > 0 && !fingerprints && missing ? NO_CHROMAPRINT : null)
      record(f, m, error)
    }
    log.info('markers looked for', {
      show: showId,
      season: number,
      files: work.length,
      intros: work.filter((f) => marks.get(f.fileId)?.intro).length,
      credits: work.filter((f) => marks.get(f.fileId)?.credits !== null).length,
      ms: clock.now() - started,
    })
  }

  jobs.define({
    type: MARKERS_JOB,
    payload: z.object({}),
    // one season at a time, and never twice in a row for one that failed: its rows say so
    concurrency: 1,
    attempts: 1,
    timeoutMs: 3 * 60 * 60_000,
    async run(_, { signal }) {
      const busy = deps.busy?.() ?? new Set<string>()
      const seasons = waiting(50)
      if (!seasons.length) return
      const free = seasons.find(
        (s) => !seasonFiles(s.showId, s.season).some((f) => busy.has(f.fileId)),
      )
      if (!free) {
        queueMarkers(jobs, clock.now() + BUSY_WAIT_MS)
        return
      }
      await season(free.showId, free.season, signal)
      if (waiting(1).length) queueMarkers(jobs, clock.now() + pause)
    },
  })

  return {
    /**
     * At boot: rows that got chapters alone for want of the muxer are looked at again when this
     * ffmpeg has it, and anything missing is queued.
     */
    async start() {
      const ok = await canFingerprint()
      // the server may have stopped while ffmpeg was asked
      if (closed) return
      // those rows are looked at again: the size no file has makes them wait, the owner's kept
      if (ok)
        db.update(episodeMarkers)
          .set({ size: -1 })
          .where(eq(episodeMarkers.error, NO_CHROMAPRINT))
          .run()
      if (waiting(1).length) queueMarkers(jobs)
    },
    /** Stops a boot check still waiting on ffmpeg from touching the closed database. */
    close() {
      closed = true
    },
    /** The import's and the scan's hook: a new or replaced episode's season is looked at. */
    afterImport: async () => {
      queueMarkers(jobs)
    },
    /** One season, now: for tests and the job. */
    season: (showId: string, number: number, signal = new AbortController().signal) =>
      season(showId, number, signal),
  }
}

export type MarkersService = ReturnType<typeof createMarkers>

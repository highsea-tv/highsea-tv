// SPDX-License-Identifier: AGPL-3.0-only
// `media.ahead` (phase 5, A1's finding of 2026-11-17): what a stream needs of a file that takes a
// read of the file to get, read after the import rather than when someone presses Play.
//
// - **Keyframes.** A direct stream's segments follow the picture's keyframes (ADR 0051). They're
//   read from the container's index where it has one that agrees with the film's packets, a few
//   megabytes, and else from every packet, the whole file (HT-48, `readKeyframesFrom`). They're
//   kept by the file's size (`file_keyframes`), as before.
// - **Text subtitles of the file's own, as WebVTT.** A subtitle track is spread through the file,
//   so ffmpeg reads all of it to take one out (https://ffmpeg.org/ffmpeg.html#Stream-copy: it
//   demuxes the whole input), and no index helps: Matroska's Cues point at the Clusters that hold
//   a subtitle (RFC 9559 § 22.1), each a few seconds of the whole film. Converted once a session,
//   every play with a subtitle read the film again beside its own stream. They're kept in the data
//   folder's `webvtt/<file>/`, named by the file's size and the stream, so a file replaced at the
//   same path is converted again.
//
// Two jobs, one file at a time each, as trickplay's is: `media.ahead` reads the newest file without
// keyframes for its present size and queues itself again while any is left, then queues
// `media.ahead.subtitles`, which converts the newest file's missing subtitles in one pass and
// queues itself again the same way. The keyframes come first and never wait for a conversion: a
// library's keyframes take seconds a film, its subtitles a read of each film that has any. The
// import's hook queues the keyframes and so does boot, which is how a library from before this
// gets read. Both run at the lowest priority. A play that comes first reads what it needs itself,
// and shares a read already under way. A file that fails is left until the server next starts.
// It reads what's stored and writes whole files, so it's safe to repeat (ADR 0022).
import { existsSync } from 'node:fs'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Clock, Logger } from '@highsea-tv/core'
import { type Db, schema } from '@highsea-tv/db'
import type { JobQueue } from '@highsea-tv/jobs'
import type { MediaInfo } from '@highsea-tv/media/shared'
import { type Background, convertSubtitles, readKeyframesFrom } from '@highsea-tv/stream/hls'
import { and, desc, eq, isNull, ne, notInArray, or } from 'drizzle-orm'
import { z } from 'zod'

export const AHEAD_JOB = 'media.ahead'
export const AHEAD_SUBTITLES_JOB = 'media.ahead.subtitles'

const { mediaFiles, fileKeyframes } = schema

type File = { id: string; path: string; size: number }
type Read = { times: number[]; read: boolean; from?: 'index' | 'packets'; why?: string }

export function createAhead(deps: {
  db: Db
  jobs: JobQueue
  clock: Clock
  logger: Logger
  /** The data folder's `webvtt/`. */
  root: string
  ffmpeg: string
  ffprobe: string
  /** The stream indexes of a file's own text subtitles. */
  textTracks(fileId: string): number[]
}) {
  const { db, jobs, clock, root } = deps
  const log = deps.logger.child('playback')
  /** Reads under way, so a play and the job, or two plays, read a file once. */
  const reading = new Map<string, Promise<Read>>()
  const converting = new Map<string, Promise<void>>()
  /** Files the jobs couldn't read or convert: left until the server next starts. */
  const failed = new Set<string>()
  const failedSubtitles = new Set<string>()

  /** A file's keyframes: kept from an earlier read when the file's size is the same, else read. */
  function keyframes(file: File, index: number, background?: Background): Promise<Read> {
    const kept = db.select().from(fileKeyframes).where(eq(fileKeyframes.fileId, file.id)).get()
    if (kept && kept.size === file.size) return Promise.resolve({ times: kept.times, read: false })
    const pending = reading.get(file.id)
    if (pending) return pending
    const read = readKeyframesFrom(deps.ffprobe, file.path, index, background)
      .then(({ times, from, why }) => {
        const row = { size: file.size, times, readAt: clock.now() }
        try {
          db.insert(fileKeyframes)
            .values({ fileId: file.id, ...row })
            .onConflictDoUpdate({ target: fileKeyframes.fileId, set: row })
            .run()
        } catch {
          // the file left the library while it was read: nothing to keep
        }
        return { times, read: true, from, why }
      })
      .finally(() => reading.delete(file.id))
    reading.set(file.id, read)
    return read
  }

  const subtitlePath = (file: File, index: number) =>
    join(root, file.id, `${file.size}-${index}.vtt`)

  /** Converts the file's text subtitles that aren't kept yet, all in one pass. */
  function convert(file: File, background?: Background): Promise<void> {
    const pending = converting.get(file.id)
    if (pending) return pending
    const missing = deps
      .textTracks(file.id)
      .map((index) => ({ index, output: subtitlePath(file, index) }))
      .filter((t) => !existsSync(t.output))
    if (!missing.length) return Promise.resolve()
    const made = mkdir(join(root, file.id), { recursive: true })
      .then(() => convertSubtitles(deps.ffmpeg, file.path, missing, background))
      .finally(() => converting.delete(file.id))
    converting.set(file.id, made)
    return made
  }

  /**
   * One of the file's own text subtitles as WebVTT: its path, and whether it had to be converted
   * now. Asked for before the job reached the file, all of its tracks are converted with it.
   */
  async function subtitle(file: File, index: number): Promise<{ path: string; made: boolean }> {
    const path = subtitlePath(file, index)
    if (existsSync(path)) return { path, made: false }
    await convert(file)
    if (!existsSync(path)) throw new Error('That subtitle couldn’t be converted.')
    return { path, made: true }
  }

  /** The newest file whose keyframes aren't kept for its present size. */
  function nextMissing() {
    return db
      .select({
        id: mediaFiles.id,
        path: mediaFiles.path,
        size: mediaFiles.size,
        mediaInfo: mediaFiles.mediaInfo,
      })
      .from(mediaFiles)
      .leftJoin(fileKeyframes, eq(fileKeyframes.fileId, mediaFiles.id))
      .where(
        and(
          or(isNull(fileKeyframes.fileId), ne(fileKeyframes.size, mediaFiles.size)),
          // nothing is left out until something has failed
          failed.size ? notInArray(mediaFiles.id, [...failed]) : undefined,
        ),
      )
      .orderBy(desc(mediaFiles.addedAt))
      .limit(1)
      .get()
  }

  /** Folders of subtitles whose file has left the library. */
  async function prune() {
    const names = await readdir(root).catch(() => [] as string[])
    if (!names.length) return
    const kept = new Set(
      db
        .select({ id: mediaFiles.id })
        .from(mediaFiles)
        .all()
        .map((f) => f.id),
    )
    for (const name of names)
      if (!kept.has(name)) await rm(join(root, name), { recursive: true, force: true })
  }

  /**
   * The newest file with a text subtitle of its own not converted yet for its present size: a
   * look at each file's folder, newest first, which is quick beside a conversion.
   */
  function nextSubtitles(): File | null {
    const files = db
      .select({ id: mediaFiles.id, path: mediaFiles.path, size: mediaFiles.size })
      .from(mediaFiles)
      .orderBy(desc(mediaFiles.addedAt))
      .all()
    for (const file of files) {
      if (failedSubtitles.has(file.id)) continue
      if (deps.textTracks(file.id).some((index) => !existsSync(subtitlePath(file, index))))
        return file
    }
    return null
  }

  /** Queues a job, once: the one running queues the next itself. */
  const queue = () => jobs.enqueue(AHEAD_JOB, {}, { dedupeKey: 'ahead' })
  const queueSubtitles = () =>
    jobs.enqueue(AHEAD_SUBTITLES_JOB, {}, { dedupeKey: 'ahead-subtitles' })

  jobs.define({
    type: AHEAD_JOB,
    payload: z.object({}),
    // one file at a time: a file without an index to use is a read of the whole of it
    concurrency: 1,
    attempts: 1,
    timeoutMs: 3 * 60 * 60_000,
    async run(_, { signal }) {
      await prune()
      const file = nextMissing()
      if (!file) {
        queueSubtitles()
        return
      }
      const video = (file.mediaInfo as { probe?: MediaInfo } | null)?.probe?.video
      const from = clock.now()
      try {
        // a file without a picture, or not read yet, has nothing to read ahead
        if (!video) throw new Error('It has no picture, or hasn’t been read yet.')
        const read = await keyframes(file, video.index, { low: true, signal })
        log.info('read ahead of the first play', {
          file: file.id,
          keyframes: read.times.length,
          // where they came from, and why not the index when it couldn't be used
          from: read.from ?? 'kept',
          ...(read.why ? { why: read.why } : {}),
          ms: clock.now() - from,
        })
      } catch (e) {
        // stopped for shutdown: it's read next time
        if (signal.aborted) throw e
        failed.add(file.id)
        if (video)
          log.warn('a film couldn’t be read ahead of its first play', {
            file: file.id,
            error: (e as Error).message,
          })
      }
      if (nextMissing()) queue()
      else queueSubtitles()
    },
  })

  jobs.define({
    type: AHEAD_SUBTITLES_JOB,
    payload: z.object({}),
    // one file at a time: each is a read of the whole file
    concurrency: 1,
    attempts: 1,
    timeoutMs: 3 * 60 * 60_000,
    async run(_, { signal }) {
      const file = nextSubtitles()
      if (!file) return
      const from = clock.now()
      try {
        await convert(file, { low: true, signal })
        log.info('subtitles converted ahead of the first play', {
          file: file.id,
          subtitles: deps.textTracks(file.id).length,
          ms: clock.now() - from,
        })
      } catch (e) {
        if (signal.aborted) throw e
        failedSubtitles.add(file.id)
        log.warn('a film’s subtitles couldn’t be converted ahead', {
          file: file.id,
          error: (e as Error).message,
        })
      }
      if (nextSubtitles()) queueSubtitles()
    },
  })

  return {
    /** At boot: reads the library's files that haven't been, in the background. */
    start() {
      if (nextMissing()) queue()
      else if (nextSubtitles()) queueSubtitles()
    },
    /** The import's hook: a new or replaced file is read. */
    afterImport: async () => {
      queue()
    },
    keyframes,
    subtitle,
  }
}

export type Ahead = ReturnType<typeof createAhead>

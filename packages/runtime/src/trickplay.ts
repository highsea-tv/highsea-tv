// SPDX-License-Identifier: AGPL-3.0-only
// `media.trickplay` (checkpoint 4.1b, ADR 0051): the scrubber's previews, made by ffmpeg into the
// data folder's `trickplay/<file id>/`, one film at a time at the lowest priority
// (`@highsea-tv/stream/trickplay`).
//
// - The job makes the newest film without previews, then queues itself again while any is left,
//   so the library is filled in the background (answer 9). The import's hook queues it after each
//   import, and boot queues it when anything is missing.
// - A file's row keeps its size, so a file replaced at the same path is made again; one replaced
//   elsewhere is a new file, and its old row goes with the old file's.
// - A film that fails keeps its error and isn't tried again until its file changes.
// - Each run removes folders whose file has left the library, and half-made ones.
// It reads what's stored and writes whole folders, so it's safe to repeat (ADR 0022).
import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Clock, Logger } from '@highsea-tv/core'
import { type Db, schema } from '@highsea-tv/db'
import type { JobQueue } from '@highsea-tv/jobs'
import type { MediaInfo } from '@highsea-tv/media/shared'
import {
  makeTrickplay,
  type TrickplayManifest,
  trickplayManifest,
} from '@highsea-tv/stream/trickplay'
import { desc, eq, isNull, ne, or } from 'drizzle-orm'
import { z } from 'zod'

export const TRICKPLAY_JOB = 'media.trickplay'

const { mediaFiles, trickplay } = schema

export function createTrickplay(deps: {
  db: Db
  jobs: JobQueue
  clock: Clock
  logger: Logger
  /** The data folder's `trickplay/`. */
  root: string
  ffmpeg: string
}) {
  const { db, jobs, clock, root } = deps
  const log = deps.logger.child('trickplay')

  /** The newest file without previews for its present size. */
  function nextMissing() {
    return db
      .select({
        id: mediaFiles.id,
        path: mediaFiles.path,
        size: mediaFiles.size,
        mediaInfo: mediaFiles.mediaInfo,
      })
      .from(mediaFiles)
      .leftJoin(trickplay, eq(trickplay.fileId, mediaFiles.id))
      .where(or(isNull(trickplay.fileId), ne(trickplay.size, mediaFiles.size)))
      .orderBy(desc(mediaFiles.addedAt))
      .limit(1)
      .get()
  }

  function record(
    fileId: string,
    size: number,
    manifest: TrickplayManifest | null,
    error: string | null,
  ) {
    const row = { size, manifest, error, madeAt: clock.now() }
    try {
      db.insert(trickplay)
        .values({ fileId, ...row })
        .onConflictDoUpdate({ target: trickplay.fileId, set: row })
        .run()
    } catch {
      // the file left the library while it was made: the next run removes its folder
    }
  }

  /** Folders whose file is gone, and any a stopped run left half made. */
  async function prune() {
    let names: string[]
    try {
      names = await readdir(root)
    } catch {
      return
    }
    const kept = new Set(
      db
        .select({ id: mediaFiles.id })
        .from(mediaFiles)
        .all()
        .map((f) => f.id),
    )
    for (const name of names)
      if (name.endsWith('.part') || !kept.has(name))
        await rm(join(root, name), { recursive: true, force: true })
  }

  /** Queues the job, once: the one running queues the next itself. */
  const queue = () => jobs.enqueue(TRICKPLAY_JOB, {}, { dedupeKey: 'trickplay' })

  jobs.define({
    type: TRICKPLAY_JOB,
    payload: z.object({}),
    // one film at a time, and never twice in a row for one that failed: its row says so
    concurrency: 1,
    attempts: 1,
    timeoutMs: 3 * 60 * 60_000,
    async run(_, { signal }) {
      await prune()
      const file = nextMissing()
      if (!file) return
      const probe = (file.mediaInfo as { probe?: MediaInfo } | null)?.probe
      const video = probe?.video
      if (!probe?.duration || !video) {
        record(file.id, file.size, null, probe ? 'It has no picture.' : 'It hasn’t been read yet.')
      } else {
        try {
          const sheets = await makeTrickplay({
            ffmpeg: deps.ffmpeg,
            input: file.path,
            index: video.index,
            dir: join(root, file.id),
            signal,
          })
          const manifest = trickplayManifest(probe.duration, video)
          record(file.id, file.size, { ...manifest, sheets }, null)
          log.info('trickplay made', { file: file.id, sheets })
        } catch (e) {
          // stopped for shutdown: it's made next time
          if (signal.aborted) throw e
          const message = (e as Error).message
          record(file.id, file.size, null, message)
          log.warn('trickplay couldn’t be made', { file: file.id, error: message })
        }
      }
      if (nextMissing()) queue()
    },
  })

  return {
    /** At boot: fills in the library's missing previews in the background. */
    start() {
      if (nextMissing()) queue()
    },
    /** The import's hook: a new or replaced file gets its previews. */
    afterImport: async () => {
      queue()
    },
    /** A file's previews when they're made for its present size, or null. */
    manifest(fileId: string, size: number): TrickplayManifest | null {
      const row = db.select().from(trickplay).where(eq(trickplay.fileId, fileId)).get()
      return row && row.size === size && row.manifest ? (row.manifest as TrickplayManifest) : null
    },
    /** A sheet's path, numbered from 0. */
    sheet: (fileId: string, n: number) => join(root, fileId, `${n}.jpg`),
  }
}

export type Trickplay = ReturnType<typeof createTrickplay>

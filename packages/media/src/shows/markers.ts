// SPDX-License-Identifier: AGPL-3.0-only
// An episode file's intro and credits (Phase 5 C2, ADR 0067), as `episode_markers` keeps them: the
// runtime's `media.markers` job finds them, from chapters and then the sound a season's episodes
// share; the apps read them as an episode's `intro` and `credits`, and the admin reads and corrects
// them. The owner's word on a mark (`owner`, a time or cleared) is kept when the job looks again.
import type { EpisodeMarkers, EpisodeMarkersPatch } from '@highsea-tv/api-contract'
import type { Clock } from '@highsea-tv/core'
import { type Db, schema } from '@highsea-tv/db'
import type { JobQueue } from '@highsea-tv/jobs'
import { eq, inArray } from 'drizzle-orm'
import { chunks } from '../shared/sql.ts'

/** The runtime's job that finds a season's markers (`@highsea-tv/runtime`'s markers.ts). */
export const MARKERS_JOB = 'media.markers'

const { episodeMarkers, mediaFiles } = schema

export type MarkerRow = typeof episodeMarkers.$inferSelect

/** Queues the job, once: the one running queues the next season itself. */
export const queueMarkers = (jobs: JobQueue, runAt?: number) =>
  jobs.enqueue(MARKERS_JOB, {}, { dedupeKey: 'markers', ...(runAt ? { runAt } : {}) })

/**
 * Which of a row's marks stand for the file as it is: the owner's always, a found one while the
 * file is the size it was found for (a replaced file is looked at again).
 */
const standing = (row: MarkerRow | undefined, size: number) => ({
  intro: !!row && (row.introSource === 'owner' || row.size === size),
  credits: !!row && (row.creditsSource === 'owner' || row.size === size),
})

/** A row's marks for the apps: null where none stands. */
export function clientMarks(
  row: MarkerRow | undefined,
  size: number,
): { intro: { start: number; end: number } | null; credits: number | null } {
  const ok = standing(row, size)
  return {
    intro:
      ok.intro && row?.introStart != null && row.introEnd != null && row.introEnd > row.introStart
        ? { start: row.introStart, end: row.introEnd }
        : null,
    credits: ok.credits ? (row?.credits ?? null) : null,
  }
}

/** A row as the admin's episode row reads it. */
export function adminMarks(row: MarkerRow | undefined, size: number): EpisodeMarkers {
  const ok = standing(row, size)
  return {
    ...clientMarks(row, size),
    introSource: ok.intro ? (row?.introSource ?? null) : null,
    creditsSource: ok.credits ? (row?.creditsSource ?? null) : null,
    checked: !!row && row.size === size,
  }
}

export function createShowMarkers(deps: { db: Db; jobs: JobQueue; clock: Clock }) {
  const { db, jobs, clock } = deps

  /** Each file's row, by file id. */
  function forFiles(fileIds: readonly string[]): Map<string, MarkerRow> {
    const out = new Map<string, MarkerRow>()
    for (const part of chunks([...new Set(fileIds)]))
      for (const r of db
        .select()
        .from(episodeMarkers)
        .where(inArray(episodeMarkers.fileId, part))
        .all())
        out.set(r.fileId, r)
    return out
  }

  /**
   * The owner's word on a file's marks: each given mark is set, or cleared with null, as the
   * owner's; one left out stays as it was. A file not looked at yet keeps being looked at for the
   * mark the owner didn't give.
   */
  function correct(fileId: string, patch: EpisodeMarkersPatch) {
    const file = db
      .select({ size: mediaFiles.size })
      .from(mediaFiles)
      .where(eq(mediaFiles.id, fileId))
      .get()
    if (!file) return
    const was = db.select().from(episodeMarkers).where(eq(episodeMarkers.fileId, fileId)).get()
    const intro =
      patch.intro === undefined
        ? {}
        : {
            introStart: patch.intro?.start ?? null,
            introEnd: patch.intro?.end ?? null,
            introSource: 'owner' as const,
          }
    const credits =
      patch.credits === undefined ? {} : { credits: patch.credits, creditsSource: 'owner' as const }
    if (was) {
      db.update(episodeMarkers)
        .set({ ...intro, ...credits })
        .where(eq(episodeMarkers.fileId, fileId))
        .run()
      return
    }
    // a row the job hasn't written yet: its size is one no file has, so the job still looks
    db.insert(episodeMarkers)
      .values({ fileId, size: -1, checkedAt: clock.now(), ...intro, ...credits })
      .run()
    queueMarkers(jobs)
  }

  /** Forgets a file's marks, the owner's too, and queues its season to be looked at again. */
  function forget(fileId: string) {
    db.delete(episodeMarkers).where(eq(episodeMarkers.fileId, fileId)).run()
    queueMarkers(jobs)
  }

  return { forFiles, correct, forget }
}

export type ShowMarkers = ReturnType<typeof createShowMarkers>

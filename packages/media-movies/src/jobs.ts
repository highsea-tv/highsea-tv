// SPDX-License-Identifier: AGPL-3.0-only
// The library's background job (ADR 0022, safe to repeat): `movies.availability`, daily, moves
// movies whose minimum availability has come from `not-released` to `wanted` or `unmonitored`.
// Metadata refreshes go through @highsea/metadata's `metadata.refresh`.
import type { JobQueue } from '@highsea/jobs'
import { z } from 'zod'

const DAY = 24 * 60 * 60 * 1000

export const MOVIE_JOB_TYPES = { availability: 'movies.availability' } as const

export function defineMovieJobs(jobs: JobQueue, checkAvailability: () => number) {
  jobs.define({
    type: MOVIE_JOB_TYPES.availability,
    payload: z.object({}),
    attempts: 2,
    async run() {
      checkAvailability()
    },
  })
}

/** Daily, first five minutes after boot. The runtime calls this once at boot. */
export function scheduleMovieJobs(jobs: JobQueue, now: number) {
  jobs.schedule(MOVIE_JOB_TYPES.availability, DAY, { firstRunAt: now + 5 * 60_000 })
}

// SPDX-License-Identifier: AGPL-3.0-only
// The metadata's background jobs (ADR 0022, so each is safe to repeat):
// - `metadata.refresh` refreshes one movie, person or collection by TMDB id;
// - `metadata.changes`, daily, refreshes what TMDB's change lists name;
// - `metadata.sweep`, daily, spreads a full refresh of what the library refers to over 30 days;
// - `metadata.purge`, daily, removes what's past TMDB's six-month limit and the library doesn't use;
// - `metadata.facts` derives collection rules' facts again from the stored responses (checkpoint 8d):
//   queued at boot when they were derived for another region or version, and when the region changes.
import type { Db } from '@highsea-tv/db'
import type { JobQueue } from '@highsea-tv/jobs'
import { z } from 'zod'
import { deriveAllFacts, factsCurrent } from './facts.ts'
import type { createMetadataCore } from './service.ts'
import { JOB_TYPES } from './service.ts'

const DAY = 24 * 60 * 60 * 1000

export const RefreshPayload = z.object({
  kind: z.enum(['movie', 'person', 'collection']),
  id: z.number().int().positive(),
})

/** Scheduled jobs are queued with `{}`. */
const Scheduled = z.object({})

export function defineMetadataJobs(
  jobs: JobQueue,
  core: ReturnType<typeof createMetadataCore>,
  db: Db,
  now: () => number,
) {
  jobs.define({
    type: JOB_TYPES.facts,
    payload: Scheduled,
    attempts: 3,
    timeoutMs: 30 * 60_000,
    async run() {
      // the region read when it runs, so a second change while it waited is the one that counts
      await deriveAllFacts(db, core.settings.region(), now())
    },
  })
  jobs.define({
    type: JOB_TYPES.refresh,
    payload: RefreshPayload,
    concurrency: 2,
    attempts: 3,
    timeoutMs: 60_000,
    async run({ kind, id }) {
      await core.refreshNow(kind, id)
    },
  })
  jobs.define({
    type: JOB_TYPES.changes,
    payload: Scheduled,
    attempts: 3,
    timeoutMs: 10 * 60_000,
    async run() {
      await core.runChanges()
    },
  })
  jobs.define({
    type: JOB_TYPES.sweep,
    payload: Scheduled,
    attempts: 2,
    async run() {
      core.runSweep()
    },
  })
  jobs.define({
    type: JOB_TYPES.purge,
    payload: Scheduled,
    attempts: 2,
    async run() {
      core.runPurge()
    },
  })
}

/** Queues `metadata.facts` unless the stored facts follow this region already. */
export function queueFacts(jobs: JobQueue, db: Db, region: string) {
  if (!factsCurrent(db, region)) jobs.enqueue(JOB_TYPES.facts, {}, { dedupeKey: 'facts' })
}

/** Daily, staggered so the three don't start together. The runtime calls this once at boot. */
export function scheduleMetadataJobs(jobs: JobQueue, now: number) {
  jobs.schedule(JOB_TYPES.changes, DAY, { firstRunAt: now + 10 * 60_000 })
  jobs.schedule(JOB_TYPES.sweep, DAY, { firstRunAt: now + 40 * 60_000 })
  jobs.schedule(JOB_TYPES.purge, DAY, { firstRunAt: now + 70 * 60_000 })
}

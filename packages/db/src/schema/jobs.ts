// SPDX-License-Identifier: AGPL-3.0-only
// The job queue (ADR 0022): jobs waiting or running, each run's outcome, and recurring schedules.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    payload: text('payload', { mode: 'json' }).notNull(),
    status: text('status', { enum: JOB_STATUSES }).notNull(),
    /** While queued, a second job with the same key isn't added. */
    dedupeKey: text('dedupe_key'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull(),
    runAt: integer('run_at').notNull(),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
    error: text('error'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    index('jobs_due').on(t.status, t.runAt),
    index('jobs_dedupe').on(t.type, t.dedupeKey),
    index('jobs_finished').on(t.finishedAt),
  ],
)

export const jobRuns = sqliteTable(
  'job_runs',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id').notNull(),
    type: text('type').notNull(),
    attempt: integer('attempt').notNull(),
    startedAt: integer('started_at').notNull(),
    finishedAt: integer('finished_at'),
    outcome: text('outcome', { enum: ['succeeded', 'failed', 'interrupted'] }),
    error: text('error'),
  },
  (t) => [index('job_runs_by_type').on(t.type, t.startedAt), index('job_runs_by_job').on(t.jobId)],
)

export const jobSchedules = sqliteTable('job_schedules', {
  type: text('type').primaryKey(),
  everyMs: integer('every_ms').notNull(),
  nextRunAt: integer('next_run_at').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastRunAt: integer('last_run_at'),
})

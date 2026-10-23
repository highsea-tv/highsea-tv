// SPDX-License-Identifier: AGPL-3.0-only
// An import's progress: one settings row per importer, announced on `migration.updated`, as the
// library import keeps its own (judgement call 83). The job's payload carries what to do, so a
// restart picks up at `done`.
import type { Clock, EventBus } from '@highsea-tv/core'
import { type Db, readSetting, writeSetting } from '@highsea-tv/db'
import type { JobQueue } from '@highsea-tv/jobs'

/** @highsea-tv/api-contract's `MIGRATION_TOPIC`. */
export const MIGRATION_TOPIC = 'migration.updated'

export type MigrationState = {
  state: 'idle' | 'running' | 'done' | 'failed'
  jobId: string | null
  total: number
  done: number
  imported: number
  /** Already in highsea: a second run skips them. */
  skipped: number
  failures: { name: string; message: string }[]
  startedAt: number | null
  finishedAt: number | null
}

export const IDLE: MigrationState = {
  state: 'idle',
  jobId: null,
  total: 0,
  done: 0,
  imported: 0,
  skipped: 0,
  failures: [],
  startedAt: null,
  finishedAt: null,
}

/** At most this many failures are kept, so a run that goes wrong everywhere stays readable. */
export const MAX_FAILURES = 500

export function progressRow<S extends MigrationState>(
  deps: { db: Db; clock: Clock; events: EventBus; jobs: JobQueue },
  key: string,
  idle: S,
) {
  const read = () => ({ ...idle, ...readSetting<Partial<S>>(deps.db, key, {}) }) as S
  const write = (next: S) => {
    writeSetting(deps.db, key, next, deps.clock.now())
    deps.events.emit({ topic: MIGRATION_TOPIC })
  }
  /** What's stored, with a job that gave up reading as failed. */
  const status = (): S => {
    const s = read()
    if (s.state !== 'running' || !s.jobId) return s
    const job = deps.jobs.get(s.jobId)
    if (!job || job.status === 'failed' || job.status === 'cancelled')
      return { ...s, state: 'failed' }
    return s
  }
  return { read, write, status }
}

/** One more item done: imported, skipped, or failed with a message. */
export function step<S extends MigrationState>(
  s: S,
  outcome: 'imported' | 'skipped' | { name: string; message: string },
): S {
  return {
    ...s,
    done: s.done + 1,
    imported: s.imported + (outcome === 'imported' ? 1 : 0),
    skipped: s.skipped + (outcome === 'skipped' ? 1 : 0),
    failures:
      typeof outcome === 'object' && s.failures.length < MAX_FAILURES
        ? [...s.failures, outcome]
        : s.failures,
  }
}

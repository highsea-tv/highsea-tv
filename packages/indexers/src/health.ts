// SPDX-License-Identifier: AGPL-3.0-only
// Indexer health, backoff and stats (ADR 0035). A failure backs off on a growing schedule; a run of
// failures that lasts 6 hours, or a refused credential, is failing; a success is healthy at once.
// Stats are hourly rows, so the 24-hour numbers are one sum over at most 24 rows per indexer.
import { type Db, schema } from '@highsea/db'
import { eq, gte, lt, sql } from 'drizzle-orm'
import type { FailureKind } from './http.ts'

const { indexerStatus, indexerStats } = schema

const MINUTE = 60_000
const HOUR = 60 * MINUTE
/** 5 minutes, 15, 30, 1 hour, 3 hours, then 6 hours each time. */
export const BACKOFF_STEPS_MS = [5 * MINUTE, 15 * MINUTE, 30 * MINUTE, HOUR, 3 * HOUR, 6 * HOUR]
/** Failures across this long are failing, not just backing off. */
export const FAILING_AFTER_MS = 6 * HOUR
/** ± this share of the delay, so indexers that failed together don't retry together. */
const JITTER = 0.1
/** A `Retry-After` longer than this is capped, as the schedule is. */
const MAX_RETRY_AFTER_MS = 6 * HOUR

export type Health = 'healthy' | 'backoff' | 'failing' | 'disabled'

export type StatusRow = typeof indexerStatus.$inferSelect

export function backoffDelay(
  failures: number,
  retryAfter: number | null,
  random: () => number,
): number {
  if (retryAfter !== null) return Math.min(Math.max(retryAfter, 1000), MAX_RETRY_AFTER_MS)
  const step = BACKOFF_STEPS_MS[Math.min(failures, BACKOFF_STEPS_MS.length) - 1] as number
  return Math.round(step * (1 + JITTER * (random() * 2 - 1)))
}

/** The health A9 shows. */
export function healthOf(row: StatusRow | undefined, enabled: boolean, now: number): Health {
  if (!enabled) return 'disabled'
  if (!row || row.failures === 0) return 'healthy'
  if (row.authFailed) return 'failing'
  if (row.failingSince !== null && now - row.failingSince >= FAILING_AFTER_MS) return 'failing'
  if (row.backoffUntil !== null && row.backoffUntil > now) return 'backoff'
  // the backoff ran out: the next search tries it, as the prototype shows
  return 'healthy'
}

/** Whether a search should skip it: backing off, or its credentials were refused. */
export function isResting(row: StatusRow | undefined, now: number): boolean {
  if (!row) return false
  return row.authFailed || (row.backoffUntil !== null && row.backoffUntil > now)
}

export function createHealth(db: Db, random: () => number) {
  const get = (id: string) =>
    db.select().from(indexerStatus).where(eq(indexerStatus.indexerId, id)).get()

  const hourOf = (now: number) => Math.floor(now / HOUR) * HOUR
  function count(id: string, now: number, ok: boolean, ms: number) {
    db.insert(indexerStats)
      .values({
        indexerId: id,
        hour: hourOf(now),
        queries: 1,
        failures: ok ? 0 : 1,
        responseMs: ok ? ms : 0,
      })
      .onConflictDoUpdate({
        target: [indexerStats.indexerId, indexerStats.hour],
        set: {
          queries: sql`${indexerStats.queries} + 1`,
          failures: sql`${indexerStats.failures} + ${ok ? 0 : 1}`,
          responseMs: sql`${indexerStats.responseMs} + ${ok ? ms : 0}`,
        },
      })
      .run()
  }

  return {
    get,
    all: () => db.select().from(indexerStatus).all(),

    success(id: string, now: number, ms: number, session?: string | null) {
      count(id, now, true, ms)
      const values = {
        failures: 0,
        failingSince: null,
        backoffUntil: null,
        lastError: null,
        authFailed: false,
        lastSuccessAt: now,
        updatedAt: now,
        ...(session !== undefined ? { session } : {}),
      }
      db.insert(indexerStatus)
        .values({ indexerId: id, ...values })
        .onConflictDoUpdate({ target: indexerStatus.indexerId, set: values })
        .run()
    },

    failure(
      id: string,
      now: number,
      kind: FailureKind,
      message: string,
      retryAfter: number | null,
    ) {
      count(id, now, false, 0)
      const row = get(id)
      const failures = (row?.failures ?? 0) + 1
      const auth = kind === 'auth'
      const values = {
        failures,
        failingSince: row?.failingSince ?? now,
        // a refused credential doesn't retry on a schedule: it waits for new settings or Retry now
        backoffUntil: auth ? null : now + backoffDelay(failures, retryAfter, random),
        lastError: message,
        authFailed: auth,
        lastFailureAt: now,
        updatedAt: now,
        // a sign-in that stopped working is thrown away
        ...(auth ? { session: null } : {}),
      }
      db.insert(indexerStatus)
        .values({ indexerId: id, ...values })
        .onConflictDoUpdate({ target: indexerStatus.indexerId, set: values })
        .run()
    },

    /** Retry now: the next search tries it. The run of failures still counts. */
    clearBackoff(id: string, now: number) {
      db.update(indexerStatus)
        .set({ backoffUntil: null, authFailed: false, updatedAt: now })
        .where(eq(indexerStatus.indexerId, id))
        .run()
    },

    /** New settings start over. */
    reset(id: string) {
      db.delete(indexerStatus).where(eq(indexerStatus.indexerId, id)).run()
    },

    saveSession(id: string, now: number, session: string | null) {
      db.insert(indexerStatus)
        .values({ indexerId: id, session, updatedAt: now })
        .onConflictDoUpdate({ target: indexerStatus.indexerId, set: { session, updatedAt: now } })
        .run()
    },

    /** Queries, failures and response time over the last 24 hours, per indexer. */
    stats(now: number) {
      const since = hourOf(now) - 23 * HOUR
      const rows = db
        .select({
          indexerId: indexerStats.indexerId,
          queries: sql<number>`sum(${indexerStats.queries})`,
          failures: sql<number>`sum(${indexerStats.failures})`,
          responseMs: sql<number>`sum(${indexerStats.responseMs})`,
          grabs: sql<number>`sum(${indexerStats.grabs})`,
        })
        .from(indexerStats)
        .where(gte(indexerStats.hour, since))
        .groupBy(indexerStats.indexerId)
        .all()
      return new Map(rows.map((r) => [r.indexerId, r]))
    },

    /** Drops rows older than two days; the table never needs more than 24 hours. */
    prune(now: number) {
      db.delete(indexerStats)
        .where(lt(indexerStats.hour, hourOf(now) - 48 * HOUR))
        .run()
    },
  }
}
export type HealthStore = ReturnType<typeof createHealth>

export type IndexerStats = {
  queries24h: number
  grabs24h: number
  /** Over successful queries; null before the first. */
  avgResponseMs: number | null
  /** 0 to 1; null before the first query. */
  successRate: number | null
}

export function summarize(
  row: { queries: number; failures: number; responseMs: number; grabs: number } | undefined,
): IndexerStats {
  if (!row?.queries)
    return { queries24h: 0, grabs24h: row?.grabs ?? 0, avgResponseMs: null, successRate: null }
  const ok = row.queries - row.failures
  return {
    queries24h: row.queries,
    grabs24h: row.grabs,
    avgResponseMs: ok > 0 ? Math.round(row.responseMs / ok) : null,
    successRate: ok / row.queries,
  }
}

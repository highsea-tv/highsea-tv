// SPDX-License-Identifier: AGPL-3.0-only
import {
  AppError,
  type Clock,
  type EventBus,
  type Logger,
  newId,
  silentLogger,
  systemClock,
} from '@highsea-tv/core'
import { type Db, schema } from '@highsea-tv/db'
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, or, type SQL } from 'drizzle-orm'
import type { z } from 'zod'
import { parseSubject, type Subject, type SubjectRef, subjectKey } from './subjects.ts'

const { jobs, jobRuns, jobSchedules } = schema

export type JobContext = {
  jobId: string
  attempt: number
  /** Aborted on timeout and on shutdown: long work should stop when it fires. */
  signal: AbortSignal
  logger: Logger
  /**
   * How far through it is, 0 to 1, for the item's page (HT-106). Kept in memory while it runs,
   * announced as it moves on by a whole percent.
   */
  progress(share: number): void
}

export type JobDefinition<P> = {
  type: string
  payload: z.ZodType<P>
  /** How many of this type run at once. Default 1. */
  concurrency?: number
  /** Tries before it's failed. Default 3. */
  attempts?: number
  /** Wait before try `attempt + 1`. Default 30s, doubling, at most an hour. */
  backoffMs?: (attempt: number) => number
  timeoutMs?: number
  /**
   * The library item a job of this type works on (HT-106), worked out from its payload as it's
   * queued; null or none for work across the library. An enqueue's own `subject` wins.
   */
  subject?: (payload: P) => Subject | null
  run(payload: P, ctx: JobContext): Promise<void>
}

export const defineJob = <P>(definition: JobDefinition<P>) => definition

export type Job = typeof jobs.$inferSelect

/** A scheduled job type, as System › Tasks lists it. */
export type Task = {
  type: string
  everyMs: number
  enabled: boolean
  nextRunAt: number
  lastRunAt: number | null
  lastError: string | null
  state: 'running' | 'queued' | 'idle' | 'failed'
}

export type EnqueueOptions = {
  runAt?: number
  dedupeKey?: string
  attempts?: number
  /** The library item it works on, over its type's own `subject`. */
  subject?: Subject | null
}

/** A job queued or running on a library item, or one that finished lately (HT-106). */
export type ItemJob = {
  id: string
  type: string
  status: Job['status']
  subject: SubjectRef
  of: SubjectRef
  /** When it was queued, or started when it's running. */
  since: number
  /** When it's due, while it waits: later than now when it waits to try again. */
  runAt: number
  /** 0 to 1 while it runs, where its type says. */
  progress: number | null
  finishedAt: number | null
  error: string | null
}

/** How long a finished job stays in an item's read, so its page can say how it went. */
export const FINISHED_KEPT_MS = 10 * 60_000

const defaultBackoff = (attempt: number) => Math.min(30_000 * 2 ** (attempt - 1), 3_600_000)

export type JobQueue = ReturnType<typeof createJobQueue>

export function createJobQueue({
  db,
  clock = systemClock,
  logger = silentLogger,
  events,
}: {
  db: Db
  clock?: Clock
  logger?: Logger
  events?: EventBus
}) {
  const log = logger.child('jobs')
  // biome-ignore lint/suspicious/noExplicitAny: definitions of every payload type live together
  const definitions = new Map<string, JobDefinition<any>>()
  const running = new Map<
    string,
    { type: string; controller: AbortController; done: Promise<void>; progress: number | null }
  >()
  let timer: ReturnType<typeof setInterval> | null = null
  let accepting = true

  const announce = (ids: string[]) => {
    if (ids.length) events?.emit({ topic: 'jobs.updated', ids })
  }

  function define<P>(definition: JobDefinition<P>) {
    if (definitions.has(definition.type))
      throw new AppError('conflict', `A job type named ${definition.type} is already defined.`)
    definitions.set(definition.type, definition)
  }

  function enqueue(type: string, payload: unknown, options: EnqueueOptions = {}): string {
    const definition = definitions.get(type)
    if (!definition) throw new AppError('invalid', `There's no job type named ${type}.`)
    const parsed = definition.payload.safeParse(payload)
    if (!parsed.success)
      throw new AppError('invalid', `That isn't a valid ${type} payload.`, parsed.error.issues)
    if (options.dedupeKey) {
      const existing = db
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.type, type),
            eq(jobs.dedupeKey, options.dedupeKey),
            eq(jobs.status, 'queued'),
          ),
        )
        .get()
      if (existing) return existing.id
    }
    const now = clock.now()
    const id = newId('job')
    let subject: Subject | null | undefined = options.subject
    if (subject === undefined) {
      try {
        subject = definition.subject?.(parsed.data) ?? null
      } catch (e) {
        // the mark is a courtesy: a lookup that fails never stops the work being queued
        log.warn('couldn’t name a job’s item', { type, error: (e as Error).message })
        subject = null
      }
    }
    db.insert(jobs)
      .values({
        id,
        type,
        payload: parsed.data as object,
        status: 'queued',
        dedupeKey: options.dedupeKey ?? null,
        maxAttempts: options.attempts ?? definition.attempts ?? 3,
        runAt: options.runAt ?? now,
        createdAt: now,
        subject: subject ? subjectKey(subject) : null,
        subjectOf: subject ? subjectKey(subject.of ?? subject) : null,
      })
      .run()
    announce([id])
    return id
  }

  /** Runs `type` every `everyMs`, first at `firstRunAt` (default: one interval from now). */
  function schedule(type: string, everyMs: number, { firstRunAt }: { firstRunAt?: number } = {}) {
    if (!definitions.has(type)) throw new AppError('invalid', `There's no job type named ${type}.`)
    const nextRunAt = firstRunAt ?? clock.now() + everyMs
    db.insert(jobSchedules)
      .values({ type, everyMs, nextRunAt, enabled: true })
      .onConflictDoUpdate({ target: jobSchedules.type, set: { everyMs, enabled: true } })
      .run()
  }

  /** On boot: jobs that were running when the process stopped are retried, or failed. */
  function recover() {
    const now = clock.now()
    const stuck = db.select().from(jobs).where(eq(jobs.status, 'running')).all()
    for (const job of stuck) {
      const again = job.attempts < job.maxAttempts
      db.update(jobs)
        .set(
          again
            ? { status: 'queued', runAt: now, startedAt: null }
            : { status: 'failed', finishedAt: now, error: 'Interrupted by a restart.' },
        )
        .where(eq(jobs.id, job.id))
        .run()
      db.update(jobRuns)
        .set({ outcome: 'interrupted', finishedAt: now, error: 'Interrupted by a restart.' })
        .where(and(eq(jobRuns.jobId, job.id), eq(jobRuns.attempt, job.attempts)))
        .run()
    }
    if (stuck.length) log.warn('recovered interrupted jobs', { count: stuck.length })
    announce(stuck.map((j) => j.id))
    return stuck.length
  }

  function enqueueDueSchedules(now: number) {
    const due = db
      .select()
      .from(jobSchedules)
      .where(and(eq(jobSchedules.enabled, true), lte(jobSchedules.nextRunAt, now)))
      .all()
    for (const s of due) {
      if (!definitions.has(s.type)) continue
      // a schedule that fell behind (the server was off) runs once, not once per missed interval
      const missed = Math.floor((now - s.nextRunAt) / s.everyMs)
      db.update(jobSchedules)
        .set({ nextRunAt: s.nextRunAt + (missed + 1) * s.everyMs, lastRunAt: now })
        .where(eq(jobSchedules.type, s.type))
        .run()
      enqueue(s.type, {}, { dedupeKey: 'schedule' })
    }
  }

  function start(job: Job, definition: JobDefinition<unknown>) {
    const now = clock.now()
    const attempt = job.attempts + 1
    db.update(jobs)
      .set({ status: 'running', attempts: attempt, startedAt: now, error: null })
      .where(eq(jobs.id, job.id))
      .run()
    const runId = newId('run')
    db.insert(jobRuns)
      .values({ id: runId, jobId: job.id, type: job.type, attempt, startedAt: now })
      .run()
    announce([job.id])

    const controller = new AbortController()
    const jobLog = log.child(`jobs:${job.type}`)
    // kept before the job starts: its first steps run at once, and may say how far it is
    const entry = {
      type: job.type,
      controller,
      done: Promise.resolve(),
      progress: null as number | null,
    }
    running.set(job.id, entry)
    entry.done = (async () => {
      const timeout = definition.timeoutMs
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const run = definition.run(definition.payload.parse(job.payload), {
          jobId: job.id,
          attempt,
          signal: controller.signal,
          logger: jobLog,
          progress: (share) => {
            const r = running.get(job.id)
            if (!r) return
            const next = Math.min(1, Math.max(0, share))
            const moved =
              r.progress === null || Math.floor(next * 100) !== Math.floor(r.progress * 100)
            r.progress = next
            if (moved && job.subject) announce([job.id])
          },
        })
        await (timeout
          ? Promise.race([
              run,
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                  // reject first: aborting can settle the job's own promise synchronously
                  reject(new Error(`Timed out after ${Math.round(timeout / 1000)}s.`))
                  controller.abort()
                }, timeout)
              }),
            ])
          : run)
        finish(job, runId, attempt, null)
      } catch (e) {
        finish(job, runId, attempt, e instanceof Error ? e : new Error(String(e)))
      } finally {
        if (timer) clearTimeout(timer)
        running.delete(job.id)
      }
    })()
  }

  function finish(job: Job, runId: string, attempt: number, error: Error | null) {
    const now = clock.now()
    db.update(jobRuns)
      .set({
        outcome: error ? 'failed' : 'succeeded',
        finishedAt: now,
        error: error?.message ?? null,
      })
      .where(eq(jobRuns.id, runId))
      .run()
    const current = db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, job.id)).get()
    if (current?.status === 'cancelled') return announce([job.id])
    if (!error) {
      db.update(jobs).set({ status: 'succeeded', finishedAt: now }).where(eq(jobs.id, job.id)).run()
    } else if (attempt < job.maxAttempts) {
      const definition = definitions.get(job.type)
      const wait = (definition?.backoffMs ?? defaultBackoff)(attempt)
      db.update(jobs)
        .set({ status: 'queued', runAt: now + wait, error: error.message })
        .where(eq(jobs.id, job.id))
        .run()
      log.warn('job failed; retrying', {
        type: job.type,
        id: job.id,
        attempt,
        error: error.message,
      })
    } else {
      db.update(jobs)
        .set({ status: 'failed', finishedAt: now, error: error.message })
        .where(eq(jobs.id, job.id))
        .run()
      log.error('job failed', { type: job.type, id: job.id, attempt, error: error.message })
    }
    announce([job.id])
  }

  /**
   * Queues due schedules, then starts due jobs up to each type's concurrency. It's synchronous
   * (the database is), so two ticks never overlap; the jobs it starts run on their own.
   */
  function tick(): Promise<void> {
    if (!accepting) return Promise.resolve()
    const now = clock.now()
    enqueueDueSchedules(now)
    const due = db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, 'queued'), lte(jobs.runAt, now)))
      .orderBy(asc(jobs.runAt), asc(jobs.createdAt))
      .all()
    for (const job of due) {
      const definition = definitions.get(job.type)
      if (!definition) {
        db.update(jobs)
          .set({ status: 'failed', finishedAt: now, error: `No job type named ${job.type}.` })
          .where(eq(jobs.id, job.id))
          .run()
        announce([job.id])
        continue
      }
      const busy = [...running.values()].filter((r) => r.type === job.type).length
      if (busy >= (definition.concurrency ?? 1)) continue
      start(job, definition)
    }
    return Promise.resolve()
  }

  /** Resolves when every job started so far has finished. */
  async function idle() {
    while (running.size) await Promise.all([...running.values()].map((r) => r.done))
  }

  function cancel(id: string) {
    const job = db.select().from(jobs).where(eq(jobs.id, id)).get()
    if (!job) throw new AppError('not-found', 'That job doesn’t exist.')
    if (job.status !== 'queued' && job.status !== 'running') return
    db.update(jobs)
      .set({ status: 'cancelled', finishedAt: clock.now() })
      .where(eq(jobs.id, id))
      .run()
    running.get(id)?.controller.abort()
    announce([id])
  }

  function list({
    status,
    type,
    limit = 100,
  }: {
    status?: Job['status'][]
    type?: string
    limit?: number
  } = {}) {
    const where: SQL[] = []
    if (status?.length) where.push(inArray(jobs.status, status))
    if (type) where.push(eq(jobs.type, type))
    return db
      .select()
      .from(jobs)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(jobs.createdAt))
      .limit(limit)
      .all()
  }

  const get = (id: string) => db.select().from(jobs).where(eq(jobs.id, id)).get() ?? null

  /**
   * System › Tasks (checkpoint 8a): each scheduled job type with its interval, next and last run,
   * and whether a job of it is running or waiting, or the last run failed.
   */
  function tasks(): Task[] {
    return db
      .select()
      .from(jobSchedules)
      .orderBy(asc(jobSchedules.type))
      .all()
      .map((s) => {
        const active = db
          .select({ status: jobs.status })
          .from(jobs)
          .where(and(eq(jobs.type, s.type), inArray(jobs.status, ['running', 'queued'])))
          .orderBy(desc(jobs.status))
          .all()
        const last = db
          .select()
          .from(jobRuns)
          .where(eq(jobRuns.type, s.type))
          .orderBy(desc(jobRuns.startedAt))
          .limit(1)
          .get()
        const state: Task['state'] = active.some((j) => j.status === 'running')
          ? 'running'
          : active.length
            ? 'queued'
            : last?.outcome === 'failed'
              ? 'failed'
              : 'idle'
        return {
          type: s.type,
          everyMs: s.everyMs,
          enabled: s.enabled,
          nextRunAt: s.nextRunAt,
          lastRunAt: last?.startedAt ?? s.lastRunAt ?? null,
          lastError: last?.outcome === 'failed' ? (last.error ?? null) : null,
          state,
        }
      })
  }

  /** Runs a scheduled task now, as its schedule would: once, whatever is already waiting. */
  function runNow(type: string): string {
    const s = db.select().from(jobSchedules).where(eq(jobSchedules.type, type)).get()
    if (!s || !definitions.has(type)) throw new AppError('not-found', 'That task doesn’t exist.')
    return enqueue(type, {}, { dedupeKey: 'schedule' })
  }

  const itemJob = (j: Job): ItemJob | null => {
    const subject = parseSubject(j.subject)
    const of = parseSubject(j.subjectOf) ?? subject
    if (!subject || !of) return null
    return {
      id: j.id,
      type: j.type,
      status: j.status,
      subject,
      of,
      since: j.status === 'running' ? (j.startedAt ?? j.createdAt) : j.createdAt,
      runAt: j.runAt,
      progress: j.status === 'running' ? (running.get(j.id)?.progress ?? null) : null,
      finishedAt: j.finishedAt,
      error: j.error,
    }
  }
  const itemJobs = (rows: Job[]) => rows.flatMap((j) => itemJob(j) ?? [])

  /**
   * Every job queued or running on a library item (HT-106), oldest first: one read for a whole
   * library's marks. A show's carry its seasons' and episodes' (`of`).
   */
  const atWork = (): ItemJob[] =>
    itemJobs(
      db
        .select()
        .from(jobs)
        .where(and(inArray(jobs.status, ['running', 'queued']), isNotNull(jobs.subjectOf)))
        .orderBy(asc(jobs.createdAt))
        .all(),
    )

  /**
   * One item's work (HT-106): what's queued or running on it or on what it holds (a show's seasons
   * and episodes), and what finished in the last ten minutes, newest first, so its page can say how
   * it went.
   */
  function workOf(item: SubjectRef) {
    const key = subjectKey(item)
    const mine = or(eq(jobs.subjectOf, key), eq(jobs.subject, key))
    const active = itemJobs(
      db
        .select()
        .from(jobs)
        .where(and(mine, inArray(jobs.status, ['running', 'queued'])))
        .orderBy(asc(jobs.createdAt))
        .all(),
    )
    const finished = itemJobs(
      db
        .select()
        .from(jobs)
        .where(
          and(
            mine,
            inArray(jobs.status, ['succeeded', 'failed', 'cancelled']),
            gte(jobs.finishedAt, clock.now() - FINISHED_KEPT_MS),
          ),
        )
        .orderBy(desc(jobs.finishedAt))
        .limit(20)
        .all(),
    )
    return { active, finished }
  }

  const runsOf = (jobId: string) =>
    db.select().from(jobRuns).where(eq(jobRuns.jobId, jobId)).orderBy(asc(jobRuns.attempt)).all()

  return {
    define,
    enqueue,
    schedule,
    recover,
    tick,
    idle,
    cancel,
    list,
    get,
    runsOf,
    atWork,
    workOf,
    tasks,
    runNow,
    /** Ticks every `intervalMs` until stopped. */
    startTicking(intervalMs = 1000) {
      accepting = true
      timer ??= setInterval(() => {
        tick().catch((e) => log.error('tick failed', { error: (e as Error).message }))
      }, intervalMs)
    },
    /**
     * Stops starting jobs, then waits up to `deadlineMs` for running ones. Those still running are
     * aborted, and recovered as interrupted on the next boot.
     */
    async drain(deadlineMs = 10_000) {
      accepting = false
      if (timer) clearInterval(timer)
      timer = null
      let deadline: ReturnType<typeof setTimeout> | undefined
      const late = await Promise.race([
        idle().then(() => false),
        new Promise<boolean>((r) => {
          deadline = setTimeout(() => r(true), deadlineMs)
        }),
      ])
      // a pending deadline would keep the process alive
      clearTimeout(deadline)
      if (late) for (const r of running.values()) r.controller.abort()
    },
  }
}

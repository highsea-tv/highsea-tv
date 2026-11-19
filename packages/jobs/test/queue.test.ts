// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { createEventBus, createFakeClock } from '@highsea-tv/core'
import { migrate, openDatabase } from '@highsea-tv/db'
import { z } from 'zod'
import { createJobQueue, defineJob } from '../src/index.ts'

function setup() {
  const { db, raw } = openDatabase(':memory:')
  migrate(raw)
  const clock = createFakeClock()
  const events = createEventBus({ now: clock.now })
  const queue = createJobQueue({ db, clock, events })
  return { db, raw, clock, events, queue }
}

describe('job queue', () => {
  test('runs a job once, records the run, and announces changes', async () => {
    const { queue, events } = setup()
    const seen: string[] = []
    queue.define(
      defineJob({
        type: 'greet',
        payload: z.object({ name: z.string() }),
        async run({ name }) {
          seen.push(name)
        },
      }),
    )
    const topics: string[] = []
    events.subscribe((e) => topics.push(e.topic))
    const id = queue.enqueue('greet', { name: 'Ines' })
    await queue.tick()
    await queue.idle()
    expect(seen).toEqual(['Ines'])
    expect(queue.get(id)?.status).toBe('succeeded')
    expect(queue.runsOf(id).map((r) => r.outcome)).toEqual(['succeeded'])
    expect(topics.every((t) => t === 'jobs.updated')).toBe(true)
    // nothing left to do
    await queue.tick()
    await queue.idle()
    expect(seen).toEqual(['Ines'])
  })

  test('rejects an unknown type and a bad payload', () => {
    const { queue } = setup()
    queue.define(
      defineJob({ type: 'x', payload: z.object({ n: z.number() }), run: async () => {} }),
    )
    expect(() => queue.enqueue('nope', {})).toThrow('no job type named nope')
    expect(() => queue.enqueue('x', { n: 'one' })).toThrow('valid x payload')
  })

  test('retries with backoff, then fails', async () => {
    const { queue, clock } = setup()
    let tries = 0
    queue.define(
      defineJob({
        type: 'flaky',
        payload: z.object({}),
        attempts: 2,
        backoffMs: () => 60_000,
        async run() {
          tries++
          throw new Error('Indexer timed out')
        },
      }),
    )
    const id = queue.enqueue('flaky', {})
    await queue.tick()
    await queue.idle()
    expect(queue.get(id)).toMatchObject({
      status: 'queued',
      attempts: 1,
      error: 'Indexer timed out',
    })
    // not due yet
    await queue.tick()
    await queue.idle()
    expect(tries).toBe(1)
    clock.advance(60_000)
    await queue.tick()
    await queue.idle()
    expect(tries).toBe(2)
    expect(queue.get(id)?.status).toBe('failed')
    expect(queue.runsOf(id).map((r) => r.outcome)).toEqual(['failed', 'failed'])
  })

  test('holds each type to its concurrency', async () => {
    const { queue } = setup()
    let active = 0
    let peak = 0
    const gates: (() => void)[] = []
    queue.define(
      defineJob({
        type: 'slow',
        payload: z.object({}),
        concurrency: 2,
        async run() {
          active++
          peak = Math.max(peak, active)
          await new Promise<void>((r) => gates.push(r))
          active--
        },
      }),
    )
    for (let i = 0; i < 5; i++) queue.enqueue('slow', {})
    await queue.tick()
    expect(active).toBe(2)
    for (const open of gates.splice(0)) open()
    await new Promise((r) => setTimeout(r, 0))
    await queue.tick()
    expect(active).toBe(2)
    for (const open of gates.splice(0)) open()
    await new Promise((r) => setTimeout(r, 0))
    await queue.tick()
    for (const open of gates.splice(0)) open()
    await queue.idle()
    expect(peak).toBe(2)
    expect(queue.list({ status: ['succeeded'] })).toHaveLength(5)
  })

  test('a dedupe key keeps one waiting job', () => {
    const { queue } = setup()
    queue.define(
      defineJob({ type: 'refresh', payload: z.object({ id: z.string() }), run: async () => {} }),
    )
    const a = queue.enqueue('refresh', { id: '1' }, { dedupeKey: '1' })
    const b = queue.enqueue('refresh', { id: '1' }, { dedupeKey: '1' })
    const c = queue.enqueue('refresh', { id: '2' }, { dedupeKey: '2' })
    expect(b).toBe(a)
    expect(c).not.toBe(a)
    expect(queue.list()).toHaveLength(2)
  })

  test('schedules run when due, once even after a long gap', async () => {
    const { queue, clock } = setup()
    let runs = 0
    queue.define(defineJob({ type: 'rss', payload: z.object({}), run: async () => void runs++ }))
    queue.schedule('rss', 15 * 60_000)
    await queue.tick()
    expect(runs).toBe(0)
    clock.advance(15 * 60_000)
    await queue.tick()
    await queue.idle()
    expect(runs).toBe(1)
    // the server was off for five intervals: one catch-up run
    clock.advance(5 * 15 * 60_000)
    await queue.tick()
    await queue.idle()
    await queue.tick()
    await queue.idle()
    expect(runs).toBe(2)
  })

  test('a timeout aborts the job and counts as a failure', async () => {
    const { queue } = setup()
    let aborted = false
    queue.define(
      defineJob({
        type: 'sync',
        payload: z.object({}),
        attempts: 1,
        timeoutMs: 20,
        run: (_p, { signal }) =>
          new Promise<void>((resolve) => {
            signal.addEventListener('abort', () => {
              aborted = true
              resolve()
            })
          }),
      }),
    )
    const id = queue.enqueue('sync', {})
    await queue.tick()
    await queue.idle()
    expect(aborted).toBe(true)
    expect(queue.get(id)).toMatchObject({ status: 'failed', error: 'Timed out after 0s.' })
  })

  test('after a crash, running jobs are retried or failed as interrupted', () => {
    const { db, raw, clock } = setup()
    const before = createJobQueue({ db, clock })
    before.define(
      defineJob({ type: 'import', payload: z.object({}), attempts: 2, run: async () => {} }),
    )
    const retry = before.enqueue('import', {})
    const last = before.enqueue('import', {}, { attempts: 1 })
    // simulate the process dying mid-run
    raw.run("UPDATE jobs SET status = 'running', attempts = 1")
    const after = createJobQueue({ db, clock })
    after.define(defineJob({ type: 'import', payload: z.object({}), run: async () => {} }))
    expect(after.recover()).toBe(2)
    expect(after.get(retry)?.status).toBe('queued')
    expect(after.get(last)).toMatchObject({ status: 'failed', error: 'Interrupted by a restart.' })
  })

  test('cancel stops a waiting job and aborts a running one', async () => {
    const { queue } = setup()
    let signal: AbortSignal | undefined
    queue.define(
      defineJob({
        type: 'long',
        payload: z.object({}),
        run: (_p, ctx) =>
          new Promise<void>((resolve) => {
            signal = ctx.signal
            ctx.signal.addEventListener('abort', () => resolve())
          }),
      }),
    )
    const id = queue.enqueue('long', {})
    await queue.tick()
    queue.cancel(id)
    await queue.idle()
    expect(signal?.aborted).toBe(true)
    expect(queue.get(id)?.status).toBe('cancelled')
  })

  test('drain stops new work and aborts what outlives the deadline', async () => {
    const { queue } = setup()
    let aborted = false
    queue.define(
      defineJob({
        type: 'hang',
        payload: z.object({}),
        run: (_p, { signal }) =>
          new Promise<void>((resolve) =>
            signal.addEventListener('abort', () => {
              aborted = true
              resolve()
            }),
          ),
      }),
    )
    queue.enqueue('hang', {})
    await queue.tick()
    await queue.drain(10)
    expect(aborted).toBe(true)
    queue.enqueue('hang', {})
    await queue.tick()
    expect(queue.list({ status: ['running'] })).toHaveLength(0)
  })
})

// HT-106: the admin marks the item a job works on
describe('a job’s item', () => {
  function withItems() {
    const s = setup()
    let release: () => void = () => {}
    s.queue.define(
      defineJob({
        type: 'refresh',
        payload: z.object({ kind: z.enum(['movie', 'show', 'person']), id: z.number() }),
        subject: ({ kind, id }) => (kind === 'person' ? null : { kind, id: String(id) }),
        run: () => new Promise<void>((r) => (release = r)),
      }),
    )
    s.queue.define(
      defineJob({
        type: 'subs',
        payload: z.object({ episode: z.number() }),
        subject: ({ episode }) => ({
          kind: 'episode',
          id: String(episode),
          of: { kind: 'show', id: '1396' },
        }),
        async run(_, ctx) {
          ctx.progress(0.25)
          ctx.progress(0.252)
          ctx.progress(0.5)
          throw new Error('No provider answered.')
        },
        attempts: 1,
      }),
    )
    return { ...s, release: () => release() }
  }

  test('keeps the item its type names, and a show’s carries its episodes’ work', async () => {
    const { queue, release, clock } = withItems()
    const film = queue.enqueue('refresh', { kind: 'movie', id: 603 })
    queue.enqueue('refresh', { kind: 'person', id: 1 })
    const show = queue.enqueue('refresh', { kind: 'show', id: 1396 })
    const subs = queue.enqueue('subs', { episode: 62085 })
    // an enqueue's own subject wins over its type's
    const other = queue.enqueue(
      'refresh',
      { kind: 'movie', id: 604 },
      { subject: { kind: 'collection', id: 'col_1' } },
    )

    const all = queue.atWork()
    expect(all.map((j) => [j.id, j.subject, j.of, j.status])).toEqual([
      [film, { kind: 'movie', id: '603' }, { kind: 'movie', id: '603' }, 'queued'],
      [show, { kind: 'show', id: '1396' }, { kind: 'show', id: '1396' }, 'queued'],
      [subs, { kind: 'episode', id: '62085' }, { kind: 'show', id: '1396' }, 'queued'],
      [other, { kind: 'collection', id: 'col_1' }, { kind: 'collection', id: 'col_1' }, 'queued'],
    ])

    expect(queue.workOf({ kind: 'show', id: '1396' }).active.map((j) => j.id)).toEqual([
      show,
      subs,
    ])
    // an episode's own read finds its work too
    expect(queue.workOf({ kind: 'episode', id: '62085' }).active.map((j) => j.id)).toEqual([subs])

    // the episode's job fails: it leaves the work and stays a while, with its reason
    clock.advance(1000)
    await queue.tick()
    const running = queue.workOf({ kind: 'movie', id: '603' }).active[0]
    expect(running?.status).toBe('running')
    expect(running?.since).toBe(clock.now())
    release()
    await queue.idle()
    const showWork = queue.workOf({ kind: 'show', id: '1396' })
    expect(showWork.active.map((j) => j.id)).toEqual([show])
    expect(showWork.finished.map((j) => [j.id, j.status, j.error])).toEqual([
      [subs, 'failed', 'No provider answered.'],
    ])
    expect(queue.workOf({ kind: 'movie', id: '603' }).finished.map((j) => j.status)).toEqual([
      'succeeded',
    ])

    // ten minutes on, it's no longer news
    clock.advance(10 * 60_000 + 1)
    expect(queue.workOf({ kind: 'show', id: '1396' }).finished).toEqual([])
  })

  test('progress is read while it runs and announced by the whole percent', async () => {
    const { queue, events } = withItems()
    const seen: number[] = []
    queue.define(
      defineJob({
        type: 'long',
        payload: z.object({}),
        subject: () => ({ kind: 'movie', id: '603' }),
        async run(_, ctx) {
          ctx.progress(0.4)
          seen.push(queue.atWork()[0]?.progress ?? -1)
          ctx.progress(0.401)
          ctx.progress(1.5)
          seen.push(queue.atWork()[0]?.progress ?? -1)
        },
      }),
    )
    queue.enqueue('long', {})
    let announced = 0
    events.subscribe((e) => {
      if (e.topic === 'jobs.updated') announced++
    })
    await queue.tick()
    await queue.idle()
    expect(seen).toEqual([0.4, 1])
    // started, 40%, 100%, finished: the step inside a percent says nothing
    expect(announced).toBe(4)
  })

  test('a lookup that throws queues the work without its item', () => {
    const { queue } = setup()
    queue.define(
      defineJob({
        type: 'odd',
        payload: z.object({}),
        subject: () => {
          throw new Error('gone')
        },
        run: async () => {},
      }),
    )
    const id = queue.enqueue('odd', {})
    expect(queue.get(id)?.subject).toBeNull()
    expect(queue.atWork()).toEqual([])
  })
})

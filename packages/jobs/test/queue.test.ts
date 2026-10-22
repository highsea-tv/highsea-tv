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

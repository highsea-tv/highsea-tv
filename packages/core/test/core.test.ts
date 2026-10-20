// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import {
  AppError,
  createEventBus,
  createFakeClock,
  createLogger,
  createSealer,
  generateSecretKey,
  memorySink,
  newId,
} from '../src/index.ts'

describe('ids', () => {
  test('a prefix and 16 base32 characters, never repeated', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId('job')))
    expect(ids.size).toBe(1000)
    for (const id of ids) expect(id).toMatch(/^job_[0-9a-hjkmnp-tv-z]{16}$/)
  })
})

describe('errors', () => {
  test('a code carries its HTTP status', () => {
    expect(new AppError('not-found', 'Nope').status).toBe(404)
    expect(new AppError('rate-limited', 'Slow down').status).toBe(429)
  })
})

describe('logger', () => {
  test('drops entries under its level and keeps fields', () => {
    const sink = memorySink(10)
    const clock = createFakeClock(1000)
    const log = createLogger({ level: 'info', sinks: [sink], clock })
    log.debug('hidden')
    log.child('jobs').info('ran', { type: 'backup' })
    expect(sink.entries()).toEqual([
      { at: 1000, level: 'info', source: 'jobs', message: 'ran', fields: { type: 'backup' } },
    ])
  })

  test('the memory sink keeps the newest entries', () => {
    const sink = memorySink(2)
    const log = createLogger({ sinks: [sink] })
    for (const m of ['a', 'b', 'c']) log.info(m)
    expect(sink.entries().map((e) => e.message)).toEqual(['b', 'c'])
  })
})

describe('event bus', () => {
  test('numbers events and replays from an id', () => {
    const bus = createEventBus({ now: () => 5, buffer: 3 })
    const seen: string[] = []
    bus.subscribe((e) => seen.push(e.topic))
    for (const t of ['a', 'b', 'c', 'd']) bus.emit({ topic: t })
    expect(seen).toEqual(['a', 'b', 'c', 'd'])
    expect(bus.since(2)?.map((e) => e.topic)).toEqual(['c', 'd'])
    expect(bus.since(4)).toEqual([])
    // event 1 fell out of the buffer: the client has to start over
    expect(bus.since(0)).toBeNull()
  })

  test('a failing listener doesn’t stop the rest', () => {
    const bus = createEventBus()
    let got = false
    bus.subscribe(() => {
      throw new Error('boom')
    })
    bus.subscribe(() => {
      got = true
    })
    bus.emit({ topic: 'x' })
    expect(got).toBe(true)
  })
})

describe('secrets', () => {
  test('seal and open round-trip; another key can’t open it', () => {
    const sealer = createSealer(generateSecretKey())
    const sealed = sealer.seal('tmdb-key-123')
    expect(sealed.startsWith('v1.')).toBe(true)
    expect(sealed).not.toContain('tmdb')
    expect(sealer.open(sealed)).toBe('tmdb-key-123')
    expect(() => createSealer(generateSecretKey()).open(sealed)).toThrow(AppError)
  })
})

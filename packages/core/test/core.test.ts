// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import {
  AppError,
  bytes,
  bytesParts,
  createEventBus,
  createFakeClock,
  createLogger,
  createSealer,
  duration,
  generateSecretKey,
  memorySink,
  newId,
  percent,
  rate,
  relative,
  retryAfterMs,
  shortDate,
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

  test('a level getter changes the level while it runs, children included', () => {
    const sink = memorySink(10)
    let level: 'debug' | 'warn' = 'warn'
    const log = createLogger({ level: () => level, sinks: [sink] })
    const child = log.child('jobs')
    child.info('hidden')
    level = 'debug'
    child.debug('shown')
    expect(sink.entries().map((e) => e.message)).toEqual(['shown'])
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

describe('format', () => {
  test('bytes and rates in decimal units, one decimal place', () => {
    expect(bytes(0)).toBe('0 B')
    expect(bytes(412_000_000)).toBe('412 MB')
    expect(bytes(6_200_000_000_000)).toBe('6.2 TB')
    expect(bytesParts(18_400_000)).toEqual(['18.4', 'MB'])
    expect(rate(18_400_000)).toBe('18.4 MB/s')
  })

  test('durations, relative times and dates', () => {
    expect(duration(45)).toBe('45s')
    expect(duration(12 * 60)).toBe('12m')
    expect(duration(4 * 3600 + 12 * 60)).toBe('4h 12m')
    expect(duration(3 * 86400)).toBe('3d')
    const now = Date.parse('2026-10-20T12:00:00Z')
    expect(relative('2026-10-20T12:09:00Z', now)).toBe('in 9m')
    expect(relative('2026-10-20T11:56:00Z', now)).toBe('4m ago')
    expect(percent(0.426)).toBe('42%')
    expect(shortDate('2026-10-23T12:00:00Z')).toBe('Fri 23')
  })
})

describe('fetch', () => {
  test('Retry-After as seconds or a date (RFC 9110 § 10.2.3)', () => {
    const now = Date.UTC(2026, 9, 17, 20, 15)
    expect(retryAfterMs('120', now)).toBe(120_000)
    expect(retryAfterMs('Sat, 17 Oct 2026 20:15:30 GMT', now)).toBe(30_000)
    expect(retryAfterMs('Sat, 17 Oct 2026 20:00:00 GMT', now)).toBe(0)
    expect(retryAfterMs('soon', now)).toBeNull()
    expect(retryAfterMs(null, now)).toBeNull()
  })
})

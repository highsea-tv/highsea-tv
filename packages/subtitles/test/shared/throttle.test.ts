// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import {
  afterFailure,
  afterSuccess,
  nextUtcMidnight,
  THROTTLE,
  type ThrottleState,
  throttled,
} from '../../src/shared/throttle.ts'
import type { ProviderErrorKind } from '../../src/shared/types.ts'

const NOW = Date.UTC(2026, 9, 21, 15, 30)
const fresh = (): ThrottleState => ({ throttledUntil: null, throttleReason: null, failures: [] })
const err = (kind: ProviderErrorKind, more: { retryAfterMs?: number; resetsAt?: number } = {}) => ({
  kind,
  retryAfterMs: more.retryAfterMs ?? null,
  resetsAt: more.resetsAt ?? null,
})

describe('afterFailure', () => {
  test('too many requests: an hour, a minute for OpenSubtitles.com, or what the provider says', () => {
    expect(afterFailure(fresh(), err('rate-limited'), 'subdl', NOW)).toEqual({
      throttledUntil: NOW + THROTTLE.rateLimited,
      throttleReason: 'rate-limited',
      failures: [],
    })
    expect(afterFailure(fresh(), err('rate-limited'), 'opensubtitles', NOW).throttledUntil).toBe(
      NOW + 60_000,
    )
    expect(
      afterFailure(fresh(), err('rate-limited', { retryAfterMs: 45_000 }), 'subsource', NOW)
        .throttledUntil,
    ).toBe(NOW + 45_000)
  })

  test('out of downloads: until the reset, else the next midnight UTC, at least a minute', () => {
    const reset = NOW + 3 * 60 * 60_000
    expect(afterFailure(fresh(), err('quota', { resetsAt: reset }), 'opensubtitles', NOW)).toEqual({
      throttledUntil: reset,
      throttleReason: 'quota',
      failures: [],
    })
    expect(afterFailure(fresh(), err('quota'), 'opensubtitles', NOW).throttledUntil).toBe(
      Date.UTC(2026, 9, 22),
    )
    expect(
      afterFailure(fresh(), err('quota', { resetsAt: NOW - 5 }), 'opensubtitles', NOW)
        .throttledUntil,
    ).toBe(NOW + 60_000)
  })

  test('a refused login: 12 hours', () => {
    expect(afterFailure(fresh(), err('auth'), 'opensubtitles', NOW)).toEqual({
      throttledUntil: NOW + 12 * 60 * 60_000,
      throttleReason: 'auth',
      failures: [],
    })
  })

  test('unavailable: an hour, but only after 5 within 2 minutes', () => {
    let s = fresh()
    for (let i = 0; i < 4; i++) {
      s = afterFailure(s, err('unavailable'), 'subdl', NOW + i * 1000)
      expect(s.throttledUntil).toBeNull()
    }
    expect(s.failures).toHaveLength(4)
    s = afterFailure(s, err('unavailable'), 'subdl', NOW + 4000)
    expect(s).toEqual({
      throttledUntil: NOW + 4000 + THROTTLE.unavailable,
      throttleReason: 'unavailable',
      failures: [],
    })
  })

  test('failures older than the window are forgotten', () => {
    let s = fresh()
    for (let i = 0; i < 4; i++) s = afterFailure(s, err('unavailable'), 'subdl', NOW + i * 1000)
    s = afterFailure(s, err('unavailable'), 'subdl', NOW + 3 * 60_000)
    expect(s.throttledUntil).toBeNull()
    expect(s.failures).toEqual([NOW + 3 * 60_000])
  })

  test('no account and an unreadable answer do not throttle', () => {
    const s = { ...fresh(), failures: [NOW - 1] }
    expect(afterFailure(s, err('no-account'), 'subdl', NOW)).toEqual(s)
    expect(afterFailure(s, err('invalid'), 'subdl', NOW)).toEqual(s)
  })
})

describe('afterSuccess and throttled', () => {
  test('a success forgets failures and keeps a wait', () => {
    const s: ThrottleState = { throttledUntil: NOW + 5, throttleReason: 'quota', failures: [1, 2] }
    expect(afterSuccess(s)).toEqual({
      throttledUntil: NOW + 5,
      throttleReason: 'quota',
      failures: [],
    })
  })

  test('throttled until the time passes', () => {
    expect(throttled({ throttledUntil: null }, NOW)).toBe(false)
    expect(throttled({ throttledUntil: NOW + 1 }, NOW)).toBe(true)
    expect(throttled({ throttledUntil: NOW }, NOW)).toBe(false)
  })

  test('the next midnight UTC', () => {
    expect(nextUtcMidnight(NOW)).toBe(Date.UTC(2026, 9, 22))
    expect(nextUtcMidnight(Date.UTC(2026, 9, 22))).toBe(Date.UTC(2026, 9, 23))
  })
})

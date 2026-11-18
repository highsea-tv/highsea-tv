// SPDX-License-Identifier: AGPL-3.0-only
// What the drafted widgets are drawn from (HT-47): the network's activity is made from the time
// alone, has quiet and busy stretches, and counts what's running; the weather is a week.
import { describe, expect, test } from 'bun:test'
import { ACTIVITY_STEP, networkActivity, weather } from '../src/widget-drafts.ts'

const NOON = Date.UTC(2026, 10, 17, 12, 0, 0)

describe('the network’s activity', () => {
  test('is the same for the same moment, oldest first, a sample every ten seconds', () => {
    const a = networkActivity(NOON, 10)
    expect(a).toEqual(networkActivity(NOON, 10))
    expect(a.samples).toHaveLength((10 * 60) / ACTIVITY_STEP + 1)
    expect(a.samples.at(-1)?.at).toBe(NOON)
    expect(a.samples.every((x, i, xs) => i === 0 || x.at - (xs[i - 1]?.at ?? 0) === 10_000)).toBe(
      true,
    )
  })

  test('a usual evening has stretches with nothing downloading and stretches with a lot', () => {
    // two hours cover every cycle the mock turns on
    const { samples } = networkActivity(NOON, 120)
    expect(samples.some((x) => x.down === 0)).toBe(true)
    expect(samples.some((x) => x.down > 15_000_000)).toBe(true)
    expect(samples.some((x) => x.local + x.remote === 0)).toBe(true)
    expect(samples.some((x) => x.local > 0 && x.remote > 0)).toBe(true)
    expect(samples.every((x) => x.down >= 0 && x.up >= 0 && x.local >= 0 && x.remote >= 0)).toBe(
      true,
    )
  })

  test('nothing running is all zeros; everything at once has every series moving', () => {
    const idle = networkActivity(NOON, 10, 'idle')
    expect(idle.samples.every((x) => x.down + x.up + x.local + x.remote === 0)).toBe(true)
    expect(idle).toMatchObject({ downloads: 0, seeding: 0, streams: { local: 0, remote: 0 } })
    const busy = networkActivity(NOON, 10, 'busy')
    expect(busy.samples.every((x) => x.down > 0 && x.up > 0 && x.local > 0 && x.remote > 0)).toBe(
      true,
    )
    expect(busy).toMatchObject({ downloads: 3, streams: { local: 2, remote: 1 } })
  })
})

describe('the weather', () => {
  test('is now, the next twelve hours and a week from today', () => {
    const w = weather(NOON)
    expect(w.place).toBe('Lisbon')
    expect(w.updatedAt).toBeLessThanOrEqual(NOON)
    expect(w.hours).toHaveLength(12)
    expect(w.days).toHaveLength(7)
    expect(w.days[0]?.at).toBe(NOON)
    expect(w.days.every((d) => d.high >= d.low)).toBe(true)
    expect(w.current.temperature).toBeGreaterThanOrEqual(w.days[0]?.low ?? 0)
    expect(w.current.temperature).toBeLessThanOrEqual(w.days[0]?.high ?? 0)
  })
})

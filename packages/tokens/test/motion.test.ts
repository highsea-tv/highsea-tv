// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from 'bun:test'
import { MAX_OVERSHOOT, springMetrics, springs, springToCss } from '../src/index.ts'

test('spring.base matches the locked direction', () => {
  const m = springMetrics(springs.base)
  expect(m.zeta).toBeCloseTo(0.913, 3)
  expect(m.t90).toBe(317)
  expect(m.settle).toBe(559)
  expect(m.overshoot).toBeCloseTo(0.09, 2)
})

test('spring.quick matches the design language', () => {
  const m = springMetrics(springs.quick)
  expect(m.zeta).toBeCloseTo(0.866, 3)
  expect(m.t90).toBe(188)
  expect(m.settle).toBe(459)
  expect(m.overshoot).toBeCloseTo(0.4, 1)
})

test('no spring overshoots more than 1%', () => {
  for (const s of Object.values(springs))
    expect(springMetrics(s).overshoot).toBeLessThanOrEqual(MAX_OVERSHOOT)
})

test('CSS easing is a 49-point linear() from 0 to 1', () => {
  const { easing, duration } = springToCss(springs.base)
  const pts = easing.slice('linear('.length, -1).split(', ').map(Number)
  expect(pts).toHaveLength(49)
  expect(pts[0]).toBe(0)
  expect(pts.at(-1)).toBe(1)
  expect(duration).toBeGreaterThan(550)
  expect(duration).toBeLessThan(580)
})

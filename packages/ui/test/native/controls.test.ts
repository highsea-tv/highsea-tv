// SPDX-License-Identifier: AGPL-3.0-only
// The control spec's platform rule in points (src/native/metrics.ts, controls.md), by the form
// factor's input: a pointer's rule, the phone's touch rule, the TV's units turned into points, and
// the hit area that takes a touch target to 44.
import { describe, expect, test } from 'bun:test'
import { controlMetrics, targets } from '@highsea-tv/tokens'
import { centredPadding, controlPoints, hitSlopFor } from '../../src/native/metrics.ts'

describe('a pointer', () => {
  test('draws the spec as it is: 36 and 30, with 14 and 13 text', () => {
    const md = controlPoints('pointer', 1)
    const sm = controlPoints('pointer', 1, 'sm')
    const { unit: _md, ...pointerMd } = controlMetrics('pointer')
    const { unit: _sm, ...pointerSm } = controlMetrics('pointer', 'sm')
    expect(md).toEqual(pointerMd)
    expect(sm).toEqual(pointerSm)
    expect([md.height, sm.height]).toEqual([36, 30])
    expect([md.text, sm.text]).toEqual([14, 13])
    expect(md.radius).toBe(8)
  })

  test('has no hit area, so nothing slops past the drawn control', () => {
    const m = controlPoints('pointer', 1)
    expect(m.hit).toBe(0)
    expect(hitSlopFor(m.hit, m.height)).toBeUndefined()
    expect(hitSlopFor(m.hit, m.height, m.height)).toBeUndefined()
  })

  test('ignores the unit, which is 1 off the TV', () => {
    expect(controlPoints('pointer', 19.2)).toEqual(controlPoints('pointer', 1))
  })
})

describe('the phone', () => {
  test('draws the spec as it is, 36 and 30, with 16 text', () => {
    const md = controlPoints('touch', 1)
    const sm = controlPoints('touch', 1, 'sm')
    expect(md.height).toBe(36)
    expect(sm.height).toBe(30)
    expect(md.text).toBe(16)
    expect(sm.text).toBe(16)
    expect(md.radius).toBe(8)
    expect(md.hit).toBe(targets.touch)
  })

  test('ignores the unit, which is 1 off the TV', () => {
    expect(controlPoints('touch', 19.2)).toEqual(controlPoints('touch', 1))
  })
})

describe('the TV', () => {
  test('turns the spec’s screen units into points by 1u', () => {
    const u = 19.2 // 1u at 1080p
    const inUnits = controlMetrics('tv')
    const pt = controlPoints('tv', u)
    expect(pt.height).toBeCloseTo(inUnits.height * u, 1)
    expect(pt.radius).toBeCloseTo(inUnits.radius * u, 1)
    expect(pt.text).toBeCloseTo(inUnits.text * u, 1)
    // 1.75 times the pointer's 36 at its reference width
    expect(pt.height).toBeCloseTo(63, 0)
  })

  test('has no hit area: nothing on a TV is touched', () => {
    expect(controlPoints('tv', 19.2).hit).toBe(0)
  })

  test('keeps the same proportions at every resolution', () => {
    const hd = controlPoints('tv', 12.8)
    const uhd = controlPoints('tv', 38.4)
    expect(uhd.height / hd.height).toBeCloseTo(3, 2)
  })
})

describe('the hit area', () => {
  test('takes a 36 control to 44, half above and half below', () => {
    expect(hitSlopFor(44, 36)).toEqual({ top: 4, bottom: 4, left: 0, right: 0 })
  })

  test('takes a 30 control to 44', () => {
    expect(hitSlopFor(44, 30)).toEqual({ top: 7, bottom: 7, left: 0, right: 0 })
  })

  test('widens a square icon button too', () => {
    expect(hitSlopFor(44, 36, 36)).toEqual({ top: 4, bottom: 4, left: 4, right: 4 })
  })

  test('leaves a wide control’s sides alone', () => {
    expect(hitSlopFor(44, 36, 120)).toEqual({ top: 4, bottom: 4, left: 0, right: 0 })
  })

  test('is nothing where the control already reaches it, or there is no hit area', () => {
    expect(hitSlopFor(44, 44, 44)).toBeUndefined()
    expect(hitSlopFor(0, 63)).toBeUndefined()
  })

  test('never overlaps a neighbour at the row’s gap', () => {
    const m = controlPoints('touch', 1)
    const slop = hitSlopFor(m.hit, m.height, m.height)
    expect((slop?.right ?? 0) + (slop?.left ?? 0)).toBeLessThanOrEqual(m.rowGap)
  })
})

describe('a label', () => {
  test('is centred in the control’s height', () => {
    const m = controlPoints('touch', 1)
    const line = Math.round(m.text * m.leading)
    expect(centredPadding(m) * 2 + line).toBe(m.height)
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
// The TV's layout and remote rules (src/tv/model.ts, tv.md).
import { describe, expect, test } from 'bun:test'
import {
  HERO_DWELL_MS,
  homeBack,
  homeLift,
  inUnits,
  KEEP,
  remoteKey,
  rowOffset,
  unit,
} from '../src/tv/model.ts'

describe('screen units', () => {
  test('1u is 1% of the width, at every resolution tv.md lists', () => {
    expect(unit(1280)).toBe(12.8)
    expect(unit(1920)).toBe(19.2)
    expect(unit(3840)).toBe(38.4)
  })

  test('a poster is 10.5u, about 202px at 1080p', () => {
    expect(inUnits(10.5, 1920)).toBeCloseTo(201.6)
  })
})

describe('rows by transform', () => {
  test('keep the focused item 30% in', () => {
    expect(KEEP.row).toBe(0.3)
    // an item centred at 1500 in a 1920 view of a 4000 track sits at 576 (30%)
    expect(rowOffset(1500, 1920, 4000)).toBe(1500 - 576)
  })

  test('clamp at the start and the end', () => {
    expect(rowOffset(200, 1920, 4000)).toBe(0)
    expect(rowOffset(3900, 1920, 4000)).toBe(4000 - 1920)
    // a row shorter than the screen never moves
    expect(rowOffset(1000, 1920, 1200)).toBe(0)
  })
})

describe("Home's lift", () => {
  test('rests while focus is on the hero or the featured row', () => {
    expect(homeLift({ row: -1, featured: 0, rowTop: 600, width: 1920 })).toBe(0)
    expect(homeLift({ row: 0, featured: 0, rowTop: 600, width: 1920 })).toBe(0)
  })

  test("lifts a lower row's title to the safe area's top (3.2u)", () => {
    expect(homeLift({ row: 2, featured: 0, rowTop: 1400, width: 1920 })).toBeCloseTo(
      1400 - 3.2 * 19.2,
    )
  })

  test('without a featured row, any row below the hero lifts', () => {
    expect(homeLift({ row: 0, featured: -1, rowTop: 700, width: 1920 })).toBeCloseTo(
      700 - 3.2 * 19.2,
    )
  })
})

describe('the remote', () => {
  test('each key plays its sound', () => {
    expect(remoteKey('left')).toEqual({ action: 'move', sound: 'navigate' })
    expect(remoteKey('select')).toEqual({ action: 'select', sound: 'select' })
    expect(remoteKey('longSelect')).toEqual({ action: 'actions', sound: 'select' })
    expect(remoteKey('playPause')).toEqual({ action: 'play', sound: 'select' })
    expect(remoteKey('menu')).toEqual({ action: 'back', sound: 'back' })
  })

  test('other events are left to tvOS', () => {
    expect(remoteKey('swipeUp')).toBeNull()
    expect(remoteKey('blur')).toBeNull()
  })

  test('Back at the home root: first to the first item, then out', () => {
    expect(homeBack(false)).toBe('focus-first')
    expect(homeBack(true)).toBe('exit')
  })

  test("the hero's dwell is the motion token's 220 ms", () => {
    expect(HERO_DWELL_MS).toBe(220)
  })
})

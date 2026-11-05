// SPDX-License-Identifier: AGPL-3.0-only
// The TV's layout and remote rules (src/tv/model.ts, tv.md).
import { describe, expect, test } from 'bun:test'
import { tv } from '@highsea-tv/tokens'
import {
  HERO_DWELL_MS,
  homeBack,
  homeRowAt,
  inUnits,
  KEEP,
  keptAt,
  remoteKey,
  unit,
} from '../../src/native/tv/model.ts'

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

describe('where focus lands', () => {
  test("a row's tile lands with its centre 30% in", () => {
    expect(KEEP.row).toBe(0.3)
    // a 200px tile in a 1920 view: its leading edge at 476, so its centre is at 576 (30%)
    expect(keptAt(KEEP.row, 1920, 200)).toBe(476)
  })

  test("a page's part lands with its centre `keep` of the way down", () => {
    expect(keptAt(0.4, 1080, 300)).toBe(432 - 150)
  })
})

describe("Home's rows", () => {
  test('the hero and the featured row land where they are, so the page rests at the top', () => {
    expect(homeRowAt({ row: -1, featured: 0, rowTop: 400, width: 1920 })).toBe(400)
    expect(homeRowAt({ row: 0, featured: 0, rowTop: 600, width: 1920 })).toBe(600)
  })

  test("a lower row's title lands at the safe area's top (tv.safe.y)", () => {
    expect(homeRowAt({ row: 2, featured: 0, rowTop: 1400, width: 1920 })).toBeCloseTo(
      tv.safe.y * 19.2,
    )
  })

  test('without a featured row, any row below the hero lifts', () => {
    expect(homeRowAt({ row: 0, featured: -1, rowTop: 700, width: 1920 })).toBeCloseTo(
      tv.safe.y * 19.2,
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

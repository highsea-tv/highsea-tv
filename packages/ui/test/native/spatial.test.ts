// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import {
  type Box,
  isCandidate,
  pickBest,
  score,
  trackOffset,
  trackStart,
} from '../../src/native/tv/spatial/spatial.ts'

const box = (left: number, top: number, width = 100, height = 150): Box => ({
  left,
  top,
  width,
  height,
})

// two rows of posters with a 20px gap, and a hero button row above them
const row1 = [0, 120, 240, 360].map((x) => box(x, 300))
const row2 = [0, 120, 240, 360].map((x) => box(x + 40, 500))
const heroButtons = [box(0, 100, 80, 40), box(100, 100, 80, 40)]

describe('spatial focus model', () => {
  test('left and right stay in the row', () => {
    const all = [...row1, ...row2]
    expect(pickBest('right', row1[1] as Box, all)).toBe(2)
    expect(pickBest('left', row1[1] as Box, all)).toBe(0)
    // nothing to the right of the last poster in its row, even though row 2 goes further
    expect(pickBest('right', row1[3] as Box, [...row1, box(500, 500)])).toBe(-1)
  })

  test('left/right never slide diagonally into another region', () => {
    expect(isCandidate('right', row1[0] as Box, row2[3] as Box)).toBe(false)
  })

  test('down picks the nearest overlapping item in the next row', () => {
    // row 2 is offset 40px: from row1[1] (120–220) both row2[0] (40–140) and row2[1] (160–260)
    // overlap; the closer center wins
    expect(pickBest('down', row1[1] as Box, row2)).toBe(1)
  })

  test('up accepts a 45° cone when nothing overlaps', () => {
    const far = box(400, 300)
    expect(isCandidate('up', far, heroButtons[1] as Box)).toBe(false)
    const near = box(150, 200)
    expect(isCandidate('up', near, heroButtons[1] as Box)).toBe(true)
  })

  test('the orthogonal offset weighs 3× for left/right', () => {
    const from = box(0, 0)
    const sameRowFar = box(400, 0)
    const offRowNear = box(120, 100)
    expect(score('right', from, sameRowFar)).toBe(300)
    expect(score('right', from, offRowNear)).toBe(20 + 300)
  })

  test('candidates must be more than 2px ahead', () => {
    expect(isCandidate('right', box(0, 0), box(2, 0))).toBe(false)
    expect(isCandidate('right', box(0, 0), box(3, 0))).toBe(true)
  })

  test('tracks keep focus at their fraction and clamp at the ends', () => {
    expect(trackOffset({ itemCenter: 1000, view: 1000, total: 3000, keep: 0.3 })).toBe(700)
    expect(trackOffset({ itemCenter: 100, view: 1000, total: 3000, keep: 0.3 })).toBe(0)
    expect(trackOffset({ itemCenter: 2950, view: 1000, total: 3000, keep: 0.3 })).toBe(2000)
    expect(trackOffset({ itemCenter: 100, view: 1000, total: 3000, keep: 0.5, clamp: false })).toBe(
      -400,
    )
  })
})

describe('trackStart', () => {
  // 200px items 50px apart after 100px of padding: item n sits in the first slot at 250n
  const stops = Array.from({ length: 12 }, (_, n) => n * 250)
  const at = (n: number, total = 3000) =>
    trackStart({ itemCenter: 100 + n * 250 + 100, width: 200, pad: 100, view: 1000, total, stops })
  test('keeps the item in the first slot', () => {
    expect(at(0)).toBe(0)
    expect(at(4)).toBe(1000)
  })
  test('stops at the first slot that shows the end, so an item is always flush', () => {
    // the end shows from 2000: item 8's slot
    expect(at(10)).toBe(2000)
    // from 1900, between items 7 and 8: it goes on to 8 rather than stopping partway through 7
    expect(at(10, 2900)).toBe(2000)
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { type Box, isCandidate, pickBest, score, trackOffset } from '../src/focus/spatial.ts'

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

// SPDX-License-Identifier: AGPL-3.0-only
// The featured cards' bloom colour (client/vibrant.ts): the most vibrant hue in a picture's
// pixels, leaving out the near-black, the near-white and the grey.
import { describe, expect, test } from 'bun:test'
import { glow, pickVibrant } from '../src/client/vibrant.ts'

const pixels = (...rgbs: [number, number, number, number][]) =>
  new Uint8ClampedArray(
    rgbs.flatMap(([r, g, b, n]) => Array.from({ length: n }, () => [r, g, b, 255]).flat()),
  )

describe('pickVibrant', () => {
  test('a little colour beats a lot of black, white and grey', () => {
    const hsl = pickVibrant(
      pixels([0, 0, 0, 500], [255, 255, 255, 200], [128, 128, 128, 200], [200, 40, 40, 20]),
    )
    expect(hsl).not.toBeNull()
    expect(Math.round((hsl?.[0] ?? 1) * 360)).toBe(0)
  })

  test('the more colourful hue wins over a larger dull one', () => {
    const hsl = pickVibrant(pixels([110, 120, 100, 300], [40, 90, 220, 100]))
    expect(Math.round((hsl?.[0] ?? 0) * 360)).toBeGreaterThan(200)
  })

  test('nothing but black, white and grey picks nothing', () => {
    expect(pickVibrant(pixels([0, 0, 0, 10], [250, 250, 250, 10], [90, 90, 90, 10]))).toBeNull()
  })
})

test('glow lifts a dull colour to one that reads on the dark background', () => {
  expect(glow([0.3, 0.1, 0.15])).toBe('hsl(108 50% 40%)')
})

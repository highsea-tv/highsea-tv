// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import {
  apcaLc,
  composite,
  formatCss,
  formatHex,
  fromOklab,
  mix,
  parseColor,
  TRANSPARENT,
  toOklab,
  wcagRatio,
} from '../src/index.ts'

describe('parseColor', () => {
  test('reads hex and rgb() forms', () => {
    expect(parseColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 })
    expect(parseColor('#0b0b0c80').a).toBeCloseTo(128 / 255)
    expect(parseColor('rgb(255 255 255 / 0.07)')).toEqual({ r: 255, g: 255, b: 255, a: 0.07 })
    expect(parseColor('rgba(10, 20, 30, 0.5)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 })
    expect(parseColor('rgb(100% 0% 0% / 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 })
  })

  test('rejects anything else', () => {
    for (const bad of ['red', '#12', 'hsl(0 0% 0%)', 'rgb(1 2)', ''])
      expect(() => parseColor(bad)).toThrow()
  })

  test('formats round-trip', () => {
    expect(formatHex(parseColor('#d6cfc2'))).toBe('#d6cfc2')
    expect(formatCss(parseColor('rgb(255 255 255 / 0.13)'))).toBe('rgb(255 255 255 / 0.13)')
  })
})

describe('OKLab', () => {
  test('round-trips sRGB', () => {
    for (const hex of ['#0b0b0c', '#d6cfc2', '#7cc4a0', '#a23a3a', '#ffffff']) {
      expect(formatHex(fromOklab(toOklab(parseColor(hex))))).toBe(hex)
    }
  })

  test('mixing with transparent keeps the hue and lowers alpha, like color-mix()', () => {
    const soft = mix(parseColor('#d6cfc2'), TRANSPARENT, 0.13)
    expect(formatHex({ ...soft, a: 1 })).toBe('#d6cfc2')
    expect(soft.a).toBeCloseTo(0.13)
  })
})

describe('contrast', () => {
  const s1 = parseColor('#121214')
  test('matches the reference board audit', () => {
    expect(Math.round(apcaLc(parseColor('#ededee'), s1))).toBe(96)
    expect(Math.round(apcaLc(parseColor('#c7c7cb'), s1))).toBe(72)
    expect(Math.round(apcaLc(parseColor('#0b0b0c'), parseColor('#ebe6dc')))).toBe(91)
  })

  test('WCAG 2 ratio', () => {
    expect(wcagRatio(parseColor('#000'), parseColor('#fff'))).toBeCloseTo(21)
    expect(wcagRatio(parseColor('#fff'), parseColor('#fff'))).toBeCloseTo(1)
  })

  test('composite paints translucent layers over an opaque base', () => {
    expect(formatHex(composite(parseColor('#000'), parseColor('rgb(255 255 255 / 0.5)')))).toBe(
      '#808080',
    )
  })
})

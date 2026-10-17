// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import {
  auditTheme,
  builtInThemes,
  createTheme,
  decodeTheme,
  defaultTheme,
  deriveAccent,
  encodeTheme,
  lightness,
  nearestPassing,
  parseColor,
  resolveTheme,
  ThemeCodeError,
} from '../src/index.ts'

const lcOf = (theme: Parameters<typeof auditTheme>[0], label: string) =>
  Math.round(auditTheme(theme).results.find((r) => r.label === label)?.lc ?? 0)

describe('built-in themes', () => {
  for (const spec of Object.values(builtInThemes)) {
    test(`${spec.name} passes the contrast policy`, () => {
      const audit = auditTheme(resolveTheme(spec))
      expect(audit.results.filter((r) => !r.pass)).toEqual([])
    })
  }

  test('the default theme measures what the signed-off board measured', () => {
    const t = resolveTheme(defaultTheme)
    // The audit reports each pairing's weakest surface. The board measured accent text on bg
    // (78); on s1, which the audit also checks, it is 77.
    expect(lcOf(t, 'Accent text')).toBe(77)
    expect(lcOf(t, 'Primary button')).toBe(91)
    expect(lcOf(t, 'Destructive button')).toBe(87)
    expect(lcOf(t, 'Success badge')).toBe(68)
    expect(lcOf(t, 'Warning badge')).toBe(68)
    expect(lcOf(t, 'Danger badge')).toBe(69)
  })

  test('high contrast holds secondary and tertiary text at Lc 75', () => {
    const results = auditTheme(resolveTheme(builtInThemes['high-contrast'])).results
    for (const label of ['Secondary text', 'Tertiary text'])
      expect(results.find((r) => r.label === label)?.min).toBe(75)
  })

  test('OLED black uses true black and keeps everything else', () => {
    const oled = builtInThemes.oled
    expect(oled.colors.bg).toBe('#000000')
    expect(oled.colors.text).toBe(defaultTheme.colors.text)
    expect(oled.colors.accent).toBe(defaultTheme.colors.accent)
  })
})

describe('custom themes', () => {
  test('status colors cannot be themed', () => {
    expect(() => createTheme({ colors: { success: '#00ff00' } as never })).toThrow(/status color/)
    expect(() => createTheme({ colors: { sparkle: '#fff' } as never })).toThrow(
      /Unknown color role/,
    )
  })

  test('the accent family generated from Bone lands next to the locked values', () => {
    const d = deriveAccent(defaultTheme.colors.accent)
    const near = (a: string, b: string) =>
      Math.abs(lightness(parseColor(a)) - lightness(parseColor(b)))
    expect(near(d['accent-fill'], defaultTheme.colors['accent-fill'])).toBeLessThan(0.02)
    expect(near(d['accent-2'], defaultTheme.colors['accent-2'])).toBeLessThan(0.02)
    expect(d['on-accent']).toBe(defaultTheme.colors.bg)
  })

  test.each([
    ['Sea glass', '#8fbfb7'],
    ['Slate', '#a8bbcf'],
    ['Royal blue', '#1f4fbf'],
    ['Signal red', '#d0021b'],
    ['Near black', '#111111'],
    ['White', '#ffffff'],
  ])('an accent of %s generates a passing theme', (_, accent) => {
    for (const base of ['default', 'oled', 'high-contrast'] as const) {
      const { audit } = createTheme({ base, accent })
      expect(audit.results.filter((r) => !r.pass)).toEqual([])
    }
  })

  test('explicit colors win over generated ones, and failures are reported', () => {
    const { theme, audit } = createTheme({ accent: '#8fbfb7', colors: { 'text-3': '#4a4a4f' } })
    expect(theme.colors['text-3']).toBe('#4a4a4f')
    expect(audit.pass).toBe(false)
    expect(audit.results.find((r) => !r.pass)?.id).toBe('text-3')
  })

  test('nearestPassing finds the closest passing lightness', () => {
    const input = { colors: { 'text-3': '#4a4a4f' } }
    const fixed = nearestPassing(input, 'text-3')
    expect(fixed).not.toBeNull()
    expect(createTheme({ colors: { 'text-3': fixed as string } }).audit.pass).toBe(true)
    // it moves toward text (lighter), and no further than needed
    expect(lightness(parseColor(fixed as string))).toBeGreaterThan(lightness(parseColor('#4a4a4f')))
    expect(lightness(parseColor(fixed as string))).toBeLessThan(
      lightness(parseColor(defaultTheme.colors['text-3'])) + 0.01,
    )
  })
})

describe('share codes', () => {
  test('round-trip', () => {
    const input = { name: 'Harbor — night', base: 'oled' as const, accent: '#8fbfb7' }
    const code = encodeTheme(input)
    expect(code.startsWith('hs1.')).toBe(true)
    expect(code).not.toMatch(/[+/=]/)
    expect(decodeTheme(code)).toEqual(input)
  })

  test('damaged or foreign codes are rejected with a readable error', () => {
    expect(() => decodeTheme('hello')).toThrow(ThemeCodeError)
    expect(() => decodeTheme('hs1.%%%')).toThrow('This theme code is damaged')
    const locked = `hs1.${btoa(JSON.stringify({ colors: { danger: '#000000' } }))}`
    expect(() => decodeTheme(locked)).toThrow(/status color/)
  })
})

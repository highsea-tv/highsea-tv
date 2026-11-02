// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import {
  auditTheme,
  BUTTON_VARIANTS,
  builtInThemes,
  buttonLooks,
  CONTROL_GAP,
  CONTROL_PLATFORMS,
  type ControlLook,
  controlEntries,
  controlLooks,
  controlMetrics,
  createTheme,
  icon,
  radius,
  resolveTheme,
  targets,
  tokensCss,
} from '../src/index.ts'
import { COLOR_ROLES } from '../src/roles.ts'

describe('the control spec', () => {
  test('a pointer and touch draw 36 and 30, with radius-sm', () => {
    for (const p of ['pointer', 'touch'] as const) {
      expect(controlMetrics(p).height).toBe(36)
      expect(controlMetrics(p, 'sm').height).toBe(30)
      expect(controlMetrics(p).radius).toBe(radius.sm)
      expect(controlMetrics(p).unit).toBe('px')
    }
  })

  test('touch keeps the drawn size and adds a 44 hit area; the gap keeps hit areas apart', () => {
    expect(controlMetrics('touch').hit).toBe(targets.touch)
    expect(controlMetrics('pointer').hit).toBe(0)
    expect(controlMetrics('touch').height + CONTROL_GAP).toBeGreaterThanOrEqual(targets.touch)
  })

  test('text: 14 and 13 with a pointer, 16 on touch, the TV its own', () => {
    expect(controlMetrics('pointer').text).toBe(14)
    expect(controlMetrics('pointer', 'sm').text).toBe(13)
    expect(controlMetrics('touch').text).toBe(16)
    expect(controlMetrics('touch', 'sm').text).toBe(16)
    expect(controlMetrics('tv').unit).toBe('u')
  })

  test('the TV is the pointer at 1.75 times, in units of 19.2px', () => {
    const tv = controlMetrics('tv')
    expect(tv.height * 19.2).toBeCloseTo(36 * 1.75, 2)
    expect(tv.radius * 19.2).toBeCloseTo(radius.sm * 1.75, 2)
    expect(tv.icon).toBeGreaterThanOrEqual(icon.sizeTv.min)
    expect(tv.hit).toBe(0)
  })

  test('every look names real roles', () => {
    const roles = new Set<string>(COLOR_ROLES)
    const looks: ControlLook[] = [...Object.values(buttonLooks), ...Object.values(controlLooks)]
    for (const look of looks) {
      for (const role of [look.fill, look.edge, look.label, look.hover?.fill, look.hover?.label]) {
        if (role) expect(roles.has(role)).toBe(true)
      }
    }
    expect(BUTTON_VARIANTS).toContain('overlay')
  })

  test('the CSS sets the variables for a pointer, a coarse pointer and each data-platform', () => {
    const css = tokensCss()
    expect(css).toContain('@media (pointer: coarse)')
    for (const p of CONTROL_PLATFORMS) expect(css).toContain(`[data-platform="${p}"]`)
    const names = controlEntries('pointer').map(([n]) => n)
    expect(controlEntries('tv').map(([n]) => n)).toEqual(names)
    expect(controlEntries('touch').map(([n]) => n)).toEqual(names)
    expect(Object.fromEntries(controlEntries('touch'))['control-hit']).toBe('2.75rem')
    expect(String(Object.fromEntries(controlEntries('tv'))['control-h'])).toContain('cqw')
  })
})

describe('the derived control roles', () => {
  test('every built-in theme passes the 3:1 checks for edges, chosen segments and focus', () => {
    for (const theme of Object.values(builtInThemes)) {
      const audit = auditTheme(resolveTheme(theme))
      for (const id of [
        'control-edge',
        'control-selected',
        'control-label',
        'focus-ring',
      ] as const) {
        const check = audit.results.find((c) => c.id === id)
        expect(check, `${theme.id} ${id}`).toBeDefined()
        expect(check?.pass, `${theme.id} ${id}`).toBe(true)
      }
    }
  })

  test('a custom accent still reaches 3:1 for focus', () => {
    for (const accent of ['#1f4fbf', '#d0021b', '#111111', '#8fbfb7']) {
      const check = createTheme({ accent }).audit.results.find((c) => c.id === 'focus-ring')
      expect(check?.pass, accent).toBe(true)
    }
  })
})

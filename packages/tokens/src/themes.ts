// SPDX-License-Identifier: AGPL-3.0-only
import type { BaseRole } from './roles.ts'

export type ContrastCheckId =
  | 'text'
  | 'text-2'
  | 'text-3'
  | 'accent-text'
  | 'button-primary'
  | 'button-danger'
  | 'badge'

/** A theme as authored: base role values plus the few non-color values a theme may change. */
export type ThemeSpec = {
  id: string
  name: string
  colors: Record<BaseRole, string>
  /** Share of the status color in a badge label, mixed into `text` in OKLab. */
  badgeMix: { status: number; danger: number }
  /** Multiplies focus ring widths on every platform. */
  focusRingScale: number
  /** Raises contrast minimums above the policy (never lowers them). */
  minimums?: Partial<Record<ContrastCheckId, number>>
}

/** The locked Abyss Neutral (Bone) values: docs/brand/direction.md#color. */
export const defaultTheme: ThemeSpec = {
  id: 'default',
  name: 'Abyss Neutral',
  colors: {
    bg: '#0b0b0c',
    s1: '#121214',
    s2: '#18181b',
    s3: '#1f1f22',
    s4: '#28282c',
    line: 'rgb(255 255 255 / 0.07)',
    'line-strong': 'rgb(255 255 255 / 0.13)',
    text: '#ededee',
    'text-2': '#c7c7cb',
    'text-3': '#a2a2a7',
    accent: '#d6cfc2',
    'accent-2': '#8c8678',
    'accent-text': '#d6cfc2',
    'accent-fill': '#ebe6dc',
    'on-accent': '#0b0b0c',
    focus: '#d6cfc2',
    success: '#7cc4a0',
    warning: '#dcb06a',
    danger: '#e88787',
    info: '#8fb0d6',
    'danger-fill': '#a23a3a',
    'on-danger': '#ffffff',
  },
  badgeMix: { status: 0.72, danger: 0.52 },
  focusRingScale: 1,
}

/** True black for OLED panels. Surfaces step down one place so cards still separate. */
export const oledTheme: ThemeSpec = {
  ...defaultTheme,
  id: 'oled',
  name: 'OLED black',
  colors: {
    ...defaultTheme.colors,
    bg: '#000000',
    s1: '#0b0b0c',
    s2: '#121214',
    s3: '#18181b',
    s4: '#1f1f22',
  },
}

/**
 * Secondary and tertiary text reach Lc 75 on every surface from `bg` to `s4`, borders are
 * stronger, badge labels lean toward `text`, and focus rings are 1.5× wider.
 */
export const highContrastTheme: ThemeSpec = {
  ...defaultTheme,
  id: 'high-contrast',
  name: 'High contrast',
  colors: {
    ...defaultTheme.colors,
    'line-strong': 'rgb(255 255 255 / 0.3)',
    'text-2': '#dedee1',
    'text-3': '#d2d2d5',
  },
  badgeMix: { status: 0.4, danger: 0.3 },
  focusRingScale: 1.5,
  minimums: { 'text-2': 75, 'text-3': 75, badge: 75 },
}

export type BuiltInThemeId = 'default' | 'oled' | 'high-contrast'
export const builtInThemes: Record<BuiltInThemeId, ThemeSpec> = {
  default: defaultTheme,
  oled: oledTheme,
  'high-contrast': highContrastTheme,
}

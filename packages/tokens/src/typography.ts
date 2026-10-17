// SPDX-License-Identifier: AGPL-3.0-only
// docs/design-language/typography.md. Web and admin sizes are px, mobile pt, TV screen units.

export const fonts = {
  sans: { family: 'Geist', fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'] },
  mono: { family: 'Geist Mono', fallback: ['ui-monospace', 'monospace'] },
} as const

/** 700 is deliberately absent: hierarchy comes from size and color first. */
export const weights = { regular: 400, medium: 500, semibold: 600 } as const

/** Letter spacing in em. */
export const tracking = {
  display: -0.035,
  title: -0.01,
  wordmark: -0.045,
  label: 0.06,
  eyebrow: 0.14,
} as const

export type TextStyle = {
  size: number
  /** Unitless multiplier. */
  leading?: number
  weight: number
  tracking?: number
  family?: 'sans' | 'mono'
  uppercase?: boolean
}

const { regular, medium, semibold } = weights

/** Web and desktop, from the reference board. */
export const webText = {
  display: { size: 40, leading: 1.05, weight: semibold, tracking: tracking.display },
  heading: { size: 28, leading: 1.15, weight: semibold, tracking: tracking.display },
  title: { size: 19, leading: 1.3, weight: semibold, tracking: tracking.title },
  body: { size: 15, leading: 1.6, weight: regular },
  caption: { size: 12.5, leading: 1.4, weight: regular },
  mono: { size: 13, leading: 1.4, weight: regular, family: 'mono' },
  label: {
    size: 11,
    leading: 1.3,
    weight: regular,
    tracking: tracking.label,
    family: 'mono',
    uppercase: true,
  },
} as const satisfies Record<string, TextStyle>

/** Admin (dense) additions. */
export const adminText = {
  ui: { size: 13, leading: 1.4, weight: regular },
  form: { size: 14, leading: 1.5, weight: regular },
  'table-header': { size: 11.5, leading: 1.3, weight: medium },
  figure: { size: 12, leading: 1.4, weight: regular, family: 'mono' },
  release: { size: 11, leading: 1.3, weight: regular, family: 'mono' },
  'widget-title': { size: 13, leading: 1.4, weight: semibold },
} as const satisfies Record<string, TextStyle>

/** Mobile, in points. Scales with the OS text size up to at least 200%. */
export const mobileText = {
  largeTitle: { size: 30, leading: 36 / 30, weight: semibold, tracking: tracking.display },
  title: { size: 20, leading: 26 / 20, weight: semibold, tracking: tracking.title },
  body: { size: 16, leading: 22 / 16, weight: regular },
  callout: { size: 14, leading: 19 / 14, weight: regular },
  caption: { size: 12, leading: 16 / 12, weight: regular },
  tabLabel: { size: 10.5, leading: 1.2, weight: medium },
} as const satisfies Record<string, TextStyle>

/** TV, in screen units. Nothing is smaller than 0.8u; anything needed to act is ≥ 0.95u. */
export const tvText = {
  heroTitle: { size: 5.2, leading: 0.95, weight: semibold, tracking: tracking.display },
  synopsis: { size: 1.15, leading: 1.45, weight: regular },
  rowTitle: { size: 1.2, leading: 1.3, weight: semibold },
  button: { size: 1.1, leading: 1.2, weight: semibold },
  meta: { size: 1.05, leading: 1.3, weight: regular },
  serverName: { size: 1.05, leading: 1.2, weight: semibold },
  eyebrow: {
    size: 0.95,
    leading: 1.2,
    weight: semibold,
    tracking: tracking.eyebrow,
    uppercase: true,
  },
  pill: { size: 0.95, leading: 1.2, weight: regular },
  quality: { size: 0.8, leading: 1.2, weight: semibold },
} as const satisfies Record<string, TextStyle>

export const TV_TEXT_MIN = 0.8

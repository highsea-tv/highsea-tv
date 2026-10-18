// SPDX-License-Identifier: AGPL-3.0-only
// Values from docs/design-language/{spacing-layout,elevation,iconography}.md and the platform guides.
// Web values are px; mobile values are pt/dp; TV values are screen units (1u = 1% of width).

/** 4px base. Keys match the docs (`space-0.5` … `space-16`) and Tailwind's spacing steps. */
export const space = {
  '0.5': 2,
  '1': 4,
  '2': 8,
  '3': 12,
  '4': 16,
  '5': 20,
  '6': 24,
  '8': 32,
  '10': 40,
  '12': 48,
  '16': 64,
} as const
export const SPACE_BASE = 4

/** Locked in docs/brand/direction.md#shape. `md` is the docs' plain `radius`. */
export const radius = { sm: 8, md: 12, lg: 16, xl: 28, poster: 10, pill: 999 } as const

/** Min widths. `compact` is everything below `medium`. */
export const breakpoints = { medium: 600, expanded: 1024, wide: 1440 } as const

export type Shadow = { x: number; y: number; blur: number; spread: number; opacity: number }

/** Elevation is tone first; shadows (always black) only for layers that float. Levels 0–1 have none. */
export const elevation = {
  2: { surface: ['s2', 's3'], shadow: { x: 0, y: 1, blur: 2, spread: 0, opacity: 0.3 } },
  3: { surface: ['s3', 's4'], shadow: { x: 0, y: 20, blur: 40, spread: -20, opacity: 0.7 } },
  4: { surface: ['s3', 's4'], shadow: { x: 0, y: 24, blur: 48, spread: -16, opacity: 0.75 } },
} as const satisfies Record<number, { surface: readonly string[]; shadow: Shadow }>

export const shadowCss = (s: Shadow) =>
  `${s.x}px ${s.y}px ${s.blur}px ${s.spread}px rgb(0 0 0 / ${s.opacity})`

/** Blur radii (px) for chrome over moving or image content, with the tint each sits on. */
export const blur = {
  bar: { radius: 20, saturate: 1.4, tint: 'bg', opacity: 0.82 },
  pill: { radius: 12, tint: 's2', opacity: 0.75 },
  badge: { radius: 6 },
  scrim: { radius: 6, tint: 'bg', opacity: 0.6 },
  /** Opacity of the solid fallback when blur is unavailable or transparency is reduced. */
  fallbackOpacity: 0.96,
} as const

/** Admin density (docs/design-language/platforms/admin.md#density), px. */
export const density = {
  control: 36,
  controlSm: 30,
  input: 38,
  badge: 22,
  row: 60,
  rowSingle: 40,
  sidebar: 216,
  sidebarRail: 64,
  mainPadding: 24,
  widgetGap: 12,
  widgetPadding: 14,
  /** One row of the widget grid: a small widget is two rows (180px with the gap). */
  widgetRow: 84,
} as const

/** Pointer and touch target minimums. */
export const targets = { pointer: 24, touch: 44 } as const

export const aspect = { poster: [2, 3], still: [16, 9], square: [1, 1], book: [2, 3] } as const

export const icon = {
  stroke: 1.75,
  /** TV icons at or above 1.4u use this stroke. */
  strokeTv: 2,
  size: { sm: 16, md: 20, lg: 24 },
  sizeTv: { min: 1.4, max: 1.6 },
} as const

/**
 * Focus rings. Theme `focusRingScale` multiplies the widths. The web ring uses the `focus` role;
 * the TV ring uses `text`, with a dark drop shadow (in u) and a scale on the focused item.
 */
export const focus = {
  web: { width: 2, offset: 2 },
  tv: {
    width: 0.2,
    shadow: { x: 0, y: 0.8, blur: 2, spread: -0.6, opacity: 0.75 },
    scalePoster: 1.09,
    scaleButton: 1.07,
    /** The edge-of-list nudge distance. */
    nudge: 0.2,
  },
  mobile: { pressScale: 0.97 },
} as const

/** TV layout in screen units (docs/design-language/platforms/tv.md#layout). */
export const tv = {
  safe: { x: 4.5, y: 3.2, overscan: 5 },
  hero: { height: 62, copyTop: 7.5, copyWidth: 38 },
  rows: { height: 47, inset: 4.5 },
  poster: { width: 10.5, gap: 1.2 },
  radius: { poster: 0.5, button: 0.5, pill: 0.3 },
  ambientBlur: 2.6,
} as const

export const mobile = { gutter: 16, posterGap: 8, rowGap: 24 } as const

export const web = { gutter: 24, margin: { compact: 32, wide: 64 }, maxWidth: 1680 } as const

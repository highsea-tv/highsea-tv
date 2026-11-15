// SPDX-License-Identifier: AGPL-3.0-only
// Values from docs/design-language/{spacing-layout,elevation,iconography}.md and the platform guides.
// Web values are px; mobile values are pt/dp; TV values are screen units (1u = 1% of width).

/** 4px base. Keys match the docs (`space-0.5` … `space-16`) and Tailwind's spacing steps. */
export const space = {
  '0.5': 2,
  '1': 4,
  '1.5': 6,
  '2': 8,
  '2.5': 10,
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

/**
 * Locked in docs/brand/direction.md#shape. `md` is the docs' plain `radius`. `xs`, `2xs` and `3xs`
 * are the small parts' corners (a key cap, a tag, a swatch), added with the owner's sign-off of
 * 2026-11-10 (one-client-platform-e.md, answer 1 on E1's values).
 */
export const radius = {
  '3xs': 2,
  '2xs': 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 28,
  poster: 10,
  pill: 999,
} as const

/**
 * Line widths (elevation.md › Lines): `thin` is every border and rule (`line` on level 1,
 * `line-strong` on inputs), `thick` the line tabs' underline, a rule group's bar and the resize
 * mark. A border overlapped by its neighbour's takes `-line.thin`.
 */
export const line = { thin: 1, thick: 2 } as const

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

/**
 * Over artwork (elevation.md › Over artwork): black under scrims and video, as the shadows are
 * always black; a scrim is `black` at an `alpha` step. The glass and the hairline inside artwork
 * are a theme's roles at an alpha, so a theme that changes `bg` or `text` changes them.
 */
export const art = {
  black: '#000000',
  alpha: { 35: 0.35, 50: 0.5, 60: 0.6, 70: 0.7, 80: 0.8 },
  /** The dark glass over artwork: `bg` at 0.62, rgba(11,11,12,0.62) in the default theme. */
  glass: { role: 'bg', alpha: 0.62 },
  /** The hairline inside artwork's edge: `text` at 0.04. */
  edge: { role: 'text', alpha: 0.04 },
  /** A blurred backdrop's scale, so its blurred edges sit outside the screen. */
  backdropScale: 1.1,
} as const

/**
 * Admin density (docs/design-language/platforms/admin.md#density), px. Controls' sizes are the
 * control spec's (`controls.ts`, `--control-*`), not density's.
 */
export const density = {
  badge: 22,
  row: 60,
  rowSingle: 40,
  sidebar: 216,
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
  /** `xs` is `controlGeometry.sm.icon`, `2xs` the smallest, beside a caption or in a tag. */
  size: { '2xs': 12, xs: 14, sm: 16, md: 20, lg: 24 },
  sizeTv: { min: 1.4, max: 1.6 },
  /** The circles an icon sits in: the Banner's, the Toaster's and a small EmptyState's, then EmptyState's. */
  disc: { sm: 32, md: 44, lg: 56 },
  /** An icon's drop to sit on its text's first line, and the same on the TV in u. */
  drop: 1,
  dropTv: 0.2,
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
    scalePoster: 1.05,
    scaleButton: 1.07,
    /** The edge-of-list nudge distance. */
    nudge: 0.2,
  },
  mobile: { pressScale: 0.97 },
} as const

/** TV layout in screen units (docs/design-language/platforms/tv.md#layout). */
export const tv = {
  // one inset on every side, tightened inside tvOS's 60 and 80 points (HIG, Layout: tvOS) to 46
  // at 1080p (the owner, 2026-10-30); `overscan` still covers a TV that crops the picture
  safe: { x: 2.4, y: 2.4, overscan: 5 },
  hero: { height: 62, copyTop: 7.5, copyWidth: 38 },
  rows: { height: 47, inset: 4.5 },
  poster: { width: 10.5, gap: 1.2 },
  /** `sm`, `md` and `panel` added with the owner's sign-off of 2026-11-10 (answer 1 on E1's values). */
  radius: { pill: 0.3, sm: 0.4, poster: 0.5, button: 0.5, md: 0.6, panel: 1 },
  /**
   * The TV's spacing scale (tv.md › Spacing), keyed as `space` is: a step is 0.2u, so `5` is 1u and
   * `12` is 2.4u. Steps no part uses are left out.
   */
  space: {
    '0.5': 0.1,
    '1': 0.2,
    '1.5': 0.3,
    '2': 0.4,
    '2.5': 0.5,
    '3': 0.6,
    '3.5': 0.7,
    '4': 0.8,
    '4.5': 0.9,
    '5': 1,
    '6': 1.2,
    '7': 1.4,
    '8': 1.6,
    '10': 2,
    '12': 2.4,
    '20': 4,
  },
  /** The head's measures (tv.md › Navigation): the account's circle, its avatar, the dots. */
  head: { account: 3, avatar: 2.2, dot: 0.6, dotOffset: 0.45, guide: 1, stop: 2.6 },
  /** The screen's height in u at 16:9: 100 × 9 / 16. */
  screenHeight: 56.25,
  ambientBlur: 2.6,
} as const

/**
 * The scrollbar drawn over a page (spacing-layout.md › The scrollbar), as approved with 4.4a: the
 * gap to the scroller's edges, the handle at rest and active, how far towards the page the strip
 * takes the pointer, the shortest handle, and `text-3`'s alpha at rest and active.
 */
export const scrollbar = {
  inset: 6,
  handle: 6,
  handleActive: 8,
  reach: 8,
  minThumb: 32,
  alpha: 0.45,
  alphaActive: 0.7,
} as const

export const mobile = { gutter: 16, posterGap: 8, rowGap: 24 } as const

export const web = { gutter: 24, margin: { compact: 32, wide: 64 }, maxWidth: 1680 } as const

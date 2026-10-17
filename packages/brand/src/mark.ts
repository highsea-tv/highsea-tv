// SPDX-License-Identifier: AGPL-3.0-only
// The highsea mark: a disc over the horizon, cut by two swells. Drawn on a 48-unit grid.
// The geometry is exactly the signed-off reference board's (design/explorations/a2-abyss-neutral.html).
import { defaultTheme } from '@highsea/tokens'

export const MARK_GRID = 48

export const markGeometry = {
  disc: { cx: 24, cy: 24, r: 21 },
  /** Each swell is one stroked wave across the disc; the stroke is cut out of the disc. */
  swells: [
    'M1 29.5c7.7-4.4 15.3-4.4 23 0s15.3 4.4 23 0',
    'M1 37c7.7-4.4 15.3-4.4 23 0s15.3 4.4 23 0',
  ],
  cut: 3.2,
  /** Heavier cuts keep the swells open at 16–24px. */
  cutSmall: 4.2,
} as const

/** Below this rendered size (px), use the small variant. */
export const MARK_SMALL_BELOW = 24

export type MarkPaint =
  /** Bone gradient, for dark backgrounds. */
  | 'bone'
  /** `currentColor`, for inline single-color use. */
  | 'mono'
  /** A solid color. */
  | { solid: string }

export type MarkOptions = {
  paint?: MarkPaint
  small?: boolean
  /** Prefix for gradient and mask ids, so several marks can share a page. */
  id?: string
}

/** The mark's elements (defs + disc) for placing inside another SVG, in 48-unit coordinates. */
export function markElements({ paint = 'bone', small = false, id = 'hs-mark' }: MarkOptions = {}) {
  const g = markGeometry
  const cut = small ? g.cutSmall : g.cut
  const fill = paint === 'bone' ? `url(#${id}-g)` : paint === 'mono' ? 'currentColor' : paint.solid
  const gradient =
    paint === 'bone'
      ? `<linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${defaultTheme.colors.accent}"/><stop offset="1" stop-color="${defaultTheme.colors['accent-2']}"/></linearGradient>`
      : ''
  const swells = g.swells
    .map(
      (d) =>
        `<path d="${d}" stroke="#000" stroke-width="${cut}" fill="none" stroke-linecap="round"/>`,
    )
    .join('')
  return `<defs>${gradient}<mask id="${id}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="${MARK_GRID}" height="${MARK_GRID}"><rect width="${MARK_GRID}" height="${MARK_GRID}" fill="#fff"/>${swells}</mask></defs><circle cx="${g.disc.cx}" cy="${g.disc.cy}" r="${g.disc.r}" fill="${fill}" mask="url(#${id}-m)"/>`
}

export function markSvg(options: MarkOptions & { title?: string } = {}): string {
  const label = options.title ? `role="img" aria-label="${options.title}"` : 'aria-hidden="true"'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_GRID} ${MARK_GRID}" ${label}>${markElements(options)}</svg>`
}

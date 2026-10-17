// SPDX-License-Identifier: AGPL-3.0-only
// The wordmark and lockup, built from outlined Geist so they render the same everywhere.
// docs/brand/logo.md
import { defaultTheme } from '@highsea/tokens'
import { MARK_GRID, type MarkPaint, markElements } from './mark.ts'
import { wordmarkOutline } from './wordmark-data.ts'

export type LogoPaint =
  /** Bone mark, `text` name and `text-3` `tv`, for dark backgrounds. */
  | 'brand'
  /** Everything `currentColor`, for single-color use. */
  | 'mono'
  /** Near-black, for light backgrounds and print. */
  | 'ink'

export const INK = { name: defaultTheme.colors.bg, tv: '#6e6e73' } as const

const PAINTS: Record<LogoPaint, { mark: MarkPaint; name: string; tv: string }> = {
  brand: { mark: 'bone', name: defaultTheme.colors.text, tv: defaultTheme.colors['text-3'] },
  mono: { mark: 'mono', name: 'currentColor', tv: 'currentColor' },
  ink: { mark: { solid: INK.name }, name: INK.name, tv: INK.tv },
}

/** Lockup layout in em (the wordmark's font size), as on the reference board's `.lockup`. */
export const LOCKUP = { markBox: 1.15, gap: 0.42 } as const

export type LogoOptions = {
  paint?: LogoPaint
  /** Accessible name; without it the SVG is hidden from assistive technology. */
  title?: string
  /** Prefix for gradient and mask ids. */
  id?: string
}

type Box = { x0: number; y0: number; x1: number; y1: number }

const r2 = (n: number) => Math.round(n * 100) / 100

function svg(box: Box, body: string, title?: string) {
  const w = r2(box.x1 - box.x0)
  const h = r2(box.y1 - box.y0)
  const label = title ? `role="img" aria-label="${title}"` : 'aria-hidden="true"'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(box.x0)} ${r2(box.y0)} ${w} ${h}" width="${w}" height="${h}" ${label}>${body}</svg>`
}

function words(paint: LogoPaint, dx = 0, dy = 0) {
  const p = PAINTS[paint]
  const [name, tv] = wordmarkOutline.paths
  const move = dx || dy ? ` transform="translate(${r2(dx)} ${r2(dy)})"` : ''
  return `<g${move}><path fill="${p.name}" d="${name}"/><path fill="${p.tv}" d="${tv}"/></g>`
}

/** The wordmark alone, cropped to its ink. Units are 100 per em. */
export function wordmarkSvg({ paint = 'brand', title }: LogoOptions = {}): string {
  return svg(wordmarkOutline.ink, words(paint), title)
}

/** Ink bounds of the lockup, in wordmark units (100 per em). */
export function lockupBox(): Box {
  const em = 100
  const box = LOCKUP.markBox * em
  const inset = (box * (MARK_GRID / 2 - 21)) / MARK_GRID
  const tx = (LOCKUP.markBox + LOCKUP.gap) * em
  const ty = (box - em) / 2
  const ink = wordmarkOutline.ink
  return {
    x0: inset,
    y0: Math.min(inset, ty + ink.y0),
    x1: tx + ink.x1,
    y1: Math.max(box - inset, ty + ink.y1),
  }
}

/** Mark and wordmark side by side, cropped to their ink. */
export function lockupSvg({
  paint = 'brand',
  title,
  id = 'hs-lockup',
  small = false,
}: LogoOptions & { small?: boolean } = {}): string {
  return svg(lockupBox(), lockupElements({ paint, id, small }), title)
}

/** The lockup's elements for placing inside another SVG, in wordmark units. */
export function lockupElements({
  paint = 'brand',
  id = 'hs-lockup',
  small = false,
}: {
  paint?: LogoPaint
  id?: string
  small?: boolean
} = {}): string {
  const em = 100
  const box = LOCKUP.markBox * em
  const mark = `<g transform="scale(${Math.round((box / MARK_GRID) * 1e4) / 1e4})">${markElements({ paint: PAINTS[paint].mark, id, small })}</g>`
  return mark + words(paint, (LOCKUP.markBox + LOCKUP.gap) * em, (box - em) / 2)
}

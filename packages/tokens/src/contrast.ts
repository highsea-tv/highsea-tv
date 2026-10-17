// SPDX-License-Identifier: AGPL-3.0-only
import type { Rgba } from './color.ts'

const linear = (v: number) => {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** WCAG 2 contrast ratio (1–21) between two opaque colors. */
export function wcagRatio(fg: Rgba, bg: Rgba): number {
  const lum = (c: Rgba) => 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b)
  const [hi, lo] = [lum(fg), lum(bg)].sort((m, n) => n - m) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * APCA 0.0.98G-4g lightness contrast, as an absolute Lc (0–~106). Text on a lighter background
 * and text on a darker background use different exponents, so the order of arguments matters.
 */
export function apcaLc(text: Rgba, background: Rgba): number {
  const y = (c: Rgba) =>
    0.2126729 * (c.r / 255) ** 2.4 + 0.7151522 * (c.g / 255) ** 2.4 + 0.072175 * (c.b / 255) ** 2.4
  // biome-ignore lint/suspicious/noApproximativeNumericConstant: APCA's published soft-clamp exponent is exactly 1.414
  const clamp = (v: number) => (v > 0.022 ? v : v + (0.022 - v) ** 1.414)
  const tY = clamp(y(text))
  const bY = clamp(y(background))
  let c: number
  if (bY > tY) {
    c = (bY ** 0.56 - tY ** 0.57) * 1.14
    c = c < 0.1 ? 0 : c - 0.027
  } else {
    c = (bY ** 0.65 - tY ** 0.62) * 1.14
    c = c > -0.1 ? 0 : c + 0.027
  }
  return Math.abs(c * 100)
}

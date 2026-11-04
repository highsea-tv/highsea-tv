// SPDX-License-Identifier: AGPL-3.0-only
// A colour at an alpha, shared by every form factor's parts (the TV's re-exports it from
// ./tv/controls.tsx, where apps/tv imports it).

/** The hex colours it takes: `#rgb`, `#rrggbb`, and either with an alpha of its own, which it replaces. */
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** CSS Color 4's space-separated `hsl(h s% l%)`, as the art's colours come, with an alpha or none. */
const HSL = /^hsla?\(\s*([\d.]+)\s+([\d.]+%)\s+([\d.]+%)\s*(?:\/\s*[\d.]+%?\s*)?\)$/i

/**
 * A theme colour at an alpha, as the prototype's `bg-text/12`: `#rgb` and `#rrggbb`, and their
 * forms with an alpha, whose alpha this one replaces (CSS Color 4's hex notation,
 * https://www.w3.org/TR/css-color-4/#hex-notation, which React Native reads too:
 * https://reactnative.dev/docs/colors). Also `hsl(h s% l%)`, the art's colours' form, written
 * back as `hsla(h s% l% / a)`, the one form with an alpha both CSS
 * (https://www.w3.org/TR/css-color-4/#the-hsl-notation) and React Native's colour parser
 * (@react-native/normalize-colors' `hsla` matcher) read. Any other form throws, rather than
 * making a colour that isn't one.
 */
export const alpha = (hex: string, a: number) => {
  const clamped = Math.min(1, Math.max(0, a))
  const hsl = HSL.exec(hex)
  if (hsl) return `hsla(${hsl[1]} ${hsl[2]} ${hsl[3]} / ${clamped})`
  if (!HEX.test(hex)) throw new Error(`alpha() takes a hex or hsl() colour, not ${hex}`)
  const digits = hex.slice(1)
  const rgb =
    digits.length <= 4 ? [...digits.slice(0, 3)].map((d) => d + d).join('') : digits.slice(0, 6)
  return `#${rgb}${Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0')}`
}

/**
 * An unchosen destination's strength in the pointer's top bar and the TV's head: the prototypes'
 * `text-text/65` (web/shell.tsx's TopBar, tv/kit.tsx's head), the text colour at that alpha rather
 * than `text-2`, so the chosen one stands out as it does there.
 */
export const UNCHOSEN_ALPHA = 0.65

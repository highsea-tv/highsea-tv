// SPDX-License-Identifier: AGPL-3.0-only
// The emails' palette and type (docs/product/emails.md), taken from the default theme's resolved
// roles (Abyss Neutral, docs/brand/direction.md) rather than copied, so a token change reaches the
// emails too. Email clients can't be trusted with alpha or color-mix(), so every translucent role
// is painted onto the surface it sits on first (`composite`, as the contrast audit measures it)
// and written as solid hex: the card's border is `line` over `s1`, each badge's pill is its status
// at 14% over `s1`. Badge labels are already solid (status mixed into `text`, color.md's recipe).
import { composite, defaultTheme, formatHex, parseColor, resolveTheme } from '@highsea/tokens'

const theme = resolveTheme(defaultTheme)
const role = (r: keyof typeof theme.colors) => parseColor(theme.colors[r])
const solid = (r: keyof typeof theme.colors) => formatHex(role(r))
const over = (surface: keyof typeof theme.colors, r: keyof typeof theme.colors) =>
  formatHex(composite(role(surface), role(r)))

export type Level = 'info' | 'success' | 'warning' | 'error'

/** The status role a message's level shows as: an error is `danger`. */
const status = { info: 'info', success: 'success', warning: 'warning', error: 'danger' } as const

export const palette = {
  canvas: solid('bg'),
  card: solid('s1'),
  border: over('s1', 'line'),
  divider: over('s1', 'line'),
  text: solid('text'),
  text2: solid('text-2'),
  text3: solid('text-3'),
  /** The link written out under the button. */
  link: solid('accent-text'),
  buttonFill: solid('accent-fill'),
  buttonLabel: solid('on-accent'),
  /** Behind a missing poster: the placeholder art's muted surface. */
  poster: solid('s3'),
  badge: Object.fromEntries(
    (Object.keys(status) as Level[]).map((level) => [
      level,
      {
        dot: solid(status[level]),
        label: solid(`badge-${status[level]}`),
        fill: over('s1', `badge-${status[level]}-bg`),
      },
    ]),
  ) as Record<Level, { dot: string; label: string; fill: string }>,
}

/**
 * Geist first, for the few clients with it installed, then each system's own UI face: no web font
 * is loaded, so an email makes no remote request (Gmail documents no web fonts either:
 * https://developers.google.com/workspace/gmail/design/css).
 */
export const fonts = {
  sans: "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
}

/** direction.md's type scale and shapes, in the units email HTML takes. */
export const type = {
  title: { size: '24px', lineHeight: '30px', weight: '600', tracking: '-0.02em' },
  body: { size: '15px', lineHeight: '24px' },
  caption: { size: '12.5px', lineHeight: '18px' },
  mono: { size: '13px', lineHeight: '20px' },
}

export const shape = {
  /** The card's width, padding (24 under the breakpoint) and radius. */
  width: 560,
  padding: 32,
  paddingNarrow: 24,
  breakpoint: 480,
  cardRadius: 16,
  buttonRadius: 8,
  logo: 32,
  logoRadius: 8,
  poster: { width: 96, height: 144, radius: 10 },
}

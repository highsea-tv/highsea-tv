// SPDX-License-Identifier: AGPL-3.0-only
// Text in the type scale (typography.md), by the form factor's input (controls.md › The form
// factor): touch's styles in points, scaled by the person's text size (mobile.md › Type), the
// TV's in screen units, and a pointer's the web's scale (typography.md › Web and desktop), in CSS
// pixels. A screen names a style in any scale's words, and each input draws it as its own scale's
// nearest style (NEAREST below). Every size is multiplied by the ThemeProvider's `fontScale` (2 for
// the prototypes' 200% text, as Dynamic Type would draw it). Colour is a role, never a hex.
import type { ColorRole } from '@highsea-tv/tokens'
import { PixelRatio, Platform, Text as RNText, type TextProps as RNTextProps } from 'react-native'
import { family } from './fonts.ts'
import { fontScaleFor, MAX_FONT_MULTIPLIER, type Theme, tokens, useTheme } from './theme.tsx'

type Scale = 'mobile' | 'tv' | 'web'
type MobileVariant = keyof typeof tokens.text.mobile
type TvVariant = keyof typeof tokens.text.tv
type WebVariant = keyof typeof tokens.text.web

export type Variant = MobileVariant | TvVariant | WebVariant

/**
 * Each style's counterpart in the other scales, by its role: a page's title, a section's, running
 * text, metadata, a small label. A style in its own scale is itself.
 */
const NEAREST: Record<Variant, { mobile: MobileVariant; tv: TvVariant; web: WebVariant }> = {
  // the phone's
  largeTitle: { mobile: 'largeTitle', tv: 'heroTitle', web: 'heading' },
  title: { mobile: 'title', tv: 'rowTitle', web: 'title' },
  body: { mobile: 'body', tv: 'synopsis', web: 'body' },
  callout: { mobile: 'callout', tv: 'meta', web: 'body' },
  caption: { mobile: 'caption', tv: 'meta', web: 'caption' },
  tabLabel: { mobile: 'tabLabel', tv: 'pill', web: 'caption' },
  // the TV's
  heroTitle: { mobile: 'largeTitle', tv: 'heroTitle', web: 'display' },
  synopsis: { mobile: 'body', tv: 'synopsis', web: 'body' },
  rowTitle: { mobile: 'title', tv: 'rowTitle', web: 'title' },
  button: { mobile: 'callout', tv: 'button', web: 'body' },
  meta: { mobile: 'caption', tv: 'meta', web: 'caption' },
  serverName: { mobile: 'title', tv: 'serverName', web: 'title' },
  eyebrow: { mobile: 'caption', tv: 'eyebrow', web: 'label' },
  pill: { mobile: 'caption', tv: 'pill', web: 'caption' },
  quality: { mobile: 'tabLabel', tv: 'quality', web: 'label' },
  // the web's
  display: { mobile: 'largeTitle', tv: 'heroTitle', web: 'display' },
  heading: { mobile: 'largeTitle', tv: 'heroTitle', web: 'heading' },
  mono: { mobile: 'caption', tv: 'meta', web: 'mono' },
  label: { mobile: 'tabLabel', tv: 'eyebrow', web: 'label' },
}

const SCALE: Record<'pointer' | 'touch' | 'tv', Scale> = {
  pointer: 'web',
  touch: 'mobile',
  tv: 'tv',
}

export type TextProps = RNTextProps & {
  variant?: Variant
  color?: ColorRole
  weight?: 400 | 500 | 600
  mono?: boolean
  /** Points on the phone and with a pointer, units on the TV: overrides the variant's size. */
  size?: number
  align?: 'left' | 'center' | 'right'
}

type Spec = {
  size: number
  leading: number
  weight: number
  tracking?: number
  uppercase?: boolean
  family?: 'mono'
}

/** Geist's glyphs reach 1.2em of line before the tops are cut (its ascender is 1.005em). */
const NATURAL_LEADING = 1.2

/**
 * A style's text at the theme's form factor and `fontScale`, held to `cap`, the element's
 * `maxFontSizeMultiplier` (fontScaleFor).
 */
export function textStyle(
  theme: Theme,
  variant: Variant,
  size?: number,
  weight?: number,
  cap?: number,
) {
  const scale = SCALE[theme.formFactor.input]
  const styles = tokens.text[scale] as Record<string, Spec>
  const spec = styles[NEAREST[variant]?.[scale] ?? 'body'] ?? (tokens.text.mobile.body as Spec)
  const px = (size ?? spec.size) * theme.u * fontScaleFor(theme, cap)
  const lineHeight = Math.round(px * spec.leading)
  // a line tighter than the font's own (display titles) has its glyphs' tops cut off by the
  // text's frame on iOS, so the frame grows upward by the difference and the margin takes it
  // back: the layout keeps the tight leading
  const headroom = Math.max(0, Math.round(px * NATURAL_LEADING) - lineHeight)
  return {
    fontFamily: family(weight ?? spec.weight, spec.family === 'mono' ? 'mono' : 'sans'),
    fontSize: px,
    lineHeight,
    paddingTop: headroom || undefined,
    marginTop: headroom ? -headroom : undefined,
    // no tracking leaves letterSpacing unset: on iOS any number, 0 included, becomes
    // NSKernAttributeName (RCTAttributedTextUtils.mm), and a kern of 0 turns the font's kerning
    // off (Core Text's kCTKernAttributeName), where the web's `letter-spacing: 0` keeps it
    letterSpacing: spec.tracking ? spec.tracking * px : undefined,
    textTransform: spec.uppercase ? ('uppercase' as const) : undefined,
  }
}

/**
 * The device pixel iOS adds to every text's frame. React Native's iOS text measurement rounds up
 * to the pixel grid after adding an epsilon, so a height that's already on the grid (any line
 * height in whole points) gains one physical pixel: 1/3 of a point on a 3× iPhone
 * (ReactCommon/react/renderer/textlayoutmanager/TextMeasurementRounding.h, facebook/react-native
 * #53450). It keeps a last line from being clipped, but every text stands that much taller than
 * the web's, and a column of them drifts down (Settings' list, 5 points by its last row). The
 * margin takes the pixel back from the layout, as `headroom` does above, and leaves the frame
 * as drawn. Only where a line height is set, which every style here has.
 */
const IOS_TEXT_PIXEL = Platform.OS === 'ios' ? -1 / PixelRatio.get() : 0

export function Text({
  variant = 'body',
  color = 'text',
  weight,
  mono,
  size,
  align,
  style,
  maxFontSizeMultiplier = MAX_FONT_MULTIPLIER,
  ...props
}: TextProps) {
  const theme = useTheme()
  const base = textStyle(theme, variant, size, weight, maxFontSizeMultiplier ?? undefined)
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        base,
        IOS_TEXT_PIXEL ? { marginBottom: IOS_TEXT_PIXEL } : null,
        mono && { fontFamily: family(weight ?? 400, 'mono') },
        { color: theme.colors[color], textAlign: align },
        style,
      ]}
      {...props}
    />
  )
}

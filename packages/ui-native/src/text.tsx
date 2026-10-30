// SPDX-License-Identifier: AGPL-3.0-only
// Text in the type scale (typography.md): the phone's styles in points, scaled by the person's
// text size (mobile.md › Type), and the TV's in screen units. Colour is a role, never a hex.
import type { ColorRole } from '@highsea-tv/tokens'
import { Text as RNText, type TextProps as RNTextProps } from 'react-native'
import { family } from './fonts.ts'
import { type Theme, tokens, useTheme } from './theme.tsx'

export type Variant = keyof typeof tokens.text.mobile | keyof typeof tokens.text.tv

export type TextProps = RNTextProps & {
  variant?: Variant
  color?: ColorRole
  weight?: 400 | 500 | 600
  mono?: boolean
  /** Points on the phone, units on the TV: overrides the variant's size. */
  size?: number
  align?: 'left' | 'center' | 'right'
}

type Spec = {
  size: number
  leading: number
  weight: number
  tracking?: number
  uppercase?: boolean
}

export function textStyle(theme: Theme, variant: Variant, size?: number, weight?: number) {
  const scale = (theme.platform === 'tv' ? tokens.text.tv : tokens.text.mobile) as Record<
    string,
    Spec
  >
  const spec = scale[variant] ?? (tokens.text.mobile.body as Spec)
  const px = (size ?? spec.size) * theme.u
  return {
    fontFamily: family(weight ?? spec.weight),
    fontSize: px,
    lineHeight: Math.round(px * spec.leading),
    letterSpacing: spec.tracking ? spec.tracking * px : 0,
    textTransform: spec.uppercase ? ('uppercase' as const) : undefined,
  }
}

export function Text({
  variant = 'body',
  color = 'text',
  weight,
  mono,
  size,
  align,
  style,
  ...props
}: TextProps) {
  const theme = useTheme()
  const base = textStyle(theme, variant, size, weight)
  return (
    <RNText
      maxFontSizeMultiplier={2}
      style={[
        base,
        mono && { fontFamily: family(weight ?? 400, 'mono') },
        { color: theme.colors[color], textAlign: align },
        style,
      ]}
      {...props}
    />
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// One Icon for the apps (iconography.md): 1.75 stroke, 20pt by default, decorative unless
// labelled. On the TV, sizes are units and the stroke is 2 (tokens' icon.strokeTv).
import type { ColorRole } from '@highsea-tv/tokens'
import { Platform } from 'react-native'
import { type IconName, icons } from './icons.ts'
import { tokens, useTheme } from './theme.tsx'

export type IconProps = {
  name: IconName
  /** Points on the phone (16, 20 or 24), units on the TV. */
  size?: number
  color?: ColorRole
  /** Names the icon for VoiceOver. Without it the icon is hidden from it. */
  label?: string
  /** Solid in its colour with no stroke, as the web's `fill="currentColor" strokeWidth={0}`. */
  filled?: boolean
}

/**
 * An SVG's name, or none for a decorative one, in each platform's terms (the Icon and the Mark). On the web react-native-svg hands the props it
 * doesn't know to the `<svg>` element, so React Native's accessibility props would reach the DOM;
 * there it's ARIA's (https://www.w3.org/WAI/ARIA/apg/practices/names-and-descriptions/).
 */
export const svgName = (label: string | undefined) =>
  Platform.OS === 'web'
    ? label
      ? { role: 'img' as const, 'aria-label': label }
      : { 'aria-hidden': true }
    : {
        accessible: !!label,
        accessibilityLabel: label,
        accessibilityElementsHidden: !label,
        importantForAccessibility: label ? ('yes' as const) : ('no-hide-descendants' as const),
      }

export function Icon({ name, size, color = 'text', label, filled }: IconProps) {
  const theme = useTheme()
  const Glyph = icons[name]
  const tv = theme.formFactor.input === 'tv'
  const px = (size ?? (tv ? tokens.icon.sizeTv.min : tokens.icon.size.md)) * theme.u
  return (
    <Glyph
      size={px}
      color={theme.colors[color]}
      fill={filled ? theme.colors[color] : 'none'}
      strokeWidth={filled ? 0 : tv ? tokens.icon.strokeTv : tokens.icon.stroke}
      {...svgName(label)}
    />
  )
}

export type { IconName }

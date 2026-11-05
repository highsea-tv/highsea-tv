// SPDX-License-Identifier: AGPL-3.0-only
// A read-only star rating, as the web's (web/components/rating.tsx): the stars in s4, the accent's
// stars over them cut to the value, and the value always in the label.

import { useT } from '@highsea-tv/i18n/react'
import { View } from 'react-native'
import { Icon } from './icon.tsx'
import { uiMessages } from './messages.ts'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

export type RatingProps = {
  /** 0–max, fractions allowed. */
  value: number
  max?: number
  /**
   * A star's size in the form factor's unit: points (16 by default), or units on the TV, where
   * it's the TV prototype's 20 on a 1080p screen (TV_STAR) unless given.
   */
  size?: number
  /** Shows the number after the stars, in mono. */
  showValue?: boolean
}

/** The TV's star, in units: the TV prototype's `size={20}` on its 1080p screen, where 1u is 19.2. */
export const TV_STAR = 1.04
/** The gap before the value, in units on the TV (the web's gap-1.5, 6 at 1080p). */
const TV_GAP = 0.31

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

export function Rating({ value, max = 5, size: given, showValue = false }: RatingProps) {
  const theme = useTheme()
  const tv = theme.formFactor.input === 'tv'
  const size = given ?? (tv ? TV_STAR : tokens.icon.size.sm)
  const t = useT(uiMessages)
  const clamped = Math.min(max, Math.max(0, value))
  const px = size * theme.u
  // each star in a box of its own size: on the web an icon is an <svg>, which CSS lets shrink
  // (flex-shrink: 1), so the accent's row, cut to the value's width, squeezed all five stars into
  // it; a View doesn't shrink (react-native-web's View style sets flexShrink: 0, in
  // src/exports/View/index.js, as React Native's default,
  // https://reactnative.dev/docs/layout-props#flexshrink), so the stars keep their size
  const stars = (color: 's4' | 'accent') =>
    Array.from({ length: max }, (_, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: the stars are fixed
      <View key={i} style={{ width: px, height: px }}>
        <Icon name="star" size={size} color={color} filled />
      </View>
    ))
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('rated', { value: fmt(clamped), max })}
      style={{ flexDirection: 'row', alignItems: 'center', gap: tv ? TV_GAP * theme.u : 6 }}
    >
      <View style={{ flexDirection: 'row' }}>
        {stars('s4')}
        <View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            start: 0,
            width: (clamped / max) * px * max,
            flexDirection: 'row',
            overflow: 'hidden',
          }}
        >
          {stars('accent')}
        </View>
      </View>
      {showValue ? (
        <Text variant={tv ? 'meta' : 'caption'} mono color="text-2">
          {fmt(clamped)}
        </Text>
      ) : null}
    </View>
  )
}

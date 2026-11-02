// SPDX-License-Identifier: AGPL-3.0-only
// A read-only star rating, as the web's (web/components/rating.tsx): the stars in s4, the accent's
// stars over them cut to the value, and the value always in the label.
import { View } from 'react-native'
import { Icon } from './icon.tsx'
import { Text } from './text.tsx'
import { useTheme } from './theme.tsx'

export type RatingProps = {
  /** 0–max, fractions allowed. */
  value: number
  max?: number
  size?: number
  /** Shows the number after the stars, in mono. */
  showValue?: boolean
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

export function Rating({ value, max = 5, size = 16, showValue = false }: RatingProps) {
  const theme = useTheme()
  const clamped = Math.min(max, Math.max(0, value))
  const px = size * theme.u
  const stars = (color: 's4' | 'accent') =>
    Array.from({ length: max }, (_, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: the stars are fixed
      <Icon key={i} name="star" size={size} color={color} filled />
    ))
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Rated ${fmt(clamped)} out of ${max}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
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
        <Text variant="caption" mono color="text-2">
          {fmt(clamped)}
        </Text>
      ) : null}
    </View>
  )
}

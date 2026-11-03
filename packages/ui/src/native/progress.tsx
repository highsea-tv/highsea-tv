// SPDX-License-Identifier: AGPL-3.0-only
// The progress bar (ProgressBar, as on the web): the accent on a faint track, for Continue watching
// on artwork and for the player's buffered and played ranges.
import { View } from 'react-native'
import { tokens, useTheme } from './theme.tsx'

export function ProgressBar({
  value,
  label = 'Watched',
  height = 4,
}: {
  /** 0–100. */
  value: number
  label?: string
  height?: number
}) {
  const theme = useTheme()
  const v = Math.max(0, Math.min(100, value))
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v) }}
      style={{
        height: height * theme.u,
        borderRadius: tokens.radius.pill,
        overflow: 'hidden',
        backgroundColor: `${theme.colors.text}40`,
      }}
    >
      <View
        style={{
          width: `${v}%`,
          height: '100%',
          borderRadius: tokens.radius.pill,
          backgroundColor: theme.colors.accent,
        }}
      />
    </View>
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// The progress bar (progress.tsx in ui-web): the accent on a faint track, for Continue watching
// on artwork and for the player's buffered and played ranges.
import { View } from 'react-native'
import { useTheme } from './theme.tsx'

export function Progress({
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
        borderRadius: 999,
        overflow: 'hidden',
        backgroundColor: `${theme.colors.text}40`,
      }}
    >
      <View
        style={{
          width: `${v}%`,
          height: '100%',
          borderRadius: 999,
          backgroundColor: theme.colors.accent,
        }}
      />
    </View>
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// The progress bar (ProgressBar, as on the web): the accent on a faint track, for Continue watching
// on artwork, for the player's buffered and played ranges, and for a download (neutral while it's
// paused, with its percentage beside it, as the web renderer's `tone` and `showValue`).
import { View } from 'react-native'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

/** The tones the clients draw: the accent while it moves, neutral while it's held. */
export type ProgressBarTone = 'accent' | 'neutral'

const percent = (v: number) => `${v < 10 && v > 0 && v % 1 ? v.toFixed(1) : Math.round(v)}%`

export function ProgressBar({
  value,
  label = 'Watched',
  height = 4,
  tone = 'accent',
  showValue = false,
}: {
  /** 0–100. */
  value: number
  label?: string
  height?: number
  tone?: ProgressBarTone
  /** Shows the percentage beside the bar, so progress never relies on the bar alone. */
  showValue?: boolean
}) {
  const theme = useTheme()
  const v = Math.max(0, Math.min(100, value))
  const bar = (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      style={{
        height: height * theme.u,
        borderRadius: tokens.radius.pill,
        overflow: 'hidden',
        backgroundColor: `${theme.colors.text}40`,
        flexGrow: showValue ? 1 : undefined,
      }}
    >
      <View
        style={{
          width: `${v}%`,
          height: '100%',
          borderRadius: tokens.radius.pill,
          backgroundColor: theme.colors[tone === 'neutral' ? 'text-3' : 'accent'],
        }}
      />
    </View>
  )
  if (!showValue) return bar
  return (
    // the web renderer's gap-2.5 and w-11
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: (tokens.space['2'] + tokens.space['0.5']) * theme.u,
      }}
    >
      {bar}
      <Text
        variant="caption"
        color="text-2"
        mono
        align="right"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ minWidth: (tokens.space['10'] + tokens.space['1']) * theme.u }}
      >
        {percent(v)}
      </Text>
    </View>
  )
}

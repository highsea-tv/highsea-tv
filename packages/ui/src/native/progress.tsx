// SPDX-License-Identifier: AGPL-3.0-only
// The progress bar (ProgressBar, as on the web): the accent on a faint track, for Continue watching
// on artwork, for the player's buffered and played ranges, and for a download (neutral while it's
// paused, with its percentage beside it, as the web renderer's `tone` and `showValue`).
import { View } from 'react-native'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

/**
 * The tones: the accent while it moves, neutral while it's held, and the admin's status tones
 * (success when complete, warning when stalled or nearly full, danger when failed).
 */
export type ProgressBarTone = 'accent' | 'neutral' | 'success' | 'warning' | 'danger'

const FILL = {
  accent: 'accent',
  neutral: 'text-3',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
} as const satisfies Record<ProgressBarTone, string>

/** A panel's bar (web/components/progress.tsx's `sm`): 5 tall on `s3`. */
const PANEL_HEIGHT = 5

const percent = (v: number) => `${v < 10 && v > 0 && v % 1 ? v.toFixed(1) : Math.round(v)}%`

export function ProgressBar({
  value,
  label = 'Watched',
  height = 4,
  tone = 'accent',
  showValue = false,
  look = 'overlay',
}: {
  /** 0–100. */
  value: number
  label?: string
  height?: number
  tone?: ProgressBarTone
  /** Shows the percentage beside the bar, so progress never relies on the bar alone. */
  showValue?: boolean
  /**
   * `overlay`: on artwork and the player, a faint track of the text colour. `panel`: in the
   * admin's panels, 5 tall on `s3` with the value in the admin's `figure` type.
   */
  look?: 'overlay' | 'panel'
}) {
  const panel = look === 'panel'
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
        height: (panel ? PANEL_HEIGHT : height) * theme.u,
        borderRadius: tokens.radius.pill,
        overflow: 'hidden',
        backgroundColor: panel ? theme.colors.s3 : `${theme.colors.text}40`,
        flexGrow: showValue ? 1 : undefined,
      }}
    >
      <View
        style={{
          width: `${v}%`,
          height: '100%',
          borderRadius: tokens.radius.pill,
          backgroundColor: theme.colors[FILL[tone]],
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
        size={panel ? tokens.adminText.figure.size : undefined}
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

// SPDX-License-Identifier: AGPL-3.0-only
// A title page's TV parts that stay the TV's own: the resume line and the dialog at the right of the
// screen that the tracks open in. The rest of a title page's parts are merged by form factor (ADR 0060).
import { tvDetail } from '@highsea-tv/tokens'
import type { ReactNode } from 'react'
import { View } from 'react-native'
import { alpha } from '../alpha.ts'
import { Text } from '../text.tsx'
import { tokens, useTheme } from '../theme.tsx'
import { FocusGuide } from './engine'

const tv = tokens.tv

/** A thin progress bar with the time left beside it: where a title's resume stands. */
export function TvProgressLine({
  progress,
  label,
  width = tvDetail.progressWidth,
}: {
  /** 0–1. */
  progress: number
  label: string
  /** The bar's width, in units. */
  width?: number
}) {
  const theme = useTheme()
  const u = theme.u
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: tv.space['4'] * u }}>
      <View
        style={{
          height: tvDetail.progressLine * u,
          width: width * u,
          borderRadius: tokens.radius.pill,
          overflow: 'hidden',
          backgroundColor: alpha(theme.colors.text, 0.2),
        }}
      >
        <View
          style={{
            height: '100%',
            width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
            borderRadius: tokens.radius.pill,
            backgroundColor: theme.colors.accent,
          }}
        />
      </View>
      <Text variant="pill" color="text-2">
        {label}
      </Text>
    </View>
  )
}

/**
 * A dialog at the right of the screen over a page (the tracks, a setting's choices): inset half the
 * safe area, rounded, on `s1` at 95% with a shadow, keeping focus inside it (a focus guide with
 * every trap) until Back closes it, which is the app's to wire.
 */
export function TvSideDialog({
  label,
  width = tvDetail.sideDialog,
  children,
}: {
  label: string
  /** In units. */
  width?: number
  children: ReactNode
}) {
  const theme = useTheme()
  const u = theme.u
  const inset = { x: (tv.safe.x / 2) * u, y: (tv.safe.y / 2) * u }
  return (
    <FocusGuide
      trapFocusUp
      trapFocusDown
      trapFocusLeft
      trapFocusRight
      accessibilityLabel={label}
      accessibilityViewIsModal
      style={{
        position: 'absolute',
        top: inset.y,
        bottom: inset.y,
        right: inset.x,
        zIndex: 30,
        width: width * u,
        gap: tv.space['8'] * u,
        paddingHorizontal: tv.space['12'] * u,
        paddingVertical: tv.space['12'] * u,
        borderRadius: tv.radius.panel * u,
        backgroundColor: alpha(theme.colors.s1, 0.95),
        boxShadow: tokens.elevation[4].boxShadow,
      }}
    >
      {children}
    </FocusGuide>
  )
}

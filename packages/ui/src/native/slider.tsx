// SPDX-License-Identifier: AGPL-3.0-only
// A slider from 0 to 1 (the prototypes' `<input type="range">` for the volume, in the web's music
// bar and the phone's Now playing): a pill track filled with the text's colour up to the value,
// with a round thumb where `thumb` asks. A press or a drag sets it; on the web the arrow keys step
// it, and VoiceOver's adjustable actions do everywhere
// (https://reactnative.dev/docs/accessibility#accessibility-actions).
import { useState } from 'react'
import { type LayoutChangeEvent, View } from 'react-native'
import { alpha } from './alpha.ts'
import { tokens, useTheme } from './theme.tsx'

type Keys = { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }

export function Slider({
  value,
  onChange,
  label,
  valueText,
  step = 0.05,
  track = 4,
  thumb = 0,
  width,
}: {
  /** 0 to 1. */
  value: number
  onChange: (value: number) => void
  label: string
  /** The value in words: "80%". */
  valueText?: string
  step?: number
  /** The track's height in points. */
  track?: number
  /** The thumb's size in points; none at 0. */
  thumb?: number
  /** A fixed width; it fills its row without one. */
  width?: number
}) {
  const theme = useTheme()
  const [w, setW] = useState(0)
  const v = Math.max(0, Math.min(1, value))
  const set = (x: number) => {
    if (w) onChange(Math.max(0, Math.min(1, x / w)))
  }
  const by = (d: number) => onChange(Math.max(0, Math.min(1, Math.round((v + d) / step) * step)))
  const height = Math.max(track, thumb, tokens.space['6'])
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      accessible
      focusable
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-valuetext={valueText}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => by(e.nativeEvent.actionName === 'increment' ? step : -step)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => set(e.nativeEvent.locationX)}
      onResponderMove={(e) => set(e.nativeEvent.locationX)}
      // react-native-web forwards onKeyDown on a View (forwardedProps)
      onKeyDown={(e: { nativeEvent: unknown; preventDefault(): void }) => {
        const k = e.nativeEvent as Keys
        if (k.altKey || k.ctrlKey || k.metaKey) return
        if (k.key === 'ArrowLeft' || k.key === 'ArrowDown') by(-step)
        else if (k.key === 'ArrowRight' || k.key === 'ArrowUp') by(step)
        else return
        e.preventDefault()
      }}
      style={
        {
          width,
          flex: width === undefined ? 1 : undefined,
          height,
          justifyContent: 'center',
          borderRadius: tokens.radius.pill,
          cursor: 'pointer',
        } as object
      }
    >
      <View
        pointerEvents="none"
        style={{
          height: track,
          borderRadius: tokens.radius.pill,
          backgroundColor: alpha(theme.colors.text, 0.25),
        }}
      >
        <View
          style={{
            width: `${v * 100}%`,
            height: track,
            borderRadius: tokens.radius.pill,
            backgroundColor: theme.colors.text,
          }}
        />
      </View>
      {thumb ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: v * w - thumb / 2,
            width: thumb,
            height: thumb,
            borderRadius: thumb / 2,
            backgroundColor: theme.colors.text,
          }}
        />
      ) : null}
    </View>
  )
}

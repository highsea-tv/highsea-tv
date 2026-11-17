// SPDX-License-Identifier: AGPL-3.0-only
// The music player's progress as the song's own shape (the prototype's client/waveform.tsx): bars
// of its loudness from start to end (the server's loudness analysis, as Plex's gives Plexamp its
// waveform), filled with the accent up to where the song is. While it plays, the bars at the
// playhead rise and fall as an equalizer's do: the shape is the whole song, the motion is now.
// With reduced motion they hold still. With `onSeek` it's a slider: a press or a drag seeks, and
// so do the arrow keys on the web and VoiceOver's adjustable actions; a pointer over it shows the
// time it would go to. The TV's screen wraps it in its own focus stop for the remote's Left and
// Right, as the film's scrubber is (apps/client's player/tv.tsx).
//
// Also PlayingBars, the mark beside what's playing (a song in its album, the TV's Now playing in
// the head): three bars moving as an equalizer's, still while paused.
//
// The motion is React Native's Animated on the native driver (https://reactnative.dev/docs/animated
// › Using the native driver), one looping value each bar reads at its own phase, so React doesn't
// render twenty times a second as the prototype's style writes avoided. `transformOrigin` grows
// the bars from their foot (https://reactnative.dev/docs/transforms#transform-origin).

import { waveform, webText } from '@highsea-tv/tokens'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Easing, type LayoutChangeEvent, Platform, View } from 'react-native'
import { alpha } from './alpha.ts'
import { Text } from './text.tsx'
import { tokens, useMotionReduced, useTheme } from './theme.tsx'

/** The bars at and just behind the playhead that move while the song plays. */
const LIVE_BEHIND = 10
const LIVE_AHEAD = 2
/** One turn of the equalizer's loop, in ms. */
const LOOP_MS = 2400
/** The steps each bar's wave is sampled at over a turn: about twenty a second reads as music. */
const STEPS = 48

/** The loudest step in each of `count` even buckets: peaks stay, however few bars fit. */
export function resample(levels: readonly number[], count: number): number[] {
  if (count <= 0 || levels.length === 0) return []
  return Array.from({ length: count }, (_, i) => {
    const from = Math.floor((i * levels.length) / count)
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / count))
    let peak = 0
    for (let j = from; j < to; j++) peak = Math.max(peak, levels[j] as number)
    return peak
  })
}

/**
 * A bar's height in percent from its loudness: quiet passages drop well below loud ones, as a
 * waveform drawn on a decibel-like scale does, and nothing quite vanishes.
 */
export const barHeight = (level: number) =>
  Math.round(12 + 88 * Math.max(0, (level - 0.15) / 0.85) ** 1.6)

/** A looping 0 to 1 while `on`, at rest otherwise. */
function useLoop(on: boolean, ms: number) {
  const value = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!on) {
      value.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration: ms,
        easing: Easing.linear,
        // the web has no native driver; react-native-web runs it in JS
        useNativeDriver: Platform.OS !== 'web',
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [on, ms, value])
  return value
}

/** A bar's scale over a turn: two waves at odd speeds, so it never repeats plainly. */
function waveOf(i: number, near: number, most: number) {
  const input: number[] = []
  const output: number[] = []
  for (let s = 0; s <= STEPS; s++) {
    const t = (s / STEPS) * LOOP_MS
    const wave = Math.abs(Math.sin(t / 170 + i * 1.7) * 0.6 + Math.sin(t / 97 + i * 0.9) * 0.4)
    input.push(s / STEPS)
    output.push(Math.min(most, 0.3 + 0.7 * (1 - near) + wave * 1.1 * near))
  }
  // the loop's end meets its start
  output[STEPS] = output[0] as number
  return { inputRange: input, outputRange: output }
}

export type WaveformProps = {
  loudness: readonly number[]
  position: number
  duration: number
  playing: boolean
  /** A bar's width and the gap after it, in points; or a fixed number of bars and their gap. */
  bar?: { width: number; gap: number } | { count: number; gap: number }
  /** The waveform's height in points. */
  height: number
  /** Seeks to a position in seconds; without it the waveform only shows progress. */
  onSeek?: (seconds: number) => void
  /** How far an arrow key or VoiceOver's adjust moves, in seconds. */
  step?: number
  /** The slider's name: "Position in Rooftops". */
  label?: string
  /** Where it is in words: "1:10 of 3:39". */
  valueText?: string
  /** A time in words, for the pointer's tooltip: the app's clock. */
  timeAt?: (seconds: number) => string
}

type Keys = { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }

/** Where along the waveform a press or the pointer is, on the web from the element's own box. */
function xIn(e: { nativeEvent: unknown; currentTarget: unknown }) {
  const el = e.currentTarget as { getBoundingClientRect?: () => { left: number } } | null
  const n = e.nativeEvent as { clientX?: number; locationX?: number }
  if (el?.getBoundingClientRect && n.clientX !== undefined)
    return n.clientX - el.getBoundingClientRect().left
  return n.locationX ?? 0
}

export function Waveform({
  loudness,
  position,
  duration,
  playing,
  bar = { width: 3, gap: 2 },
  height,
  onSeek,
  step = 5,
  label,
  valueText,
  timeAt,
}: WaveformProps) {
  const theme = useTheme()
  const reduced = useMotionReduced()
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number | null>(null)
  // as many bars as fit, so the shape fills its width at any size
  const count =
    'count' in bar ? bar.count : Math.max(8, Math.floor((width + bar.gap) / (bar.width + bar.gap)))
  const levels = useMemo(
    () => (width || 'count' in bar ? resample(loudness, count) : []),
    [loudness, count, width, bar],
  )
  const fraction = duration > 0 ? Math.min(1, position / duration) : 0
  const at = Math.floor(fraction * count)
  const live = playing && !reduced
  const tick = useLoop(live, LOOP_MS)
  const hoverAt = hover === null ? null : Math.floor(hover * count)
  const seekAt = (x: number) =>
    onSeek && width ? onSeek(Math.max(0, Math.min(1, x / width)) * duration) : undefined

  const bars = (
    <View
      style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: bar.gap }}
      pointerEvents="none"
    >
      {levels.map((level, i) => {
        const h = barHeight(level)
        const done = i < at || (i === at && fraction > 0)
        const color = done
          ? theme.colors.accent
          : alpha(theme.colors.text, hoverAt !== null && i <= hoverAt ? 0.5 : 0.25)
        const moving = live && i >= at - LIVE_BEHIND && i <= at + LIVE_AHEAD
        const near = 1 - Math.abs(i - at) / (LIVE_BEHIND + 1)
        return (
          <Animated.View
            // biome-ignore lint/suspicious/noArrayIndexKey: a bar is its place in the song
            key={i}
            style={{
              flex: 1,
              minWidth: 0,
              height: `${h}%`,
              borderRadius: tokens.radius.pill,
              backgroundColor: color,
              transformOrigin: 'bottom',
              transform: moving
                ? [{ scaleY: tick.interpolate(waveOf(i, near, 100 / h)) }]
                : undefined,
            }}
          />
        )
      })}
    </View>
  )
  if (!onSeek)
    return (
      <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>{bars}</View>
    )
  const by = (seconds: number) => onSeek(Math.max(0, Math.min(duration - 0.5, position + seconds)))
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessible
      focusable
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(position)}
      aria-valuetext={valueText}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => by(e.nativeEvent.actionName === 'increment' ? step : -step)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => seekAt(xIn(e))}
      onResponderMove={(e) => seekAt(xIn(e))}
      // react-native-web forwards onKeyDown and the pointer events on a View (forwardedProps)
      onKeyDown={(e: { nativeEvent: unknown; preventDefault(): void }) => {
        const k = e.nativeEvent as Keys
        if (k.altKey || k.ctrlKey || k.metaKey) return
        if (k.key === 'ArrowLeft' || k.key === 'ArrowDown') by(-step)
        else if (k.key === 'ArrowRight' || k.key === 'ArrowUp') by(step)
        else return
        e.preventDefault()
      }}
      onPointerMove={(e: { nativeEvent: unknown; currentTarget: unknown }) => {
        if ((e.nativeEvent as { pointerType?: string }).pointerType !== 'mouse' || !width) return
        setHover(Math.max(0, Math.min(1, xIn(e) / width)))
      }}
      onPointerLeave={() => setHover(null)}
      style={{ borderRadius: tokens.radius.sm, cursor: 'pointer' } as object}
    >
      {hover !== null && timeAt ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: height + tokens.space['1'] + tokens.space['0.5'],
            left: hover * width,
            transform: [{ translateX: '-50%' }],
            paddingHorizontal: tokens.space['1'] + tokens.space['0.5'],
            paddingVertical: tokens.space['0.5'],
            borderRadius: tokens.radius.sm,
            backgroundColor: theme.colors.s3,
            zIndex: 1,
          }}
        >
          <Text variant="mono" mono size={webText.label.size}>
            {timeAt(hover * duration)}
          </Text>
        </View>
      ) : null}
      {bars}
    </View>
  )
}

/** The three bars' speeds and offsets, as the prototype's playing-bar animation has them. */
const PLAYING = [
  { ms: 760, delay: 0 },
  { ms: 1040, delay: 230 },
  { ms: 880, delay: 460 },
]

/**
 * The mark beside what's playing: three bars moving as an equalizer's do, still while paused or
 * with reduced motion. `size` is its height in points; it takes the text's colour role.
 */
export function PlayingBars({
  playing,
  size = tokens.icon.size.xs,
  color = 'text',
}: {
  playing: boolean
  size?: number
  color?: 'text' | 'text-2' | 'accent-text' | 'bg'
}) {
  const theme = useTheme()
  const reduced = useMotionReduced()
  const live = playing && !reduced
  const ticks = [
    useLoop(live, PLAYING[0]?.ms ?? 760),
    useLoop(live, PLAYING[1]?.ms ?? 1040),
    useLoop(live, PLAYING[2]?.ms ?? 880),
  ]
  const w = Math.max(waveform.barMin, Math.round(size * 0.2))
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', alignItems: 'flex-end', height: size, gap: w * 0.7 }}
    >
      {ticks.map((tick, i) => {
        // the prototype's keyframes: down to a third and back, each bar at its own offset
        const offset = (PLAYING[i]?.delay ?? 0) / (PLAYING[i]?.ms ?? 1)
        const rest = [1, 0.55, 0.75][i] as number
        return (
          <Animated.View
            // biome-ignore lint/suspicious/noArrayIndexKey: three bars in their places
            key={i}
            style={{
              width: w,
              height: size,
              borderRadius: tokens.radius.pill,
              backgroundColor: theme.colors[color],
              transformOrigin: 'bottom',
              transform: [
                {
                  scaleY: live
                    ? tick.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: offset < 0.5 ? [1, 0.3, 1] : [0.3, 1, 0.3],
                      })
                    : rest,
                },
              ],
            }}
          />
        )
      })}
    </View>
  )
}

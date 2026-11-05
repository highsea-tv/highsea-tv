// SPDX-License-Identifier: AGPL-3.0-only
// Placeholders while content loads, as the web renderer's (web/components/skeleton.tsx): `s2`
// with a band of `s3` sweeping across it, 1.6s a pass, linear, forever. The sweep counts as a
// progress indicator, the one kind of motion allowed to loop (motion.md#choreography); reduced
// motion holds it still on `s2`. The band is a gradient as wide as the placeholder, moved from one
// side to the other by transform on the UI thread (Reanimated's withRepeat,
// https://docs.swmansion.com/react-native-reanimated/docs/animations/withRepeat), where the web
// moves a background twice its width. Hidden from assistive tech: the screen says it's loading.
import { useEffect, useState } from 'react'
import { type DimensionValue, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { tokens, useMotionReduced, useTheme } from './theme.tsx'

/** One pass of the sweep, ms (the web's --animate-shimmer, hs-shimmer 1.6s linear infinite). */
const SWEEP_MS = 1600

export type SkeletonProps = {
  width?: DimensionValue
  /** Its height, in the form factor's unit (points, or units on the TV). */
  height?: number
  /**
   * Its corner, in points: `radius.sm` by default, as the web's `rounded-sm`, and on the TV the
   * same in units, so it rounds as much against the screen's larger type.
   */
  radius?: number
}

export function Skeleton({ width = '100%', height, radius }: SkeletonProps) {
  const theme = useTheme()
  const corner = radius ?? tokens.radius.sm * (theme.formFactor.input === 'tv' ? theme.u : 1)
  const reduced = useMotionReduced()
  const [w, setW] = useState(0)
  const at = useSharedValue(-1)
  useEffect(() => {
    if (reduced || w === 0) return
    at.value = -1
    at.value = withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.linear }), -1)
  }, [reduced, w, at])
  const band = useAnimatedStyle(() => ({ transform: [{ translateX: at.value * w }] }), [at, w])
  const { s2, s3 } = theme.colors
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{
        width,
        height: height === undefined ? undefined : height * theme.u,
        borderRadius: corner,
        overflow: 'hidden',
        backgroundColor: s2,
      }}
    >
      {reduced || w === 0 ? null : (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundImage: `linear-gradient(90deg, ${s2} 30%, ${s3} 50%, ${s2} 70%)` },
            band,
          ]}
        />
      )}
    </View>
  )
}

/** A line's height and the gap under it: the web's h-3 and gap-2, and the TV prototype's in units. */
const LINE = { height: tokens.space['3'], gap: tokens.space['2'] }
const TV_LINE = { height: 1.1, gap: 0.6 }

/**
 * Lines of text-shaped placeholders, the last one shorter (60%): 12 tall and 8 apart, as the
 * web's, or on the TV 1.1u and 0.6u, as the TV prototype's (tv/home.tsx's h-[1.1cqw] gap-[0.6cqw]).
 */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  const theme = useTheme()
  const line = theme.formFactor.input === 'tv' ? TV_LINE : LINE
  return (
    <View aria-hidden style={{ gap: line.gap * theme.u }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder lines
          key={i}
          height={line.height}
          width={i === lines - 1 && lines > 1 ? '60%' : '100%'}
        />
      ))}
    </View>
  )
}

/**
 * A poster's placeholder, as Poster lays one out with its title (client/media-card.tsx's
 * MediaPosterSkeleton and tv/kit.tsx's TvTileSkeleton): the art at its aspect and corner, the
 * resume bar under it for Continue watching, then a line for the title and a shorter one for the
 * caption. By touch and with a pointer the bar is 4 tall 14 under the art and the lines 14 and 12,
 * 6 apart; on the TV the bar is TvTile's (0.25u, 0.9u under) and the lines 1.05u and 0.95u.
 */
export function PosterSkeleton({
  aspect = 'poster',
  resume = false,
  width,
}: {
  /** A poster's 2:3, or a still's 16:9 (Continue watching and a row of stills). */
  aspect?: 'poster' | 'still'
  /** Continue watching's: the resume bar under the art. */
  resume?: boolean
  /** Its width in points; it fills its parent without one. */
  width?: number
}) {
  const theme = useTheme()
  const u = theme.u
  const tv = theme.formFactor.input === 'tv'
  const [w, h] = tokens.aspect[aspect]
  const m = tv ? TV_POSTER_LINES : POSTER_LINES
  return (
    <View aria-hidden style={{ width }}>
      <View style={{ flexDirection: 'row', aspectRatio: w / h }}>
        <Skeleton radius={tv ? tokens.tv.radius.poster * u : tokens.radius.poster} width="100%" />
      </View>
      {resume ? (
        <View style={{ marginTop: m.barGap * u }}>
          <Skeleton height={m.bar} radius={tokens.radius.pill} />
        </View>
      ) : null}
      <View style={{ marginTop: m.top * u, gap: m.gap * u, paddingVertical: m.pad * u }}>
        <Skeleton height={m.title} width="80%" />
        <Skeleton height={m.caption} width="40%" />
      </View>
    </View>
  )
}

/** PosterSkeleton's bar and lines: the web's mt-3.5 h-1, mt-2 gap-1.5 py-1, h-3.5 and h-3. */
const POSTER_LINES = {
  bar: tokens.space['1'],
  barGap: tokens.space['3'] + tokens.space['0.5'],
  top: tokens.space['2'],
  gap: tokens.space['1'] + tokens.space['0.5'],
  pad: tokens.space['1'],
  title: tokens.space['3'] + tokens.space['0.5'],
  caption: tokens.space['3'],
}
/** On the TV, in units: TvTile's bar, and the TV prototype's mt-[1cqw] gap-[0.5cqw] py-[0.2cqw]. */
const TV_POSTER_LINES = {
  bar: 0.25,
  barGap: 0.9,
  top: 1,
  gap: 0.5,
  pad: 0.2,
  title: 1.05,
  caption: 0.95,
}

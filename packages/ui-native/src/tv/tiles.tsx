// SPDX-License-Identifier: AGPL-3.0-only
// Titled art as a focus stop (kit.tsx's TvTile in the prototype): a poster or a wide tile, its
// title and a caption under the art. The art lifts on focus and takes the ring; the words stay
// put, clear of it, and the title turns from `text-2` to `text`. A row of them is a sideways
// scroll view, so tvOS's focus engine reaches tiles past the screen's edge, and each tile lands
// 30% in from the left, measured from centres (tv.md › Scrolling); the row is a focus guide with
// `autoFocus`, so coming back to it lands on the tile left (react-native-tvos's TVFocusGuideView).
import { Image } from 'expo-image'
import { type ReactNode, type Ref, useEffect } from 'react'
import { ScrollView, TVFocusGuideView, useWindowDimensions, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { Progress } from '../progress.tsx'
import { Text } from '../text.tsx'
import { tokens, useTheme } from '../theme.tsx'
import { Focusable, focusShadow, type ViewHandle } from './focusable.tsx'
import { KEEP, keptAt, TRACK_SPRING } from './model.ts'

const tv = tokens.tv

/** A wide tile's width in units: Continue watching's stills (17u in the prototype). */
export const WIDE_WIDTH = 17

export type TileSource = string | { uri: string; headers?: Record<string, string> } | null

export function TvTile({
  title,
  caption,
  src,
  wide = false,
  progress = null,
  width,
  onPress,
  onLongPress,
  onFocus,
  preferred,
  ref,
}: {
  title: string
  caption: string
  src: TileSource | undefined
  wide?: boolean
  /** 0–1. */
  progress?: number | null
  /** In units; a poster's is 10.5u, a wide tile's 17u. */
  width?: number
  onPress?: () => void
  onLongPress?: () => void
  onFocus?: () => void
  preferred?: boolean
  ref?: Ref<ViewHandle>
}) {
  const theme = useTheme()
  const u = theme.u
  const w = (width ?? (wide ? WIDE_WIDTH : tv.poster.width)) * u
  const radius = tv.radius.poster * u
  return (
    <Focusable
      ref={ref}
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={onFocus}
      preferred={preferred}
      lift="none"
      ring={false}
      role="link"
      label={`${title}, ${caption}`}
      width={w}
    >
      {(focused) => (
        <>
          <Art
            src={src}
            title={title}
            ratio={wide ? 16 / 9 : 2 / 3}
            radius={radius}
            focused={focused}
            progress={progress}
          />
          <Text
            variant="meta"
            weight={600}
            color={focused ? 'text' : 'text-2'}
            numberOfLines={1}
            style={{ marginTop: 1 * u }}
          >
            {title}
          </Text>
          <Text variant="pill" color="text-3" numberOfLines={1}>
            {caption}
          </Text>
        </>
      )}
    </Focusable>
  )
}

function Art({
  src,
  title,
  ratio,
  radius,
  focused,
  progress,
}: {
  src: TileSource | undefined
  title: string
  ratio: number
  radius: number
  focused: boolean
  progress: number | null
}) {
  const theme = useTheme()
  const reduced = useReducedMotion()
  const scale = useSharedValue(1)
  useEffect(() => {
    scale.value = withSpring(focused && !reduced ? tokens.focus.tv.scalePoster : 1, TRACK_SPRING)
  }, [focused, reduced, scale])
  const lifted = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  return (
    <Animated.View
      style={[
        {
          width: '100%',
          aspectRatio: ratio,
          borderRadius: radius,
          backgroundColor: theme.colors.s2,
        },
        focused && { boxShadow: focusShadow(theme.colors.text, theme.u, theme.focusRingScale) },
        lifted,
      ]}
    >
      <View style={{ flex: 1, borderRadius: radius, overflow: 'hidden' }}>
        {src ? (
          <Image
            source={src}
            style={{ flex: 1 }}
            contentFit="cover"
            transition={tokens.durations.color}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View
            style={{
              flex: 1,
              justifyContent: 'flex-end',
              padding: '9%',
              experimental_backgroundImage: `linear-gradient(160deg, ${theme.colors.s3}, ${theme.colors.s1})`,
            }}
          >
            <Text variant="meta" weight={600} color="text-2" numberOfLines={3}>
              {title}
            </Text>
          </View>
        )}
        {progress !== null ? (
          <View style={{ position: 'absolute', left: '7%', right: '7%', bottom: '7%' }}>
            <Progress value={progress * 100} height={0.25} />
          </View>
        ) : null}
      </View>
    </Animated.View>
  )
}

/**
 * A titled row of tiles (kit.tsx's TvRow): the title at the safe area's inset, and the tiles in a
 * sideways scroll view that lands each focused tile with its centre 30% in (react-native-tvos's
 * `snapToAlignment="item"` with each tile's `scrollSnapOffset`). Item widths are known (posters
 * 10.5u, wide tiles 17u), so where they land is worked out, not measured.
 */
export function TvRow<T>({
  title,
  suffix,
  items,
  keyOf,
  wide = false,
  render,
  onFocusItem,
  ref,
}: {
  title: string
  suffix?: string | null
  items: T[]
  keyOf: (item: T) => string | number
  wide?: boolean
  render: (item: T, at: { index: number; onFocus: () => void }) => ReactNode
  onFocusItem?: (item: T, index: number) => void
  ref?: Ref<ViewHandle>
}) {
  const theme = useTheme()
  const u = theme.u
  const { width } = useWindowDimensions()
  const reduced = useReducedMotion()
  const w = (wide ? WIDE_WIDTH : tv.poster.width) * u
  const inset = tv.safe.x * u
  return (
    <View ref={ref} accessibilityRole="list" accessibilityLabel={title} style={{ gap: 0.8 * u }}>
      <Text variant="rowTitle" style={{ paddingHorizontal: inset }} accessibilityRole="header">
        {title}
        {suffix ? (
          <Text variant="rowTitle" weight={400} color="text-2">
            {` ${suffix}`}
          </Text>
        ) : null}
      </Text>
      <TVFocusGuideView autoFocus trapFocusLeft trapFocusRight>
        <ScrollView
          horizontal
          snapToAlignment="item"
          scrollAnimationEnabled={!reduced}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            gap: tv.poster.gap * u,
            paddingHorizontal: inset,
            paddingVertical: 1 * u,
          }}
        >
          {items.map((item, index) => (
            <View key={keyOf(item)} scrollSnapOffset={keptAt(KEEP.row, width, w)}>
              {render(item, {
                index,
                onFocus: () => onFocusItem?.(item, index),
              })}
            </View>
          ))}
        </ScrollView>
      </TVFocusGuideView>
    </View>
  )
}

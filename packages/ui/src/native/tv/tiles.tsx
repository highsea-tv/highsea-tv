// SPDX-License-Identifier: AGPL-3.0-only
// Titled art as a focus stop (kit.tsx's TvTile in the prototype): a poster or a wide tile, its
// title and a caption under the art. The art lifts on focus and takes the ring; the words stay
// put, clear of it, and the title turns from `text-2` to `text`. It's Poster's TV form
// (../poster.tsx), and a row of them is Row's (../row.tsx). Poster hands it a collection's mosaic
// as `artwork` and its Smart mark as `status`, which lift with the art (kit/collection-art.tsx).
import { Image } from 'expo-image'
import { type ReactNode, type Ref, useEffect, useRef } from 'react'
import { View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { ProgressBar } from '../progress.tsx'
import { Text } from '../text.tsx'
import { tokens, useMotionReduced, useTheme } from '../theme.tsx'
import { Focusable, focusShadow, type ViewHandle } from './focusable.tsx'
import { TRACK_SPRING } from './model.ts'

const tv = tokens.tv

/** A wide tile's width in units: Continue watching's stills (17u in the prototype). */
export const WIDE_WIDTH = 17

export type TileSource = string | { uri: string; headers?: Record<string, string> } | null

/**
 * What Play/Pause does while a tile is focused (tv.md#remote-keys: it plays the focused title): the
 * focused tile's `onPlay`, kept in one place so the app's one key handler can run it, rather than
 * a handler in each of the hundreds of tiles a library draws.
 */
export const focusedPlay: { current: (() => void) | null } = { current: null }

export function TvTile({
  title,
  caption,
  src,
  artwork,
  status,
  wide = false,
  square = false,
  round = false,
  progress = null,
  progressBelow = false,
  width,
  onPress,
  onLongPress,
  delayLongPress,
  onFocus,
  onPlay,
  preferred,
  label,
  ref,
}: {
  title: string
  caption: string
  src: TileSource | undefined
  /** Drawn in the art's place over `src` (a collection's mosaic, Poster's). */
  artwork?: ReactNode
  /** A mark at the art's foot, at the start (a smart collection's), as Poster's status. */
  status?: ReactNode
  wide?: boolean
  /** Music's square cover: an album's, a playlist's mosaic (tv/music.tsx's `TvTile square`). */
  square?: boolean
  /** An artist's round photo, its words centred (tv/music.tsx's TvArtistTile). */
  round?: boolean
  /** 0–1. */
  progress?: number | null
  /** The bar between the art and the title rather than on the art: Continue watching's. */
  progressBelow?: boolean
  /** In units; a poster's is 10.5u, a wide tile's 17u. */
  width?: number
  onPress?: () => void
  onLongPress?: () => void
  /** How long OK is held for `onLongPress`, in ms. */
  delayLongPress?: number
  onFocus?: () => void
  /** What Play/Pause does while this tile is focused: a film's tile plays it. */
  onPlay?: () => void
  preferred?: boolean
  /** What it's read as, over `title, caption`. */
  label?: string
  ref?: Ref<ViewHandle>
}) {
  const theme = useTheme()
  const u = theme.u
  const play = useRef(onPlay)
  play.current = onPlay
  const mine = useRef(() => play.current?.())
  // a tile unmounted while focused (a screen left) takes its action with it
  useEffect(() => {
    const own = mine.current
    return () => {
      if (focusedPlay.current === own) focusedPlay.current = null
    }
  }, [])
  const w = (width ?? (wide ? WIDE_WIDTH : tv.poster.width)) * u
  const radius = round ? tokens.radius.pill : tv.radius.poster * u
  return (
    <Focusable
      ref={ref}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      onFocus={() => {
        focusedPlay.current = mine.current
        onFocus?.()
      }}
      onBlur={() => {
        if (focusedPlay.current === mine.current) focusedPlay.current = null
      }}
      preferred={preferred}
      lift="none"
      ring={false}
      role="link"
      label={label ?? [title, caption].filter(Boolean).join(', ')}
      width={w}
    >
      {(focused) => (
        <>
          <Art
            src={src}
            artwork={artwork}
            status={status}
            title={title}
            ratio={wide ? 16 / 9 : square || round ? 1 : 2 / 3}
            radius={radius}
            focused={focused}
            progress={progressBelow ? null : progress}
          />
          {progressBelow && progress !== null ? (
            <View style={{ marginTop: 0.9 * u }}>
              <ProgressBar value={progress * 100} height={0.25} />
            </View>
          ) : null}
          <Text
            variant="meta"
            weight={600}
            color={focused ? 'text' : 'text-2'}
            numberOfLines={1}
            align={round ? 'center' : undefined}
            style={{ marginTop: 1 * u }}
          >
            {title}
          </Text>
          <Text
            variant="pill"
            color="text-3"
            numberOfLines={1}
            align={round ? 'center' : undefined}
          >
            {caption}
          </Text>
        </>
      )}
    </Focusable>
  )
}

function Art({
  src,
  artwork,
  status,
  title,
  ratio,
  radius,
  focused,
  progress,
}: {
  src: TileSource | undefined
  artwork?: ReactNode
  status?: ReactNode
  title: string
  ratio: number
  radius: number
  focused: boolean
  progress: number | null
}) {
  const theme = useTheme()
  const reduced = useMotionReduced()
  const scale = useSharedValue(1)
  useEffect(() => {
    scale.value = withSpring(focused && !reduced ? tokens.focus.tv.scalePoster : 1, TRACK_SPRING)
  }, [focused, reduced, scale])
  const lifted = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }), [scale])
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
        {artwork ? (
          artwork
        ) : src ? (
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
              backgroundImage: `linear-gradient(160deg, ${theme.colors.s3}, ${theme.colors.s1})`,
            }}
          >
            <Text variant="meta" weight={600} color="text-2" numberOfLines={3}>
              {title}
            </Text>
          </View>
        )}
        {status ? (
          <View
            style={{
              position: 'absolute',
              left: '7%',
              right: '7%',
              bottom: progress === null ? '7%' : '14%',
              flexDirection: 'row',
            }}
          >
            {status}
          </View>
        ) : null}
        {progress !== null ? (
          <View style={{ position: 'absolute', left: '7%', right: '7%', bottom: '7%' }}>
            <ProgressBar value={progress * 100} height={0.25} />
          </View>
        ) : null}
      </View>
    </Animated.View>
  )
}

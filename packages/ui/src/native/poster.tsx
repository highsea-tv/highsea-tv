// SPDX-License-Identifier: AGPL-3.0-only
// A poster (poster.tsx in ui-web): 2:3 artwork (or a 16:9 still) with a fallback of the title on
// a gradient, quality pills top left, a status bottom left, the Continue watching bar 7% in from
// the edges, and the title and caption under it. The poster is its own touch target. Artwork is
// decoded at display size by expo-image (tv.md › Performance; https://docs.expo.dev/versions/latest/sdk/image/).
// By the form factor: only with a pointer the art grows to the web's poster scale while the pointer's
// over it or the keyboard's on it (./lift.ts), and its quick actions show at its top end while the
// pointer's over the poster or focus is inside it, as the web renderer's do (`group-hover` and
// `group-focus-within`); on the TV it's TvTile (./tv/tiles.tsx), a focus stop whose art lifts and
// takes the ring. A collection without a poster of its own draws its first four titles' posters as
// a mosaic, as Plex draws a smart collection's (collections.md#artwork; kit/collection-art.tsx).
// react-native-web's View passes the pointer's and focus's events on to its element
// (modules/forwardedProps: onPointerEnter, onPointerLeave, onFocus and onBlur, which bubble in
// React), so the poster's frame knows both.
import { adminText } from '@highsea-tv/tokens'
import { type ReactNode, type Ref, useState } from 'react'
import {
  Platform,
  type StyleProp,
  StyleSheet,
  View,
  type ViewProps,
  type ViewStyle,
} from 'react-native'
import Animated from 'react-native-reanimated'
import { QualityTag } from './badge.tsx'
import { Image } from './image.tsx'
import { useLift } from './lift.ts'
import { Press } from './press.tsx'
import { ProgressBar } from './progress.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'
import type { ViewHandle } from './tv/focusable.tsx'
import { TvTile } from './tv/tiles.tsx'

/** The admin's `ui` style, a pointer's `titleSize="ui"` (as the banner's). */
const UI = adminText.ui

export type PosterProps = {
  title: string
  /** A URL, or a source with headers (a server's artwork needs the device's token). */
  src?: string | { uri: string; headers?: Record<string, string> } | null
  /** A film's 2:3, a still's 16:9, or music's square cover (an album's, a playlist's mosaic). */
  aspect?: 'poster' | 'still' | 'square'
  /**
   * Round art with the words centred under it: an artist's photo, as people are drawn
   * (web/music.tsx's ArtistCard, tv/music.tsx's TvArtistTile). Takes the square aspect.
   */
  round?: boolean
  onPress?: () => void
  /**
   * Where it leads: on the web the poster is an `<a href>` (react-native-web draws a Pressable with
   * an address as one), as the web renderer's Poster `href` (the admin's posters). Elsewhere
   * `onPress` is the way.
   */
  href?: string
  onLongPress?: () => void
  /** What the long press does, which VoiceOver offers among the poster's actions. */
  longPressLabel?: string
  /** How long the press is held, in ms (React Native's default is 500). */
  longPressMs?: number
  quality?: string[]
  status?: ReactNode
  /** 0–100. */
  progress?: number
  /** The bar under the art, between it and the title, as Continue watching has it. */
  progressBelow?: boolean
  showTitle?: boolean
  /**
   * A pointer: the title's size, the clients' `body` (the owner, 2026-10-30; web/library.tsx) or
   * the admin's denser `ui`, as the web renderer's `titleSize`. `body` by default, as the clients
   * pass it; touch keeps its `callout` and the TV its tile's.
   */
  titleSize?: 'ui' | 'body'
  caption?: string
  /** The width it's drawn at, in the form factor's unit (units on the TV); the height follows the aspect. */
  width?: number
  /** The TV: it took focus. */
  onFocus?: () => void
  /** The TV: what Play/Pause does while it's focused (a film's poster plays it). */
  onPlay?: () => void
  /** The TV: it takes focus when the screen appears. */
  preferred?: boolean
  /** What it's read as, over `title, caption`. */
  accessibilityLabel?: string
  /**
   * A pointer: quick actions over the art's top end (Play, Add to list, More), shown while the
   * pointer's over the poster or focus is inside it. Touch has no hover, so it doesn't draw them.
   */
  actions?: ReactNode
  /**
   * Up to four posters drawn two by two where there's no `src` (a collection's), with two or more
   * of them; with one, it's the art.
   */
  mosaic?: readonly NonNullable<PosterProps['src']>[]
  ref?: Ref<ViewHandle>
}

export function Poster({
  title,
  src,
  aspect: aspectGiven = 'poster',
  round = false,
  onPress,
  href,
  onLongPress,
  longPressLabel,
  longPressMs,
  quality,
  status,
  progress,
  progressBelow = false,
  showTitle,
  titleSize = 'body',
  caption,
  width,
  onFocus,
  onPlay,
  preferred,
  accessibilityLabel,
  actions,
  mosaic,
  ref,
}: PosterProps) {
  const theme = useTheme()
  const input = theme.formFactor.input
  const aspect = round ? 'square' : aspectGiven
  // a pointer over the poster, its actions included, and focus inside it (the actions')
  const [over, setOver] = useState(false)
  const [within, setWithin] = useState(false)
  if (input === 'tv')
    // the TV's tile has no quality pills (tv.md's tiles carry the title and caption), but a
    // collection's mosaic and its Smart mark, as the TV prototype's (tv/collections.tsx drawing
    // kit/collection-art.tsx's CollectionTile)
    return (
      <TvTile
        ref={ref}
        title={title}
        caption={caption ?? ''}
        src={src ?? mosaic?.[0]}
        artwork={!src && mosaic && mosaic.length > 1 ? <Mosaic sources={mosaic} /> : undefined}
        status={status}
        wide={aspect === 'still'}
        square={aspect === 'square'}
        round={round}
        progress={progress === undefined ? null : progress / 100}
        progressBelow={progressBelow}
        width={width}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={longPressMs}
        onFocus={onFocus}
        onPlay={onPlay}
        preferred={preferred}
        label={accessibilityLabel}
      />
    )
  const ratio = aspect === 'poster' ? 2 / 3 : aspect === 'square' ? 1 : 16 / 9
  // only a pointer lifts the art; touch draws it still, without the lift's animated view
  const Frame = input === 'pointer' ? Lifted : Still
  const art = (lifted: boolean) => (
    <Frame
      on={lifted}
      style={{
        width: '100%',
        aspectRatio: ratio,
        borderRadius: round ? tokens.radius.pill : tokens.radius.poster * theme.u,
        overflow: 'hidden',
        backgroundColor: theme.colors.s2,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.04)',
      }}
    >
      {src || mosaic?.length === 1 ? (
        <Image
          source={src ?? mosaic?.[0]}
          style={{ position: 'absolute', inset: 0 }}
          contentFit="cover"
          transition={tokens.durations.color}
          accessibilityIgnoresInvertColors
        />
      ) : mosaic && mosaic.length > 1 ? (
        <Mosaic sources={mosaic} />
      ) : (
        <View
          style={{
            position: 'absolute',
            inset: 0,
            justifyContent: 'flex-end',
            padding: '9%',
            backgroundImage: `linear-gradient(160deg, ${theme.colors.s3}, ${theme.colors.s1})`,
          }}
        >
          {!showTitle && (
            <Text variant="callout" weight={600} color="text-2" numberOfLines={3}>
              {title}
            </Text>
          )}
        </View>
      )}
      {quality && quality.length > 0 && (
        <View
          style={{
            position: 'absolute',
            top: '7%',
            left: '7%',
            flexDirection: 'row',
            gap: tokens.space['1'],
          }}
        >
          {quality.map((q) => (
            <QualityTag key={q}>{q}</QualityTag>
          ))}
        </View>
      )}
      {status ? (
        <View
          style={{
            position: 'absolute',
            left: '7%',
            right: '7%',
            bottom: progress === undefined || progressBelow ? '7%' : '14%',
            flexDirection: 'row',
          }}
        >
          {status}
        </View>
      ) : null}
      {progress !== undefined && !progressBelow && (
        <View style={{ position: 'absolute', left: '7%', right: '7%', bottom: '7%' }}>
          <ProgressBar value={progress} />
        </View>
      )}
    </Frame>
  )
  const below =
    progress !== undefined && progressBelow ? (
      <View style={{ marginTop: 10 }}>
        <ProgressBar value={progress} />
      </View>
    ) : null
  const label = showTitle ? (
    <View
      style={{
        marginTop: tokens.space['2'],
        gap: tokens.space['0.5'],
        alignItems: round ? 'center' : undefined,
      }}
    >
      <Text
        variant="callout"
        weight={600}
        numberOfLines={2}
        align={round ? 'center' : undefined}
        {...(input === 'pointer' && titleSize === 'ui'
          ? { size: UI.size, style: { lineHeight: Math.round(UI.size * UI.leading) } }
          : null)}
      >
        {title}
      </Text>
      {caption ? (
        <Text variant="caption" color="text-3" align={round ? 'center' : undefined}>
          {caption}
        </Text>
      ) : null}
    </View>
  ) : null
  const name = accessibilityLabel ?? [title, caption].filter(Boolean).join(', ')
  const link = href && Platform.OS === 'web' ? ({ href } as object) : null
  if (!onPress && !link)
    return (
      // a label needs a role on the web (ARIA forbids naming a plain div, axe's aria-prohibited-attr);
      // `group` is React Native's role too (https://reactnative.dev/docs/view#role)
      <View
        ref={ref}
        style={{ width }}
        accessible
        role="group"
        accessibilityLabel={accessibilityLabel ?? title}
      >
        {art(false)}
        {below}
        {label}
      </View>
    )
  const target = (
    <Press
      ref={ref}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={longPressMs}
      accessibilityRole="link"
      {...link}
      accessibilityLabel={name}
      accessibilityActions={
        onLongPress && longPressLabel ? [{ name: 'longpress', label: longPressLabel }] : undefined
      }
      onAccessibilityAction={
        onLongPress && longPressLabel
          ? (e) => e.nativeEvent.actionName === 'longpress' && onLongPress()
          : undefined
      }
      style={{ width }}
    >
      {(s) => (
        <>
          {art(s.hovered || s.focused || (actions ? over : false))}
          {below}
          {label}
        </>
      )}
    </Press>
  )
  if (!actions || input !== 'pointer') return target
  const shown = over || within
  const events = {
    onPointerEnter: () => setOver(true),
    onPointerLeave: () => setOver(false),
    onFocus: () => setWithin(true),
    onBlur: () => setWithin(false),
  } as ViewProps
  return (
    <View {...events} style={{ width }}>
      {target}
      {/* the row lets presses through to the poster; only its actions take them, once shown */}
      <View
        pointerEvents={shown ? 'box-none' : 'none'}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          flexDirection: 'row',
          justifyContent: 'flex-end',
          gap: tokens.space['1'],
          padding: tokens.space['2'],
          opacity: shown ? 1 : 0,
        }}
      >
        {actions}
      </View>
    </View>
  )
}

/** Up to four posters two by two, a point apart (the prototype's grid-cols-2 gap-px). */
function Mosaic({ sources }: { sources: NonNullable<PosterMosaic> }) {
  const cell = (i: number) => (
    <Image
      source={sources[i % sources.length]}
      style={{ flex: 1 }}
      contentFit="cover"
      accessibilityIgnoresInvertColors
    />
  )
  return (
    <View style={[StyleSheet.absoluteFill, { gap: 1 }]}>
      {[0, 2].map((row) => (
        <View key={row} style={{ flex: 1, flexDirection: 'row', gap: 1 }}>
          {cell(row)}
          {cell(row + 1)}
        </View>
      ))}
    </View>
  )
}

type PosterMosaic = PosterProps['mosaic']

type FrameProps = { on: boolean; style: StyleProp<ViewStyle>; children: ReactNode }

/** The art's frame, grown while `on` (a pointer's over it, or the keyboard's on it). */
function Lifted({ on, style, children }: FrameProps) {
  const lift = useLift(on)
  return <Animated.View style={[style, lift]}>{children}</Animated.View>
}

/** The art's frame by touch, which never lifts it. */
function Still({ style, children }: FrameProps) {
  return <View style={style}>{children}</View>
}

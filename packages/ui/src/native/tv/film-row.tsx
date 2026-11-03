// SPDX-License-Identifier: AGPL-3.0-only
// A row of films on the TV (the prototype's film-row.tsx), after Netflix's TV rows: its first slot
// is fixed at the left, a widescreen card showing one film's backdrop and title, and posters of the
// films after it follow at the right. The card is the row's one focus stop. Right hands it the next
// film: every poster slides one place (Reanimated springs on `spring.base`), the first sliding
// under the card as its film crossfades in, and the film the card held comes out the other side as
// a poster; Left gives the previous one back the same way. Home's rows loop, past the last film
// coming the first again. Under the row, the card's film is described, no wider than the card and
// the safe inset, its synopsis at most two lines, so nothing moves as focus does.
//
// Left and Right reach the card through react-native-tvos's useTVEventHandler while it has focus,
// and a focus guide around it traps them (`trapFocusLeft` and `trapFocusRight`) while there's a
// film to move to, so the focus engine doesn't take them too
// (https://github.com/react-native-tvos/react-native-tvos#readme). Past the ends of a row that
// doesn't loop, they're left to the engine.
//
// The row knows nothing of servers, routes or sounds: the app hands it each film's artwork as
// sources, what opening and playing a film do, and what a move sounds like, so any app on the TV's
// rule can draw one.
import { Image } from 'expo-image'
import { type ReactNode, type Ref, useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { Text } from '../text.tsx'
import { tokens, useMotionReduced, useTheme } from '../theme.tsx'
import { FocusGuide, useRemote } from './engine'
import { Focusable, StopScope, type ViewHandle } from './focusable.tsx'
import { TRACK_SPRING } from './model.ts'
import { focusedPlay, type TileSource } from './tiles.tsx'

const tv = tokens.tv

/** The posters' width; the card is as tall as they are, at 16:9. */
const POSTER = tv.poster.width
const HEIGHT = POSTER * 1.5
const WIDE = (HEIGHT * 16) / 9

/** The slots kept around the card's: enough after it to run off the screen, and two before it. */
const AHEAD = 9
const BEHIND = 2
const mod = (a: number, n: number) => ((a % n) + n) % n

/** What a row needs of a film. */
export type RowFilm = { id: string | number; title: string; synopsis: string }

/**
 * Where a slot's poster sits from the card's left edge, in points: the slots before the card's to
 * its left, off the screen, and the ones after it to its right. The card's own slot waits hidden
 * one place from where it came in, under the card's edge, so every poster moves one place a press.
 */
function placeOf(u: number) {
  const step = (POSTER + tv.poster.gap) * u
  const after = (WIDE + tv.poster.gap) * u
  return {
    place: (v: number, pos: number, dir: number) =>
      v < pos
        ? (v - pos) * step
        : v > pos
          ? after + (v - pos - 1) * step
          : dir < 0
            ? 0
            : after - step,
    /** Where the card's film starts from as it comes out: one place short of its slot. */
    exit: (dir: number) => (dir > 0 ? 0 : after - step),
  }
}

export function TvFilmRow<T extends RowFilm>({
  title,
  suffix,
  items,
  art,
  meta,
  noteOf,
  onOpen,
  onPlay,
  loop = false,
  onMove,
  preferred,
  onFocus,
  ref,
}: {
  title: string
  suffix?: string | null
  items: T[]
  /** The film's poster and backdrop as sources the images can load (a server's need its token). */
  art: (item: T) => { poster: TileSource | undefined; backdrop: TileSource | undefined }
  /** The line beside the film's title: its year, length and genre. */
  meta: (item: T) => string
  /** A line about the film for this row, under its title: a person's role in it. */
  noteOf?: (item: T) => string
  onOpen: (item: T) => void
  /** What Play/Pause does on the card: plays its film. */
  onPlay?: (item: T) => void
  /** Past the last film comes the first again, either way. */
  loop?: boolean
  /** A move from one film to the next: the app's navigate sound. */
  onMove?: () => void
  preferred?: boolean
  onFocus?: () => void
  ref?: Ref<ViewHandle>
}) {
  const theme = useTheme()
  const u = theme.u
  const reduced = useMotionReduced()
  const [{ pos, dir }, setPos] = useState({ pos: 0, dir: 1 })
  const [focused, setFocused] = useState(false)
  const n = items.length
  const loops = loop && n > 1
  const at = loops ? mod(pos, n) : Math.min(pos, Math.max(0, n - 1))
  const can = (by: number) => loops || (at + by >= 0 && at + by < n)
  const onEvent = useCallback(
    (e: { eventType: string }) => {
      if (!focused) return
      const by = e.eventType === 'right' ? 1 : e.eventType === 'left' ? -1 : 0
      if (!by || !(loops || (pos + by >= 0 && pos + by < n))) return
      setPos({ pos: pos + by, dir: by })
      onMove?.()
    },
    [focused, loops, pos, n, onMove],
  )
  useRemote(onEvent)
  const item = items[at]
  // Play/Pause plays the card's film, whichever it holds now (tiles.tsx's focusedPlay)
  const playing = useRef(() => {})
  playing.current = () => {
    if (item && onPlay) onPlay(item)
  }
  const mine = useRef(() => playing.current())
  useEffect(() => {
    const own = mine.current
    return () => {
      if (focusedPlay.current === own) focusedPlay.current = null
    }
  }, [])
  if (!item) return null
  const { place, exit } = placeOf(u)
  const slots: number[] = []
  for (let v = pos - BEHIND; v <= pos + AHEAD; v++) if (loops || (v >= 0 && v < n)) slots.push(v)
  const radius = tv.radius.poster * u
  const inset = tv.safe.x * u
  const line = meta(item)
  const backdrop = art(item).backdrop
  const note = noteOf?.(item)
  return (
    <View accessibilityLabel={title} style={{ gap: 0.8 * u }}>
      <Text variant="rowTitle" style={{ paddingHorizontal: inset }} accessibilityRole="header">
        {title}
        {suffix ? (
          <Text variant="rowTitle" weight={400} color="text-2">
            {` ${suffix}`}
          </Text>
        ) : null}
      </Text>
      <View style={{ paddingVertical: 1 * u, paddingLeft: inset }}>
        <View style={{ height: HEIGHT * u }}>
          {/* every film as a poster on one strip behind the card */}
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0 }}
          >
            {slots.map((v) => {
              const m = items[mod(v, n)] as T
              const poster = art(m).poster
              return (
                <Slot
                  key={v}
                  x={place(v, pos, dir)}
                  from={exit(dir)}
                  hidden={v === pos}
                  reduced={reduced}
                >
                  <View
                    style={{
                      width: POSTER * u,
                      aspectRatio: 2 / 3,
                      borderRadius: radius,
                      overflow: 'hidden',
                      backgroundColor: theme.colors.s2,
                    }}
                  >
                    {poster ? (
                      <Image
                        source={poster}
                        style={{ flex: 1 }}
                        contentFit="cover"
                        accessibilityIgnoresInvertColors
                      />
                    ) : (
                      <View style={{ flex: 1, justifyContent: 'flex-end', padding: '9%' }}>
                        <Text variant="meta" weight={600} color="text-2" numberOfLines={3}>
                          {m.title}
                        </Text>
                      </View>
                    )}
                  </View>
                </Slot>
              )
            })}
          </View>
          <FocusGuide
            trapFocusLeft={focused && can(-1)}
            trapFocusRight={focused && can(1)}
            style={{ width: WIDE * u, height: HEIGHT * u }}
          >
            <StopScope.Provider value={`${title}/`}>
              <Focusable
                ref={ref}
                role="link"
                label={[item.title, note, line].filter(Boolean).join(', ')}
                lift={1.04}
                radius={radius}
                preferred={preferred}
                onFocus={() => {
                  setFocused(true)
                  if (onPlay) focusedPlay.current = mine.current
                  onFocus?.()
                }}
                onBlur={() => {
                  setFocused(false)
                  if (focusedPlay.current === mine.current) focusedPlay.current = null
                }}
                onPress={() => onOpen(item)}
              >
                <View
                  style={{
                    width: WIDE * u,
                    height: HEIGHT * u,
                    borderRadius: radius,
                    overflow: 'hidden',
                    backgroundColor: theme.colors.s2,
                  }}
                >
                  <Animated.View
                    key={item.id}
                    entering={reduced ? undefined : FadeIn.springify().stiffness(300).damping(30)}
                    exiting={reduced ? undefined : FadeOut.duration(tokens.durations.fadeOut)}
                    style={StyleSheet.absoluteFill}
                  >
                    {backdrop ? (
                      <Image
                        source={backdrop}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        accessibilityIgnoresInvertColors
                      />
                    ) : null}
                    <View
                      style={[
                        StyleSheet.absoluteFill,
                        {
                          experimental_backgroundImage:
                            'linear-gradient(20deg, rgba(0,0,0,0.65), transparent 55%)',
                        },
                      ]}
                    />
                    {/* the title, where the prototype has its logo: no server has logos yet */}
                    <View
                      style={{
                        position: 'absolute',
                        left: 1.2 * u,
                        right: 1.2 * u,
                        bottom: 1.1 * u,
                      }}
                    >
                      <Text
                        size={1.6}
                        weight={600}
                        numberOfLines={2}
                        style={{ lineHeight: 1.7 * u }}
                      >
                        {item.title}
                      </Text>
                    </View>
                  </Animated.View>
                </View>
              </Focusable>
            </StopScope.Provider>
          </FocusGuide>
        </View>
      </View>
      {/* the card's film, described under the row, as wide as the card */}
      <View
        style={{
          width: WIDE * u + inset,
          maxWidth: '100%',
          gap: 0.5 * u,
          paddingLeft: inset,
          paddingTop: 0.4 * u,
          paddingBottom: 1.2 * u,
        }}
      >
        <Text variant="meta" weight={600} numberOfLines={1}>
          {item.title}
          {line ? (
            <Text variant="meta" weight={400} color="text-2">
              {`   ${line}`}
            </Text>
          ) : null}
        </Text>
        {note ? (
          <Text variant="meta" numberOfLines={1}>
            {note}
          </Text>
        ) : null}
        <Text variant="synopsis" color="text-2" numberOfLines={2}>
          {item.synopsis}
        </Text>
      </View>
    </View>
  )
}

/**
 * One place on the strip. A slot keeps its view as it slides, so its poster moves rather than
 * jumps; the card's own slot is hidden, and when it comes out it starts from `from`, one place short
 * of where it goes.
 */
function Slot({
  x,
  from,
  hidden,
  reduced,
  children,
}: {
  x: number
  from: number
  hidden: boolean
  reduced: boolean
  children: ReactNode
}) {
  const tx = useSharedValue(x)
  const opacity = useSharedValue(hidden ? 0 : 1)
  const was = useRef(hidden)
  useEffect(() => {
    if (reduced) {
      tx.value = x
      opacity.value = hidden ? 0 : 1
    } else {
      if (was.current && !hidden) tx.value = from
      tx.value = withSpring(x, TRACK_SPRING)
      opacity.value = hidden
        ? withTiming(0, { duration: tokens.durations.fadeOut })
        : withSpring(1, tokens.springs.quick)
    }
    was.current = hidden
  }, [x, from, hidden, reduced, tx, opacity])
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: tx.value }],
  }))
  return (
    <Animated.View style={[{ position: 'absolute', top: 0, left: 0 }, style]}>
      {children}
    </Animated.View>
  )
}

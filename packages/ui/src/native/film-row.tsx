// SPDX-License-Identifier: AGPL-3.0-only
// A row of films (the prototypes' tv/film-row.tsx and web/film-row.tsx), one part with a form per
// form factor:
// - the TV and a pointer, after Netflix's rows: the first slot is fixed at the left, a widescreen
//   card showing one film's backdrop and title, and posters of the films after it follow at the
//   right. The card opens its film. Its film changes with every poster moving one place
//   (Reanimated springs), the first sliding under the card as its film crossfades in and the
//   film the card held coming out the other side as a poster: with Left and Right while the card
//   has focus, and with a pointer also by the arrows at the row's edges while it's over the row,
//   or by clicking a poster, which brings that film into the card. Home's rows loop, past the
//   last film coming the first again. Under the row, the card's film is described, no wider than
//   the card, its synopsis at most two lines, so nothing moves as its film changes;
// - touch, which the phone's prototype draws as its rows of posters (mobile/home.tsx): a Row of
//   Posters with their titles and each film's year under it, as every app's card has it
//   (createFilmsText().card in @highsea-tv/client/films). Touch has no card, so it leaves out
//   `meta`, `quality`, `noteOf`, `onPlay`, `loop`, `onMove`, `preferred`, `onFocus` and `ref`.
//
// On the TV, Left and Right reach the card through react-native-tvos's useTVEventHandler while it
// has focus, and a focus guide around it traps them (`trapFocusLeft` and `trapFocusRight`) while
// there's a film to move to, so the focus engine doesn't take them too
// (https://github.com/react-native-tvos/react-native-tvos#readme). Past the ends of a row that
// doesn't loop, they're left to the engine. With a pointer the card's element takes them as keys
// (react-native-web's Pressable forwards onKeyDown).
//
// With a pointer, the posters' width is fitted so that the card and a whole number of posters
// fill the page's width (the owner, 2026-10-30), and the row reaches past the gutter on both
// sides by a poster and its gap, or to the window's edge where that's nearer, the films there
// fading out under a mask (CSS's mask-image, which react-native-web passes through as a style;
// only the web has a pointer, ./input.ts).
//
// The row knows nothing of servers, routes or sounds: the app hands it each film's artwork as
// sources, what opening and playing a film do, and what a move sounds like, so any app draws one.
import { web } from '@highsea-tv/tokens'
import { Image } from 'expo-image'
import { type ReactNode, type Ref, useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  type WithSpringConfig,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { QualityTag } from './badge.tsx'
import { focusVisible } from './dom'
import { brighten, HOVER_BRIGHTNESS, useLift } from './lift.ts'
import { Poster } from './poster.tsx'
import { Press } from './press.tsx'
import { pointerItemWidth, Row, RowSkeleton, usePageGutter, usePosterWidth } from './row.tsx'
import { RowArrow } from './row-arrow.tsx'
import { SectionHeading } from './section-heading.tsx'
import { Skeleton, SkeletonText } from './skeleton.tsx'
import { Text, textStyle } from './text.tsx'
import { tokens, useMotionReduced, useTheme } from './theme.tsx'
import { FocusGuide, useRemote } from './tv/engine'
import { Focusable, StopScope, type ViewHandle } from './tv/focusable.tsx'
import { TRACK_SPRING } from './tv/model.ts'
import { focusedPlay, type TileSource } from './tv/tiles.tsx'

const tv = tokens.tv

/** The card's width in posters: as tall as one, at 16:9. */
const WIDE = (1.5 * 16) / 9

/** The slots kept around the card's: enough after it to run off the screen, and two before it. */
const AHEAD = { tv: 9, pointer: 13 }
const BEHIND = 2
const mod = (a: number, n: number) => ((a % n) + n) % n

/** A pointer's posters' gap, the prototype's 0.75rem. */
const POINTER_GAP = tokens.space['3']
/** The page's width, beyond which the row stops reaching for the window's edge (web.maxWidth). */
const PAGE_WIDTH = web.maxWidth
/** The fade across each inset, eased so it has no edge: an ease-in-out curve at five stops. */
const EASE = [0, 0.06, 0.25, 0.6, 0.88, 1]

/** A key's press as the web reports it, with its modifiers. */
type Keys = {
  key: string
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

/** What a row needs of a film. The year is touch's caption under each poster. */
export type RowFilm = {
  id: string | number
  title: string
  synopsis: string
  year?: number | null
}

export type FilmRowProps<T extends RowFilm> = {
  title: string
  suffix?: string | null
  items: readonly T[]
  /** The film's poster and backdrop as sources the images can load (a server's need its token). */
  art: (item: T) => { poster: TileSource | undefined; backdrop: TileSource | undefined }
  /** The line beside the card's film's title: its year, length and genre. Not by touch. */
  meta: (item: T) => string
  /** The film's quality tags, after its line (4K, HDR). */
  quality?: (item: T) => readonly string[]
  /** A line about the film for this row, under its title: a person's role in it. */
  noteOf?: (item: T) => string
  onOpen: (item: T) => void
  /** What Play/Pause does on the TV's card: plays its film. */
  onPlay?: (item: T) => void
  /** Past the last film comes the first again, either way. */
  loop?: boolean
  /** A move from one film to the next: the app's navigate sound. */
  onMove?: () => void
  /** The TV: the card takes focus when the screen appears. */
  preferred?: boolean
  /** The TV: the card took focus. */
  onFocus?: () => void
  ref?: Ref<ViewHandle>
}

export function FilmRow<T extends RowFilm>(props: FilmRowProps<T>) {
  const input = useTheme().formFactor.input
  if (input === 'tv') return <TvForm {...props} />
  if (input === 'pointer') return <PointerForm {...props} />
  return <TouchForm {...props} />
}

/** The card's place in the row and the moves from it, the same at every form factor. */
function useCard(n: number, loop: boolean, onMove?: () => void) {
  const [{ pos, dir, by: step }, setPos] = useState({ pos: 0, dir: 1, by: 1 })
  const loops = loop && n > 1
  const at = loops ? mod(pos, n) : Math.min(pos, Math.max(0, n - 1))
  const can = (by: number) => !!by && (loops || (pos + by >= 0 && pos + by < n))
  const move = (by: number) => {
    if (!can(by)) return
    // from the place it's at now, so two presses before a render move it two places
    setPos((was) =>
      loops || (was.pos + by >= 0 && was.pos + by < n)
        ? { pos: was.pos + by, dir: Math.sign(by), by: Math.abs(by) }
        : was,
    )
    onMove?.()
  }
  const slots = (ahead: number) => {
    const out: number[] = []
    for (let v = pos - BEHIND; v <= pos + ahead; v++) if (loops || (v >= 0 && v < n)) out.push(v)
    return out
  }
  // only a move of one place brings the card's film out from under its edge (placeOf's exit); a
  // click further along slides it from where it waited
  const one = step === 1
  return { pos, dir, one, at, can, move, slots }
}

/**
 * Where a slot's poster sits from the card's left edge, in points: the slots before the card's to
 * its left, and the ones after it to its right. The card's own slot waits hidden one place from
 * where it came in, under the card's edge, so every poster moves one place a press.
 */
function placeOf(poster: number, gap: number) {
  const step = poster + gap
  const after = poster * WIDE + gap
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

/**
 * A pointer's strip at this window: the posters' width, so the card and a whole number of them
 * fill the page inside its gutters once the row is measured, the card's, the inset the arrows and
 * the fade take, and the fade's mask.
 */
function pointerStrip(windowWidth: number, measured: number | null, gutter: number) {
  const gap = POINTER_GAP
  // a pointer's poster, near 10.5% of the window between 6.5rem and 12rem (the prototype's clamp)
  const target = pointerItemWidth(windowWidth)
  const room = (measured ?? windowWidth) - 2 * gutter
  const count = Math.max(1, Math.round((room - WIDE * target) / (target + gap)))
  const poster = measured ? (room - count * gap) / (WIDE + count) : target
  const inset = Math.min(poster + gap, Math.max(0, (windowWidth - PAGE_WIDTH) / 2) + gutter)
  const ramp = (side: 'start' | 'end') =>
    EASE.map((a, i) => {
      const x = ((inset - gap) * i) / (EASE.length - 1)
      return side === 'start'
        ? `rgba(0,0,0,${a}) ${x}px`
        : `rgba(0,0,0,${1 - a}) calc(100% - ${inset - gap - x}px)`
    }).join(', ')
  // react-native-web writes a style it doesn't know as CSS (createReactDOMStyle)
  const fade = {
    maskImage: `linear-gradient(90deg, ${ramp('start')}, ${ramp('end')})`,
  } as ViewStyle
  return { gap, poster, height: poster * 1.5, wide: poster * WIDE, inset, fade }
}

function TouchForm<T extends RowFilm>({ title, suffix, items, art, onOpen }: FilmRowProps<T>) {
  const width = usePosterWidth()
  return (
    <Row
      title={title}
      suffix={suffix}
      items={items}
      keyOf={(item) => item.id}
      itemWidth={width}
      render={(item) => (
        <Poster
          title={item.title}
          src={art(item).poster}
          showTitle
          caption={item.year ? String(item.year) : undefined}
          width={width}
          onPress={() => onOpen(item)}
        />
      )}
    />
  )
}

function TvForm<T extends RowFilm>({
  title,
  suffix,
  items,
  art,
  meta,
  quality,
  noteOf,
  onOpen,
  onPlay,
  loop = false,
  onMove,
  preferred,
  onFocus,
  ref,
}: FilmRowProps<T>) {
  const theme = useTheme()
  const u = theme.u
  const reduced = useMotionReduced()
  const [focused, setFocused] = useState(false)
  const n = items.length
  const card = useCard(n, loop, onMove)
  const { pos, can } = card
  const move = useRef(card.move)
  move.current = card.move
  const onEvent = useCallback(
    (e: { eventType: string }) => {
      if (!focused) return
      move.current(e.eventType === 'right' ? 1 : e.eventType === 'left' ? -1 : 0)
    },
    [focused],
  )
  useRemote(onEvent)
  const item = items[card.at]
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
  const poster = tv.poster.width * u
  const height = poster * 1.5
  const wide = poster * WIDE
  const { place, exit } = placeOf(poster, tv.poster.gap * u)
  const radius = tv.radius.poster * u
  const inset = tv.safe.x * u
  const line = meta(item)
  const note = noteOf?.(item)
  return (
    // a group named by its title, as Row's (an accessible view would hide the card inside it)
    <View role="group" accessibilityLabel={title} style={{ gap: 0.8 * u }}>
      <SectionHeading title={title} suffix={suffix} inset={inset} />
      <View style={{ paddingVertical: 1 * u, paddingLeft: inset }}>
        <View style={{ height }}>
          <View
            pointerEvents="none"
            // the web's TV ignores the two props after it (react-native-web), as RowArrow's
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0 }}
          >
            {card.slots(AHEAD.tv).map((v) => {
              const m = items[mod(v, n)] as T
              return (
                <Slot
                  key={v}
                  x={place(v, pos, card.dir)}
                  from={card.one ? exit(card.dir) : undefined}
                  hidden={v === pos}
                  reduced={reduced}
                  spring={TRACK_SPRING}
                >
                  <StripArt title={m.title} src={art(m).poster} width={poster} radius={radius} />
                </Slot>
              )
            })}
          </View>
          <FocusGuide
            trapFocusLeft={focused && can(-1)}
            trapFocusRight={focused && can(1)}
            style={{ width: wide, height }}
          >
            <StopScope.Provider value={`${title}/`}>
              <Focusable
                ref={ref}
                role="link"
                label={[item.title, note, line].filter(Boolean).join(', ')}
                lift="card"
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
                <Card item={item} art={art} width={wide} height={height} radius={radius} />
              </Focusable>
            </StopScope.Provider>
          </FocusGuide>
        </View>
      </View>
      <View style={{ paddingLeft: inset, paddingTop: 0.4 * u, paddingBottom: 1.2 * u }}>
        <Described item={item} line={line} note={note} tags={quality?.(item)} width={wide} />
      </View>
    </View>
  )
}

function PointerForm<T extends RowFilm>({
  title,
  suffix,
  items,
  art,
  meta,
  quality,
  noteOf,
  onOpen,
  loop = false,
  onMove,
}: FilmRowProps<T>) {
  const reduced = useMotionReduced()
  const gutter = usePageGutter()
  const window = useWindowDimensions()
  const [measured, setMeasured] = useState<number | null>(null)
  const [over, setOver] = useState(false)
  const [focused, setFocused] = useState(false)
  const n = items.length
  const card = useCard(n, loop, onMove)
  const { pos, can, move } = card
  const item = items[card.at]
  if (!item) return null
  const { gap, poster, height, wide, inset, fade } = pointerStrip(window.width, measured, gutter)
  const { place, exit } = placeOf(poster, gap)
  const radius = tokens.radius.poster
  const line = meta(item)
  const note = noteOf?.(item)
  const shown = over || focused
  return (
    <View
      role="group"
      accessibilityLabel={title}
      onLayout={(e) => setMeasured(e.nativeEvent.layout.width)}
      onPointerEnter={(e) => e.nativeEvent.pointerType !== 'touch' && setOver(true)}
      onPointerLeave={() => setOver(false)}
      style={{ gap: POINTER_GAP }}
    >
      <SectionHeading title={title} suffix={suffix} inset={gutter} />
      <View style={{ marginHorizontal: gutter - inset }}>
        <RowArrow dir={-1} width={inset} disc shown={shown && can(-1)} onPress={() => move(-1)} />
        <RowArrow dir={1} width={inset} disc shown={shown && can(1)} onPress={() => move(1)} />
        {/* the padding keeps the card's lift and focus ring inside the mask */}
        <View
          style={[
            fade,
            { overflow: 'hidden', paddingHorizontal: inset, paddingVertical: tokens.space['2'] },
          ]}
        >
          <View style={{ height }}>
            <Press
              accessibilityRole="link"
              accessibilityLabel={[item.title, note, line].filter(Boolean).join(', ')}
              onPress={() => onOpen(item)}
              // the arrows show for the keyboard's focus, not a click's (`:focus-visible`, ./dom)
              onFocus={(e) => setFocused(focusVisible(e.nativeEvent.target ?? e.target))}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                const k = e.nativeEvent as unknown as Keys
                if (k.altKey || k.ctrlKey || k.metaKey || k.shiftKey) return
                const by = k.key === 'ArrowRight' ? 1 : k.key === 'ArrowLeft' ? -1 : 0
                if (!can(by)) return
                e.preventDefault()
                move(by)
              }}
              style={{ zIndex: 10, width: wide, height, borderRadius: radius }}
            >
              {(s) => (
                // under the pointer, or with the keyboard's focus (Press's `focused` is the
                // focus-visible one)
                <Lifted on={s.hovered || s.focused}>
                  <Card item={item} art={art} width={wide} height={height} radius={radius} />
                </Lifted>
              )}
            </Press>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              aria-hidden
              style={{ position: 'absolute', top: 0, bottom: 0, left: 0 }}
            >
              {card.slots(AHEAD.pointer).map((v) => {
                const m = items[mod(v, n)] as T
                return (
                  <Slot
                    key={v}
                    x={place(v, pos, card.dir)}
                    from={card.one ? exit(card.dir) : undefined}
                    hidden={v === pos}
                    reduced={reduced}
                    spring={tokens.springs.quick}
                  >
                    <Press
                      ring={false}
                      focusable={false}
                      onPress={() => move(v - pos)}
                      style={(s) => ({
                        width: poster,
                        borderRadius: radius,
                        // the prototype's hover:brightness-110 (RN's filter, which the web writes as CSS)
                        filter: s.hovered ? brighten(HOVER_BRIGHTNESS.strong) : undefined,
                      })}
                    >
                      {(s) => (
                        <Lifted on={s.hovered}>
                          <Poster title={m.title} src={art(m).poster} width={poster} />
                        </Lifted>
                      )}
                    </Press>
                  </Slot>
                )
              })}
            </View>
          </View>
        </View>
      </View>
      <View style={{ paddingHorizontal: gutter }}>
        <Described item={item} line={line} note={note} tags={quality?.(item)} width={wide} />
      </View>
    </View>
  )
}

/** The card: its film's backdrop crossfading in as the film changes, and its title over a fade. */
function Card<T extends RowFilm>({
  item,
  art,
  width,
  height,
  radius,
}: {
  item: T
  art: FilmRowProps<T>['art']
  width: number
  height: number
  radius: number
}) {
  const theme = useTheme()
  const u = theme.u
  const reduced = useMotionReduced()
  const isTv = theme.formFactor.input === 'tv'
  const backdrop = art(item).backdrop
  // the web's title at the display type's leading and tracking (the prototype's leading-[1.05]
  // tracking-display)
  const title = textStyle(theme, 'title')
  const display = tokens.text.web.display
  // the title where the prototypes have its logo, which no server has yet: the TV's at its 1.6,
  // the web's in the title type, inset as the prototype's inset-x-4 bottom-3.5
  const words = isTv
    ? { left: 1.2 * u, right: 1.2 * u, bottom: 1.1 * u }
    : {
        left: tokens.space['4'],
        right: tokens.space['4'],
        bottom: tokens.space['3'] + tokens.space['0.5'],
      }
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius,
        overflow: 'hidden',
        backgroundColor: theme.colors.s2,
      }}
    >
      <Animated.View
        key={item.id}
        entering={
          reduced
            ? undefined
            : FadeIn.springify()
                .stiffness(tokens.springs.quick.stiffness)
                .damping(tokens.springs.quick.damping)
                .mass(tokens.springs.quick.mass)
        }
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
              backgroundImage: 'linear-gradient(20deg, rgba(0,0,0,0.65), transparent 55%)',
            },
          ]}
        />
        <View style={{ position: 'absolute', ...words }}>
          {isTv ? (
            <Text size={1.6} weight={600} numberOfLines={2} style={{ lineHeight: 1.7 * u }}>
              {item.title}
            </Text>
          ) : (
            <Text
              variant="title"
              weight={600}
              numberOfLines={2}
              style={{
                lineHeight: Math.round(display.leading * title.fontSize),
                letterSpacing: display.tracking * title.fontSize,
              }}
            >
              {item.title}
            </Text>
          )}
        </View>
      </Animated.View>
    </View>
  )
}

/** The card's film under the row, as wide as the card: its title and line, a note, the synopsis. */
function Described({
  item,
  line,
  note,
  tags,
  width,
}: {
  item: RowFilm
  line: string
  note?: string
  tags?: readonly string[]
  width: number
}) {
  const theme = useTheme()
  const isTv = theme.formFactor.input === 'tv'
  const small = isTv ? 'meta' : 'body'
  const space = isTv ? 0.5 * theme.u : tokens.space['1'] + tokens.space['0.5']
  const quality = tags?.map((q) => <QualityTag key={q}>{q}</QualityTag>)
  // the TV's title and line are one text on one line, as the TV's prototype has them, so nothing
  // under it moves; its quality tags, when the app gives them, follow 1u after
  const named = (
    <Text variant="meta" weight={600} numberOfLines={1} style={{ flexShrink: 1 }}>
      {item.title}
      {line ? (
        <Text variant="meta" weight={400} color="text-2">
          {`   ${line}`}
        </Text>
      ) : null}
    </Text>
  )
  return (
    <View style={{ width, maxWidth: '100%', gap: space }}>
      {isTv ? (
        quality?.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 * theme.u }}>
            {named}
            {quality}
          </View>
        ) : (
          named
        )
      ) : (
        // the web's wraps, as the prototype's (gap-x-3 gap-y-1)
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: tokens.space['3'],
            rowGap: tokens.space['1'],
          }}
        >
          <Text variant="body" weight={600}>
            {item.title}
          </Text>
          {line ? (
            <Text variant="body" color="text-2">
              {line}
            </Text>
          ) : null}
          {quality}
        </View>
      )}
      {note ? (
        <Text variant={small} numberOfLines={1}>
          {note}
        </Text>
      ) : null}
      <Text variant={isTv ? 'synopsis' : 'body'} color="text-2" numberOfLines={2}>
        {item.synopsis}
      </Text>
    </View>
  )
}

/**
 * A poster on the TV's strip, behind the card: its art, or its title on the surface. Not Poster,
 * whose TV form is a focus stop of its own, and the strip has none.
 */
function StripArt({
  title,
  src,
  width,
  radius,
}: {
  title: string
  src: TileSource | undefined
  width: number
  radius: number
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        width,
        aspectRatio: 2 / 3,
        borderRadius: radius,
        overflow: 'hidden',
        backgroundColor: theme.colors.s2,
      }}
    >
      {src ? (
        <Image
          source={src}
          style={{ flex: 1 }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={{ flex: 1, justifyContent: 'flex-end', padding: '9%' }}>
          <Text variant="meta" weight={600} color="text-2" numberOfLines={3}>
            {title}
          </Text>
        </View>
      )}
    </View>
  )
}

/** A pointer's lift on the card or a strip's poster while it's over it or focused (./lift.ts). */
function Lifted({ on, children }: { on: boolean; children: ReactNode }) {
  const lift = useLift(on)
  return <Animated.View style={lift}>{children}</Animated.View>
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
  spring,
  children,
}: {
  x: number
  /** Where it comes out from; none slides it from where it waited. */
  from?: number
  hidden: boolean
  reduced: boolean
  spring: WithSpringConfig
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
      if (was.current && !hidden && from !== undefined) tx.value = from
      tx.value = withSpring(x, spring)
      opacity.value = hidden
        ? withTiming(0, { duration: tokens.durations.fadeOut })
        : withSpring(1, tokens.springs.quick)
    }
    was.current = hidden
  }, [x, from, hidden, reduced, spring, tx, opacity])
  const style = useAnimatedStyle(
    () => ({
      opacity: opacity.value,
      transform: [{ translateX: tx.value }],
    }),
    [opacity, tx],
  )
  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'auto'}
      style={[{ position: 'absolute', top: 0, left: 0 }, style]}
    >
      {children}
    </Animated.View>
  )
}

/**
 * A FilmRow while Home loads, laid out as the row will be (the prototypes' row skeletons): its
 * title's line, then by touch three posters at the row's width (mobile/home.tsx's
 * MobileRowSkeleton); with a pointer the card and the posters after it at the sizes the row will
 * have, a poster showing past each end, and the description's lines (web/film-row.tsx's
 * WebFilmRowSkeleton); on the TV the card, the posters ahead of it and the description's three
 * lines (tv/film-row.tsx's TvFilmRowSkeleton). Hidden from assistive tech.
 */
export function FilmRowSkeleton() {
  const input = useTheme().formFactor.input
  if (input === 'tv') return <TvRowSkeleton />
  if (input === 'pointer') return <PointerRowSkeleton />
  // by touch the row is a Row of posters, so its skeleton is Row's
  return <RowSkeleton />
}

/** The title's line with a pointer: the prototype's h-6 w-48. */
const SKELETON_TITLE = {
  pointer: { height: tokens.space['6'], width: tokens.space['16'] * 3 },
}
/** The TV's, in units (h-[1.2cqw] w-[12cqw], py-[0.2cqw]), and its description's lines. */
const TV_SKELETON = {
  title: 1.2,
  titleWidth: 12,
  describedTop: 0.6,
  describedBottom: 1.4,
  lineGap: 0.7,
}

function PointerRowSkeleton() {
  const gutter = usePageGutter()
  const window = useWindowDimensions()
  const [measured, setMeasured] = useState<number | null>(null)
  const { gap, poster, height, wide, inset, fade } = pointerStrip(window.width, measured, gutter)
  const { place } = placeOf(poster, gap)
  const radius = tokens.radius.poster
  const t = SKELETON_TITLE.pointer
  return (
    <View
      aria-hidden
      onLayout={(e) => setMeasured(e.nativeEvent.layout.width)}
      style={{ gap: POINTER_GAP }}
    >
      <View style={{ paddingHorizontal: gutter }}>
        <Skeleton height={t.height} width={t.width} />
      </View>
      <View style={{ marginHorizontal: gutter - inset }}>
        <View
          style={[
            fade,
            { overflow: 'hidden', paddingHorizontal: inset, paddingVertical: tokens.space['2'] },
          ]}
        >
          <View style={{ height }}>
            <Skeleton width={wide} height={height} radius={radius} />
            {Array.from({ length: AHEAD.pointer + BEHIND }, (_, i) => i - BEHIND).map((v) =>
              v === 0 ? null : (
                <View
                  key={v}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: poster,
                    transform: [{ translateX: place(v, 0, 1) }],
                  }}
                >
                  <Skeleton height={height} radius={radius} />
                </View>
              ),
            )}
          </View>
        </View>
      </View>
      <View style={{ paddingHorizontal: gutter }}>
        <View
          style={{
            width: wide,
            maxWidth: '100%',
            gap: tokens.space['2'] + tokens.space['0.5'],
            paddingTop: tokens.space['1'],
          }}
        >
          <Skeleton height={tokens.space['4']} width="66%" />
          <SkeletonText lines={2} />
        </View>
      </View>
    </View>
  )
}

function TvRowSkeleton() {
  const u = useTheme().u
  const poster = tv.poster.width * u
  const height = poster * 1.5
  const wide = poster * WIDE
  const { place } = placeOf(poster, tv.poster.gap * u)
  const radius = tv.radius.poster * u
  const inset = tv.safe.x * u
  const s = TV_SKELETON
  return (
    <View aria-hidden style={{ gap: 0.8 * u }}>
      <View style={{ paddingHorizontal: inset, paddingVertical: 0.2 * u }}>
        <Skeleton height={s.title} width={s.titleWidth * u} />
      </View>
      <View style={{ paddingVertical: 1 * u, paddingLeft: inset }}>
        <View style={{ height }}>
          <Skeleton width={wide} height={height / u} radius={radius} />
          {Array.from({ length: AHEAD.tv }, (_, i) => i + 1).map((v) => (
            <View
              key={v}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: poster,
                transform: [{ translateX: place(v, 0, 1) }],
              }}
            >
              <Skeleton height={height / u} radius={radius} />
            </View>
          ))}
        </View>
      </View>
      <View
        style={{
          width: wide + inset,
          maxWidth: '100%',
          gap: s.lineGap * u,
          paddingLeft: inset,
          paddingTop: s.describedTop * u,
          paddingBottom: s.describedBottom * u,
        }}
      >
        <Skeleton height={1.05} width="66%" />
        <Skeleton height={1} />
        <Skeleton height={1} width="60%" />
      </View>
    </View>
  )
}

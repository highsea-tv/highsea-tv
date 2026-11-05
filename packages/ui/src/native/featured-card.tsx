// SPDX-License-Identifier: AGPL-3.0-only
// Home's featured title, one part with a form per form factor (client-home.md):
// - touch: the phone prototype's carousel card (mobile/home.tsx Featured), the poster at 4:5
//   under a fade from the bottom in `bg`, the kicker ("New · 2010 · Fantasy") in the eyebrow's
//   type over the title; a Row with `itemGap` lays the cards out 78% of the row wide, the next
//   peeking;
// - a pointer: the web prototype's card (web/home.tsx FeaturedCard), the backdrop under fades from
//   the left and the bottom, the title, its line, the tagline in two lines and the actions the app
//   passes (Play or Resume, and More info) in a column no wider than 38rem; a press anywhere on the
//   card does `onPress`, as More info does for the keyboard and screen readers. A Pager, when the
//   app passes one, stands at the card's bottom end from a medium window up;
// - the TV: one large card across the page that's a focus stop, lifting only slightly (at this size
//   a poster's lift would push it off the screen), the title, the line and the tagline low on the
//   left (tv/home.tsx).
// The pointer's and the TV's fades are the prototypes' black, the phone's the page's `bg`, as each
// prototype draws them. React Native draws CSS gradients itself
// (https://reactnative.dev/docs/view-style-props#backgroundimage).
// Bloom is the glow behind the card with a pointer and on the TV, in the art's colour
// (client/bloom.tsx).
import { breakpoints, web } from '@highsea-tv/tokens'
import { Image } from 'expo-image'
import { type ReactNode, type Ref, useEffect } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { alpha } from './alpha.ts'
import { QualityTag } from './badge.tsx'
import { Button } from './button.tsx'
import { Press } from './press.tsx'
import { usePageGutter, usePosterWidth } from './row.tsx'
import { Skeleton, SkeletonText } from './skeleton.tsx'
import { Text, textStyle } from './text.tsx'
import { tokens, useMotionReduced, useTheme } from './theme.tsx'
import { Focusable, type ViewHandle } from './tv/focusable.tsx'
import type { TileSource } from './tv/tiles.tsx'

const { space } = tokens

/** The phone's card's share of the row (the prototype's w-[78%]), for `usePosterWidth`. */
export const FEATURED_SHARE = 0.78
/** The gap between the phone's cards (the prototype's gap-3), for the Row's `itemGap`. */
export const FEATURED_GAP = space['3']

/** The TV's card's height and corner, in units. */
const TV = { height: 40.5, radius: 1.4, inset: 2.8, words: 34, gap: 0.8 }

/**
 * The pointer's card's height: the prototype's clamp(18rem, min(62svh, 42vw), 44rem), 42% of the
 * page's measure where the prototype has the window's width, so a wide window's card stops
 * growing with the page. A minimum, so a narrow window's card grows to fit its words.
 */
const POINTER_HEIGHT = { min: 288, ofWindow: 0.62, ofMeasure: 0.42, max: 704 }
/** The pointer's words' column (the prototype's max-w-[38rem]). */
const POINTER_WORDS = 608

/** The pointer's fades and the TV's (the prototypes' black at 0.7 and 0.6). */
const SHADE =
  'linear-gradient(90deg, rgba(0,0,0,0.7), transparent 55%), linear-gradient(0deg, rgba(0,0,0,0.6), transparent 45%)'

/** The pointer's card at this window: its height, and where its words sit. */
function usePointerCard() {
  const window = useWindowDimensions()
  const measure = Math.min(window.width, web.maxWidth)
  const h = POINTER_HEIGHT
  const height = Math.min(
    h.max,
    Math.max(h.min, Math.min(h.ofWindow * window.height, h.ofMeasure * measure)),
  )
  const medium = window.width >= breakpoints.medium
  // the prototype's inset-x-5 bottom-5, and inset-x-10 bottom-9 from a medium window up
  const inset = medium ? space['10'] : space['5']
  const below = medium ? space['8'] + space['1'] : space['5']
  return { height, medium, inset, below, width: window.width }
}

export type FeaturedCardProps = {
  title: string
  /** The title's line: its year, length and genres. The TV and a pointer; touch never draws it. */
  meta?: string | null
  /** Its quality ("4K", "HDR"), as tags after the line: the TV and a pointer, as `meta`. */
  tags?: readonly string[]
  /** Two lines under it, the tagline or the synopsis. The TV and a pointer. */
  tagline?: string | null
  /** Touch: the words over the title ("New · 2010 · Fantasy"). */
  kicker?: string | null
  /** The wide art: the TV and a pointer. */
  backdrop?: TileSource
  /** The poster: touch's 4:5 card. */
  poster?: TileSource
  /** A pointer: the buttons under the words (Play or Resume, More info). */
  actions?: ReactNode
  /** A pointer: a Pager through the section's titles, from a medium window up. */
  pager?: ReactNode
  /** Opens the title: a tap or a press on the card, or OK on the TV. */
  onPress: () => void
  /** What it's read as: the title on touch, `title, meta` on the TV. */
  accessibilityLabel?: string
  /** Touch: the card's width, in points (78% of the row inside its gutters by default). */
  width?: number
  /** The TV: focus starts here when the screen appears. */
  preferred?: boolean
  /** The TV: it took focus. */
  onFocus?: () => void
  ref?: Ref<ViewHandle>
}

export function FeaturedCard(props: FeaturedCardProps) {
  const input = useTheme().formFactor.input
  if (input === 'tv') return <TvFeatured {...props} />
  if (input === 'pointer') return <PointerFeatured {...props} />
  return <TouchFeatured {...props} />
}

function TouchFeatured({
  title,
  kicker,
  poster,
  onPress,
  accessibilityLabel,
  width,
  ref,
}: FeaturedCardProps) {
  const theme = useTheme()
  const share = usePosterWidth(FEATURED_SHARE)
  const bg = theme.colors.bg
  return (
    <Press
      ref={ref}
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? title}
      style={{
        width: width ?? share,
        aspectRatio: 4 / 5,
        borderRadius: tokens.radius.lg,
        overflow: 'hidden',
        backgroundColor: theme.colors.s2,
        justifyContent: 'flex-end',
      }}
    >
      {poster ? (
        <Image
          source={poster}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={tokens.durations.color}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundImage: `linear-gradient(0deg, ${bg} 2%, ${alpha(bg, 0)} 55%)` },
        ]}
      />
      <View style={{ padding: space['4'], gap: space['1'] }}>
        {kicker ? (
          // the prototype's eyebrow: uppercase and tracked, where touch's eyebrow type is the caption's
          <Text
            variant="eyebrow"
            weight={600}
            color="accent-text"
            style={{
              textTransform: 'uppercase',
              letterSpacing: tokens.tracking.eyebrow * textStyle(theme, 'eyebrow').fontSize,
            }}
          >
            {kicker}
          </Text>
        ) : null}
        <Text variant="title" numberOfLines={2}>
          {title}
        </Text>
      </View>
    </Press>
  )
}

function PointerFeatured({
  title,
  meta,
  tags,
  tagline,
  backdrop,
  actions,
  pager,
  onPress,
  accessibilityLabel,
}: FeaturedCardProps) {
  const theme = useTheme()
  const { height, medium, inset, below } = usePointerCard()
  return (
    // a labelled region (react-native-web writes `summary` as `region`, which needs a name to be
    // one: https://www.w3.org/TR/wai-aria-1.2/#region), named by the title unless the screen names it
    <View
      accessibilityRole="summary"
      accessibilityLabel={accessibilityLabel ?? title}
      style={{
        minHeight: height,
        borderRadius: tokens.radius.lg,
        overflow: 'hidden',
        backgroundColor: theme.colors.s2,
        justifyContent: 'flex-end',
      }}
    >
      {backdrop ? (
        <Image
          source={backdrop}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={tokens.durations.color}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundImage: SHADE }]} />
      {/* a click anywhere on the card opens the title, as the actions' More info does for the
          keyboard and screen readers; the words and buttons sit above it */}
      <Press
        onPress={onPress}
        ring={false}
        focusable={false}
        // react-native-web ignores the two props after it, which leave an unnamed button for the
        // web's readers; aria-hidden hides it there, as RowArrow's (./row-arrow.tsx)
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}
      >
        {null}
      </Press>
      <View
        pointerEvents="box-none"
        style={{
          maxWidth: POINTER_WORDS + inset * 2,
          gap: space['3'],
          paddingHorizontal: inset,
          paddingBottom: below,
          paddingTop: space['16'],
        }}
      >
        {/* a pager's new page is read by its title and meta only, never its tagline or buttons
            (https://www.w3.org/TR/wai-aria-1.2/#aria-live) */}
        <View accessibilityLiveRegion="polite" style={{ gap: space['3'] }}>
          <Text variant="display" accessibilityRole="header" aria-level={2}>
            {title}
          </Text>
          {meta || tags?.length ? (
            // the prototype's flex-wrap items-center gap-2 line
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: space['2'],
              }}
            >
              {meta ? (
                <Text variant="body" color="text-2">
                  {meta}
                </Text>
              ) : null}
              <Tags tags={tags} />
            </View>
          ) : null}
        </View>
        {tagline ? (
          <Text variant="body" color="text-2" numberOfLines={2}>
            {tagline}
          </Text>
        ) : null}
        {actions ? (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: space['2'],
              paddingTop: space['1'],
            }}
          >
            {actions}
          </View>
        ) : null}
      </View>
      {pager && medium ? (
        <View style={{ position: 'absolute', right: inset, bottom: below }}>{pager}</View>
      ) : null}
    </View>
  )
}

function TvFeatured({
  title,
  meta,
  tags,
  tagline,
  backdrop,
  onPress,
  accessibilityLabel,
  preferred,
  onFocus,
  ref,
}: FeaturedCardProps) {
  const theme = useTheme()
  const u = theme.u
  const radius = TV.radius * u
  return (
    <Focusable
      ref={ref}
      role="link"
      label={accessibilityLabel ?? [title, meta, ...(tags ?? [])].filter(Boolean).join(', ')}
      lift="banner"
      radius={radius}
      preferred={preferred}
      onFocus={onFocus}
      onPress={onPress}
    >
      <View
        style={{
          height: TV.height * u,
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: theme.colors.s2,
        }}
      >
        {backdrop ? (
          <Image
            source={backdrop}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundImage: SHADE }]} />
        <View
          style={{
            position: 'absolute',
            left: TV.inset * u,
            bottom: TV.inset * u,
            maxWidth: TV.words * u,
            gap: TV.gap * u,
          }}
        >
          {/* the title, where the prototype has its logo: no server has logos yet */}
          <Text variant="heroTitle" numberOfLines={2} accessibilityRole="header" aria-level={2}>
            {title}
          </Text>
          {meta || tags?.length ? (
            // the prototype's items-center gap-[1cqw] line
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: u }}>
              {meta ? (
                <Text variant="meta" color="text-2">
                  {meta}
                </Text>
              ) : null}
              <Tags tags={tags} />
            </View>
          ) : null}
          {tagline ? (
            <Text variant="synopsis" color="text-2" numberOfLines={2}>
              {tagline}
            </Text>
          ) : null}
        </View>
      </View>
    </Focusable>
  )
}

/** The quality tags after the title's line, on glass over the art (QualityTag's `overlay`). */
function Tags({ tags }: { tags?: readonly string[] }) {
  return tags?.map((q) => <QualityTag key={q}>{q}</QualityTag>) ?? null
}

/** The bloom's fade in and out, ms: the prototype's duration-700 ease-out (client/bloom.tsx). */
const BLOOM_FADE = 700
/**
 * The pointer's bloom reaches past the card by the prototype's 24rem, and fades out over the last
 * 45% of its height (its mask-image, linear-gradient(black 55%, transparent)).
 */
const POINTER_BLOOM = { below: space['16'] * 6, fadeFrom: '55%' }

export type BloomProps = {
  /**
   * The featured title's most vibrant colour, hex or `hsl(h s% l%)` (as the prototype's
   * useVibrant gives it); nothing without one.
   */
  color?: string | null
  /** Whether it shows: the pointer hides it once the card has mostly scrolled away. */
  shown?: boolean
}

/**
 * The glow behind Home's featured card (the owner, 2026-10-30; client/bloom.tsx's BloomGlow), with
 * a pointer and on the TV: the title's colour as an ellipse 75% by 85% from where the card sits,
 * at 70% then 30% by halfway and gone by 85%. With a pointer it stands at the page's top, from
 * behind the bar to 24rem past the card (web/home.tsx), at 40% 50%; on the TV it fills what holds
 * it (tv/home.tsx), at 42% 45%. Where the web masks its end to transparent, this one fades it into
 * the page's `bg` over the same span, the same on a page in `bg` and drawn on native too, which
 * has no mask-image. It fades in and out over 700ms, at once under reduced motion; a new colour
 * takes the old one's place at once, where the prototype's registered `--bloom` turns between them.
 * Nothing by touch. Place it before the page's content in a positioned parent; it takes no
 * pointer events and is hidden from assistive tech.
 */
export function Bloom({ color, shown = true }: BloomProps) {
  const theme = useTheme()
  const input = theme.formFactor.input
  const reduced = useMotionReduced()
  const card = usePointerCard()
  const opacity = useSharedValue(0)
  const on = shown && !!color
  useEffect(() => {
    opacity.value = reduced ? (on ? 1 : 0) : withTiming(on ? 1 : 0, { duration: BLOOM_FADE })
  }, [on, reduced, opacity])
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }))
  if (input === 'touch' || !color) return null
  const tv = input === 'tv'
  const at = tv ? '42% 45%' : '40% 50%'
  const glow = `radial-gradient(ellipse 75% 85% at ${at}, ${alpha(color, 0.7)}, ${alpha(color, 0.3)} 50%, transparent 85%)`
  return (
    <Animated.View
      pointerEvents="none"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        tv
          ? StyleSheet.absoluteFill
          : {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: card.height + POINTER_BLOOM.below,
            },
        { backgroundImage: glow },
        fade,
      ]}
    >
      {tv ? null : (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundImage: `linear-gradient(transparent ${POINTER_BLOOM.fadeFrom}, ${theme.colors.bg})`,
            },
          ]}
        />
      )}
    </Animated.View>
  )
}

export type PagerProps = {
  /** How many pages, and the one shown. */
  count: number
  current: number
  onChange: (index: number) => void
  /** "Previous featured title" and "Next featured title". */
  previousLabel: string
  nextLabel: string
  /** Each dot's name: "Show Inception". */
  pageLabel: (index: number) => string
}

/**
 * The arrows and a dot for each page, paging through a featured section (the web prototype's
 * web/home.tsx): with a pointer only, since touch swipes its cards and the TV moves by focus. Each
 * dot is a 24 target with an 8 dot, the current one 20 wide in `text` and marked `aria-current`
 * (a page among a set is the current one, not a selected option:
 * https://www.w3.org/TR/wai-aria-1.2/#aria-current), the others `text` at 40%, 70% under the
 * pointer. Nothing for one page.
 */
export function Pager({
  count,
  current,
  onChange,
  previousLabel,
  nextLabel,
  pageLabel,
}: PagerProps) {
  const theme = useTheme()
  if (theme.formFactor.input !== 'pointer' || count < 2) return null
  const step = (by: number) => onChange((current + by + count) % count)
  const text = theme.colors.text
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['1'] }}>
      <Button
        variant="overlay"
        iconOnly
        icon="chevron-left"
        accessibilityLabel={previousLabel}
        onPress={() => step(-1)}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {Array.from({ length: count }, (_, i) => (
          <Press
            // biome-ignore lint/suspicious/noArrayIndexKey: a page is its index
            key={i}
            onPress={() => onChange(i)}
            accessibilityRole="button"
            accessibilityLabel={pageLabel(i)}
            aria-current={i === current ? 'true' : undefined}
            style={{
              width: space['6'],
              height: space['6'],
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: tokens.radius.pill,
            }}
          >
            {(s) => (
              <View
                style={{
                  width: i === current ? space['5'] : space['2'],
                  height: space['2'],
                  borderRadius: tokens.radius.pill,
                  backgroundColor: i === current ? text : alpha(text, s.hovered ? 0.7 : 0.4),
                }}
              />
            )}
          </Press>
        ))}
      </View>
      <Button
        variant="overlay"
        iconOnly
        icon="chevron-right"
        accessibilityLabel={nextLabel}
        onPress={() => step(1)}
      />
    </View>
  )
}

/**
 * Home's featured section while it loads, laid out as the card will be (the prototypes'
 * HomeSkeleton): by touch the 4:5 cards at their share of the row, the next one peeking, with the
 * kicker's and the title's lines at the bottom (mobile/home.tsx); with a pointer the card at its
 * own height with the title's, meta's and tagline's lines and the two buttons at the bottom left
 * (web/home.tsx); on the TV the card at 40.5u with the title's, the details' and the tagline's
 * lines low on the left (tv/home.tsx). Hidden from assistive tech: the screen says it's loading.
 */
export function FeaturedCardSkeleton() {
  const input = useTheme().formFactor.input
  if (input === 'tv') return <TvFeaturedSkeleton />
  if (input === 'pointer') return <PointerFeaturedSkeleton />
  return <TouchFeaturedSkeleton />
}

/** The pointer's title line: the prototype's clamp(3rem, 6vw, 5.5rem) tall, min(22rem, 70%) wide. */
const POINTER_TITLE = { min: 48, ofWindow: 0.06, max: 88, width: 352 }

function TouchFeaturedSkeleton() {
  const theme = useTheme()
  const width = usePosterWidth(FEATURED_SHARE)
  const gutter = usePageGutter()
  return (
    <View
      aria-hidden
      style={{
        flexDirection: 'row',
        gap: FEATURED_GAP,
        paddingHorizontal: gutter,
        overflow: 'hidden',
      }}
    >
      {[0, 1].map((i) => (
        <View
          key={i}
          style={{
            width,
            aspectRatio: 4 / 5,
            justifyContent: 'flex-end',
            gap: space['2'],
            padding: space['4'],
            borderRadius: tokens.radius.lg,
            backgroundColor: theme.colors.s1,
          }}
        >
          <Skeleton height={space['2'] + space['0.5']} width={space['16'] * 2} />
          <View style={{ marginVertical: space['0.5'] }}>
            <Skeleton height={space['6']} width="60%" />
          </View>
        </View>
      ))}
    </View>
  )
}

function PointerFeaturedSkeleton() {
  const theme = useTheme()
  const { height, inset, below, width } = usePointerCard()
  const t = POINTER_TITLE
  return (
    <View
      aria-hidden
      style={{
        height,
        borderRadius: tokens.radius.lg,
        overflow: 'hidden',
        backgroundColor: theme.colors.s1,
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: inset,
          right: inset,
          bottom: below,
          maxWidth: POINTER_WORDS,
          gap: space['3'],
        }}
      >
        <View style={{ flexDirection: 'row' }}>
          <Skeleton
            height={Math.min(t.max, Math.max(t.min, t.ofWindow * width))}
            width={Math.min(
              t.width,
              0.7 * (Math.min(width, POINTER_WORDS + 2 * inset) - 2 * inset),
            )}
            radius={tokens.radius.md}
          />
        </View>
        {/* the prototype's w-56 */}
        <Skeleton height={space['4']} width={space['16'] * 3 + space['8']} />
        <View style={{ maxWidth: POINTER_TAGLINE }}>
          <SkeletonText lines={2} />
        </View>
        <View style={{ flexDirection: 'row', gap: space['2'], paddingTop: space['1'] }}>
          {/* the prototype's w-24 and w-32 buttons */}
          <Skeleton height={space['10']} width={space['16'] + space['8']} />
          <Skeleton height={space['10']} width={space['16'] * 2} />
        </View>
      </View>
    </View>
  )
}

/** The tagline's lines' measure with a pointer (the prototype's max-w-[30rem]). */
const POINTER_TAGLINE = 480

/** The TV's lines, in units (tv/home.tsx's HomeSkeleton). */
const TV_LINES = { title: 6, titleWidth: 22, titleRadius: 0.6, meta: 1.05, metaWidth: 16 }

function TvFeaturedSkeleton() {
  const theme = useTheme()
  const u = theme.u
  const l = TV_LINES
  return (
    <View
      aria-hidden
      style={{
        height: TV.height * u,
        borderRadius: TV.radius * u,
        overflow: 'hidden',
        backgroundColor: theme.colors.s1,
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: TV.inset * u,
          bottom: TV.inset * u,
          width: TV.words * u,
          gap: TV.gap * u,
        }}
      >
        <Skeleton height={l.title} width={l.titleWidth * u} radius={l.titleRadius * u} />
        <View style={{ marginVertical: 0.15 * u }}>
          <Skeleton height={l.meta} width={l.metaWidth * u} />
        </View>
        <View style={{ paddingVertical: 0.2 * u }}>
          <SkeletonText lines={2} />
        </View>
      </View>
    </View>
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// A titled row of items that scrolls sideways, one part with a form per form factor (the
// prototypes' MobileRow, web CarouselRow and tv TvRow):
// - touch (mobile.md › Layout): its title (SectionHeading, as at every form factor), then items
//   edge to edge with the first one on the 16pt gutter, 8pt apart; posters about 30% of the
//   row's width, so three show and a peek;
// - a pointer (desktop-web.md, the web prototype's rows, ui-web's CarouselRow): the same on the
//   page's gutter, 12 apart, the wheel and trackpad scrolling it and paging arrows fading in at its
//   edges while the pointer's over it. The keyboard has it as one Tab stop: Left and Right move
//   between items (`onMove`, the app's navigate sound), Home and End to its ends, and at either end
//   focus stays and nudges, silently (./dom.web.ts, through the page's elements);
// - the TV (tv.md › Scrolling): the title at the safe area's inset, and the items in a sideways
//   scroll view that lands each focused item with its centre 30% in (react-native-tvos's
//   `snapToAlignment="item"` with each item's `scrollSnapOffset`). Item widths are known
//   (posters 10.5u, wide tiles 17u), so where they land is worked out, not measured; the row is a
//   focus guide with `autoFocus`, so coming back to it lands on the item left
//   (react-native-tvos's TVFocusGuideView). In a browser the engine pair does the same.
// Only the touch form is virtual: a pointer's and the TV's rows draw every item, since their keys
// and focus move along the drawn items, and a shelf is short.
// Each form is a group named by its title (https://www.w3.org/TR/wai-aria-1.2/#group), not a list:
// a list may hold only its items, and the row holds its heading and arrows too.
import { formFactorLayouts, web } from '@highsea-tv/tokens'
import { type ComponentRef, type ReactNode, type Ref, useEffect, useRef, useState } from 'react'
import { ScrollView, useWindowDimensions, View } from 'react-native'
import { moveInRow, roveRow } from './dom'
import { RowArrow } from './row-arrow.tsx'
import { ScrollView as LibraryScrollView } from './scroll-view.tsx'
import { SectionHeading } from './section-heading.tsx'
import { PosterSkeleton, Skeleton } from './skeleton.tsx'
import { tokens, useMotionReduced, useTheme } from './theme.tsx'
import { FocusGuide, TvScroll } from './tv/engine'
import { StopScope, type ViewHandle } from './tv/focusable.tsx'
import { KEEP, keptAt } from './tv/model.ts'
import { WIDE_WIDTH } from './tv/tiles.tsx'
import { Virtual } from './virtual.tsx'

const { gutter: phoneGutter, posterGap } = tokens.mobile
/** A touch row's item before it's measured, when the row gives no width: about a poster's. */
const TOUCH_ESTIMATE = 120

/** A pointer row's items' gap, as the web prototype's `gap-3`. */
const POINTER_GAP = tokens.space['3']
/** How far an arrow pages a pointer's row: most of its width, so the item at the edge stays in view. */
const PAGE_SHARE = 0.85

/**
 * The page's side inset at this form factor, which a row's first item sits on: the phone's gutter,
 * the TV's safe area, and with a pointer the web's margin by the form-factor rule (the prototype's
 * `px-4 medium:px-8 wide:px-16` on the one split: the phone's 16 in a compact window, then
 * `web.margin.wide`'s 64 from 768).
 */
export function usePageGutter(): number {
  const { formFactor, u } = useTheme()
  if (formFactor.input === 'tv') return tokens.tv.safe.x * u
  if (formFactor.input === 'touch') return phoneGutter
  return formFactor.widthClass === 'compact' ? phoneGutter : web.margin.wide
}

/**
 * The width of one poster in a row on this screen: a share of the row inside its gutters, as the
 * prototype's `w-[30%]` is of its padded list. The phone's own share is its layout's.
 */
export function usePosterWidth(share: number = formFactorLayouts['compact-touch'].itemShare) {
  return Math.round((useWindowDimensions().width - phoneGutter * 2) * share)
}

/**
 * A pointer's item widths by the window's, as the web prototype's clamps: a poster near 10.5% of
 * the window between 6.5rem and 12rem (web/film-row.tsx's --poster), a still near 24% between
 * 15rem and 21rem (web/home.tsx's cardWidth).
 */
const POINTER_ITEM = {
  poster: { share: 0.105, min: 104, max: 192 },
  still: { share: 0.24, min: 240, max: 336 },
}

/** A pointer's poster or still width in a window this wide (POINTER_ITEM). */
export const pointerItemWidth = (windowWidth: number, aspect: 'poster' | 'still' = 'poster') => {
  const c = POINTER_ITEM[aspect]
  return Math.min(Math.max(c.min, windowWidth * c.share), c.max)
}

export type RowProps<T> = {
  title: string
  /** Quieter words after the title (a spotlight's "because you watched"). */
  suffix?: string | null
  items: readonly T[]
  keyOf: (item: T) => string | number
  /**
   * An item, and on the TV where it sits and what its focus should tell the row (each item is a
   * focus stop of its own there).
   */
  render: (item: T, at: { index: number; onFocus: () => void }) => ReactNode
  /** A link or button at the end of the title (touch and a pointer). */
  action?: ReactNode
  /**
   * A pointer: the title and items' inset from the row's edge, when it isn't the page's gutter
   * (the admin's rows sit flush in their column, as ui-web's CarouselRow's `flush`, so 0).
   */
  inset?: number
  /** A pointer and touch: the title is a link to this address (a movie's collection's page). */
  titleHref?: string
  /**
   * Each item's width in the form factor's unit: on touch, so a fling stops with an item on the
   * gutter; on the TV, when it isn't a poster's or a wide tile's, so it lands where it should.
   */
  itemWidth?: number
  /** The TV's wide tiles (17u), where `itemWidth` isn't given. */
  wide?: boolean
  /**
   * Touch: the gap between items, in points, when it isn't a poster row's (Home's featured
   * carousel, whose cards stand 12 apart); a fling still stops with an item on the gutter.
   */
  itemGap?: number
  /** Touch: the title only names the list, as Home's featured carousel's, and isn't drawn. */
  titleHidden?: boolean
  /** The TV: an item took focus. */
  onFocusItem?: (item: T, index: number) => void
  /** A pointer: the arrow keys moved focus from one item to the next (the app's navigate sound). */
  onMove?: () => void
  ref?: Ref<ViewHandle>
}

export function Row<T>(props: RowProps<T>) {
  const input = useTheme().formFactor.input
  if (input === 'tv') return <TvForm {...props} />
  if (input === 'pointer') return <PointerForm {...props} />
  return <TouchForm {...props} />
}

const noFocus = () => {}

function TouchForm<T>({
  title,
  suffix,
  items,
  keyOf,
  render,
  action,
  itemWidth,
  itemGap = posterGap,
  titleHidden,
  titleHref,
}: RowProps<T>) {
  return (
    <View style={{ gap: tokens.space['2.5'] }} role="group" accessibilityLabel={title}>
      {titleHidden ? null : (
        <SectionHeading
          title={title}
          href={titleHref}
          suffix={suffix}
          action={action}
          inset={phoneGutter}
        />
      )}
      {/* the library's virtual list, as the grids' (./virtual.tsx): a long row draws the items
          near the screen */}
      <LibraryScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: phoneGutter }}
        {...(itemWidth
          ? { snapToInterval: itemWidth + itemGap, decelerationRate: 'fast' as const }
          : {})}
      >
        <Virtual
          count={items.length}
          estimateSize={() => itemWidth ?? TOUCH_ESTIMATE}
          getKey={(i) => {
            const item = items[i]
            return item === undefined ? i : String(keyOf(item))
          }}
          gap={itemGap}
          render={(index, onLayout) => {
            const item = items[index]
            return item === undefined ? null : (
              <View onLayout={onLayout}>{render(item, { index, onFocus: noFocus })}</View>
            )
          }}
        />
      </LibraryScrollView>
    </View>
  )
}

/** A key's press as the web reports it, with its modifiers. */
type Keys = { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }

/** The keys that move along a pointer's row, as CarouselRow's. */
const STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  Home: -Infinity,
  End: Infinity,
}

/** Marks a row's item for the keyboard's moves (react-native-web writes `dataSet` as data-*). */
const ITEM = { dataSet: { rowItem: '' } } as object

function PointerForm<T>({
  title,
  suffix,
  items,
  keyOf,
  render,
  action,
  inset,
  titleHref,
  onMove,
}: RowProps<T>) {
  const pageGutter = usePageGutter()
  const gutter = inset ?? pageGutter
  const reduced = useMotionReduced()
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null)
  const row = useRef<ComponentRef<typeof View>>(null)
  const [over, setOver] = useState(false)
  // the scroller's width and its content's, and where it's scrolled to: the ends are worked out
  // from all three once both sizes are known, so the arrows never show while everything fits
  const [sizes, setSizes] = useState({ at: 0, width: 0, content: 0 })
  const measured = sizes.width > 0 && sizes.content > 0
  const edges = {
    start: sizes.at <= 1,
    end: !measured || sizes.at + sizes.width >= sizes.content - 1,
  }
  const page = (dir: 1 | -1) =>
    scroller.current?.scrollTo({
      x: Math.max(0, sizes.at + dir * sizes.width * PAGE_SHARE),
      animated: !reduced,
    })
  // one Tab stop: the first item, or the one focused last; again when the items change
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the items change
  useEffect(() => roveRow(row.current, null), [items.length])
  return (
    <View
      ref={row}
      style={{ gap: POINTER_GAP }}
      role="group"
      accessibilityLabel={title}
      // the row's hover, for its arrows: a View reports the pointer's entering and leaving on the
      // web (react-native-web forwards the pointer events, modules/forwardedProps), and a touch
      // never shows them
      onPointerEnter={(e) => e.nativeEvent.pointerType !== 'touch' && setOver(true)}
      onPointerLeave={() => setOver(false)}
      // focus and keys bubble from the items to the row's element (react-native-web forwards
      // onFocus and onKeyDown on a View)
      onFocus={(e) => roveRow(row.current, e.target)}
      onKeyDown={(e) => {
        const k = e.nativeEvent as unknown as Keys
        const step = STEPS[k.key]
        if (step === undefined || k.altKey || k.ctrlKey || k.metaKey) return
        const moved = moveInRow(row.current, step, reduced)
        if (moved === 'none') return
        e.preventDefault()
        if (moved === 'moved') onMove?.()
      }}
    >
      <SectionHeading
        title={title}
        href={titleHref}
        suffix={suffix}
        action={action}
        inset={gutter}
      />
      <View>
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onLayout={(e) => {
            const width = e.nativeEvent.layout.width
            setSizes((was) => ({ ...was, width }))
          }}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
            setSizes({
              at: contentOffset.x,
              width: layoutMeasurement.width,
              content: contentSize.width,
            })
          }}
          onContentSizeChange={(content) => setSizes((was) => ({ ...was, content }))}
          // the padding keeps a hovered poster's scale inside the scroller's clip
          contentContainerStyle={{
            paddingHorizontal: gutter,
            paddingVertical: POINTER_GAP,
            gap: POINTER_GAP,
          }}
        >
          {/* every item drawn, as CarouselRow's, so the keyboard's moves reach each */}
          {items.map((item, index) => (
            <View key={keyOf(item)} {...ITEM}>
              {render(item, { index, onFocus: noFocus })}
            </View>
          ))}
        </ScrollView>
        <RowArrow dir={-1} width={gutter} shown={over && !edges.start} onPress={() => page(-1)} />
        <RowArrow dir={1} width={gutter} shown={over && !edges.end} onPress={() => page(1)} />
      </View>
    </View>
  )
}

function TvForm<T>({
  title,
  suffix,
  items,
  keyOf,
  wide = false,
  itemWidth,
  render,
  onFocusItem,
  ref,
}: RowProps<T>) {
  const theme = useTheme()
  const u = theme.u
  const { width } = useWindowDimensions()
  const w = (itemWidth ?? (wide ? WIDE_WIDTH : tokens.tv.poster.width)) * u
  const inset = tokens.tv.safe.x * u
  return (
    <View
      ref={ref}
      role="group"
      accessibilityLabel={title}
      style={{ gap: tokens.tv.space['4'] * u }}
    >
      <SectionHeading title={title} suffix={suffix} inset={inset} />
      <FocusGuide autoFocus trapFocusLeft trapFocusRight>
        <TvScroll
          horizontal
          keep={KEEP.row}
          contentContainerStyle={{
            gap: tokens.tv.poster.gap * u,
            paddingHorizontal: inset,
            paddingVertical: tokens.tv.space['5'] * u,
          }}
        >
          {items.map((item, index) => (
            <View key={keyOf(item)} scrollSnapOffset={keptAt(KEEP.row, width, w)}>
              <StopScope.Provider value={`${title}/${index}/`}>
                {render(item, {
                  index,
                  onFocus: () => onFocusItem?.(item, index),
                })}
              </StopScope.Provider>
            </View>
          ))}
        </TvScroll>
      </FocusGuide>
    </View>
  )
}

/**
 * A row's measures while it loads, by form factor, in the form factor's unit: the title's line
 * and the gap under it, then the items' gap, their padding and how many there are.
 * - touch, mobile/home.tsx's MobileRowSkeleton: gap-2.5, the title my-0.5 h-4.5 w-40, three items
 *   8 apart (posterGap);
 * - a pointer, web/home.tsx's row of stills: gap-3, the title h-6 w-52, six items gap-3 py-3;
 * - the TV, tv/kit.tsx's TvRowSkeleton: gap 0.8u, the title h-[1.2cqw] w-[14cqw] py-[0.2cqw],
 *   seven tiles the poster gap apart, py-[1cqw].
 */
const ROW_SKELETON = {
  touch: {
    gap: tokens.space['2'] + tokens.space['0.5'],
    title: tokens.space['4'] + tokens.space['0.5'],
    titleWidth: tokens.space['16'] * 2 + tokens.space['8'],
    titlePad: tokens.space['0.5'],
    itemGap: posterGap,
    itemPad: 0,
    count: 3,
  },
  pointer: {
    gap: POINTER_GAP,
    title: tokens.space['6'],
    titleWidth: tokens.space['16'] * 3 + tokens.space['4'],
    titlePad: 0,
    itemGap: POINTER_GAP,
    itemPad: POINTER_GAP,
    count: 6,
  },
  tv: {
    gap: 0.8,
    title: 1.2,
    titleWidth: 14,
    titlePad: 0.2,
    itemGap: tokens.tv.poster.gap,
    itemPad: 1,
    count: 7,
  },
} as const

export type RowSkeletonProps = {
  /** Posters (2:3) or stills (16:9, Continue watching's). */
  aspect?: 'poster' | 'still'
  /** Continue watching's: each item's resume bar. */
  resume?: boolean
  /**
   * Each item's width: in points by touch and with a pointer, in units on the TV, as Row's. By
   * default touch's poster share (usePosterWidth), a pointer's clamp (pointerItemWidth) and the
   * TV's tile (10.5u, or 17u for a still).
   */
  itemWidth?: number
  /** How many items: as many as show, three by touch, six with a pointer and seven on the TV. */
  count?: number
}

/**
 * A Row while its screen loads: its title's line over a row of PosterSkeletons, at the form
 * factor's measures (ROW_SKELETON), on the page's gutter. Hidden from assistive tech; the screen
 * says it's loading.
 */
export function RowSkeleton({
  aspect = 'poster',
  resume = false,
  itemWidth,
  count,
}: RowSkeletonProps) {
  const theme = useTheme()
  const input = theme.formFactor.input
  const u = theme.u
  const gutter = usePageGutter()
  const window = useWindowDimensions()
  const touch = usePosterWidth()
  const m = ROW_SKELETON[input]
  const width =
    input === 'tv'
      ? (itemWidth ?? (aspect === 'still' ? WIDE_WIDTH : tokens.tv.poster.width)) * u
      : (itemWidth ?? (input === 'pointer' ? pointerItemWidth(window.width, aspect) : touch))
  return (
    <View aria-hidden style={{ gap: m.gap * u }}>
      <View style={{ paddingHorizontal: gutter, paddingVertical: m.titlePad * u }}>
        <Skeleton height={m.title} width={m.titleWidth * u} />
      </View>
      <View
        style={{
          flexDirection: 'row',
          gap: m.itemGap * u,
          paddingHorizontal: gutter,
          paddingVertical: m.itemPad * u,
          overflow: 'hidden',
        }}
      >
        {Array.from({ length: count ?? m.count }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
          <PosterSkeleton key={i} aspect={aspect} resume={resume} width={width} />
        ))}
      </View>
    </View>
  )
}

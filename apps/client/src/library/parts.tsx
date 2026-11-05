// SPDX-License-Identifier: AGPL-3.0-only
// What Movies, Collections and a collection's page share at every form factor: the grid of posters
// on the phone and with a pointer, a film's poster and a collection's tile (each @highsea-tv/ui's
// Poster, worded by @highsea-tv/client/films), a TV page's title and its empty words, and the
// page's loading mark. Search and a film's page can draw the same grid and tiles.
// - The grid is a FlatList, so a library of thousands draws only the rows on screen
//   (https://reactnative.dev/docs/flatlist, `numColumns`). A phone's compact width is three a row,
//   8 apart and 16 between rows (the prototype's mobile `grid-cols-3 gap-x-2 gap-y-4`); everything
//   else fills the width with posters of at least 9rem, 16 apart and 24 between rows (the web
//   prototype's `repeat(auto-fill,minmax(9rem,1fr))`), so an iPad and a narrow browser draw a
//   pointer's columns.
// - Each row of the grid is a list of its own and each cell a listitem that gives its place in the
//   whole (aria-posinset of aria-setsize), since the scroller holds the page's header and states
//   besides the cells and draws only some of the rows: WAI-ARIA 1.2's listitem needs a list as its
//   parent, and aria-setsize and aria-posinset are for sets not all in the DOM
//   (https://www.w3.org/TR/wai-aria-1.2/#listitem, #aria-setsize, #aria-posinset).
// - A collection's tile prefers its mosaic to its poster, as the prototype's CollectionTile does
//   (kit/collection-art.tsx), and is read with its Smart mark ("…, smart collection, …"). The TV's
//   tile draws no mosaic, so it keeps the poster, or the mosaic's first image.
// - Loading draws the library's PosterSkeleton at every form factor (the prototypes'
//   MediaPosterSkeleton, client/media-card.tsx, and tv/library.tsx's TvTileSkeleton), hidden from
//   assistive tech inside a container marked busy.
import type { ClientItem, LibraryCollection } from '@highsea-tv/api-contract'
import { playPath } from '@highsea-tv/client/library'
import { useMedia } from '@highsea-tv/native/media'
import type { WidthClass } from '@highsea-tv/tokens'
import {
  Badge,
  Poster,
  PosterSkeleton,
  ScrollView,
  Text,
  tokens,
  useFormFactor,
  useMotionReduced,
  useTheme,
} from '@highsea-tv/ui'
import type { ViewHandle } from '@highsea-tv/ui/tv'
import { type Href, router } from 'expo-router'
import {
  type ComponentProps,
  type ReactElement,
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Animated,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type RefreshControlProps,
  useWindowDimensions,
  View,
} from 'react-native'
import { useFilmsText } from '../films.ts'
import { TV_LIBRARY } from './sizes.ts'

const { space } = tokens

/** A regular width's least poster width, the web prototype's 9rem. */
const REGULAR_MIN = space['16'] * 2 + space['4']

/** The grid's columns across `span`, and its spacing, by the width class. */
export function gridOf(widthClass: WidthClass, span: number) {
  const compact = widthClass === 'compact'
  const gap = compact
    ? { column: tokens.mobile.posterGap, row: space['4'] }
    : { column: space['4'], row: space['6'] }
  const columns = compact
    ? 3
    : Math.max(1, Math.floor((span + gap.column) / (REGULAR_MIN + gap.column)))
  const width = Math.max(0, Math.floor((span - (columns - 1) * gap.column) / columns))
  return { columns, width, gap }
}

/** What a grid's parent can ask of it: to scroll an item into view. */
export type GridHandle = {
  /** Scrolls the row holding item `index` to `offset` under the scroller's top. */
  toItem: (index: number, options: { animated: boolean; offset: number }) => void
}

/**
 * Posters in rows across the width they're given, inside a page's own scroller: Search's sections
 * and a collection's page, whose lists are short. `render` gets each one's width.
 */
export function LibraryGrid<T>({
  items,
  keyOf,
  render,
  label,
  widthClass,
}: {
  items: readonly T[]
  keyOf: (item: T) => string
  render: (item: T, width: number) => ReactNode
  label?: string
  widthClass?: WidthClass
}) {
  const klass = useWidthClass(widthClass)
  const window = useWindowDimensions().width
  // the width it's laid out at; until then the window's, so the first frame is near enough
  const [across, setAcross] = useState<number | null>(null)
  const { width, gap } = gridOf(klass, across ?? window)
  return (
    <View
      role="list"
      accessibilityLabel={label}
      onLayout={(e) => setAcross(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: gap.column, rowGap: gap.row }}
    >
      {items.map((item) => (
        <View key={keyOf(item)} role="listitem" style={{ width }}>
          {render(item, width)}
        </View>
      ))}
    </View>
  )
}

/**
 * The width class a grid draws at: the page's, or compact only on a phone's compact width; a
 * pointer at any width, and the TV, fill it (web/library.tsx's auto-fill).
 */
function useWidthClass(given?: WidthClass): WidthClass {
  const ff = useFormFactor()
  return given ?? (ff.input === 'touch' && ff.widthClass === 'compact' ? 'compact' : 'regular')
}

/** A cell's place in the whole grid, for assistive tech (RN's types don't name these yet). */
const placeOf = (index: number, size: number) =>
  ({ 'aria-posinset': index + 1, 'aria-setsize': size }) as object

export type LibraryGridListProps<T> = {
  items: readonly T[]
  keyOf: (item: T) => string
  /** One cell, which fills its column's width. */
  render: (item: T, index: number) => ReactNode
  /** The grid's name for assistive tech, which reads it as a list. */
  label: string
  /** What the page shows above the grid, scrolling with it. */
  header?: ReactElement
  /** What it shows in the grid's place when there are no items: the page's states. */
  empty?: ReactElement
  /** The room either side of the grid, inside the scroller. */
  inset?: number
  /** More room at its end: the phone's index stands there (the prototype's `pe-2`). */
  insetEnd?: number
  /**
   * Room at the start of every row, for a column drawn over the page (a pointer's index): `room`
   * is what it comes to, which the columns are counted without, and `width` what it is now, as it
   * opens and closes.
   */
  lead?: { room: number; width: Animated.Value }
  /** The room under it. */
  bottom?: number
  /** The width class whose columns it draws; the window's, unless a page says otherwise. */
  widthClass?: WidthClass
  /**
   * Its own columns and gaps over the width class's: the phone's Music draws two albums a row and
   * its lists one (mobile/music.tsx).
   */
  columns?: number
  gap?: { column: number; row: number }
  refreshControl?: ReactElement<RefreshControlProps>
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void
  /** Where the grid starts in the scroller, once the header is laid out. */
  onGridTop?: (y: number) => void
  ref?: Ref<GridHandle>
}

/**
 * A library page's grid as the page's own scroller, drawing only the rows near the screen, with the
 * page's header above it. Its cells share each row by flex, so a column opening beside them
 * narrows them as it goes.
 */
export function LibraryGridList<T>({
  items,
  keyOf,
  render,
  label,
  header,
  empty,
  inset = 0,
  insetEnd = 0,
  lead,
  bottom = 0,
  widthClass,
  columns: givenColumns,
  gap: givenGap,
  refreshControl,
  onScroll,
  onGridTop,
  ref,
}: LibraryGridListProps<T>) {
  const klass = useWidthClass(widthClass)
  const list = useRef<FlatList<readonly T[]>>(null)
  // the width it's laid out at, less its insets; until then the window's, so the first frame is
  // near enough
  const window = useWindowDimensions().width
  const [laid, setLaid] = useState<number | null>(null)
  const span = Math.max(0, (laid ?? window) - 2 * inset - insetEnd)
  const grid = gridOf(klass, Math.max(0, span - (lead?.room ?? 0)))
  const columns = givenColumns ?? grid.columns
  const gap = givenGap ?? grid.gap
  const rows = useMemo(() => {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += columns) out.push(items.slice(i, i + columns))
    return out
  }, [items, columns])
  // between rows: one component for the list's life, so it isn't remade each render
  const Separator = useMemo(() => {
    const height = gap.row
    return function RowGap() {
      return <View style={{ height }} />
    }
  }, [gap.row])
  // the fallback's second try, cleared if the page goes first
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => clearTimeout(retry.current ?? undefined), [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: the handle reads this render's rows
  useImperativeHandle(ref, () => ({
    toItem: (index, { animated, offset }) => {
      const row = Math.floor(index / columns)
      if (row < rows.length)
        list.current?.scrollToIndex({ index: row, animated, viewOffset: offset })
    },
  }))
  return (
    <FlatList<readonly T[]>
      ref={list}
      // the library's ScrollView, so the web draws its own scrollbar over the page
      // (the cast: the library's react-native-tvos types are another copy's than the app's)
      renderScrollComponent={(props) => (
        <ScrollView {...(props as ComponentProps<typeof ScrollView>)} />
      )}
      data={rows}
      // a row by its first item, which no other row holds
      keyExtractor={(row, r) => (row[0] === undefined ? String(r) : keyOf(row[0]))}
      onLayout={(e) => setLaid(e.nativeEvent.layout.width)}
      onScroll={onScroll}
      scrollEventThrottle={16}
      refreshControl={refreshControl}
      contentContainerStyle={{
        paddingStart: inset,
        paddingEnd: inset + insetEnd,
        paddingBottom: bottom,
      }}
      ListHeaderComponent={
        header ? (
          <View onLayout={(e) => onGridTop?.(e.nativeEvent.layout.height)}>{header}</View>
        ) : undefined
      }
      ListEmptyComponent={empty}
      ItemSeparatorComponent={Separator}
      renderItem={({ item: row, index: r }) => (
        <View style={{ flexDirection: 'row' }}>
          {lead ? <Animated.View style={{ width: lead.width }} /> : null}
          <View
            role="list"
            // the first row names the grid; the rest are its continuation
            accessibilityLabel={r === 0 ? label : undefined}
            style={{ flex: 1, flexDirection: 'row', columnGap: gap.column }}
          >
            {Array.from({ length: columns }, (_, c) => {
              const item = row[c]
              // a short last row keeps the columns' width with empty places
              return item === undefined ? (
                <View key={`empty-${String(c)}`} aria-hidden style={{ flex: 1 }} />
              ) : (
                <View
                  key={keyOf(item)}
                  role="listitem"
                  {...placeOf(r * columns + c, items.length)}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {render(item, r * columns + c)}
                </View>
              )
            })}
          </View>
        </View>
      )}
      // a row the jump hasn't measured yet: go near it by the rows' average, then exactly
      // (https://reactnative.dev/docs/flatlist#onscrolltoindexfailed)
      onScrollToIndexFailed={(info) => {
        list.current?.scrollToOffset({
          offset: info.averageItemLength * info.index,
          animated: false,
        })
        clearTimeout(retry.current ?? undefined)
        retry.current = setTimeout(
          () => list.current?.scrollToIndex({ index: info.index, animated: false }),
          0,
        )
      }}
    />
  )
}

/**
 * A value that springs to `target` with spring.quick (columns opening and closing, as the
 * prototypes' web and TV indexes do), or is set at once with reduced motion.
 */
export function useSpringTo(target: number): Animated.Value {
  const reduced = useMotionReduced()
  const [value] = useState(() => new Animated.Value(target))
  useEffect(() => {
    if (reduced) {
      value.setValue(target)
      return
    }
    const run = Animated.spring(value, {
      toValue: target,
      ...tokens.springs.quick,
      useNativeDriver: false,
    })
    run.start()
    return () => run.stop()
  }, [target, reduced, value])
  return value
}

/** A film in a library's grid: its poster, title and year, opening its page; Play/Pause on the TV. */
export function LibraryPoster({
  item,
  width,
  ref,
  preferred,
  onFocus,
}: {
  item: ClientItem
  width?: number
  ref?: Ref<ViewHandle>
  preferred?: boolean
  onFocus?: () => void
}) {
  const media = useMedia()
  const card = useFilmsText().card(item)
  return (
    <Poster
      ref={ref}
      title={card.title}
      src={media(card.src)}
      aspect={card.aspect}
      showTitle
      caption={card.caption}
      width={width}
      preferred={preferred}
      onFocus={onFocus}
      onPress={() => router.push(`/movies/${item.id}` as Href)}
      // the remote's Play/Pause plays a focused film (tv.md); Poster ignores it off the TV
      onPlay={() => router.push(playPath(item.id) as Href)}
    />
  )
}

/** A collection as a tile reads it: the library's (with its smart part) or a search's. */
export type TileCollection = Pick<LibraryCollection, 'name' | 'count' | 'years' | 'art'> & {
  id: string | number
  smart?: LibraryCollection['smart']
}

/** A collection's tile: its mosaic or poster, the smart mark, its name and what it holds. */
export function LibraryCollectionTile({
  collection: c,
  width,
  ref,
  preferred,
  onFocus,
  caption = 'full',
}: {
  collection: TileCollection
  /**
   * What its caption (and so its spoken label) says: what it holds and their years, or only how
   * many (Search's on touch).
   */
  caption?: 'full' | 'count'
  width?: number
  /** The tile's view, as LibraryPoster's: a page focuses it (Search's TV results). */
  ref?: Ref<ViewHandle>
  preferred?: boolean
  onFocus?: () => void
}) {
  const media = useMedia()
  const tile = useFilmsText().tileOf({
    ...c,
    years: caption === 'count' ? '' : c.years,
    smart: c.smart ?? null,
  })
  const mosaic = (c.smart?.mosaic ?? []).map(media).filter((x) => x != null)
  // the mosaic when there is one, on every form factor (kit/collection-art.tsx, which the TV
  // prototype's tiles draw too), else the collection's poster
  const src = mosaic.length ? null : (c.art.poster ?? null)
  return (
    <Poster
      ref={ref}
      accessibilityLabel={tile.label}
      title={c.name}
      src={media(src)}
      mosaic={mosaic.length ? mosaic : undefined}
      showTitle
      caption={tile.caption}
      status={
        tile.badge ? (
          <Badge overlay icon="filter">
            {tile.badge}
          </Badge>
        ) : undefined
      }
      width={width}
      preferred={preferred}
      onFocus={onFocus}
      onPress={() => router.push(`/collections/${c.id}` as Href)}
    />
  )
}

/**
 * The page's loading mark, where its grid will be: the posters' skeletons, as many as its prototype
 * draws (on the TV two rows of seven, or one), hidden from assistive tech inside a container that
 * says it's busy.
 */
export function LibraryLoading({
  touch = 9,
  pointer = 14,
  tv = 14,
}: {
  touch?: number
  pointer?: number
  tv?: number
}) {
  const theme = useTheme()
  const input = theme.formFactor.input
  const klass = useWidthClass()
  const window = useWindowDimensions().width
  const [across, setAcross] = useState<number | null>(null)
  const u = theme.u
  const count = input === 'tv' ? tv : input === 'touch' ? touch : pointer
  // the TV's seven a row, as TvGrid lays them; elsewhere the grid's own columns
  const tvGap = tokens.tv.poster.gap * u
  const tvColumns = 7
  const span = across ?? window
  const { width, gap } =
    input === 'tv'
      ? {
          width: Math.max(0, Math.floor((span - (tvColumns - 1) * tvGap) / tvColumns)),
          gap: { column: tvGap, row: tvGap },
        }
      : gridOf(klass, span)
  return (
    <View
      accessibilityState={{ busy: true }}
      aria-busy
      onLayout={(e) => setAcross(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: gap.column, rowGap: gap.row }}
    >
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <PosterSkeleton key={i} width={width} />
      ))}
    </View>
  )
}

/** A TV page's title: the prototype's 2.6cqw, which the type scale has no step for yet. */
export function LibraryTitle({ children }: { children: string }) {
  const size = TV_LIBRARY.pageTitle
  const u = useTheme().u
  return (
    <Text
      size={size}
      weight={600}
      accessibilityRole="header"
      aria-level={1}
      style={{ lineHeight: size * u }}
    >
      {children}
    </Text>
  )
}

/**
 * A TV library's words where the grid would be, as the prototype's TvEmptyLibrary and
 * TvNothingMatches: a heading at the row title's size over a line of synopsis, and what to do.
 */
export function LibraryTvWords({
  title,
  children,
  action,
}: {
  title: string
  children: string
  action?: ReactNode
}) {
  const u = useTheme().u
  return (
    <View
      style={{
        maxWidth: TV_LIBRARY.emptyWidth * u,
        gap: TV_LIBRARY.emptyGap * u,
        paddingTop: TV_LIBRARY.emptyTop * u,
        alignItems: 'flex-start',
      }}
    >
      <Text variant="rowTitle" weight={600} accessibilityRole="header" aria-level={2}>
        {title}
      </Text>
      <Text variant="synopsis" color="text-2">
        {children}
      </Text>
      {action ? <View style={{ marginTop: TV_LIBRARY.emptyAction * u }}>{action}</View> : null}
    </View>
  )
}

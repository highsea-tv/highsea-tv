// SPDX-License-Identifier: AGPL-3.0-only
// C3 Movies (client-library.md): every film on this server as a poster grid, with Show (all or
// unwatched), a genre and a sort, from @highsea-tv/client/library. Sorted by title, the A–Z index
// stands beside the grid (@highsea-tv/ui's LetterIndex, a form per form factor). One composition
// per form factor, as the prototypes lay each out differently:
// - touch (the prototype's mobile/library.tsx and letter-index.tsx), the body of the phone's
//   Library under its title and its Movies and Collections (./library.tsx), which reads the
//   library and hands it here: the count, one Sort and filter button opening a sheet (Show, Sort
//   by, Genre, Reset), three posters a row, and the index in a 24-wide column at the screen's
//   edge, from the grid's top, staying 16 under the top as the page scrolls;
// - a pointer (web/library.tsx): the title and count with Show, Genre and Sort as selects, and the
//   index in a column of its own at the left, which stays under the top bar as the page scrolls,
//   opening and closing with spring.quick; at a compact width there's no index;
// - the TV (tv/library.tsx): the title with the sorts, Unwatched and the genre as chips on its
//   right, seven posters a row, and the rail at the safe area's left. Focus starts on the first
//   title; after that, picking a sort or a view keeps focus on the choice (the owner, 2026-10-31).
// An empty library says so; choices that match nothing say why, and with a pointer and on the TV
// offer Show everything. The grids draw only the rows near the screen (./parts.tsx), so a letter
// jumps to its first title's row, not to a measured place.
import { useLibrary } from '@highsea-tv/client/data'
import {
  ALL,
  arrange,
  createLibraryText,
  genresOf,
  LETTERS,
  letterOf,
  type Show,
  type Sort,
} from '@highsea-tv/client/library'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { springs, springToCss, web } from '@highsea-tv/tokens'
import {
  Button,
  Chip,
  EmptyState,
  LetterIndex,
  Menu,
  type MenuOption,
  Select,
  Sheet,
  Skeleton,
  Text,
  tokens,
  useControl,
  useFormFactor,
  useMotionReduced,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import {
  alpha,
  focusOn,
  Kept,
  RAIL_WIDTH,
  TV_HEAD_HEIGHT,
  TvGrid,
  TvMessage,
  TvPage,
  type ViewHandle,
} from '@highsea-tv/ui/tv'
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Animated,
  Modal,
  type RefreshControlProps,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBack } from '../back.tsx'
import { ROW_KEEP } from '../keep.ts'
import { HeadGoal, SectionLabel, useChromeOverlay, useHeadDown } from '../kit.tsx'
import { libraryScreenMessages as messages } from './messages.ts'
import {
  type GridHandle,
  LibraryGridList,
  LibraryLoading,
  LibraryPoster,
  LibraryTitle,
  LibraryTvWords,
  useSpringTo,
} from './parts.tsx'
import { TV_LIBRARY } from './sizes.ts'

const { space } = tokens
const tv = tokens.tv

/** The library as useLibrary answers it, read once by the page and handed to its parts. */
export type LibraryQuery = ReturnType<typeof useLibrary>

/** The sorts and Show in this locale, as every app words them. */
function useLibraryText() {
  const locale = useLocale()
  return useMemo(() => createLibraryText(locale), [locale])
}

/** The choices in force and what they leave, the same at every form factor. */
function useChoices(library: LibraryQuery) {
  const [genre, setGenre] = useState(ALL)
  const [sort, setSort] = useState<Sort>('title')
  const [show, setShow] = useState<Show>('all')
  const all = library.data ?? []
  const shown = useMemo(
    () => arrange(library.data ?? [], genre, sort, show === 'unwatched'),
    [library.data, genre, sort, show],
  )
  const titled = sort === 'title' && library.status === 'success' && shown.length > 0
  // each letter's first title in a list sorted by title, by its place
  const firsts = useMemo(() => {
    const out = new Map<string, number>()
    if (sort === 'title')
      shown.forEach((m, i) => {
        const l = letterOf(m.title)
        if (!out.has(l)) out.set(l, i)
      })
    return out
  }, [shown, sort])
  const present = useMemo(() => new Set(firsts.keys()), [firsts])
  return {
    library,
    all,
    shown,
    titled,
    present,
    firsts,
    genre,
    setGenre,
    sort,
    setSort,
    show,
    setShow,
    everything: () => {
      setGenre(ALL)
      setShow('all')
    },
  }
}

type Choices = ReturnType<typeof useChoices>

/** Why the choices match nothing: the phone's and a pointer's words. */
const noMatchOf = (show: Show) => (show === 'unwatched' ? 'noMatchUnwatched' : 'noMatch')

/** The grid's place when there's nothing to draw in it: loading, an error, none, or no match. */
function MoviesState({ c, everything }: { c: Choices; everything?: boolean }) {
  const t = useT(messages)
  const { library } = c
  if (library.status === 'loading') return <LibraryLoading />
  if (library.status === 'error')
    return (
      <EmptyState
        tone="error"
        icon="alert"
        title={t('failed')}
        action={<Button onPress={library.refetch}>{t('tryAgain')}</Button>}
      >
        {library.error.message}
      </EmptyState>
    )
  if (c.all.length === 0)
    return (
      <EmptyState icon="library" title={t('emptyTitle')}>
        {t('emptyBody')}
      </EmptyState>
    )
  return everything ? (
    <EmptyState
      icon="filter"
      title={t('nothingTitle')}
      action={<Button onPress={c.everything}>{t('showEverything')}</Button>}
    >
      {t(noMatchOf(c.show))}
    </EmptyState>
  ) : (
    <EmptyState icon="filter" title={t('noMatchTitle')}>
      {t(noMatchOf(c.show))}
    </EmptyState>
  )
}

/** The scroller's offset as an animated value, so what follows it never re-renders the page. */
function useScrolled() {
  const [y] = useState(() => new Animated.Value(0))
  const onScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { y } } }], { useNativeDriver: false }),
    [y],
  )
  return { y, onScroll }
}

/** Where a column that starts at `from` in the scroller stands, staying at `stuck` once there. */
const stickyTop = (y: Animated.Value, from: number, stuck: number) =>
  from > stuck
    ? y.interpolate({
        inputRange: [0, from - stuck],
        outputRange: [from, stuck],
        extrapolate: 'clamp',
      })
    : stuck

// ---------------------------------------------------------------- touch

export function TouchMovies({
  library,
  header,
  refreshControl,
}: {
  library: LibraryQuery
  /** The Library's title and its views, above the count. */
  header: ReactElement
  refreshControl: ReactElement<RefreshControlProps>
}) {
  const t = useT(messages)
  const text = useLibraryText()
  const gutter = usePageGutter()
  const insets = useSafeAreaInsets()
  const c = useChoices(library)
  const { all, shown } = c
  const [open, setOpen] = useState(false)
  const filtered = c.genre !== ALL || c.sort !== 'title' || c.show !== 'all'
  const grid = useRef<GridHandle>(null)
  const scrolled = useScrolled()
  // where the grid starts in the scroller, once its header is laid out
  const [gridTop, setGridTop] = useState(0)
  // the letters stay 16 under the top as the page scrolls (`sticky top-4`), and a letter's first
  // title lands on the same line (`scroll-mt-4`)
  const stuck = insets.top + space['4']

  return (
    <View style={{ flex: 1 }}>
      <LibraryGridList
        ref={grid}
        items={c.library.status === 'success' ? shown : []}
        keyOf={(m) => String(m.id)}
        label={t('movies')}
        widthClass="compact"
        inset={gutter}
        insetEnd={c.titled ? space['2'] : 0}
        bottom={space['8']}
        refreshControl={refreshControl}
        onScroll={scrolled.onScroll}
        onGridTop={setGridTop}
        header={
          <View style={{ gap: space['4'], paddingBottom: space['4'] }}>
            {header}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['2'] }}>
              <View style={{ flex: 1 }}>
                {library.status === 'success' ? (
                  <Text variant="caption" color="text-3">
                    {t('shown', { shown: shown.length, total: all.length })}
                  </Text>
                ) : library.status === 'loading' ? (
                  <Skeleton height={space['3']} width={space['16'] + space['8']} />
                ) : null}
              </View>
              <Button size="sm" icon="filter" hasPopup="dialog" onPress={() => setOpen(true)}>
                {filtered ? t('sorted') : t('sortFilter')}
              </Button>
            </View>
          </View>
        }
        empty={<MoviesState c={c} />}
        render={(m) => <LibraryPoster item={m} />}
      />
      {c.titled ? (
        <Animated.View
          style={{
            position: 'absolute',
            // the column's end at the screen's edge: the gutter's 16 less the prototype's -end-4
            end: Math.max(0, gutter - space['4']),
            width: space['6'],
            alignItems: 'center',
            top: stickyTop(scrolled.y, gridTop, stuck),
            // drawn once it knows where the grid starts
            opacity: gridTop ? 1 : 0,
          }}
        >
          <LetterIndex
            letters={LETTERS}
            present={c.present}
            label={t('letters')}
            onLetter={(l) =>
              grid.current?.toItem(c.firsts.get(l) ?? 0, { animated: false, offset: stuck })
            }
          />
        </Animated.View>
      ) : null}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('sortFilter')}
        // Reset and Show pinned under the choices (mobile/library.tsx's sheet footer)
        footer={
          <>
            <Button
              variant="ghost"
              onPress={() => {
                c.everything()
                c.setSort('title')
              }}
            >
              {t('reset')}
            </Button>
            <Button variant="primary" onPress={() => setOpen(false)}>
              {t('showCount', { count: shown.length })}
            </Button>
          </>
        }
      >
        <View style={{ gap: space['5'] }}>
          <ChipGroup label={t('show')}>
            {text.shows.map((x) => (
              <Chip key={x.value} selected={c.show === x.value} onPress={() => c.setShow(x.value)}>
                {x.label}
              </Chip>
            ))}
          </ChipGroup>
          <ChipGroup label={t('sortBy')}>
            {text.sorts.map((s) => (
              <Chip key={s.value} selected={c.sort === s.value} onPress={() => c.setSort(s.value)}>
                {s.label}
              </Chip>
            ))}
          </ChipGroup>
          <ChipGroup label={t('genre')}>
            {[ALL, ...genresOf(all)].map((g) => (
              <Chip key={g} selected={c.genre === g} onPress={() => c.setGenre(g)}>
                {g === ALL ? t('all') : g}
              </Chip>
            ))}
          </ChipGroup>
        </View>
      </Sheet>
    </View>
  )
}

/** One of the sheet's choices: its name, then its chips, as a labelled group. */
function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  const m = useControl()
  return (
    <View role="group" accessibilityLabel={label} style={{ gap: space['2'] }}>
      <SectionLabel>{label}</SectionLabel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: m.gap }}>{children}</View>
    </View>
  )
}

// ---------------------------------------------------------------- a pointer

export function PointerMovies() {
  const t = useT(messages)
  const f = useFormat()
  const text = useLibraryText()
  const theme = useTheme()
  const gutter = usePageGutter()
  const reduced = useMotionReduced()
  const { widthClass } = useFormFactor()
  const c = useChoices(useLibrary())
  const { library, all, shown } = c
  const grid = useRef<GridHandle>(null)
  const scrolled = useScrolled()
  // the page's width and its top on the screen, where the grid starts in the scroller, and the
  // index's width
  const [frame, setFrame] = useState({ width: 0, top: 0 })
  const box = useRef<ViewHandle>(null)
  const [gridTop, setGridTop] = useState(0)
  const [indexWidth, setIndexWidth] = useState(0)
  // each letter's first poster, which a jump focuses, and the letter a jump is still waiting on:
  // a far letter's row is drawn only once the jump has scrolled to it, so its poster is focused as
  // it mounts
  const firsts = useRef(new Map<string, ViewHandle | null>())
  const pending = useRef<string | null>(null)
  // the content is centred at the web's greatest width; the index sits on its gutter, beside the
  // grid until the page scrolls it up to the line under the top bar, where it stays. While the
  // library loads it's there with every letter dimmed; a compact width has none (the prototype's
  // `medium:block`)
  const inset = Math.max(0, (frame.width - web.maxWidth) / 2) + gutter
  const stuck = space['6']
  const indexed =
    widthClass !== 'compact' && c.sort === 'title' && (library.status === 'loading' || c.titled)
  const lead = useSpringTo(indexed ? indexWidth + space['4'] : 0)
  const shownIndex = useSpringTo(indexed ? 1 : 0)
  const jump = (l: string) => {
    const there = firsts.current.get(l)
    pending.current = there ? null : l
    // focus first, so the browser's own scroll to it doesn't cut the jump's short
    there?.focus?.()
    grid.current?.toItem(c.firsts.get(l) ?? 0, { animated: !reduced, offset: stuck })
  }
  const firstOf = (l: string) => (node: ViewHandle | null) => {
    firsts.current.set(l, node)
    if (node && pending.current === l) {
      pending.current = null
      node.focus?.()
    }
  }

  return (
    <View
      ref={box}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      onLayout={(e) => {
        const width = e.nativeEvent.layout.width
        box.current?.measureInWindow((_x, top) => setFrame({ width, top }))
      }}
    >
      <LibraryGridList
        ref={grid}
        items={library.status === 'success' ? shown : []}
        keyOf={(m) => String(m.id)}
        label={t('movies')}
        inset={inset}
        lead={{ room: indexed ? indexWidth + space['4'] : 0, width: lead }}
        bottom={space['16']}
        onScroll={scrolled.onScroll}
        onGridTop={setGridTop}
        header={
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              gap: space['3'],
              paddingTop: space['6'],
              paddingBottom: space['6'],
            }}
          >
            <View style={{ gap: space['1'] }}>
              <Text variant="heading" accessibilityRole="header" aria-level={1}>
                {t('movies')}
              </Text>
              {library.status === 'success' ? (
                <Text variant="caption" color="text-3">
                  {f.movies(all.length)}
                </Text>
              ) : null}
            </View>
            <View
              testID="movie-filters"
              style={{
                marginStart: 'auto',
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: space['2'],
                // react-native-web's View doesn't shrink (its View's own flexShrink 0, where CSS's
                // flex items do), so on a line of its own the row kept its one-line width and ran
                // past the edge: shrunk to the line, its selects wrap, as the prototype's
                // `ms-auto flex flex-wrap` does
                flexShrink: 1,
              }}
            >
              <View style={{ width: space['16'] * 2 + space['8'] }}>
                <Select
                  aria-label={t('show')}
                  value={c.show}
                  onValueChange={c.setShow}
                  options={text.shows}
                />
              </View>
              <View style={{ width: space['16'] * 2 + space['12'] }}>
                <Select
                  aria-label={t('genre')}
                  value={c.genre}
                  onValueChange={c.setGenre}
                  options={[
                    { value: ALL, label: t('allGenres') },
                    ...genresOf(all).map((g) => ({ value: g, label: g })),
                  ]}
                />
              </View>
              <View style={{ width: space['16'] * 2 + space['12'] }}>
                <Select
                  aria-label={t('sort')}
                  value={c.sort}
                  onValueChange={c.setSort}
                  options={text.sorts}
                />
              </View>
            </View>
          </View>
        }
        empty={<MoviesState c={c} everything />}
        render={(m, i) => (
          <LibraryPoster
            item={m}
            ref={
              c.titled && c.firsts.get(letterOf(m.title)) === i
                ? firstOf(letterOf(m.title))
                : undefined
            }
          />
        )}
      />
      {indexed ? (
        <Animated.View
          onLayout={(e) => setIndexWidth(e.nativeEvent.layout.width)}
          style={{
            position: 'absolute',
            start: inset,
            top: stickyTop(scrolled.y, gridTop, stuck),
            opacity: gridTop ? shownIndex : 0,
          }}
        >
          <LetterIndex
            letters={LETTERS}
            present={library.status === 'success' ? c.present : new Set<string>()}
            label={t('letters')}
            top={frame.top + stuck}
            onLetter={jump}
          />
        </Animated.View>
      ) : null}
    </View>
  )
}

// ---------------------------------------------------------------- the TV

/** The TV's sorts: the prototype's three, without the phone's and the web's Highest rated. */
const TV_SORTS = ['title', 'added', 'year'] as const satisfies Sort[]

/** How long the page's lift takes to settle, after which the first row is where it'll stay. */
const LIFT_MS = springToCss(springs.base).duration

export function TvMovies() {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  const m = useControl()
  const { width } = useWindowDimensions()
  const c = useChoices(useLibrary())
  const { library, all, shown } = c
  const goal = useContext(HeadGoal)
  // focus starts on the grid once; Show everything starts it there again
  const [arrived, setArrived] = useState(false)
  const firsts = useRef(new Map<string, ViewHandle | null>())
  const [at, setAt] = useState('')
  const [railTop, setRailTop] = useState(0)
  const gridBox = useRef<ViewHandle>(null)
  const none = library.status === 'success' && all.length === 0
  const room = c.titled ? RAIL_WIDTH + tv.poster.gap : 0
  const lead = useSpringTo(room * u)
  // a page with no stops of its own focuses the head (kit's HeadGoal)
  useEffect(() => {
    if (none) focusOn(goal)
  }, [none, goal])
  // the rail starts level with the first row where focus in it leaves it: arriving lifts the grid
  // (TvPage's keep), so it's measured on the screen again once the lift has settled
  const measure = () =>
    gridBox.current?.measureInWindow((_x, y) => setRailTop((was) => (was === y ? was : y)))
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => clearTimeout(settle.current ?? undefined), [])
  // the head lies over the page and scrolls away with it, as the prototype's; Down from it lands
  // on the sorts (the prototype's down="sort")
  const chrome = useChromeOverlay()
  const [down, setDown] = useState<ViewHandle | null>(null)
  const downRef = useCallback((v: ViewHandle | null) => setDown(v), [])
  useHeadDown(down)

  if (library.status === 'error')
    return (
      <TvMessage
        title={t('failed')}
        actions={
          <Button variant="primary" hasTVPreferredFocus onPress={library.refetch}>
            {t('tryAgain')}
          </Button>
        }
      >
        {library.error.message}
      </TvMessage>
    )
  const span = width / u - 2 * tv.safe.x - room

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <TvPage
        keep={ROW_KEEP}
        onScroll={chrome.onScroll}
        scrollEventThrottle={chrome.scrollEventThrottle}
      >
        <View
          style={{
            paddingHorizontal: tv.safe.x * u,
            // clear of the head laid over the page
            paddingTop: (TV_HEAD_HEIGHT + TV_LIBRARY.pageGap) * u,
            paddingBottom: tv.safe.y * u,
            gap: TV_LIBRARY.pageGap * u,
          }}
        >
          <Kept
            style={{ flexDirection: 'row', alignItems: 'flex-end', gap: TV_LIBRARY.headGap * u }}
          >
            <LibraryTitle>{t('movies')}</LibraryTitle>
            {/* nothing to sort or filter in an empty library */}
            {none ? null : (
              <View
                style={{
                  marginStart: 'auto',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: m.gap,
                }}
              >
                {TV_SORTS.map((s, i) => (
                  <Chip
                    key={s}
                    ref={i === 0 ? downRef : undefined}
                    selected={c.sort === s}
                    onPress={() => c.setSort(s)}
                  >
                    {t(`tvSort.${s}`)}
                  </Chip>
                ))}
                <View
                  style={{
                    width: StyleSheet.hairlineWidth,
                    alignSelf: 'stretch',
                    marginHorizontal: m.inset,
                    backgroundColor: alpha(theme.colors.text, 0.2),
                  }}
                />
                <Chip
                  selected={c.show === 'unwatched'}
                  onPress={() => c.setShow((x) => (x === 'unwatched' ? 'all' : 'unwatched'))}
                >
                  {t('unwatched')}
                </Chip>
                <GenreChoice genres={genresOf(all)} value={c.genre} onPick={c.setGenre} />
              </View>
            )}
          </Kept>
          {library.status === 'loading' ? (
            <LibraryLoading tv={2 * TV_COLUMNS} />
          ) : none ? (
            <LibraryTvWords title={t('emptyTitle')}>{t('emptyBody')}</LibraryTvWords>
          ) : shown.length === 0 ? (
            <LibraryTvWords
              title={t('nothingTitle')}
              action={
                <Button
                  variant="overlay"
                  onPress={() => {
                    c.everything()
                    setArrived(false)
                  }}
                >
                  {t('showEverything')}
                </Button>
              }
            >
              {c.genre === ALL
                ? t('noUnwatched')
                : c.show === 'unwatched'
                  ? t('watchedAllIn', { genre: c.genre })
                  : t('nothingIn', { genre: c.genre })}
            </LibraryTvWords>
          ) : (
            <Animated.View
              // the rail is drawn over the screen, so the grid's top is measured on the screen,
              // not in its parent (onLayout's y); the room for it opens and closes with
              // spring.quick as A–Z is picked and left
              ref={gridBox}
              onLayout={measure}
              style={{ paddingStart: lead }}
            >
              <TvGrid
                items={shown}
                columns={TV_COLUMNS}
                span={span}
                keyOf={(x) => x.id}
                render={(x, place) => {
                  const l = letterOf(x.title)
                  const first = c.titled && c.firsts.get(l) === place.index
                  return (
                    <LibraryPoster
                      item={x}
                      width={place.width}
                      ref={
                        first
                          ? (node) => {
                              firsts.current.set(l, node)
                            }
                          : undefined
                      }
                      preferred={!arrived && place.index === 0}
                      onFocus={() => {
                        setArrived(true)
                        setAt(l)
                        if (place.index < TV_COLUMNS) {
                          clearTimeout(settle.current ?? undefined)
                          settle.current = setTimeout(measure, LIFT_MS)
                        }
                      }}
                    />
                  )
                }}
              />
            </Animated.View>
          )}
        </View>
      </TvPage>
      {c.titled && railTop ? (
        <LetterIndex
          letters={LETTERS}
          present={c.present}
          at={at}
          top={railTop}
          label={t('letters')}
          onLetter={(l) => focusOn(firsts.current.get(l))}
        />
      ) : null}
    </View>
  )
}

/** TvGrid's posters a row (tv.md's seven), so the first row's are known by their place. */
const TV_COLUMNS = 7

/**
 * The genre, the last of the choices, as the web and phone have it: OK opens the genres over the
 * page in three columns, the one in force focused; choosing one closes them and focus stays on this
 * choice, as it does on the sorts (the owner, 2026-10-31).
 */
function GenreChoice({
  genres,
  value,
  onPick,
}: {
  genres: string[]
  value: string
  onPick: (genre: string) => void
}) {
  const t = useT(messages)
  const [open, setOpen] = useState(false)
  const chip = useRef<ViewHandle>(null)
  const label = value === ALL ? t('allGenres') : value
  // focus goes back to the chip once the genres have gone
  const back = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => clearTimeout(back.current ?? undefined), [])
  const close = () => {
    setOpen(false)
    clearTimeout(back.current ?? undefined)
    back.current = setTimeout(() => focusOn(chip.current), 0)
  }
  return (
    <>
      <Chip
        ref={chip}
        selected={value !== ALL}
        iconEnd="chevron-down"
        hasPopup="menu"
        accessibilityLabel={t('genreIs', { genre: label })}
        onPress={() => setOpen(true)}
      >
        {label}
      </Chip>
      {/* over the whole screen, not inside the row of choices it opens from; Back closes it, as
          a Modal's onRequestClose answers tvOS's Menu key and Android TV's Back
          (https://reactnative.dev/docs/modal#onrequestclose) */}
      <Modal transparent visible={open} animationType="none" onRequestClose={close}>
        {open ? (
          <GenreMenu
            close={close}
            items={[ALL, ...genres].map((g) => ({
              label: g === ALL ? t('allGenres') : g,
              current: g === value,
              onSelect: () => onPick(g),
            }))}
          />
        ) : null}
      </Modal>
    </>
  )
}

/**
 * The genres while they're open: the remote's Back closes them rather than leaving Movies, as the
 * shell's Back would (kit's TvAsk registers its Cancel the same way).
 */
function GenreMenu({ close, items }: { close: () => void; items: MenuOption[] }) {
  const t = useT(messages)
  useBack(() => {
    close()
    return true
  })
  // the library's Menu, which on the TV is TvMenu over the page; choosing an item closes it
  return <Menu open title={t('genre')} columns={3} items={items} onClose={close} />
}

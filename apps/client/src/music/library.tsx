// SPDX-License-Identifier: AGPL-3.0-only
// Music (one-client-platform-b.md › B3, prototype-gaps.md › 3.8): Albums, Artists, Songs and
// Playlists, as Apple Music, Plex and Navidrome give them. Albums and Songs filter by genre; the
// first three sort by name by default, which is when the A–Z index stands beside them. Playlists
// are the person's own. One composition per form factor, as the prototypes lay each out
// differently:
// - touch (mobile/music.tsx, mobile/music-lists.tsx): a view of the phone's Library under its
//   title and views (../library/library.tsx), at `?view=music&music=`; the four views as tabs
//   across the width, the count and one Sort and filter button opening a sheet (Sort by, Genre,
//   Reset), albums two a row, artists, songs and playlists as lists (New playlist first), the
//   index at the screen's edge, and pull to refresh;
// - a pointer (web/music.tsx, web/music-lists.tsx): the title and count, the views as tabs (each
//   its own address, MUSIC_PATHS), Genre and Sort as selects or New playlist on the right, a grid
//   of square covers, round artists and playlists' mosaics, Songs as a list, and the index at the
//   left from a regular width;
// - the TV (tv/music.tsx): the title with the views as chips beside it and the sorts on the right,
//   seven tiles a row, Songs as one list, and the rail at the safe area's left when sorted by name.
//   Picking a view or a sort keeps focus on it (the owner, 2026-10-31), so the TV keeps its view
//   in the page rather than its address. It has no genre, as the prototype's.
// Every list is the page's own scroller, drawing only the rows near the screen (LibraryGridList)
// with a pointer and by touch.
import type {
  ClientAlbum,
  ClientArtist,
  ClientLibrarySong,
  ClientPlaylist,
} from '@highsea-tv/api-contract'
import { useMusic, usePlaylists, useSongs } from '@highsea-tv/client/data'
import { LETTERS, letterOf } from '@highsea-tv/client/library'
import {
  ALL_GENRES,
  type AlbumSort,
  type ArtistSort,
  albumIndexKey,
  arrangeAlbums,
  arrangeArtists,
  arrangeSongs,
  MUSIC_PATHS,
  MUSIC_VIEWS,
  musicGenresOf,
  type SongSort,
  songGenresOf,
  songIndexKey,
  type MusicView as Which,
} from '@highsea-tv/client/music'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { web } from '@highsea-tv/tokens'
import {
  Button,
  Chip,
  EmptyState,
  LetterIndex,
  Poster,
  Press,
  RAIL_WIDTH,
  Select,
  Sheet,
  Skeleton,
  Tabs,
  Text,
  tokens,
  useControl,
  useFormFactor,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import {
  focusOn,
  Kept,
  TV_HEAD_HEIGHT,
  TvGrid,
  TvMessage,
  TvPage,
  type ViewHandle,
} from '@highsea-tv/ui/tv'
import { Image } from 'expo-image'
import { type Href, router, useLocalSearchParams } from 'expo-router'
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
import { Animated, Platform, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ROW_KEEP } from '../keep.ts'
import { HeadGoal, SectionLabel, useChromeOverlay, useHeadDown } from '../kit.tsx'
import { usePull } from '../library/library.tsx'
import { stickyTop, useScrolled } from '../library/movies.tsx'
import {
  type GridHandle,
  LibraryGridList,
  LibraryLoading,
  LibraryTitle,
  LibraryTvWords,
  useSpringTo,
} from '../library/parts.tsx'
import { useMusicPlayer } from '../music-player/store.ts'
import { musicScreenMessages as messages } from './messages.ts'
import {
  albumPath,
  artistPath,
  FROM_SONGS,
  NewPlaylistButton,
  NewPlaylistRow,
  PlaylistMosaic,
  playlistPath,
  SongRow,
  useMusicText,
  useNewPlaylist,
} from './parts.tsx'
import { TV_MUSIC } from './sizes.ts'

const { space } = tokens
const tv = tokens.tv

/** The sorts and genre in force, the same at every form factor; the genre is the view's. */
function useSorts() {
  const [albumSort, setAlbumSort] = useState<AlbumSort>('title')
  const [artistSort, setArtistSort] = useState<ArtistSort>('name')
  const [songSort, setSongSort] = useState<SongSort>('title')
  const [genre, setGenre] = useState(ALL_GENRES)
  return {
    albumSort,
    setAlbumSort,
    artistSort,
    setArtistSort,
    songSort,
    setSongSort,
    genre,
    setGenre,
    reset: () => {
      setGenre(ALL_GENRES)
      setAlbumSort('title')
      setArtistSort('name')
      setSongSort('title')
    },
  }
}

type Sorts = ReturnType<typeof useSorts>

/** One cell of a view: an album, an artist, a song or a playlist, with its letter for the index. */
type Cell =
  | { kind: 'album'; key: string; letter: string | null; album: ClientAlbum }
  | { kind: 'artist'; key: string; letter: string | null; artist: ClientArtist }
  | { kind: 'song'; key: string; letter: string | null; song: ClientLibrarySong; index: number }
  | { kind: 'playlist'; key: string; letter: null; playlist: ClientPlaylist }

/** A view's answer, its cells as the choices leave them, and the index's letters. */
function useView(view: Which, s: Sorts) {
  const music = useMusic()
  const songs = useSongs()
  const lists = usePlaylists().list
  const query = view === 'songs' ? songs : view === 'playlists' ? lists : music
  const all = useMemo<Cell[]>(() => {
    if (view === 'albums')
      return (music.data?.albums ?? []).map((a) => ({
        kind: 'album',
        key: a.id,
        letter: null,
        album: a,
      }))
    if (view === 'artists')
      return (music.data?.artists ?? []).map((a) => ({
        kind: 'artist',
        key: a.id,
        letter: null,
        artist: a,
      }))
    if (view === 'songs')
      return (songs.data ?? []).map((x, index) => ({
        kind: 'song',
        key: x.id,
        letter: null,
        song: x,
        index,
      }))
    return (lists.data ?? []).map((p) => ({
      kind: 'playlist',
      key: p.id,
      letter: null,
      playlist: p,
    }))
  }, [view, music.data, songs.data, lists.data])
  const genres = useMemo(
    () =>
      view === 'albums'
        ? musicGenresOf(music.data?.albums ?? [])
        : view === 'songs'
          ? songGenresOf(songs.data ?? [])
          : [],
    [view, music.data, songs.data],
  )
  const shown = useMemo<Cell[]>(() => {
    if (view === 'albums')
      return arrangeAlbums(music.data?.albums ?? [], s.genre, s.albumSort).map((a) => {
        const key = albumIndexKey(a, s.albumSort)
        return { kind: 'album', key: a.id, letter: key === null ? null : letterOf(key), album: a }
      })
    if (view === 'artists')
      return arrangeArtists(music.data?.artists ?? [], s.artistSort).map((a) => ({
        kind: 'artist',
        key: a.id,
        letter: s.artistSort === 'name' ? letterOf(a.sortName) : null,
        artist: a,
      }))
    if (view === 'songs')
      return arrangeSongs(songs.data ?? [], s.genre, s.songSort).map((x, index) => {
        const key = songIndexKey(x, s.songSort)
        return {
          kind: 'song',
          key: x.id,
          letter: key === null ? null : letterOf(key),
          song: x,
          index,
        }
      })
    return all
  }, [view, music.data, songs.data, s.genre, s.albumSort, s.artistSort, s.songSort, all])
  const titled =
    query.status === 'success' && shown.length > 0 && shown.every((c) => c.letter !== null)
  const firsts = useMemo(() => {
    const out = new Map<string, number>()
    if (titled)
      shown.forEach((c, i) => {
        if (c.letter !== null && !out.has(c.letter)) out.set(c.letter, i)
      })
    return out
  }, [shown, titled])
  const present = useMemo(() => new Set(firsts.keys()), [firsts])
  const songIds = useMemo(
    () => shown.flatMap((c) => (c.kind === 'song' ? [c.song.id] : [])),
    [shown],
  )
  return { query, all, shown, genres, titled, firsts, present, songIds }
}

type ViewState = ReturnType<typeof useView>

/** A view's count: "12 albums", or by touch "8 of 12 albums" for Albums and Songs. */
function useCount(view: Which, v: ViewState, shownOf = false) {
  const t = useT(messages)
  const text = useMusicText()
  const total = v.all.length
  if (shownOf && view === 'albums') return t('shownAlbums', { shown: v.shown.length, total })
  if (shownOf && view === 'songs') return t('shownSongs', { shown: v.shown.length, total })
  return {
    albums: text.albumsCount,
    artists: text.artistsCount,
    songs: text.songsCount,
    playlists: text.playlistsCount,
  }[view](total)
}

/** Plays Songs from this one on, or pauses it while it's the one playing. */
function usePlaySong(ids: string[]) {
  const player = useMusicPlayer()
  return {
    here: (id: string) => player.song?.id === id,
    playing: player.playing,
    play: (id: string, i: number) =>
      player.song?.id === id
        ? player.toggle()
        : void player.play({ songs: ids }, { start: i, from: FROM_SONGS }),
  }
}

/**
 * The view's place when there's nothing to draw: loading, an error, no music, or no match. By
 * touch Albums and Songs say which matched nothing; with a pointer, Show everything clears the
 * genre. Playlists say how to make one.
 */
function ViewState({
  view,
  v,
  s,
  everything,
}: {
  view: Which
  v: ViewState
  s: Sorts
  everything?: boolean
}) {
  const t = useT(messages)
  const { query } = v
  if (query.status === 'loading') return <LibraryLoading />
  if (query.status === 'error')
    return (
      <EmptyState
        tone="error"
        icon="alert"
        title={t('failed')}
        action={<Button onPress={query.refetch}>{t('tryAgain')}</Button>}
      >
        {query.error.message}
      </EmptyState>
    )
  if (view === 'playlists')
    return everything ? (
      <EmptyState icon="queue" title={t('noPlaylistsTitle')} action={<NewPlaylistButton primary />}>
        {t('noPlaylistsBody')}
      </EmptyState>
    ) : null
  if (v.all.length === 0)
    return (
      <EmptyState icon="library" title={t('emptyTitle')}>
        {t('emptyBody')}
      </EmptyState>
    )
  return everything ? (
    <EmptyState
      icon="filter"
      title={t('nothingTitle')}
      action={<Button onPress={() => s.setGenre(ALL_GENRES)}>{t('showEverything')}</Button>}
    >
      {t('nothingBody')}
    </EmptyState>
  ) : (
    <EmptyState icon="filter" title={view === 'songs' ? t('noSongs') : t('noAlbums')}>
      {t('nothingBody')}
    </EmptyState>
  )
}

/** An artist's round photo, its name and count: a pointer's ArtistCard and the TV's tile. */
export function ArtistTile({
  artist: a,
  width,
  ref,
  preferred,
  onFocus,
}: {
  artist: ClientArtist
  width?: number
  ref?: (node: ViewHandle | null) => void
  preferred?: boolean
  onFocus?: () => void
}) {
  const media = useMedia()
  const text = useMusicText()
  return (
    <Poster
      ref={ref}
      round
      title={a.name}
      src={media(a.photo)}
      showTitle
      caption={text.albumsCount(a.albums)}
      width={width}
      preferred={preferred}
      onFocus={onFocus}
      onPress={() => router.push(artistPath(a.id))}
    />
  )
}

/** An album's square cover, title and artist. */
export function AlbumTile({
  album: a,
  width,
  ref,
  preferred,
  onFocus,
}: {
  album: ClientAlbum
  width?: number
  ref?: (node: ViewHandle | null) => void
  preferred?: boolean
  onFocus?: () => void
}) {
  const media = useMedia()
  return (
    <Poster
      ref={ref}
      aspect="square"
      title={a.title}
      src={media(a.cover)}
      showTitle
      caption={a.artist.name}
      width={width}
      preferred={preferred}
      onFocus={onFocus}
      onPress={() => router.push(albumPath(a.id))}
    />
  )
}

/** A playlist's mosaic (four covers two by two, else one), its name and count. */
function PlaylistTile({
  playlist: p,
  width,
  preferred,
}: {
  playlist: ClientPlaylist
  width?: number
  preferred?: boolean
}) {
  const media = useMedia()
  const text = useMusicText()
  const four = p.covers.length >= 4
  return (
    <Poster
      aspect="square"
      title={p.name}
      src={four ? undefined : media(p.covers[0] ?? null)}
      mosaic={
        four
          ? p.covers
              .slice(0, 4)
              .map((c) => media(c))
              .filter((x): x is NonNullable<typeof x> => x != null)
          : undefined
      }
      showTitle
      caption={text.songsCount(p.songs)}
      width={width}
      preferred={preferred}
      onPress={() => router.push(playlistPath(p.id))}
    />
  )
}

// ---------------------------------------------------------------- touch

/** The view in the phone's address: `?music=`, Albums by default. */
function useTouchView(): Which {
  const { music } = useLocalSearchParams<{ music?: string }>()
  return MUSIC_VIEWS.find((v) => v === music) ?? 'albums'
}

/** The phone's Library › Music, under the Library's title and views. */
export function MusicView({ header }: { header: ReactElement }) {
  const t = useT(messages)
  const text = useMusicText()
  const gutter = usePageGutter()
  const insets = useSafeAreaInsets()
  const view = useTouchView()
  const s = useSorts()
  const v = useView(view, s)
  const count = useCount(view, v, true)
  const refreshControl = usePull(v.query.refresh)
  const songs = usePlaySong(v.songIds)
  const [open, setOpen] = useState(false)
  const naming = useNewPlaylist()
  const grid = useRef<GridHandle>(null)
  const scrolled = useScrolled()
  const [gridTop, setGridTop] = useState(0)
  const stuck = insets.top + space['4']
  const filters = view === 'albums' || view === 'songs'
  const sorts =
    view === 'albums' ? text.albumSorts : view === 'songs' ? text.songSorts : text.artistSorts
  const sort = view === 'albums' ? s.albumSort : view === 'songs' ? s.songSort : s.artistSort
  const setSort = (x: string) =>
    view === 'albums'
      ? s.setAlbumSort(x as AlbumSort)
      : view === 'songs'
        ? s.setSongSort(x as SongSort)
        : s.setArtistSort(x as ArtistSort)
  const filtered =
    (filters && s.genre !== ALL_GENRES) || sort !== (view === 'artists' ? 'name' : 'title')
  const choose = (next: Which) => {
    // in a browser each view is a page of its own, so its Back returns to the other
    if (Platform.OS === 'web')
      router.push(
        (next === 'albums' ? '/library?view=music' : `/library?view=music&music=${next}`) as Href,
      )
    else router.setParams({ music: next === 'albums' ? undefined : next })
  }
  const loaded = v.query.status === 'success'
  // Playlists: New playlist first, then the person's, then the empty words under them
  const cells: (Cell | { kind: 'new'; key: string } | { kind: 'none'; key: string })[] =
    view === 'playlists' && loaded
      ? [
          { kind: 'new', key: 'new' },
          ...v.shown,
          ...(v.shown.length === 0 ? [{ kind: 'none' as const, key: 'none' }] : []),
        ]
      : loaded
        ? v.shown
        : []

  return (
    <View style={{ flex: 1 }}>
      {naming.prompt}
      <LibraryGridList
        ref={grid}
        items={cells}
        keyOf={(c) => c.key}
        label={text.views.find((x) => x.value === view)?.label ?? ''}
        inset={gutter}
        insetEnd={v.titled ? space['2'] : 0}
        bottom={space['8']}
        columns={view === 'albums' ? 2 : 1}
        gap={view === 'albums' ? { column: space['3'], row: space['5'] } : { column: 0, row: 0 }}
        refreshControl={refreshControl}
        onScroll={scrolled.onScroll}
        onGridTop={setGridTop}
        header={
          <View style={{ gap: space['4'], paddingBottom: space['4'] }}>
            {header}
            <Tabs
              aria-label={t('views')}
              block
              value={view}
              onValueChange={(x: Which | undefined) => {
                if (x) choose(x)
              }}
              options={text.views.map((x) => ({ value: x.value, label: x.label }))}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space['2'],
                minHeight: space['8'],
              }}
            >
              <View style={{ flex: 1 }}>
                {v.query.status === 'loading' ? (
                  <Skeleton height={space['3']} width={space['16'] + space['8']} />
                ) : loaded ? (
                  <Text variant="caption" color="text-3">
                    {count}
                  </Text>
                ) : null}
              </View>
              {view === 'playlists' ? null : (
                <Button size="sm" icon="filter" hasPopup="dialog" onPress={() => setOpen(true)}>
                  {filtered ? t('sorted') : filters ? t('sortFilter') : t('sort')}
                </Button>
              )}
            </View>
          </View>
        }
        empty={<ViewState view={view} v={v} s={s} />}
        render={(c) =>
          c.kind === 'new' ? (
            <NewPlaylistRow onPress={naming.ask} />
          ) : c.kind === 'none' ? (
            <View style={{ paddingTop: space['4'] }}>
              <EmptyState icon="queue" title={t('noPlaylistsTitle')}>
                {t('noPlaylistsPhone')}
              </EmptyState>
            </View>
          ) : c.kind === 'album' ? (
            <AlbumTile album={c.album} />
          ) : c.kind === 'artist' ? (
            <TouchArtistRow artist={c.artist} />
          ) : c.kind === 'song' ? (
            <SongRow
              song={c.song}
              album={c.song.album}
              here={songs.here(c.song.id)}
              playing={songs.playing}
              showAlbum
              onPlay={() => songs.play(c.song.id, c.index)}
            />
          ) : (
            <TouchPlaylistRow playlist={c.playlist} />
          )
        }
      />
      {v.titled ? (
        <Animated.View
          style={{
            position: 'absolute',
            end: Math.max(0, gutter - space['4']),
            width: space['6'],
            alignItems: 'center',
            top: stickyTop(scrolled.y, gridTop, stuck),
            opacity: gridTop ? 1 : 0,
          }}
        >
          <LetterIndex
            letters={LETTERS}
            present={v.present}
            label={t('letters')}
            onLetter={(l) =>
              grid.current?.toItem(v.firsts.get(l) ?? 0, { animated: false, offset: stuck })
            }
          />
        </Animated.View>
      ) : null}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={filters ? t('sortFilter') : t('sort')}
        footer={
          <>
            <Button variant="ghost" onPress={s.reset}>
              {t('reset')}
            </Button>
            <Button variant="primary" onPress={() => setOpen(false)}>
              {view === 'albums'
                ? t('showAlbums', { count: v.shown.length })
                : view === 'songs'
                  ? t('showSongs', { count: v.shown.length })
                  : t('done')}
            </Button>
          </>
        }
      >
        <View style={{ gap: space['5'] }}>
          <ChipGroup label={t('sortBy')}>
            {sorts.map((x) => (
              <Chip key={x.value} selected={sort === x.value} onPress={() => setSort(x.value)}>
                {x.label}
              </Chip>
            ))}
          </ChipGroup>
          {filters ? (
            <ChipGroup label={t('genre')}>
              {[ALL_GENRES, ...v.genres].map((g) => (
                <Chip key={g} selected={s.genre === g} onPress={() => s.setGenre(g)}>
                  {g === ALL_GENRES ? t('all') : g}
                </Chip>
              ))}
            </ChipGroup>
          ) : null}
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

/** The phone's artist: a 56 round photo, the name and the count (mobile/music.tsx). */
function TouchArtistRow({ artist: a }: { artist: ClientArtist }) {
  const theme = useTheme()
  const media = useMedia()
  const text = useMusicText()
  const photo = space['12'] + space['2']
  return (
    <Press
      onPress={() => router.push(artistPath(a.id))}
      accessibilityRole="link"
      accessibilityLabel={`${a.name}, ${text.albumsCount(a.albums)}`}
      style={{
        minHeight: space['10'] + space['1'],
        flexDirection: 'row',
        alignItems: 'center',
        gap: space['3'],
        paddingVertical: space['1'] + space['0.5'],
        borderRadius: tokens.radius.sm,
      }}
    >
      <Image
        source={media(a.photo)}
        accessibilityIgnoresInvertColors
        style={{
          width: photo,
          height: photo,
          borderRadius: photo / 2,
          backgroundColor: theme.colors.s2,
        }}
        contentFit="cover"
      />
      <View style={{ flex: 1, minWidth: 0, gap: space['0.5'] }}>
        <Text variant="callout" weight={600} numberOfLines={1}>
          {a.name}
        </Text>
        <Text variant="caption" color="text-3">
          {text.albumsCount(a.albums)}
        </Text>
      </View>
    </Press>
  )
}

/** The phone's playlist: its 56 mosaic, the name, the count and a chevron. */
function TouchPlaylistRow({ playlist: p }: { playlist: ClientPlaylist }) {
  const text = useMusicText()
  return (
    <Press
      onPress={() => router.push(playlistPath(p.id))}
      accessibilityRole="link"
      accessibilityLabel={`${p.name}, ${text.songsCount(p.songs)}`}
      style={{
        minHeight: space['16'],
        flexDirection: 'row',
        alignItems: 'center',
        gap: space['3'],
        paddingVertical: space['1'],
        borderRadius: tokens.radius.sm,
      }}
    >
      <PlaylistMosaic covers={p.covers} size={space['12'] + space['2']} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="callout" weight={600} numberOfLines={1}>
          {p.name}
        </Text>
        <Text variant="caption" color="text-3">
          {text.songsCount(p.songs)}
        </Text>
      </View>
      <Text variant="caption" color="text-3" aria-hidden>
        {'›'}
      </Text>
    </Press>
  )
}

// ---------------------------------------------------------------- a pointer

export function PointerMusic({ view }: { view: Which }) {
  const t = useT(messages)
  const text = useMusicText()
  const theme = useTheme()
  const gutter = usePageGutter()
  const { widthClass } = useFormFactor()
  const s = useSorts()
  const v = useView(view, s)
  const count = useCount(view, v)
  const songs = usePlaySong(v.songIds)
  const grid = useRef<GridHandle>(null)
  const scrolled = useScrolled()
  const [frame, setFrame] = useState({ width: 0, top: 0 })
  const box = useRef<ViewHandle>(null)
  const [gridTop, setGridTop] = useState(0)
  const [indexWidth, setIndexWidth] = useState(0)
  const inset = Math.max(0, (frame.width - web.maxWidth) / 2) + gutter
  const stuck = space['6']
  const indexed = widthClass !== 'compact' && indexedBy(view, s, v)
  const lead = useSpringTo(indexed ? indexWidth + space['4'] : 0)
  const shownIndex = useSpringTo(indexed ? 1 : 0)
  const list = view === 'songs'
  const select = space['16'] * 2 + space['12']
  const genres = (
    <View style={{ width: select }}>
      <Select
        aria-label={t('genre')}
        value={s.genre}
        onValueChange={s.setGenre}
        options={[
          { value: ALL_GENRES, label: t('allGenres') },
          ...v.genres.map((g) => ({ value: g, label: g })),
        ]}
      />
    </View>
  )
  const sortSelect = (
    <View style={{ width: select }}>
      {view === 'albums' ? (
        <Select
          aria-label={t('sort')}
          value={s.albumSort}
          onValueChange={s.setAlbumSort}
          options={text.albumSorts}
        />
      ) : view === 'artists' ? (
        <Select
          aria-label={t('sort')}
          value={s.artistSort}
          onValueChange={s.setArtistSort}
          options={text.artistSorts}
        />
      ) : (
        <Select
          aria-label={t('sort')}
          value={s.songSort}
          onValueChange={s.setSongSort}
          options={text.songSorts}
        />
      )}
    </View>
  )
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
        items={v.query.status === 'success' ? v.shown : []}
        keyOf={(c) => c.key}
        label={text.views.find((x) => x.value === view)?.label ?? ''}
        inset={inset}
        lead={{ room: indexed ? indexWidth + space['4'] : 0, width: lead }}
        bottom={space['16']}
        columns={list ? 1 : undefined}
        gap={list ? { column: 0, row: 0 } : undefined}
        onScroll={scrolled.onScroll}
        onGridTop={setGridTop}
        header={
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              columnGap: space['6'],
              rowGap: space['3'],
              paddingTop: space['6'],
              paddingBottom: space['6'],
            }}
          >
            <View style={{ gap: space['1'] }}>
              <Text variant="heading" accessibilityRole="header" aria-level={1}>
                {t('music')}
              </Text>
              {v.query.status === 'loading' ? (
                <Skeleton height={space['3']} width={space['16'] + space['12']} />
              ) : v.query.status === 'success' ? (
                <Text variant="caption" color="text-3">
                  {count}
                </Text>
              ) : null}
            </View>
            <Tabs
              aria-label={t('views')}
              value={view}
              onValueChange={(x: Which | undefined) => {
                if (x) router.push(MUSIC_PATHS[x] as Href)
              }}
              options={text.views.map((x) => ({ value: x.value, label: x.label }))}
            />
            <View
              style={{
                marginStart: 'auto',
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: space['2'],
                flexShrink: 1,
              }}
            >
              {view === 'playlists' ? (
                v.query.status === 'success' && v.all.length > 0 ? (
                  <NewPlaylistButton />
                ) : null
              ) : (
                <>
                  {view === 'artists' ? null : genres}
                  {sortSelect}
                </>
              )}
            </View>
          </View>
        }
        empty={<ViewState view={view} v={v} s={s} everything />}
        render={(c) =>
          c.kind === 'album' ? (
            <AlbumTile album={c.album} />
          ) : c.kind === 'artist' ? (
            <ArtistTile artist={c.artist} />
          ) : c.kind === 'song' ? (
            <SongRow
              song={c.song}
              album={c.song.album}
              here={songs.here(c.song.id)}
              playing={songs.playing}
              showAlbum
              onPlay={() => songs.play(c.song.id, c.index)}
            />
          ) : (
            <PlaylistTile playlist={c.playlist} />
          )
        }
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
            present={v.query.status === 'success' ? v.present : new Set<string>()}
            label={t('letters')}
            top={frame.top + stuck}
            onLetter={(l) =>
              grid.current?.toItem(v.firsts.get(l) ?? 0, { animated: true, offset: stuck })
            }
          />
        </Animated.View>
      ) : null}
    </View>
  )
}

/**
 * Whether a view keeps room for its letter index: sorted by name, and either still loading or
 * titled. Keeping the room while it loads means the index's column is open when the rows arrive,
 * rather than springing open under them.
 */
function indexedBy(
  view: Which,
  s: ReturnType<typeof useSorts>,
  v: { query: { status: string }; titled: boolean },
): boolean {
  const byName =
    view === 'albums'
      ? s.albumSort === 'title' || s.albumSort === 'artist'
      : view === 'artists'
        ? s.artistSort === 'name'
        : view === 'songs'
          ? s.songSort !== 'added' && s.songSort !== 'plays'
          : false
  return byName && (v.query.status === 'loading' || v.titled)
}

// ---------------------------------------------------------------- the TV

/** TvGrid's tiles a row (tv.md's seven). */
const TV_COLUMNS = 7

export function TvMusic({ initial }: { initial: Which }) {
  const t = useT(messages)
  const text = useMusicText()
  const theme = useTheme()
  const u = theme.u
  const m = useControl()
  const { width } = useWindowDimensions()
  const [view, setView] = useState<Which>(initial)
  const s = useSorts()
  const v = useView(view, s)
  const songs = usePlaySong(v.songIds)
  const goal = useContext(HeadGoal)
  const firsts = useRef(new Map<string, ViewHandle | null>())
  const [at, setAt] = useState('')
  const [railTop, setRailTop] = useState(0)
  const gridBox = useRef<ViewHandle>(null)
  const [arrived, setArrived] = useState(false)
  const none = v.query.status === 'success' && v.all.length === 0
  const room = indexedBy(view, s, v) ? RAIL_WIDTH + tv.poster.gap : 0
  const lead = useSpringTo(room * u)
  useEffect(() => {
    if (none) focusOn(goal)
  }, [none, goal])
  const chrome = useChromeOverlay()
  const [down, setDown] = useState<ViewHandle | null>(null)
  const downRef = useCallback((x: ViewHandle | null) => setDown(x), [])
  useHeadDown(down)
  const measure = () =>
    gridBox.current?.measureInWindow((_x, y) => setRailTop((was) => (was === y ? was : y)))
  const sorts: { value: string; label: string; on: boolean; set: () => void }[] =
    view === 'albums'
      ? text.albumSorts.map((x) => ({
          value: x.value,
          label: x.value === 'title' ? t('az') : x.value === 'year' ? t('newest') : x.label,
          on: s.albumSort === x.value,
          set: () => s.setAlbumSort(x.value),
        }))
      : view === 'artists'
        ? text.artistSorts.map((x) => ({
            value: x.value,
            label: x.value === 'name' ? t('az') : x.label,
            on: s.artistSort === x.value,
            set: () => s.setArtistSort(x.value),
          }))
        : view === 'songs'
          ? text.songSorts.map((x) => ({
              value: x.value,
              label: x.value === 'title' ? t('az') : x.label,
              on: s.songSort === x.value,
              set: () => s.setSongSort(x.value),
            }))
          : []

  if (v.query.status === 'error')
    return (
      <TvMessage
        title={t('failed')}
        actions={
          <Button variant="primary" hasTVPreferredFocus onPress={v.query.refetch}>
            {t('tryAgain')}
          </Button>
        }
      >
        {v.query.error.message}
      </TvMessage>
    )
  const span = width / u - 2 * tv.safe.x - room
  const letterRef = (c: Cell, i: number) =>
    v.titled && c.letter !== null && v.firsts.get(c.letter) === i
      ? (node: ViewHandle | null) => {
          firsts.current.set(c.letter as string, node)
        }
      : undefined
  const focused = (c: Cell, i: number) => {
    setArrived(true)
    if (c.letter) setAt(c.letter)
    if (i < TV_COLUMNS) measure()
  }

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
            paddingTop: (TV_HEAD_HEIGHT + TV_MUSIC.pageGap) * u,
            paddingBottom: tv.safe.y * u,
            gap: TV_MUSIC.pageGap * u,
          }}
        >
          <Kept style={{ flexDirection: 'row', alignItems: 'flex-end', gap: TV_MUSIC.headGap * u }}>
            <LibraryTitle>{t('music')}</LibraryTitle>
            <View style={{ flexDirection: 'row', gap: m.gap }}>
              {text.views.map((x, i) => (
                <Chip
                  key={x.value}
                  ref={i === 0 ? downRef : undefined}
                  selected={view === x.value}
                  onPress={() => {
                    setView(x.value)
                    setArrived(true)
                  }}
                >
                  {x.label}
                </Chip>
              ))}
            </View>
            {none || sorts.length === 0 ? null : (
              <View style={{ marginStart: 'auto', flexDirection: 'row', gap: m.gap }}>
                {sorts.map((x) => (
                  <Chip key={x.value} selected={x.on} onPress={x.set}>
                    {x.label}
                  </Chip>
                ))}
              </View>
            )}
          </Kept>
          {v.query.status === 'loading' ? (
            <LibraryLoading tv={2 * TV_COLUMNS} />
          ) : none ? (
            <LibraryTvWords title={view === 'playlists' ? t('noPlaylistsTitle') : t('emptyTitle')}>
              {view === 'playlists' ? t('noPlaylistsTv') : t('emptyTv')}
            </LibraryTvWords>
          ) : (
            <Animated.View ref={gridBox} onLayout={measure} style={{ paddingStart: lead }}>
              {view === 'songs' ? (
                <View
                  role="list"
                  accessibilityLabel={t('music')}
                  style={{ gap: TV_MUSIC.songsGap * u }}
                >
                  {v.shown.map((c, i) =>
                    c.kind === 'song' ? (
                      <Kept key={c.key}>
                        <SongRow
                          ref={letterRef(c, i)}
                          song={c.song}
                          album={c.song.album}
                          here={songs.here(c.song.id)}
                          playing={songs.playing}
                          showAlbum
                          preferred={!arrived && i === 0}
                          onFocus={() => focused(c, i)}
                          onPlay={() => songs.play(c.song.id, c.index)}
                        />
                      </Kept>
                    ) : null,
                  )}
                </View>
              ) : (
                <TvGrid
                  items={v.shown}
                  columns={TV_COLUMNS}
                  span={span}
                  keyOf={(c) => c.key}
                  render={(c, place) =>
                    c.kind === 'album' ? (
                      <AlbumTile
                        album={c.album}
                        width={place.width}
                        ref={letterRef(c, place.index)}
                        preferred={!arrived && place.index === 0}
                        onFocus={() => focused(c, place.index)}
                      />
                    ) : c.kind === 'artist' ? (
                      <ArtistTile
                        artist={c.artist}
                        width={place.width}
                        ref={letterRef(c, place.index)}
                        preferred={!arrived && place.index === 0}
                        onFocus={() => focused(c, place.index)}
                      />
                    ) : c.kind === 'playlist' ? (
                      <PlaylistTile
                        playlist={c.playlist}
                        width={place.width}
                        preferred={!arrived && place.index === 0}
                      />
                    ) : null
                  }
                />
              )}
            </Animated.View>
          )}
        </View>
      </TvPage>
      {v.titled && railTop ? (
        <LetterIndex
          letters={LETTERS}
          present={v.present}
          at={at}
          top={railTop}
          label={t('letters')}
          onLetter={(l) => focusOn(firsts.current.get(l))}
        />
      ) : null}
    </View>
  )
}

/** Music at its address, by the form factor: the phone's is a Library view. */
export function MusicPage({ view }: { view: Which }) {
  const input = useFormFactor().input
  if (input === 'tv') return <TvMusic initial={view} />
  return <PointerMusic view={view} />
}

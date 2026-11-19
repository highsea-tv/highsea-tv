'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Music (docs/product/music.md, HT-68, Phase 5's part D): Artists at `/music`, Albums at
// `/music/albums` and Unmatched at `/music/unmatched`, laid out as Movies and Shows are: grid or
// table, filter tabs with counts, a text filter and a sort, and the A–Z index sorted by name or
// title (./library-grid.tsx). Music differs from films in three ways, each drawn here:
// - it's read, not searched for: there's no Add, and Rescan reads the Music folders again;
// - its details come from the files' tags first, then MusicBrainz: each row says which;
// - a folder the scan can't read as one album waits in Unmatched, to be matched or ignored.
//
// Drawn only when the server serves music (`Served`, serves.tsx): the routes are drafts the mock
// answers and the server answers 501.
import type {
  LibraryAlbum,
  LibraryArtist,
  MusicFolder,
  MusicMatch,
  RootFolder,
  UnmatchedMusic,
} from '@highsea-tv/api-contract'
import { bytes, relative } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import { admin } from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Input,
  Poster,
  SearchField,
  SegmentedControl,
  Select,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  Tabs,
  Text,
  TitleCell,
  TitleLink,
  toast,
  tokens,
  useMotionReduced,
  type VirtualGridHandle,
  type VirtualList,
} from '@highsea-tv/ui/native'
import { type ReactNode, type Ref, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { View } from 'react-native'
import { LibraryPosters, STUCK, useLetters, WithLetters } from './library-grid.tsx'
import { Loadable, PosterSkeletons } from './loadable.tsx'
import {
  albumPath,
  artistPath,
  formatsLine,
  MUSIC_TABS,
  MUSIC_TOPICS,
  type MusicTab,
  musicPath,
  sourceBadge,
  unmatchedTone,
} from './music-data.ts'
import { music as messages } from './music-messages.ts'
import { Served } from './serves.tsx'
import { AdminPage } from './shell.tsx'
import { useTabAddress } from './tabs.ts'

const s = tokens.space
const UI = tokens.adminText.ui.size

/** `/music`, `/music/albums` and `/music/unmatched`. */
export function MusicLibrary({ tab = 'artists' }: { tab?: MusicTab }) {
  return (
    <Served source="music">
      <Library tab={MUSIC_TABS.includes(tab) ? tab : 'artists'} />
    </Served>
  )
}

/** Grid or table, remembered per browser, as Movies' and Shows' views are. */
const VIEW_KEY = 'highsea:music-view'
const viewListeners = new Set<() => void>()
let unstoredView: 'grid' | 'table' = 'grid'
function readView(): 'grid' | 'table' {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'grid'
  } catch {
    return unstoredView
  }
}
export function useMusicView(): ['grid' | 'table', (v: 'grid' | 'table') => void] {
  const value = useSyncExternalStore(
    (l) => {
      viewListeners.add(l)
      return () => viewListeners.delete(l)
    },
    readView,
    () => 'grid' as const,
  )
  return [
    value,
    (v) => {
      unstoredView = v
      try {
        localStorage.setItem(VIEW_KEY, v)
      } catch {}
      for (const l of viewListeners) l()
    },
  ]
}

/** The Music folders and their figures, which Rescan, the empty states and the tabs' counts use. */
function useMusicFolders() {
  const roots = useQuery('settings:root-folders', (c) => c.rootFolders.list(), [
    'settings.updated',
    ...MUSIC_TOPICS,
  ])
  const figures = useQuery('music:folders', (c) => c.musicLibrary.folders(), MUSIC_TOPICS)
  const folders: RootFolder[] = (roots.data ?? []).filter((f) => f.kind === 'music')
  return { roots, folders, figures: figures.data ?? NO_FIGURES }
}

function Library({ tab }: { tab: MusicTab }) {
  const t = useT(messages)
  const setTab = useTabAddress<MusicTab>(musicPath(), 'artists')
  const [view, setView] = useMusicView()
  const { roots, folders, figures } = useMusicFolders()
  const scan = useAction(async (c, ids: string[]) => {
    for (const id of ids) await c.rootFolders.scan({ params: { id } })
  })
  const rescan = () =>
    scan.run(folders.map((f) => f.id)).then(
      () => toast.success(t('rescan.title'), { description: t('rescan.body') }),
      (e) => toast.error(t('rescan.failed'), { description: (e as Error).message }),
    )

  const total = (k: 'artists' | 'albums' | 'unmatched') => figures.reduce((n, f) => n + f[k], 0)

  const actions = (
    <>
      {tab !== 'unmatched' && (
        <SegmentedControl
          aria-label={t('view')}
          value={view}
          onValueChange={(v) => setView(v as typeof view)}
          options={[
            { value: 'grid', label: t('view.grid'), icon: 'grid' },
            { value: 'table', label: t('view.table'), icon: 'list' },
          ]}
        />
      )}
      <Button
        variant="primary"
        icon="scan"
        accessibilityLabel={t('rescan.label')}
        loading={scan.pending}
        disabled={roots.data !== undefined && folders.length === 0}
        onPress={rescan}
      >
        {t('rescan')}
      </Button>
    </>
  )

  return (
    <AdminPage title={t('title')} actions={actions}>
      <View style={{ gap: s['5'], minWidth: 0 }}>
        <Tabs<MusicTab>
          variant="line"
          aria-label={t('sections')}
          value={tab}
          onValueChange={setTab}
          options={MUSIC_TABS.map((value) => ({
            value,
            label: t(`tab.${value}`),
            ...(figures.length ? { count: total(value) } : {}),
          }))}
        />
        <View role="tabpanel" aria-label={t(`tab.${tab}`)} style={{ minWidth: 0 }}>
          {tab === 'artists' ? (
            <Artists view={view} noFolders={roots.data !== undefined && !folders.length} />
          ) : tab === 'albums' ? (
            <Albums view={view} noFolders={roots.data !== undefined && !folders.length} />
          ) : (
            <Unmatched />
          )}
        </View>
      </View>
    </AdminPage>
  )
}

/** No music: no Music folder to read yet, or folders with nothing found in them. */
function NoMusic({ noFolders }: { noFolders: boolean }) {
  const t = useT(messages)
  return noFolders ? (
    <EmptyState
      icon="music"
      title={t('empty.title')}
      action={
        <Button variant="primary" icon="folder" href="/settings/media">
          {t('empty.folders')}
        </Button>
      }
    >
      {t('empty.body')}
    </EmptyState>
  ) : (
    <EmptyState icon="music" title={t('empty.title')}>
      {t('empty.scanned')}
    </EmptyState>
  )
}

// ——— Artists

const ARTIST_FILTERS = ['all', 'musicbrainz', 'tags'] as const
type ArtistFilter = (typeof ARTIST_FILTERS)[number]
const ARTIST_SORTS = ['name', 'added', 'size'] as const
type ArtistSort = (typeof ARTIST_SORTS)[number]
const artistCompare: Record<ArtistSort, (a: LibraryArtist, b: LibraryArtist) => number> = {
  name: (a, b) => a.sortName.localeCompare(b.sortName),
  added: (a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt),
  size: (a, b) => b.size - a.size,
}

function Artists({ view, noFolders }: { view: 'grid' | 'table'; noFolders: boolean }) {
  const t = useT(messages)
  const artists = useQuery('music:artists', (c) => c.musicLibrary.artists(), MUSIC_TOPICS)
  const [filter, setFilter] = useState<ArtistFilter>('all')
  const [sort, setSort] = useState<ArtistSort>('name')
  const [text, setText] = useState('')
  const all = artists.data ?? NO_ARTISTS
  const counts = Object.fromEntries(
    ARTIST_FILTERS.map((k) => [k, all.filter((a) => k === 'all' || a.source === k).length]),
  ) as Record<ArtistFilter, number>
  const shown = useMemo(() => {
    const q = text.trim().toLowerCase()
    return all
      .filter((a) => filter === 'all' || a.source === filter)
      .filter(
        (a) =>
          !q ||
          a.name.toLowerCase().includes(q) ||
          a.genres.some((g) => g.toLowerCase().includes(q)),
      )
      .sort(artistCompare[sort])
  }, [all, filter, text, sort])

  return (
    <Loadable
      query={artists}
      what={t('what.artists')}
      skeleton={view === 'grid' ? <PosterSkeletons /> : undefined}
    >
      {() =>
        all.length === 0 ? (
          <NoMusic noFolders={noFolders} />
        ) : (
          <Frame
            filters={
              <Tabs
                aria-label={t('filters')}
                value={filter}
                onValueChange={(v) => setFilter(v as ArtistFilter)}
                options={ARTIST_FILTERS.map((k) => ({
                  value: k,
                  label: t(`filter.${k}`),
                  count: counts[k],
                }))}
              />
            }
            text={text}
            onText={setText}
            textLabel={t('filter.artists')}
            sort={sort}
            sorts={ARTIST_SORTS.map((k) => ({ value: k, label: t(`sort.${k}`) }))}
            onSort={(v) => setSort(v as ArtistSort)}
            items={shown}
            sortedOf={artistSorted}
            byName={sort === 'name'}
            view={view}
            label={t('tab.artists')}
            tile={(a) => <ArtistTile artist={a} />}
            table={(rows) => (
              <Table label={t('tab.artists')}>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('col.name')}</TableHead>
                    <TableHead>{t('col.genres')}</TableHead>
                    <TableHead numeric>{t('col.albums')}</TableHead>
                    <TableHead numeric>{t('col.tracks')}</TableHead>
                    <TableHead numeric>{t('col.size')}</TableHead>
                    <TableHead>{t('col.source')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody ref={rows} virtual={sort === 'name'}>
                  {shown.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell tall truncate>
                        <TitleCell
                          title={<TitleLink href={artistPath(a.id)}>{a.name}</TitleLink>}
                          detail={a.path}
                          art={a.photo}
                          aspect="square"
                        />
                      </TableCell>
                      <TableCell tall truncate>
                        <Text size={UI} color="text-2" numberOfLines={1}>
                          {a.genres.join(t('comma')) || t('none')}
                        </Text>
                      </TableCell>
                      <TableCell tall numeric>
                        {String(a.albums)}
                      </TableCell>
                      <TableCell tall numeric>
                        {String(a.tracks)}
                      </TableCell>
                      <TableCell tall numeric>
                        {bytes(a.size)}
                      </TableCell>
                      <TableCell tall>
                        <Badge tone={sourceBadge[a.source].tone}>
                          {t(sourceBadge[a.source].label)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          />
        )
      }
    </Loadable>
  )
}

/** An artist in the grid: their round photo, their name, and how many albums are here. */
function ArtistTile({ artist: a }: { artist: LibraryArtist }) {
  const t = useT(messages)
  return (
    <Poster
      title={a.name}
      src={a.photo}
      aspect="square"
      round
      href={artistPath(a.id)}
      showTitle
      titleSize="ui"
      caption={t('albums', { count: a.albums })}
    />
  )
}

// ——— Albums

const ALBUM_FILTERS = ['all', 'album', 'ep', 'soundtrack', 'compilation'] as const
type AlbumFilter = (typeof ALBUM_FILTERS)[number]
const albumMatches: Record<AlbumFilter, (a: LibraryAlbum) => boolean> = {
  all: () => true,
  album: (a) => a.kind === 'album',
  // EPs and singles together, as a library this size has few of either
  ep: (a) => a.kind === 'ep' || a.kind === 'single',
  soundtrack: (a) => a.kind === 'soundtrack',
  compilation: (a) => a.kind === 'compilation',
}
const ALBUM_SORTS = ['title', 'artist', 'added', 'year', 'size'] as const
type AlbumSort = (typeof ALBUM_SORTS)[number]
const albumCompare: Record<AlbumSort, (a: LibraryAlbum, b: LibraryAlbum) => number> = {
  title: (a, b) => a.sortTitle.localeCompare(b.sortTitle),
  // an artist's albums oldest first, as a discography reads
  artist: (a, b) => a.artist.name.localeCompare(b.artist.name) || (a.year ?? 0) - (b.year ?? 0),
  added: (a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt),
  year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
  size: (a, b) => b.size - a.size,
}

function Albums({ view, noFolders }: { view: 'grid' | 'table'; noFolders: boolean }) {
  const t = useT(messages)
  const albums = useQuery('music:albums', (c) => c.musicLibrary.albums(), MUSIC_TOPICS)
  const [filter, setFilter] = useState<AlbumFilter>('all')
  const [sort, setSort] = useState<AlbumSort>('title')
  const [text, setText] = useState('')
  const all = albums.data ?? NO_ALBUMS
  const counts = Object.fromEntries(
    ALBUM_FILTERS.map((k) => [k, all.filter(albumMatches[k]).length]),
  ) as Record<AlbumFilter, number>
  const shown = useMemo(() => {
    const q = text.trim().toLowerCase()
    return all
      .filter(albumMatches[filter])
      .filter(
        (a) =>
          !q ||
          a.title.toLowerCase().includes(q) ||
          a.artist.name.toLowerCase().includes(q) ||
          String(a.year ?? '').includes(q),
      )
      .sort(albumCompare[sort])
  }, [all, filter, text, sort])

  return (
    <Loadable
      query={albums}
      what={t('what.albums')}
      skeleton={view === 'grid' ? <PosterSkeletons /> : undefined}
    >
      {() =>
        all.length === 0 ? (
          <NoMusic noFolders={noFolders} />
        ) : (
          <Frame
            filters={
              <Tabs
                aria-label={t('filters')}
                value={filter}
                onValueChange={(v) => setFilter(v as AlbumFilter)}
                options={ALBUM_FILTERS.map((k) => ({
                  value: k,
                  label: t(`filter.${k}`),
                  count: counts[k],
                }))}
              />
            }
            text={text}
            onText={setText}
            textLabel={t('filter.albums')}
            sort={sort}
            sorts={ALBUM_SORTS.map((k) => ({ value: k, label: t(`sort.${k}`) }))}
            onSort={(v) => setSort(v as AlbumSort)}
            items={shown}
            sortedOf={albumSorted}
            byName={sort === 'title'}
            view={view}
            label={t('tab.albums')}
            tile={(a) => <AlbumTile album={a} />}
            table={(rows) => <AlbumTable albums={shown} rows={rows} virtual={sort === 'title'} />}
          />
        )
      }
    </Loadable>
  )
}

/** Albums as rows: Albums' table, and an artist's albums on their page. */
export function AlbumTable({
  albums,
  rows,
  virtual = false,
  artist = true,
}: {
  albums: LibraryAlbum[]
  rows?: Ref<VirtualList>
  virtual?: boolean
  /** The artist's column, which an artist's own page leaves out. */
  artist?: boolean
}) {
  const t = useT(messages)
  return (
    <Table label={t('tab.albums')}>
      <TableHeader>
        <TableRow>
          <TableHead>{t('col.title')}</TableHead>
          {artist && <TableHead>{t('col.artist')}</TableHead>}
          <TableHead numeric>{t('col.year')}</TableHead>
          <TableHead>{t('col.kind')}</TableHead>
          <TableHead numeric>{t('col.tracks')}</TableHead>
          <TableHead>{t('col.format')}</TableHead>
          <TableHead numeric>{t('col.size')}</TableHead>
          <TableHead>{t('col.source')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody ref={rows} virtual={virtual}>
        {albums.map((a) => (
          <TableRow key={a.id}>
            <TableCell tall truncate>
              <TitleCell
                title={<TitleLink href={albumPath(a.id)}>{a.title}</TitleLink>}
                detail={a.discs > 1 ? t('discs', { count: a.discs }) : undefined}
                art={a.cover}
                aspect="square"
              />
            </TableCell>
            {artist && (
              <TableCell tall truncate>
                <TitleLink href={artistPath(a.artist.id)}>{a.artist.name}</TitleLink>
              </TableCell>
            )}
            <TableCell tall numeric>
              {a.year ? String(a.year) : t('none')}
            </TableCell>
            <TableCell tall>
              <Text size={UI} color="text-2">
                {t(`kind.${a.kind}`)}
              </Text>
            </TableCell>
            <TableCell tall numeric>
              {String(a.tracks)}
            </TableCell>
            <TableCell tall>
              <Text size={UI} mono color="text-2" numberOfLines={1}>
                {formatsLine(a)}
              </Text>
            </TableCell>
            <TableCell tall numeric>
              {bytes(a.size)}
            </TableCell>
            <TableCell tall>
              <Badge tone={sourceBadge[a.source].tone}>{t(sourceBadge[a.source].label)}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** An album in the grid: its square cover, its title, and its artist and year under it. */
export function AlbumTile({ album: a, artist = true }: { album: LibraryAlbum; artist?: boolean }) {
  const t = useT(messages)
  const caption = [
    artist ? a.artist.name : null,
    a.year ? String(a.year) : null,
    a.kind !== 'album' ? t(`kind.${a.kind}`) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Poster
      title={a.title}
      src={a.cover}
      aspect="square"
      href={albumPath(a.id)}
      showTitle
      titleSize="ui"
      caption={caption || undefined}
    />
  )
}

// ——— what Artists and Albums share

/** The frame round a list: its toolbar (filters, text filter, sort), then the grid or the table. */
function Frame<T extends { id: string }>({
  filters,
  text,
  onText,
  textLabel,
  sort,
  sorts,
  onSort,
  items,
  sortedOf,
  byName,
  view,
  label,
  tile,
  table,
}: {
  filters: ReactNode
  text: string
  onText: (v: string) => void
  textLabel: string
  sort: string
  sorts: { value: string; label: string }[]
  onSort: (v: string) => void
  items: T[]
  sortedOf: (item: T) => string
  byName: boolean
  view: 'grid' | 'table'
  label: string
  tile: (item: T) => ReactNode
  table: (rows: Ref<VirtualList>) => ReactNode
}) {
  const t = useT(messages)
  const letters = useLetters(items, sortedOf, byName)
  const reduced = useMotionReduced()
  const posters = useRef<VirtualGridHandle>(null)
  const rows = useRef<VirtualList>(null)
  const jump = (l: string) => {
    const at = letters.firsts.get(l) ?? 0
    const options = { animated: !reduced, offset: STUCK }
    if (view === 'grid') posters.current?.toItem(at, options)
    else rows.current?.scrollToIndex(at, options)
  }
  return (
    <TableFrame>
      <TableToolbar>
        {filters}
        <View
          style={{
            marginStart: 'auto',
            minWidth: 0,
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: s['2'],
          }}
        >
          <View style={{ width: admin.filterWidth }}>
            <SearchField
              label={textLabel}
              icon="filter"
              value={text}
              onChangeText={onText}
              placeholder={t('filter')}
            />
          </View>
          <View style={{ width: admin.selectWidth }}>
            <Select value={sort} onValueChange={onSort} aria-label={t('sortBy')} options={sorts} />
          </View>
        </View>
      </TableToolbar>
      <WithLetters
        shown={byName && items.length > 0}
        present={letters.present}
        label={t('letters')}
        inset={admin.table.cellX}
        onLetter={jump}
      >
        {items.length === 0 ? (
          <View style={{ padding: s['8'], alignItems: 'center' }}>
            <Text size={UI} color="text-3">
              {t('noMatch')}
            </Text>
          </View>
        ) : view === 'grid' ? (
          <View style={{ padding: admin.table.cellX }}>
            <LibraryPosters
              ref={posters}
              items={items}
              keyOf={keyOf}
              label={label}
              render={(x) => tile(x)}
              square
            />
          </View>
        ) : (
          table(rows)
        )}
      </WithLetters>
    </TableFrame>
  )
}

// ——— Unmatched

function Unmatched() {
  const t = useT(messages)
  const locale = useLocale()
  const unmatched = useQuery('music:unmatched', (c) => c.musicLibrary.unmatched(), MUSIC_TOPICS)
  const [matching, setMatching] = useState<UnmatchedMusic | null>(null)
  const ignore = useAction((c, id: string) => c.musicLibrary.ignore({ params: { id } }))
  const [ignoring, setIgnoring] = useState<UnmatchedMusic | null>(null)
  const now = Date.now()

  const doIgnore = (u: UnmatchedMusic) =>
    ignore.run(u.id).then(
      () => toast.success(t('ignored', { path: u.path })),
      (e) => toast.error(t('ignore.failed'), { description: (e as Error).message }),
    )

  return (
    <>
      <Loadable query={unmatched} what={t('what.unmatched')}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState icon="success" title={t('unmatched.empty.title')}>
              {t('unmatched.empty.body')}
            </EmptyState>
          ) : (
            <View style={{ gap: s['4'], minWidth: 0 }}>
              <Text size={UI} color="text-2">
                {t('unmatched.intro')}
              </Text>
              <TableFrame>
                <Table label={t('unmatched.table')}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('col.folder')}</TableHead>
                      <TableHead numeric>{t('col.files')}</TableHead>
                      <TableHead numeric>{t('col.size')}</TableHead>
                      <TableHead>{t('col.why')}</TableHead>
                      <TableHead>{t('col.found')}</TableHead>
                      <TableHead>{t('col.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell tall truncate>
                          <Text size={UI} mono numberOfLines={1}>
                            {u.path}
                          </Text>
                        </TableCell>
                        <TableCell tall numeric>
                          {String(u.files)}
                        </TableCell>
                        <TableCell tall numeric>
                          {bytes(u.size)}
                        </TableCell>
                        <TableCell tall>
                          <View style={{ gap: s['1'], alignItems: 'flex-start' }}>
                            <Badge tone={unmatchedTone[u.reason]}>{t(`reason.${u.reason}`)}</Badge>
                            <Text
                              size={tokens.adminText.release.size}
                              leading={tokens.adminText.release.leading}
                              color="text-3"
                            >
                              {t(`reasonHint.${u.reason}`)}
                            </Text>
                          </View>
                        </TableCell>
                        <TableCell tall>
                          <Text size={UI} color="text-2">
                            {relative(u.foundAt, now, locale)}
                          </Text>
                        </TableCell>
                        <TableCell tall>
                          <View style={{ flexDirection: 'row', gap: s['2'] }}>
                            <Button
                              size="sm"
                              icon="check"
                              accessibilityLabel={t('match.label', { path: u.path })}
                              onPress={() => setMatching(u)}
                            >
                              {t('match')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              accessibilityLabel={t('ignore.label', { path: u.path })}
                              onPress={() => setIgnoring(u)}
                            >
                              {t('ignore')}
                            </Button>
                          </View>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableFrame>
            </View>
          )
        }
      </Loadable>
      <MatchDialog folder={matching} onClose={() => setMatching(null)} />
      <ConfirmDialog
        open={ignoring !== null}
        onClose={() => setIgnoring(null)}
        title={t('ignore.title')}
        description={t('ignore.body')}
        confirmLabel={t('ignore')}
        onConfirm={() => ignoring && doIgnore(ignoring)}
      />
    </>
  )
}

/**
 * Says what a set-aside folder is: its album artist, album and year, the tags' guess filled in.
 * The files and their tags stay as they are; highsea keeps the match (Lidarr's manual import, which
 * also leaves the files' tags alone until it's told to write them).
 */
function MatchDialog({ folder, onClose }: { folder: UnmatchedMusic | null; onClose: () => void }) {
  const t = useT(messages)
  // The dialog stays mounted and opens when `open` turns true, as ConfirmDialog does: one mounted
  // already open isn't animated in on the web. The last folder stays drawn while it fades out, and
  // a new one fills the fields from its tags (React's "adjusting state when a prop changes",
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [last, setLast] = useState(folder)
  const [artist, setArtist] = useState('')
  const [album, setAlbum] = useState('')
  const [year, setYear] = useState('')
  const [touched, setTouched] = useState(false)
  if (folder && folder !== last) {
    setLast(folder)
    setArtist(folder.guess.artist ?? '')
    setAlbum(folder.guess.album ?? '')
    setYear(folder.guess.year ? String(folder.guess.year) : '')
    setTouched(false)
  }
  const shown = folder ?? last
  const match = useAction((c, x: { id: string; body: MusicMatch }) =>
    c.musicLibrary.match({ params: { id: x.id }, body: x.body }),
  )
  const yearOk = year.trim() === '' || /^\d{4}$/.test(year.trim())
  const ok = artist.trim() !== '' && album.trim() !== '' && yearOk
  const submit = () => {
    setTouched(true)
    if (!ok || !folder) return
    match
      .run({
        id: folder.id,
        body: {
          artist: artist.trim(),
          album: album.trim(),
          year: year.trim() ? Number(year) : null,
        },
      })
      .then(
        () => {
          toast.success(t('matched', { album: album.trim() }))
          onClose()
        },
        (e) => toast.error(t('match.failed'), { description: (e as Error).message }),
      )
  }
  return (
    <Dialog
      open={folder !== null}
      onClose={onClose}
      closable
      size="sm"
      title={t('match.title')}
      description={t('match.body', { path: shown?.path ?? '' })}
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>
            {t('match.cancel')}
          </Button>
          <Button variant="primary" icon="check" loading={match.pending} onPress={submit}>
            {t('match.save')}
          </Button>
        </>
      }
    >
      <View style={{ gap: s['4'] }}>
        <Field
          label={t('match.artist')}
          hint={t('match.artistHint')}
          error={touched && !artist.trim() ? t('match.needed') : undefined}
        >
          <Input value={artist} onChangeText={setArtist} />
        </Field>
        <Field
          label={t('match.album')}
          error={touched && !album.trim() ? t('match.needed') : undefined}
        >
          <Input value={album} onChangeText={setAlbum} />
        </Field>
        <Field
          label={t('match.year')}
          hint={t('match.yearHint')}
          error={touched && !yearOk ? t('match.badYear') : undefined}
        >
          <Input inputMode="numeric" value={year} onChangeText={setYear} />
        </Field>
      </View>
    </Dialog>
  )
}

/** None yet, the same array each time so the filters aren't run again. */
const NO_ARTISTS: LibraryArtist[] = []
const NO_ALBUMS: LibraryAlbum[] = []
const NO_FIGURES: MusicFolder[] = []
const keyOf = (x: { id: string }) => x.id
const artistSorted = (a: LibraryArtist) => a.sortName
const albumSorted = (a: LibraryAlbum) => a.sortTitle

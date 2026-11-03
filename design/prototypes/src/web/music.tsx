// SPDX-License-Identifier: AGPL-3.0-only
// Music on the web and desktop: the music library in four views, Albums, Artists, Songs and
// Playlists, as Apple Music, Spotify, Plex and Navidrome split theirs. The page is Movies' (C3)
// with square covers in place of posters: the title and count, the view as a segmented control
// beside it, the filters at the right, and the A–Z index when it's sorted by name. Albums show the
// title and artist under the cover; artists are round photos with how many albums are here, as
// people are on the cast rows and their own pages, so the two views read apart at a glance. Songs
// are a list (web/music-lists.tsx), and Playlists the person's own, with New playlist at the
// right. Each view has its own address (/music, /music/artists, /music/songs, /music/playlists),
// so Back returns to the one you were on.
import { letterOf } from '@highsea-tv/client/library'
import type { ClientArtist } from '@highsea-tv/mock/types'
import {
  Button,
  cn,
  EmptyState,
  Poster,
  Select,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@highsea-tv/ui'
import { useState } from 'react'
import { useLocation } from 'wouter'
import { useMusic } from '../client/data.ts'
import {
  ALL_GENRES,
  type AlbumSort,
  type ArtistSort,
  albumIndexKey,
  albumSorts,
  albumsCount,
  arrangeAlbums,
  arrangeArtists,
  arrangeSongs,
  artistSorts,
  artistsCount,
  type MusicView,
  musicGenresOf,
  musicViews,
  playlistsCount,
  type SongSort,
  songGenresOf,
  songIndexKey,
  songSorts,
  songsCount,
} from '../client/music.ts'
import { useSongs } from '../client/playlists.ts'
import { usePlaylists } from '../client/song-menu.ts'
import { LetterIndex, stuck } from './library.tsx'
import { NewPlaylist, WebPlaylistGrid, WebSongList } from './music-lists.tsx'
import { gutter, webHref } from './shell.tsx'
import { useWindowChrome } from './window.tsx'

const grid = 'grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6'

export function WebMusic({ view }: { view: MusicView }) {
  const music = useMusic()
  const songs = useSongs()
  const lists = usePlaylists()
  const [, navigate] = useLocation()
  const [genre, setGenre] = useState(ALL_GENRES)
  const [albumSort, setAlbumSort] = useState<AlbumSort>('title')
  const [artistSort, setArtistSort] = useState<ArtistSort>('name')
  const [songSort, setSongSort] = useState<SongSort>('title')
  const place = useWindowChrome() === 'bar' ? 'bar' : 'under'
  const albums = music.data?.albums ?? []
  const artists = music.data?.artists ?? []
  const allSongs = songs.data ?? []
  const playlists = lists.data ?? []
  // the view's own query, for its loading and error states
  const query = view === 'songs' ? songs : view === 'playlists' ? lists : music

  const shownAlbums = arrangeAlbums(albums, genre, albumSort)
  const shownArtists = arrangeArtists(artists, artistSort)
  const shownSongs = arrangeSongs(allSongs, genre, songSort)
  // the key each card or row files under in A–Z, or null when the sort isn't by name
  const keys =
    view === 'albums'
      ? shownAlbums.map((a) => albumIndexKey(a, albumSort))
      : view === 'artists'
        ? shownArtists.map((a) => (artistSort === 'name' ? a.sortName : null))
        : view === 'songs'
          ? shownSongs.map((s) => songIndexKey(s, songSort))
          : []
  const byName =
    view === 'albums'
      ? albumIndexKey(albums[0] ?? null, albumSort) !== null
      : view === 'artists'
        ? artistSort === 'name'
        : view === 'songs' && ['title', 'artist', 'album'].includes(songSort)
  const indexed = byName && query.status === 'success' && keys.length > 0
  const present = new Set(keys.map((k) => letterOf(k ?? '')))
  const first = (i: number) => {
    if (!indexed) return {}
    const l = letterOf(keys[i] ?? '')
    return i === 0 || letterOf(keys[i - 1] ?? '') !== l ? { 'data-letter': l } : {}
  }
  const genres = (
    <Select
      aria-label="Genre"
      value={genre}
      onValueChange={setGenre}
      options={[
        { value: ALL_GENRES, label: 'All genres' },
        ...(view === 'songs' ? songGenresOf(allSongs) : musicGenresOf(albums)).map((g) => ({
          value: g,
          label: g,
        })),
      ]}
      className="w-44"
    />
  )
  const count = {
    albums: albumsCount(albums.length),
    artists: artistsCount(artists.length),
    songs: songsCount(allSongs.length),
    playlists: playlistsCount(playlists.length),
  }[view]

  return (
    // the whole page is the tabs' root, so each view's grid is its panel
    <Tabs
      value={view}
      onValueChange={(v) => navigate(musicViews.find((x) => x.value === v)?.path ?? '/music')}
      asChild
    >
      <main
        className={cn(
          'mx-auto grid w-full max-w-[1680px] grid-cols-[minmax(0,1fr)] gap-6 pt-6 pb-16',
          gutter,
        )}
      >
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="grid gap-1">
            <h1 className="text-heading">Music</h1>
            {query.status === 'loading' && <Skeleton className="my-0.5 h-3 w-28" />}
            {query.status === 'success' && <p className="text-caption text-text-3">{count}</p>}
          </div>
          <TabsList aria-label="View" className="mb-0.5">
            {musicViews.map((v) => (
              <TabsTrigger key={v.value} value={v.value}>
                {v.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="ms-auto flex flex-wrap gap-2">
            {view === 'albums' ? (
              <>
                {genres}
                <Select
                  aria-label="Sort"
                  value={albumSort}
                  onValueChange={(v) => setAlbumSort(v as AlbumSort)}
                  options={albumSorts}
                  className="w-44"
                />
              </>
            ) : view === 'artists' ? (
              <Select
                aria-label="Sort"
                value={artistSort}
                onValueChange={(v) => setArtistSort(v as ArtistSort)}
                options={artistSorts}
                className="w-44"
              />
            ) : view === 'songs' ? (
              <>
                {genres}
                <Select
                  aria-label="Sort"
                  value={songSort}
                  onValueChange={(v) => setSongSort(v as SongSort)}
                  options={songSorts}
                  className="w-44"
                />
              </>
            ) : (
              lists.status === 'success' && playlists.length > 0 && <NewPlaylist />
            )}
          </div>
        </div>
        <div className="flex items-start">
          <LetterIndex
            shown={indexed || (byName && query.status === 'loading')}
            present={present}
            place={place}
          />
          <TabsContent value={view} className="min-w-0 flex-1">
            {query.status === 'loading' ? (
              view === 'songs' ? (
                <div aria-busy className="grid gap-1">
                  {Array.from({ length: 12 }, (_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
                    <Skeleton key={i} className="h-12" />
                  ))}
                </div>
              ) : (
                <div aria-busy className={grid}>
                  {Array.from({ length: 14 }, (_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
                    <MusicCardSkeleton key={i} round={view === 'artists'} />
                  ))}
                </div>
              )
            ) : query.status === 'error' ? (
              <EmptyState
                tone="error"
                icon="alert"
                title="Couldn’t load the music"
                action={<Button onClick={query.refetch}>Try again</Button>}
              >
                {query.error.message}
              </EmptyState>
            ) : view === 'playlists' ? (
              <WebPlaylistGrid playlists={playlists} />
            ) : albums.length === 0 && allSongs.length === 0 ? (
              <EmptyState icon="library" title="No music yet">
                When the server’s owner adds music, it shows up here.
              </EmptyState>
            ) : view === 'albums' && shownAlbums.length === 0 ? (
              <EmptyState
                icon="filter"
                title="Nothing matches"
                action={<Button onClick={() => setGenre(ALL_GENRES)}>Show everything</Button>}
              >
                Try another genre.
              </EmptyState>
            ) : view === 'songs' && shownSongs.length === 0 ? (
              <EmptyState
                icon="filter"
                title="Nothing matches"
                action={<Button onClick={() => setGenre(ALL_GENRES)}>Show everything</Button>}
              >
                Try another genre.
              </EmptyState>
            ) : view === 'songs' ? (
              <WebSongList songs={shownSongs} first={first} itemClassName={stuck.margin[place]} />
            ) : view === 'albums' ? (
              <ul aria-label="Albums" className={grid}>
                {shownAlbums.map((a, i) => (
                  <li key={a.id} {...first(i)} className={stuck.margin[place]}>
                    <Poster
                      aspect="square"
                      title={a.title}
                      src={a.cover}
                      href={webHref(`/music/albums/${a.id}`)}
                      showTitle
                      titleSize="body"
                      caption={a.artist.name}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <ul aria-label="Artists" className={grid}>
                {shownArtists.map((a, i) => (
                  <li key={a.id} {...first(i)} className={stuck.margin[place]}>
                    <ArtistCard artist={a} />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </div>
      </main>
    </Tabs>
  )
}

/** An artist: their round photo, the name and how many albums are here, centred under it. */
export function ArtistCard({ artist: a }: { artist: ClientArtist }) {
  return (
    <a
      href={webHref(`/music/artists/${a.id}`)}
      className="group/link grid min-w-0 justify-items-center gap-2 rounded-poster text-center outline-none focus-visible:z-10"
    >
      <img
        src={a.photo}
        alt=""
        loading="lazy"
        className="aspect-square w-full rounded-full bg-s2 object-cover shadow-[inset_0_0_0_1px_rgb(255_255_255/0.04)] transition-lift group-hover/link:scale-(--scale-poster) group-focus-visible/link:scale-(--scale-poster) group-focus-visible/link:ring-focus"
      />
      <span className="grid gap-0.5">
        <span className="line-clamp-2 font-semibold text-body text-text">{a.name}</span>
        <span className="text-caption text-text-3">{albumsCount(a.albums)}</span>
      </span>
    </a>
  )
}

export function MusicCardSkeleton({ round }: { round: boolean }) {
  return (
    <div aria-hidden className="min-w-0">
      <Skeleton className={cn('aspect-square', round ? 'rounded-full' : 'rounded-poster')} />
      <div className={cn('mt-2 grid gap-1.5 py-1', round && 'justify-items-center')}>
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3 w-2/5" />
      </div>
    </div>
  )
}

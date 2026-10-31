// SPDX-License-Identifier: AGPL-3.0-only
// Music on the web and desktop: the music library in two views, Albums and Artists, as Apple Music,
// Spotify, Plex and Navidrome split theirs. The page is Movies' (C3) with square covers in place of
// posters: the title and count, the view as a segmented control beside it, the filters at the
// right, and the A–Z index when it's sorted by name. Albums show the title and artist under the
// cover; artists are round photos with how many albums are here, as people are on the cast rows
// and their own pages, so the two views read apart at a glance. Each view has its own address
// (/music and /music/artists), so Back returns to the one you were on.
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
} from '@highsea-tv/ui-web'
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
  artistSorts,
  artistsCount,
  type MusicView,
  musicGenresOf,
} from '../client/music.ts'
import type { ClientArtist } from '../mock/types.ts'
import { LetterIndex, letterOf, stuck } from './library.tsx'
import { gutter, webHref } from './shell.tsx'
import { useWindowChrome } from './window.tsx'

const grid = 'grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6'

export function WebMusic({ view }: { view: MusicView }) {
  const music = useMusic()
  const [, navigate] = useLocation()
  const [genre, setGenre] = useState(ALL_GENRES)
  const [albumSort, setAlbumSort] = useState<AlbumSort>('title')
  const [artistSort, setArtistSort] = useState<ArtistSort>('name')
  const place = useWindowChrome() === 'bar' ? 'bar' : 'under'
  const albums = music.data?.albums ?? []
  const artists = music.data?.artists ?? []

  const shownAlbums = arrangeAlbums(albums, genre, albumSort)
  const shownArtists = arrangeArtists(artists, artistSort)
  // the key each card files under in A–Z, or null when the sort isn't by name
  const keys =
    view === 'albums'
      ? shownAlbums.map((a) => albumIndexKey(a, albumSort))
      : shownArtists.map((a) => (artistSort === 'name' ? a.sortName : null))
  const byName =
    view === 'albums' ? albumIndexKey(albums[0] ?? null, albumSort) !== null : artistSort === 'name'
  const indexed = byName && music.status === 'success' && keys.length > 0
  const present = new Set(keys.map((k) => letterOf(k ?? '')))
  const first = (i: number) => {
    if (!indexed) return {}
    const l = letterOf(keys[i] ?? '')
    return i === 0 || letterOf(keys[i - 1] ?? '') !== l ? { 'data-letter': l } : {}
  }

  return (
    // the whole page is the tabs' root, so each view's grid is its panel
    <Tabs
      value={view}
      onValueChange={(v) => navigate(v === 'artists' ? '/music/artists' : '/music')}
      asChild
    >
      <main className={cn('mx-auto w-full grid max-w-[1680px] gap-6 pt-6 pb-16', gutter)}>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="grid gap-1">
            <h1 className="text-heading">Music</h1>
            {music.status === 'loading' && <Skeleton className="my-0.5 h-3 w-28" />}
            {music.status === 'success' && (
              <p className="text-caption text-text-3">
                {view === 'albums' ? albumsCount(albums.length) : artistsCount(artists.length)}
              </p>
            )}
          </div>
          <TabsList aria-label="View" className="mb-0.5">
            <TabsTrigger value="albums">Albums</TabsTrigger>
            <TabsTrigger value="artists">Artists</TabsTrigger>
          </TabsList>
          <div className="ms-auto flex flex-wrap gap-2">
            {view === 'albums' ? (
              <>
                <Select
                  aria-label="Genre"
                  value={genre}
                  onValueChange={setGenre}
                  options={[
                    { value: ALL_GENRES, label: 'All genres' },
                    ...musicGenresOf(albums).map((g) => ({ value: g, label: g })),
                  ]}
                  className="w-44"
                />
                <Select
                  aria-label="Sort"
                  value={albumSort}
                  onValueChange={(v) => setAlbumSort(v as AlbumSort)}
                  options={albumSorts}
                  className="w-44"
                />
              </>
            ) : (
              <Select
                aria-label="Sort"
                value={artistSort}
                onValueChange={(v) => setArtistSort(v as ArtistSort)}
                options={artistSorts}
                className="w-44"
              />
            )}
          </div>
        </div>
        <div className="flex items-start">
          <LetterIndex
            shown={indexed || (byName && music.status === 'loading')}
            present={present}
            place={place}
          />
          <TabsContent value={view} className="min-w-0 flex-1">
            {music.status === 'loading' ? (
              <div aria-busy className={grid}>
                {Array.from({ length: 14 }, (_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
                  <MusicCardSkeleton key={i} round={view === 'artists'} />
                ))}
              </div>
            ) : music.status === 'error' ? (
              <EmptyState
                tone="error"
                icon="alert"
                title="Couldn’t load the music"
                action={<Button onClick={music.refetch}>Try again</Button>}
              >
                {music.error.message}
              </EmptyState>
            ) : albums.length === 0 ? (
              <EmptyState icon="library" title="No music yet">
                When the server’s owner adds music, it shows up here.
              </EmptyState>
            ) : view === 'albums' && shownAlbums.length === 0 ? (
              <EmptyState icon="filter" title="No albums match">
                Try another genre.
              </EmptyState>
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

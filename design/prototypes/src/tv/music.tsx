// SPDX-License-Identifier: AGPL-3.0-only
// Music on the TV: Movies' grid (C3) with square covers, seven a row, and the alphabet rail when
// it's sorted by name. The view is a pair of choices beside the title, as Collections' are and as
// the Apple TV's Music app and NaviBeat put theirs; the sort is on the right, as on Movies. Albums
// show the title and artist under the cover; artists are round photos with how many albums are
// here, as people are on the cast rows. Up from the grid reaches the sort; Left and Right cross
// between the view and the sort.
import { cn } from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useMusic } from '../client/data.ts'
import {
  type AlbumSort,
  type ArtistSort,
  albumIndexKey,
  albumsCount,
  arrangeAlbums,
  arrangeArtists,
  type MusicView,
} from '../client/music.ts'
import type { ClientArtist } from '../mock/types.ts'
import { letterOf } from '../web/library.tsx'
import {
  TvButton,
  TvHead,
  TvMessage,
  TvTile,
  TvTileSkeleton,
  tvHref,
  useInitialFocus,
} from './kit.tsx'
import { motion, room, TvLetterRail, useIndexBox } from './library.tsx'

const choice =
  'rounded-full px-[1.2cqw] py-[0.45cqw] font-semibold text-(length:--tv-text-pill) text-text-2 outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:shadow-(--tv-focus-shadow) aria-pressed:bg-text/12 aria-pressed:text-text'

const views: { value: MusicView; label: string }[] = [
  { value: 'albums', label: 'Albums' },
  { value: 'artists', label: 'Artists' },
]

const albumChoices: { value: AlbumSort; label: string }[] = [
  { value: 'title', label: 'A–Z' },
  { value: 'artist', label: 'Artist' },
  { value: 'added', label: 'Recently added' },
  { value: 'year', label: 'Newest' },
]

const artistChoices: { value: ArtistSort; label: string }[] = [
  { value: 'name', label: 'A–Z' },
  { value: 'added', label: 'Recently added' },
]

const grid = 'grid grid-cols-7 gap-x-(--tv-poster-gap) gap-y-[1.6cqw]'

export function TvMusic() {
  const music = useMusic()
  const [view, setView] = useState<MusicView>('albums')
  const [albumSort, setAlbumSort] = useState<AlbumSort>('title')
  const [artistSort, setArtistSort] = useState<ArtistSort>('name')
  const index = useIndexBox(music.status)
  const titled =
    view === 'albums' ? albumSort === 'title' || albumSort === 'artist' : artistSort === 'name'
  // the grid's first title once it loads; after that, choosing a sort or view keeps focus on the
  // choice, so the next one is a press away (the owner, 2026-10-31, for every library)
  useInitialFocus(music.status === 'success', null, '[data-group="grid"] [data-focusable]')
  if (music.status === 'error')
    return (
      <TvMessage
        title="Couldn’t load the music"
        actions={
          <TvButton primary initial onClick={music.refetch}>
            Try again
          </TvButton>
        }
      >
        {music.error.message}
      </TvMessage>
    )
  const albums = arrangeAlbums(music.data?.albums ?? [], 'all', albumSort)
  const artists = arrangeArtists(music.data?.artists ?? [], artistSort)
  const empty = music.status === 'success' && albums.length === 0
  const keys =
    view === 'albums'
      ? albums.map((a) => albumIndexKey(a, albumSort) ?? '')
      : artists.map((a) => a.sortName)
  const present = new Set(keys.map(letterOf))
  const letter = (i: number) => {
    const l = letterOf(keys[i] ?? '')
    return titled && (i === 0 || letterOf(keys[i - 1] ?? '') !== l) ? { 'data-letter': l } : {}
  }
  return (
    <>
      <TvLetterRail index={index} shown={titled && !empty} present={present} />
      <main ref={index.main} className="absolute inset-0 overflow-hidden">
        <div
          data-scroll="y"
          data-keep="0.4"
          className="relative grid grid-cols-1 gap-[1.6cqw] px-(--tv-safe-x) pb-(--tv-safe-y) transition-lift"
        >
          {/* in the track, so it scrolls away with the page */}
          <TvHead down="view" />
          <div className="flex items-end gap-[2cqw]">
            <h1 className="font-semibold text-[2.6cqw] leading-none tracking-display">Music</h1>
            <div
              data-group="view"
              data-go-up="nav"
              data-go-down="grid"
              data-go-right="sort"
              className="flex gap-[0.8cqw]"
            >
              {views.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  data-focusable=""
                  aria-pressed={view === v.value}
                  onClick={() => setView(v.value)}
                  className={choice}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div
              data-group="sort"
              data-go-up="nav"
              data-go-down="grid"
              data-go-left="view"
              className="ms-auto flex gap-[0.8cqw]"
            >
              {view === 'albums'
                ? albumChoices.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      data-focusable=""
                      aria-pressed={albumSort === s.value}
                      onClick={() => setAlbumSort(s.value)}
                      className={choice}
                    >
                      {s.label}
                    </button>
                  ))
                : artistChoices.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      data-focusable=""
                      aria-pressed={artistSort === s.value}
                      onClick={() => setArtistSort(s.value)}
                      className={choice}
                    >
                      {s.label}
                    </button>
                  ))}
            </div>
          </div>
          {empty ? (
            <p className="text-(length:--tv-text-synopsis) text-text-2">
              No music yet. When the server’s owner adds music, it shows up here.
            </p>
          ) : (
            <div
              className={`grid transition-[grid-template-columns,column-gap] ${motion} ${titled ? room.open : room.shut}`}
            >
              {/* the rail's room; the rail itself stays put outside the moving track */}
              <div aria-hidden />
              {music.status === 'loading' && (
                <div aria-busy className={grid}>
                  {Array.from({ length: 14 }, (_, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
                    <TvTileSkeleton key={i} square round={view === 'artists'} />
                  ))}
                </div>
              )}
              <ul
                ref={index.grid}
                aria-label={view === 'albums' ? 'Albums' : 'Artists'}
                data-group="grid"
                data-go-left={titled ? 'alpha' : undefined}
                data-go-up="sort"
                className={grid}
              >
                {view === 'albums'
                  ? albums.map((a, i) => (
                      <li key={a.id} {...letter(i)}>
                        <TvTile
                          square
                          title={a.title}
                          caption={a.artist.name}
                          src={a.cover}
                          href={tvHref(`/music/albums/${a.id}`)}
                        />
                      </li>
                    ))
                  : artists.map((a, i) => (
                      <li key={a.id} {...letter(i)}>
                        <TvArtistTile artist={a} />
                      </li>
                    ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    </>
  )
}

/** An artist: the round photo, lifted and ringed with focus as a poster is, and the lines centred. */
function TvArtistTile({ artist: a }: { artist: ClientArtist }) {
  return (
    <a
      href={tvHref(`/music/artists/${a.id}`)}
      data-focusable=""
      aria-label={`${a.name}, ${albumsCount(a.albums)}`}
      className="group/link block rounded-full text-center outline-none"
    >
      <img
        src={a.photo}
        alt=""
        className={cn(
          'aspect-square w-full rounded-full bg-s2 object-cover transition-lift',
          'group-focus-visible/link:scale-(--scale-poster) group-focus-visible/link:ring-focus',
        )}
      />
      <span className="mt-[1cqw] block truncate font-semibold text-(length:--tv-text-meta) text-text-2 leading-[1.3] transition-lift group-focus-visible/link:text-text">
        {a.name}
      </span>
      <span className="block truncate text-(length:--tv-text-pill) text-text-3 leading-[1.3]">
        {albumsCount(a.albums)}
      </span>
    </a>
  )
}

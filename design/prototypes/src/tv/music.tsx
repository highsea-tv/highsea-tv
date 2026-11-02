// SPDX-License-Identifier: AGPL-3.0-only
// Music on the TV: Movies' grid (C3) with square covers, seven a row, and the alphabet rail when
// it's sorted by name. The view is a row of choices beside the title, as Collections' are and as
// the Apple TV's Music app and NaviBeat put theirs: Albums, Artists, Songs and Playlists
// (prototype-gaps.md › 3.8). The sort is on the right, as on Movies. Albums show the title and
// artist under the cover; artists are round photos with how many albums are here, as people are on
// the cast rows; songs are one list (tv/music-lists.tsx), and playlists the person's own, which
// the TV plays. Up from the grid reaches the sort; Left and Right cross between the view and the
// sort.
import { Chip, cn, Skeleton } from '@highsea-tv/ui'
import { useState } from 'react'
import { useMusic } from '../client/data.ts'
import {
  type AlbumSort,
  type ArtistSort,
  albumIndexKey,
  albumsCount,
  arrangeAlbums,
  arrangeArtists,
  arrangeSongs,
  type MusicView,
  musicViews,
  type SongSort,
  songIndexKey,
} from '../client/music.ts'
import { type PlayingFrom, useMusicPlayer } from '../client/music-player.ts'
import { useSongs } from '../client/playlists.ts'
import { usePlaylists } from '../client/song-menu.ts'
import type { ClientArtist, ClientLibrarySong } from '../mock/types.ts'
import { letterOf } from '../web/library.tsx'
import {
  TvButton,
  TvHead,
  TvMessage,
  TvTile,
  TvTileSkeleton,
  tvChip,
  tvHref,
  useInitialFocus,
} from './kit.tsx'
import { motion, room, TvLetterRail, useIndexBox } from './library.tsx'
import { TvPlaylistTile, TvSongRow } from './music-lists.tsx'
import { TvSongMenu } from './song-menu.tsx'

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

const songChoices: { value: SongSort; label: string }[] = [
  { value: 'title', label: 'A–Z' },
  { value: 'artist', label: 'Artist' },
  { value: 'album', label: 'Album' },
  { value: 'added', label: 'Recently added' },
  { value: 'plays', label: 'Most played' },
]

const grid = 'grid grid-cols-7 gap-x-(--tv-poster-gap) gap-y-[1.6cqw]'
const list = 'grid grid-cols-1 gap-[0.2cqw]'

const fromSongs: PlayingFrom = { kind: 'songs', name: 'Songs', to: '/music/songs' }

export function TvMusic({ initial = 'albums' }: { initial?: MusicView }) {
  const music = useMusic()
  const allSongs = useSongs()
  const lists = usePlaylists()
  const player = useMusicPlayer()
  const [view, setView] = useState<MusicView>(initial)
  const [albumSort, setAlbumSort] = useState<AlbumSort>('title')
  const [artistSort, setArtistSort] = useState<ArtistSort>('name')
  const [songSort, setSongSort] = useState<SongSort>('title')
  const [menu, setMenu] = useState<ClientLibrarySong | null>(null)
  // the view's own query, for its loading and error states
  const query = view === 'songs' ? allSongs : view === 'playlists' ? lists : music
  const index = useIndexBox(query.status)
  const titled =
    view === 'albums'
      ? albumSort === 'title' || albumSort === 'artist'
      : view === 'artists'
        ? artistSort === 'name'
        : view === 'songs' && ['title', 'artist', 'album'].includes(songSort)
  // the grid's first title once it loads; after that, choosing a sort or view keeps focus on the
  // choice, so the next one is a press away (the owner, 2026-10-31, for every library)
  useInitialFocus(query.status === 'success', null, '[data-group="grid"] [data-focusable]')
  if (query.status === 'error')
    return (
      <TvMessage
        title="Couldn’t load the music"
        actions={
          <TvButton primary initial onClick={query.refetch}>
            Try again
          </TvButton>
        }
      >
        {query.error.message}
      </TvMessage>
    )
  const albums = arrangeAlbums(music.data?.albums ?? [], 'all', albumSort)
  const artists = arrangeArtists(music.data?.artists ?? [], artistSort)
  const songs = arrangeSongs(allSongs.data ?? [], 'all', songSort)
  const playlists = lists.data ?? []
  const ids = songs.map((s) => s.id)
  const empty =
    view === 'playlists'
      ? lists.status === 'success' && playlists.length === 0
      : music.status === 'success' && albums.length === 0
  const keys =
    view === 'albums'
      ? albums.map((a) => albumIndexKey(a, albumSort) ?? '')
      : view === 'artists'
        ? artists.map((a) => a.sortName)
        : view === 'songs'
          ? songs.map((s) => songIndexKey(s, songSort) ?? '')
          : []
  const sort =
    view === 'albums'
      ? { choices: albumChoices, value: albumSort as string, set: setAlbumSort }
      : view === 'artists'
        ? { choices: artistChoices, value: artistSort as string, set: setArtistSort }
        : view === 'songs'
          ? { choices: songChoices, value: songSort as string, set: setSongSort }
          : null
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
              data-go-right={sort ? 'sort' : undefined}
              className="flex gap-[0.8cqw]"
            >
              {musicViews.map((v) => (
                <Chip
                  key={v.value}
                  data-focusable=""
                  selected={view === v.value}
                  onClick={() => setView(v.value)}
                  className={tvChip}
                >
                  {v.label}
                </Chip>
              ))}
            </div>
            {sort && (
              <div
                data-group="sort"
                data-go-up="nav"
                data-go-down="grid"
                data-go-left="view"
                className="ms-auto flex gap-[0.8cqw]"
              >
                {sort.choices.map((x) => (
                  <Chip
                    key={x.value}
                    data-focusable=""
                    selected={sort.value === x.value}
                    // biome-ignore lint/suspicious/noExplicitAny: each view's own sort type
                    onClick={() => (sort.set as (v: any) => void)(x.value)}
                    className={tvChip}
                  >
                    {x.label}
                  </Chip>
                ))}
              </div>
            )}
          </div>
          {empty ? (
            <p className="text-(length:--tv-text-synopsis) text-text-2">
              {view === 'playlists'
                ? 'No playlists yet. Make them in highsea on the web or your phone, and they show up here to play.'
                : 'No music yet. When the server’s owner adds music, it shows up here.'}
            </p>
          ) : (
            <div
              className={`grid transition-[grid-template-columns,column-gap] ${motion} ${titled ? room.open : room.shut}`}
            >
              {/* the rail's room; the rail itself stays put outside the moving track */}
              <div aria-hidden />
              {query.status === 'loading' && (
                <div aria-busy className={view === 'songs' ? list : grid}>
                  {Array.from({ length: 14 }, (_, i) =>
                    view === 'songs' ? (
                      // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
                      <Skeleton key={i} className="h-[4.4cqw] rounded-[0.5cqw]" />
                    ) : (
                      // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
                      <TvTileSkeleton key={i} square round={view === 'artists'} />
                    ),
                  )}
                </div>
              )}
              <ul
                ref={index.grid}
                aria-label={musicViews.find((v) => v.value === view)?.label}
                data-group="grid"
                data-go-left={titled ? 'alpha' : undefined}
                data-go-up={sort ? 'sort' : 'view'}
                className={view === 'songs' ? list : grid}
              >
                {view === 'songs'
                  ? songs.map((x, i) => (
                      <li key={x.id} {...letter(i)}>
                        <TvSongRow
                          song={x}
                          here={player.song?.id === x.id}
                          playing={player.playing}
                          onPlay={() =>
                            player.song?.id === x.id
                              ? player.toggle()
                              : player.play({ songs: ids }, { start: i, from: fromSongs })
                          }
                          onMenu={() => setMenu(x)}
                        />
                      </li>
                    ))
                  : view === 'playlists'
                    ? playlists.map((p) => (
                        <li key={p.id}>
                          <TvPlaylistTile playlist={p} />
                        </li>
                      ))
                    : view === 'albums'
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
      {menu && (
        <TvSongMenu
          target={{ songs: [menu.id], name: menu.title, album: menu.album }}
          line={`${menu.album.artist.name} · ${menu.album.title}`}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  )
}

/** An artist: the round photo, lifted and ringed with focus as a poster is, and the lines centred. */
export function TvArtistTile({ artist: a }: { artist: ClientArtist }) {
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

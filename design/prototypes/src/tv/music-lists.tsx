// SPDX-License-Identifier: AGPL-3.0-only
// Music's Songs and Playlists on the TV (prototype-gaps.md › 3.8). Songs is one list down the
// screen, as the Apple TV's Music app has it: the cover, the title and artist, the album and the
// length; OK plays the list from there on, and OK held opens the song's menu. Playlists are the
// person's own as tiles of their mosaic; the TV plays them, and they're made and changed in the
// other apps.

import type { ClientLibrarySong, ClientPlaylist } from '@highsea-tv/mock/types'
import { cn } from '@highsea-tv/ui'
import { useLongPress } from '../client/continue-menu.ts'
import { songsCount, songTime } from '../client/music.ts'
import { PlaylistMosaic } from '../client/playlist-picker.tsx'
import { PlayingBars } from '../client/waveform.tsx'
import { song } from './album.tsx'
import { tvHref } from './kit.tsx'

/** A song with its cover, artist and album: OK plays it, OK held opens its menu. */
export function TvSongRow({
  song: s,
  here,
  playing,
  onPlay,
  onMenu,
}: {
  song: ClientLibrarySong
  here: boolean
  playing: boolean
  onPlay: () => void
  onMenu: () => void
}) {
  const press = useLongPress(onMenu)
  return (
    <button
      type="button"
      data-focusable=""
      aria-label={
        here && playing
          ? `Pause ${s.title}`
          : `Play ${s.title}, ${s.album.artist.name}, ${songTime(s.duration)}. Hold OK for more.`
      }
      aria-current={here ? 'true' : undefined}
      onClick={onPlay}
      {...press}
      className={cn(
        song,
        'grid-cols-[3.2cqw_minmax(0,3fr)_minmax(0,2fr)_auto] py-[0.6cqw]',
        here && 'text-accent-text',
      )}
    >
      <span className="relative size-[3.2cqw]">
        <img src={s.album.cover} alt="" className="size-full rounded-[0.4cqw] bg-s2 object-cover" />
        {here && (
          <span className="absolute inset-0 grid place-items-center rounded-[0.4cqw] bg-[rgb(0_0_0/0.5)] text-accent-text">
            <PlayingBars playing={playing} />
          </span>
        )}
      </span>
      <span className="grid min-w-0">
        <span className="truncate">{s.title}</span>
        <span className="truncate text-(length:--tv-text-pill) opacity-70">
          {s.album.artist.name}
        </span>
      </span>
      <span className="truncate text-(length:--tv-text-pill) opacity-70">{s.album.title}</span>
      <span className="text-(length:--tv-text-pill) tabular-nums opacity-70">
        {songTime(s.duration)}
      </span>
    </button>
  )
}

/** A playlist: the mosaic, lifted and ringed with focus as a poster is, the name and count. */
export function TvPlaylistTile({ playlist: p }: { playlist: ClientPlaylist }) {
  return (
    <a
      href={tvHref(`/music/playlists/${p.id}`)}
      data-focusable=""
      aria-label={`${p.name}, ${songsCount(p.songs)}`}
      className="group/link block rounded-(--tv-radius-poster) outline-none"
    >
      <PlaylistMosaic
        covers={p.covers}
        className="w-full rounded-(--tv-radius-poster) transition-lift group-focus-visible/link:scale-(--scale-poster) group-focus-visible/link:ring-focus"
      />
      <span className="mt-[1cqw] block truncate font-semibold text-(length:--tv-text-meta) text-text-2 leading-[1.3] transition-lift group-focus-visible/link:text-text">
        {p.name}
      </span>
      <span className="block truncate text-(length:--tv-text-pill) text-text-3 leading-[1.3]">
        {songsCount(p.songs)}
      </span>
    </a>
  )
}

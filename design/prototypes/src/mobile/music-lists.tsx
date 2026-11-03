// SPDX-License-Identifier: AGPL-3.0-only
// Music's Songs and Playlists views on the phone (prototype-gaps.md › 3.8), as Apple Music's
// iPhone app lists them. A song is its cover, the title, the artist and album, and ⋯ (a long press
// opens the menu too); a tap plays the list from there on. Playlists start with New playlist,
// which asks for a name in a sheet and opens the new one, then the person's own with their mosaic
// and count.

import type { ClientLibrarySong, ClientPlaylist } from '@highsea-tv/mock/types'
import { cn, EmptyState, Icon, Sheet, SheetContent } from '@highsea-tv/ui'
import { type ReactNode, useState } from 'react'
import { useLocation } from 'wouter'
import { useLongPress } from '../client/continue-menu.ts'
import { songsCount, songTime } from '../client/music.ts'
import { type PlayingFrom, useMusicPlayer } from '../client/music-player.ts'
import { PlaylistMosaic, PlaylistNameForm } from '../client/playlist-picker.tsx'
import { PlayingBars } from '../client/waveform.tsx'
import { useAction } from '../mock/hooks.tsx'
import { mobileHref } from './shell.tsx'
import { MobileSongMenu, MoreButton } from './song-menu.tsx'

const fromSongs: PlayingFrom = { kind: 'songs', name: 'Songs', to: '/music/songs' }

export function MobileSongList({
  songs,
  mark,
}: {
  songs: ClientLibrarySong[]
  /** The A–Z scrubber's mark on the first song of each letter. */
  mark?: (i: number) => { 'data-letter'?: string }
}) {
  const player = useMusicPlayer()
  const ids = songs.map((s) => s.id)
  return (
    <ul aria-label="Songs" className="grid">
      {songs.map((s, i) => {
        const here = player.song?.id === s.id
        return (
          <MobileSongRow
            key={s.id}
            song={s}
            here={here}
            playing={player.playing}
            letter={mark?.(i)['data-letter']}
            onPlay={() =>
              here ? player.toggle() : player.play({ songs: ids }, { start: i, from: fromSongs })
            }
          />
        )
      })}
    </ul>
  )
}

/** A song: a tap plays it (or pauses it, when it's the one playing); ⋯ or a long press, its menu. */
export function MobileSongRow({
  song: s,
  here,
  playing,
  onPlay,
  onRemove,
  handle,
  letter,
  as: Row = 'li',
}: {
  song: ClientLibrarySong
  here: boolean
  playing: boolean
  onPlay: () => void
  /** On a playlist's page: Remove from this playlist, in the menu. */
  onRemove?: () => void
  /** On a playlist's page: the handle that reorders it. */
  handle?: ReactNode
  /** In Songs sorted by name: the letter this song is the first of, for the A–Z scrubber. */
  letter?: string
  as?: 'li' | 'div'
}) {
  const [menu, setMenu] = useState(false)
  const press = useLongPress(() => setMenu(true))
  return (
    <Row
      data-letter={letter}
      className={cn(
        'grid items-center gap-1',
        handle ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]',
      )}
    >
      {handle}
      <button
        type="button"
        aria-label={
          here && playing
            ? `Pause ${s.title}`
            : `Play ${s.title}, ${s.album.artist.name}, ${songTime(s.duration)}`
        }
        aria-current={here ? 'true' : undefined}
        onClick={onPlay}
        {...press}
        className="grid min-h-14 w-full min-w-0 cursor-pointer grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 rounded-sm py-1 text-start outline-none focus-visible:ring-focus"
      >
        <span className="relative size-12">
          <img src={s.album.cover} alt="" className="size-12 rounded-[6px] bg-s2 object-cover" />
          {here && (
            <span className="absolute inset-0 grid place-items-center rounded-[6px] bg-[rgb(0_0_0/0.5)]">
              <PlayingBars playing={playing} className="text-[15px] text-accent-text" />
            </span>
          )}
        </span>
        <span className="grid min-w-0">
          <span className={cn('truncate text-[15px]', here ? 'text-accent-text' : 'text-text')}>
            {s.title}
          </span>
          <span className="truncate text-[13px] text-text-3">
            {s.album.artist.name} · {s.album.title}
          </span>
        </span>
      </button>
      <MoreButton name={s.title} onClick={() => setMenu(true)} />
      <MobileSongMenu
        target={{ songs: [s.id], name: s.title, album: s.album }}
        open={menu}
        onOpenChange={setMenu}
        onRemove={onRemove}
      />
    </Row>
  )
}

const row =
  'grid min-h-16 w-full cursor-pointer grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-sm py-1 text-start outline-none focus-visible:ring-focus'

/** New playlist first, then the person's playlists. */
export function MobilePlaylistList({ playlists }: { playlists: ClientPlaylist[] }) {
  const [naming, setNaming] = useState(false)
  return (
    <div className="grid gap-4">
      <ul aria-label="Playlists" className="grid">
        <li>
          <button type="button" onClick={() => setNaming(true)} className={row}>
            <span className="grid size-14 place-items-center rounded-[6px] bg-s2 text-accent-text">
              <Icon name="add" size={24} />
            </span>
            <span className="font-semibold text-[15px] text-accent-text">New playlist</span>
          </button>
        </li>
        {playlists.map((p) => (
          <li key={p.id}>
            <a href={mobileHref(`/music/playlists/${p.id}`)} className={row}>
              <PlaylistMosaic covers={p.covers} className="size-14" />
              <span className="grid min-w-0">
                <span className="truncate font-semibold text-[15px] text-text">{p.name}</span>
                <span className="text-[13px] text-text-3">{songsCount(p.songs)}</span>
              </span>
              <Icon name="chevron-right" size={18} className="text-text-3" />
            </a>
          </li>
        ))}
      </ul>
      {playlists.length === 0 && (
        <EmptyState icon="queue" title="No playlists yet">
          Make one with New playlist, or choose Add to playlist in a song’s or an album’s menu.
        </EmptyState>
      )}
      <NewPlaylistSheet open={naming} onOpenChange={setNaming} />
    </div>
  )
}

function NewPlaylistSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [, navigate] = useLocation()
  const create = useAction((c, name: string) => c.playlists.create(name))
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="New playlist">
        {open && (
          <PlaylistNameForm
            submit="Make playlist"
            onCancel={() => onOpenChange(false)}
            onDone={async (name) => {
              const p = await create.run(name)
              onOpenChange(false)
              navigate(`/music/playlists/${p.id}`)
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

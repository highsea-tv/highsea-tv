// SPDX-License-Identifier: AGPL-3.0-only
// Music's Songs and Playlists views on the web and desktop (prototype-gaps.md › 3.8). Songs is a
// list as Apple Music's is: the cover, the title and artist, the album, the length, and the
// song's ⋯ menu; a row plays the list from there on. Playlists are the person's own, as square
// mosaics of their first four covers, with New playlist at the right of the page's head, or in
// the empty view, which says how to make one.
import { Button, cn, Dialog, DialogContent, EmptyState, Icon } from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useLocation } from 'wouter'
import { songsCount, songTime } from '../client/music.ts'
import { type PlayingFrom, useMusicPlayer } from '../client/music-player.ts'
import { PlaylistMosaic, PlaylistNameForm } from '../client/playlist-picker.tsx'
import { PlayingBars } from '../client/waveform.tsx'
import { useAction } from '../mock/hooks.tsx'
import type { ClientLibrarySong, ClientPlaylist } from '../mock/types.ts'
import { webHref } from './shell.tsx'
import { WebSongMenu } from './song-menu.tsx'

const fromSongs: PlayingFrom = { kind: 'songs', name: 'Songs', to: '/music/songs' }

/** Songs, each playing the list from there on. */
export function WebSongList({
  songs,
  first,
  itemClassName,
}: {
  songs: ClientLibrarySong[]
  /** The A–Z index's mark on the first row of each letter. */
  first: (i: number) => object
  itemClassName?: string
}) {
  const player = useMusicPlayer()
  const ids = songs.map((s) => s.id)
  return (
    <ul aria-label="Songs" className="grid border-line border-t">
      {songs.map((s, i) => {
        const here = player.song?.id === s.id
        return (
          <li
            key={s.id}
            {...first(i)}
            className={cn(
              'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 border-line border-b pe-1',
              itemClassName,
            )}
          >
            <SongButton
              song={s}
              here={here}
              playing={player.playing}
              onPlay={() =>
                here ? player.toggle() : player.play({ songs: ids }, { start: i, from: fromSongs })
              }
            />
            <WebSongMenu target={{ songs: [s.id], name: s.title, album: s.album }} />
          </li>
        )
      })}
    </ul>
  )
}

/**
 * A song's row: its cover (a play icon under the pointer, the playing mark while it's the song
 * playing), the title and artist, the album from medium widths, and the length.
 */
export function SongButton({
  song: s,
  here,
  playing,
  onPlay,
}: {
  song: ClientLibrarySong
  here: boolean
  playing: boolean
  onPlay: () => void
}) {
  return (
    <button
      type="button"
      aria-label={
        here && playing
          ? `Pause ${s.title}`
          : `Play ${s.title}, ${s.album.artist.name}, ${songTime(s.duration)}`
      }
      aria-current={here ? 'true' : undefined}
      onClick={onPlay}
      className="group/song grid min-h-14 w-full min-w-0 cursor-pointer grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-sm px-2 text-start outline-none hover:bg-s1 focus-visible:ring-focus medium:grid-cols-[2.5rem_minmax(0,3fr)_minmax(0,2fr)_auto]"
    >
      <span className="relative grid size-10 place-items-center">
        <img src={s.album.cover} alt="" className="size-10 rounded-[6px] bg-s2 object-cover" />
        <span
          className={cn(
            'absolute inset-0 grid place-items-center rounded-[6px] bg-[rgb(0_0_0/0.5)] text-accent-text',
            here ? 'grid' : 'hidden group-hover/song:grid',
          )}
        >
          {here && (
            <PlayingBars playing={playing} className="text-accent-text group-hover/song:hidden" />
          )}
          <Icon
            name={here && playing ? 'pause' : 'play'}
            size={14}
            className={here ? 'hidden group-hover/song:block' : undefined}
          />
        </span>
      </span>
      <span className="grid min-w-0">
        <span className={cn('truncate text-body', here ? 'text-accent-text' : 'text-text')}>
          {s.title}
        </span>
        <span className="truncate text-caption text-text-3">{s.album.artist.name}</span>
      </span>
      <span className="hidden truncate text-caption text-text-2 medium:block">{s.album.title}</span>
      <span className="text-caption text-text-3 tabular-nums">{songTime(s.duration)}</span>
    </button>
  )
}

const grid = 'grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6'

/** The person's playlists, or how to make one. */
export function WebPlaylistGrid({ playlists }: { playlists: ClientPlaylist[] }) {
  if (playlists.length === 0)
    return (
      <EmptyState icon="queue" title="No playlists yet" action={<NewPlaylist primary />}>
        Make one here, or choose Add to playlist in a song’s or an album’s menu.
      </EmptyState>
    )
  return (
    <ul aria-label="Playlists" className={grid}>
      {playlists.map((p) => (
        <li key={p.id}>
          <a
            href={webHref(`/music/playlists/${p.id}`)}
            className="group/link grid min-w-0 gap-2 rounded-poster outline-none focus-visible:z-10"
          >
            <PlaylistMosaic
              covers={p.covers}
              className="w-full rounded-poster shadow-[inset_0_0_0_1px_rgb(255_255_255/0.04)] transition-lift group-hover/link:scale-(--scale-poster) group-focus-visible/link:scale-(--scale-poster) group-focus-visible/link:ring-focus"
            />
            <span className="grid gap-0.5">
              <span className="line-clamp-2 font-semibold text-body text-text">{p.name}</span>
              <span className="text-caption text-text-3">{songsCount(p.songs)}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

/** New playlist: asks for a name, makes it, and opens it. */
export function NewPlaylist({ primary = false }: { primary?: boolean }) {
  const [open, setOpen] = useState(false)
  const [, navigate] = useLocation()
  const create = useAction((c, name: string) => c.playlists.create(name))
  return (
    <>
      <Button icon="add" variant={primary ? 'primary' : 'secondary'} onClick={() => setOpen(true)}>
        New playlist
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="New playlist" size="sm">
          <PlaylistNameForm
            submit="Make playlist"
            onCancel={() => setOpen(false)}
            onDone={async (name) => {
              const p = await create.run(name)
              setOpen(false)
              navigate(`/music/playlists/${p.id}`)
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

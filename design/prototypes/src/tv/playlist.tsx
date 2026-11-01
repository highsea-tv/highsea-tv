// SPDX-License-Identifier: AGPL-3.0-only
// A playlist on the TV (prototype-gaps.md › 3.8), laid out as an album is: the first cover blurred
// and dimmed behind everything, the mosaic and the name, count and length in a column at the left,
// Play and Shuffle under them, and the songs in its order filling the right. The TV only plays a
// playlist; it's made, renamed and reordered on the web, desktop and phone. OK held on a song
// opens its menu, as on an album.
import { cn, Skeleton } from '@highsea-tv/ui-web'
import { useRef, useState } from 'react'
import { useParams } from 'wouter'
import { useLongPress } from '../client/continue-menu.ts'
import { songTime } from '../client/music.ts'
import { useMusicPlayer, usePlayingFrom } from '../client/music-player.ts'
import { PlaylistMosaic } from '../client/playlist-picker.tsx'
import { type PlaylistEntry, playlistSummary, usePlaylist } from '../client/playlists.ts'
import { PlayingBars } from '../client/waveform.tsx'
import { song, useSongsEntry } from './album.tsx'
import { TvButton, TvHead, TvMessage, tvHref, useInitialFocus } from './kit.tsx'
import { TvSongMenu } from './song-menu.tsx'

export function TvPlaylist() {
  const { id } = useParams<{ id: string }>()
  const found = usePlaylist(id)
  const player = useMusicPlayer()
  const path = `/music/playlists/${id}`
  const whole = usePlayingFrom(path)
  const fromHere = player.from?.to === path
  const actions = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLOListElement>(null)
  const [menu, setMenu] = useState<PlaylistEntry | null>(null)
  const ready = found.status === 'success' && found.data.songs.length > 0
  useInitialFocus(found.status === 'success', id)
  useSongsEntry(actions, list, ready && id)
  if (found.status === 'loading')
    return (
      <main aria-busy className="absolute inset-0 grid grid-rows-[auto_minmax(0,1fr)]">
        <TvHead className="px-(--tv-safe-x)" />
        <div className="grid grid-cols-[24cqw_minmax(0,1fr)] gap-[4cqw] px-(--tv-safe-x) pt-[1cqw]">
          <div className="grid content-start gap-[1cqw]">
            <Skeleton className="aspect-square w-[18cqw] rounded-(--tv-radius-poster)" />
            <Skeleton className="h-[2.4cqw] w-[20cqw]" />
            <Skeleton className="h-[1.2cqw] w-[12cqw]" />
          </div>
          <div className="grid content-start gap-[1.2cqw] pt-[1cqw]">
            {Array.from({ length: 8 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
              <Skeleton key={i} className="h-[1.3cqw] w-full" />
            ))}
          </div>
        </div>
      </main>
    )
  if (found.status === 'error')
    return (
      <TvMessage
        title="This playlist isn’t here"
        actions={
          <TvButton primary initial href={tvHref('/music/playlists')}>
            Playlists
          </TvButton>
        }
      >
        It may have been deleted.
      </TvMessage>
    )
  const { playlist: p, songs } = found.data
  const from = { kind: 'playlist' as const, name: p.name, to: path }
  const play = (start = 0, shuffle = false) =>
    player.play({ playlist: id }, { start, shuffle, from })
  return (
    <>
      {p.covers[0] && (
        <img
          src={p.covers[0]}
          alt=""
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-[2.6cqw] brightness-[0.4]"
        />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--color-bg)_5%,transparent_80%)]" />
      <main className="absolute inset-0 grid grid-rows-[auto_minmax(0,1fr)]">
        <TvHead down="actions" exact className="px-(--tv-safe-x)" />
        <div className="grid min-h-0 grid-cols-[24cqw_minmax(0,1fr)] gap-[4cqw] ps-(--tv-safe-x) pt-[2cqw]">
          <section
            ref={actions}
            aria-labelledby="title"
            data-group="actions"
            data-go-up="nav"
            data-go-right={songs.length ? 'songs' : undefined}
            className="grid content-start justify-items-start gap-[0.9cqw]"
          >
            <PlaylistMosaic
              covers={p.covers}
              className="mb-[0.6cqw] w-[18cqw] rounded-(--tv-radius-poster) shadow-[0_1cqw_3cqw_rgb(0_0_0/0.4)]"
            />
            <p className="font-mono text-(length:--tv-text-pill) text-text-3 uppercase">Playlist</p>
            <h1 id="title" className="font-semibold text-[2.4cqw] leading-[1.05] tracking-display">
              {p.name}
            </h1>
            <p className="text-(length:--tv-text-pill) text-text-2">
              {playlistSummary(p.songs, p.duration)}
            </p>
            {songs.length > 0 ? (
              <div className="grid w-[18cqw] grid-cols-2 gap-[0.8cqw] pt-[0.6cqw] *:justify-center">
                <TvButton
                  primary
                  initial
                  icon={whole?.playing ? 'pause' : 'play'}
                  onClick={() => (whole ? player.toggle() : play())}
                >
                  {whole?.playing ? 'Pause' : 'Play'}
                </TvButton>
                <TvButton icon="shuffle" onClick={() => play(0, true)}>
                  Shuffle
                </TvButton>
              </div>
            ) : (
              <>
                <p className="max-w-[20cqw] text-(length:--tv-text-pill) text-text-2 leading-[1.45]">
                  Nothing here yet. Add songs in highsea on the web or your phone.
                </p>
                <TvButton initial href={tvHref('/music/playlists')}>
                  Playlists
                </TvButton>
              </>
            )}
          </section>
          <div className="relative -ms-[1cqw] min-h-0 overflow-hidden ps-[1cqw] pe-(--tv-safe-x) [mask-image:linear-gradient(transparent,black_2cqw)]">
            <ol
              ref={list}
              aria-label="Songs"
              data-group="songs"
              data-go-left="actions"
              data-go-up="nav"
              data-scroll="y"
              data-keep="0.4"
              className="grid gap-[0.2cqw] py-[1cqw] pb-(--tv-safe-y) transition-lift"
            >
              {songs.map((s, i) => {
                const here = fromHere && player.index === i
                return (
                  <TvPlaylistSong
                    key={s.entry}
                    song={s}
                    here={here}
                    playing={player.playing}
                    onPlay={() => (here ? player.toggle() : play(i))}
                    onMenu={() => setMenu(s)}
                  />
                )
              })}
            </ol>
          </div>
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

/** A playlist's song: its cover in place of the number, as its songs come from many albums. */
function TvPlaylistSong({
  song: s,
  here,
  playing,
  onPlay,
  onMenu,
}: {
  song: PlaylistEntry
  here: boolean
  playing: boolean
  onPlay: () => void
  onMenu: () => void
}) {
  const press = useLongPress(onMenu)
  return (
    <li>
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
          'grid-cols-[2.6cqw_minmax(0,1fr)_auto] py-[0.5cqw]',
          here && 'text-accent-text',
        )}
      >
        <span className="relative size-[2.6cqw]">
          <img
            src={s.album.cover}
            alt=""
            className="size-full rounded-[0.4cqw] bg-s2 object-cover"
          />
          {here && (
            <span className="absolute inset-0 grid place-items-center rounded-[0.4cqw] bg-[rgb(0_0_0/0.5)]">
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
        <span className="text-(length:--tv-text-pill) tabular-nums opacity-70">
          {songTime(s.duration)}
        </span>
      </button>
    </li>
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// An album on the phone, as Apple Music's iPhone album page lays one out: Back over the cover
// blurred, the cover centred, the title, the artist (a link to their page), the genre, year and
// length, Play and Shuffle side by side, Download and ⋯ under them, and the album's note. The film
// it scores, when it's here, is a link under them. Then the songs, numbered, each with its length
// and ⋯ (mobile/song-menu.tsx; a long press opens it too); the release date and label; and the
// artist's other albums in a row.
import { Button, cn, EmptyState, Icon, Poster, Skeleton, SkeletonText } from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useParams } from 'wouter'
import { useLongPress } from '../client/continue-menu.ts'
import { useAlbum } from '../client/data.ts'
import { GroupDownload } from '../client/download-button.tsx'
import { songSource } from '../client/downloads.ts'
import { albumKind, albumMeta, albumSummary, releasedOn, songTime } from '../client/music.ts'
import { useAlbumPlaying, useMusicPlayer, usePlayingFrom } from '../client/music-player.ts'
import { PlayingBars } from '../client/waveform.tsx'
import type { ClientAlbum, ClientSong } from '../mock/types.ts'
import { MobileRow } from './home.tsx'
import { BackBadge, gutter, mobileHref } from './shell.tsx'
import { MobileSongMenu, MoreButton } from './song-menu.tsx'

export function MobileAlbum() {
  const { id } = useParams<{ id: string }>()
  const found = useAlbum(id)
  const player = useMusicPlayer()
  const current = useAlbumPlaying(id)
  const whole = usePlayingFrom(`/music/albums/${id}`)
  const playingId = current ? (current.queue[current.index]?.id ?? null) : null
  const [albumMenu, setAlbumMenu] = useState(false)
  const back = <BackBadge fallback="/library/music" />
  if (found.status === 'loading')
    return (
      <div aria-busy className="relative grid gap-7 pb-6">
        {back}
        <div className={cn('grid justify-items-center gap-2 pt-14 text-center', gutter)}>
          <Skeleton className="mb-3 aspect-square w-[62%] rounded-poster" />
          <Skeleton className="my-1 h-6 w-3/5" />
          <Skeleton className="my-0.5 h-4 w-2/5" />
          <Skeleton className="my-0.5 h-3.5 w-1/2" />
        </div>
        <SkeletonText lines={6} className={gutter} />
      </div>
    )
  if (found.status === 'error')
    return (
      <div className={cn('grid min-h-full place-items-center py-16', gutter)}>
        {back}
        <EmptyState
          icon="music"
          tone="error"
          title={found.error.message}
          action={
            <Button asChild>
              <a href={mobileHref('/library/music')}>Music</a>
            </Button>
          }
        >
          It may have been removed.
        </EmptyState>
      </div>
    )
  const { album: a, songs, duration, released, label, about, film, more } = found.data
  return (
    <article aria-labelledby="title" className="relative grid gap-7 pb-6">
      {back}
      <header className="relative isolate overflow-hidden">
        <img
          src={a.cover}
          alt=""
          className="-z-10 absolute inset-0 size-full scale-125 object-cover opacity-45 blur-[40px]"
        />
        <div className="-z-10 absolute inset-0 bg-[linear-gradient(0deg,var(--color-bg),transparent_75%)]" />
        <div className={cn('grid justify-items-center gap-1.5 pt-14 pb-2 text-center', gutter)}>
          <img
            src={a.cover}
            alt=""
            className="mb-3 aspect-square w-[62%] rounded-poster bg-s1 object-cover shadow-[0_8px_24px_rgb(0_0_0/0.35)]"
          />
          <p className="font-mono text-label text-text-3 uppercase">{albumKind[a.kind]}</p>
          <h1 id="title" className="font-semibold text-[24px] leading-[1.15] tracking-display">
            {a.title}
          </h1>
          <a
            href={mobileHref(`/music/artists/${a.artist.id}`)}
            className="rounded-sm text-[17px] text-text outline-none focus-visible:ring-focus"
          >
            {a.artist.name}
          </a>
          <p className="text-[13px] text-text-3">
            {[a.genres[0], a.year].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className={cn('grid grid-cols-2 gap-3 pt-3', gutter)}>
          <Button
            variant="primary"
            icon={whole?.playing ? 'pause' : 'play'}
            className="justify-center"
            onClick={() => (whole ? player.toggle() : player.play({ album: a.id }))}
          >
            {whole?.playing ? 'Pause' : 'Play'}
          </Button>
          <Button
            icon="shuffle"
            className="justify-center"
            onClick={() => player.play({ album: a.id }, { shuffle: true })}
          >
            Shuffle
          </Button>
          <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <GroupDownload
              app="mobile"
              name={a.title}
              sources={songs.map((x) => songSource(x, a))}
              wide
              className="justify-center"
            />
            <MoreButton name={a.title} onClick={() => setAlbumMenu(true)} />
          </div>
          <MobileSongMenu
            target={{ songs: songs.map((x) => x.id), name: a.title, album: a }}
            on="album"
            open={albumMenu}
            onOpenChange={setAlbumMenu}
          />
        </div>
      </header>
      {(about || film) && (
        <div className={cn('grid justify-items-start gap-2', gutter)}>
          {about && <p className="text-[15px] text-text-2 leading-[1.45]">{about}</p>}
          {film && (
            <a
              href={mobileHref(`/movies/${film.id}`)}
              className="flex min-h-11 items-center gap-1.5 rounded-sm text-[14px] text-text outline-none focus-visible:ring-focus"
            >
              <Icon name="movie" size={16} />
              The score for {film.title}
              <Icon name="chevron-right" size={16} className="text-text-3" />
            </a>
          )}
        </div>
      )}
      <section aria-label="Songs" className={cn('grid gap-3', gutter)}>
        <ol className="grid">
          {songs.map((s, i) => (
            <SongRow
              key={s.id}
              song={s}
              album={a}
              here={s.id === playingId}
              playing={!!current?.playing}
              onPlay={() =>
                s.id === playingId ? player.toggle() : player.play({ album: a.id }, { start: i })
              }
            />
          ))}
        </ol>
        <div className="grid gap-0.5 text-[13px] text-text-3">
          <p>{releasedOn(released)}</p>
          <p>{albumSummary(songs.length, duration)}</p>
          <p>
            © {a.year} {label}
          </p>
        </div>
      </section>
      {more.length > 0 && (
        <MobileRow title={`More by ${a.artist.name}`}>
          {more.map((x) => (
            <li key={x.id} className="w-[40%] shrink-0 snap-start">
              <Poster
                aspect="square"
                title={x.title}
                src={x.cover}
                href={mobileHref(`/music/albums/${x.id}`)}
                showTitle
                caption={albumMeta(x)}
              />
            </li>
          ))}
        </MobileRow>
      )}
    </article>
  )
}

/** A song: a tap plays it (or pauses it, when it's the one playing); ⋯ or a long press, its menu. */
function SongRow({
  song: s,
  album,
  here,
  playing,
  onPlay,
}: {
  song: ClientSong
  album: ClientAlbum
  here: boolean
  playing: boolean
  onPlay: () => void
}) {
  const [menu, setMenu] = useState(false)
  const press = useLongPress(() => setMenu(true))
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center border-line border-b last:border-b-0">
      <button
        type="button"
        aria-label={
          here && playing ? `Pause ${s.title}` : `Play ${s.title}, ${songTime(s.duration)}`
        }
        aria-current={here ? 'true' : undefined}
        onClick={onPlay}
        {...press}
        className="grid min-h-12 w-full cursor-pointer grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-sm text-start outline-none focus-visible:ring-focus"
      >
        {here ? (
          <PlayingBars playing={playing} className="text-[15px] text-accent-text" />
        ) : (
          <span className="text-[15px] text-text-3 tabular-nums">{s.number}</span>
        )}
        <span className={cn('truncate text-[15px]', here ? 'text-accent-text' : 'text-text')}>
          {s.title}
        </span>
        <span className="text-[13px] text-text-3 tabular-nums">{songTime(s.duration)}</span>
      </button>
      <MoreButton name={s.title} onClick={() => setMenu(true)} />
      <MobileSongMenu
        target={{ songs: [s.id], name: s.title, album }}
        on="album"
        open={menu}
        onOpenChange={setMenu}
      />
    </li>
  )
}

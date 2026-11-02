// SPDX-License-Identifier: AGPL-3.0-only
// An album on the web and desktop, from Apple Music's and Plexamp's album pages: the cover blurred
// behind the header, the square cover beside the kind, the title, the artist (a link to their
// page), the genre, year and length, the album's note, and Play, Shuffle and ⋯ (Play next, Add to
// queue, Add to playlist; with Download in the desktop app). The film it scores,
// when it's here, is a link under them, so a score leads back to its film as the film's Music
// credit leads to the composer. Then the songs, numbered, each with its length, as every music app
// lists them, each with its ⋯ menu (web/song-menu.tsx); the release date and label under them; and the artist's other albums.
import {
  Button,
  CarouselRow,
  cn,
  EmptyState,
  Icon,
  Poster,
  Skeleton,
  SkeletonText,
} from '@highsea-tv/ui'
import { useParams } from 'wouter'
import { useAlbum, useDesktopApp } from '../client/data.ts'
import { GroupDownload } from '../client/download-button.tsx'
import { songSource } from '../client/downloads.ts'
import { albumKind, albumMeta, albumSummary, releasedOn, songTime } from '../client/music.ts'
import { useAlbumPlaying, useMusicPlayer, usePlayingFrom } from '../client/music-player.ts'
import { PlayingBars } from '../client/waveform.tsx'
import type { ClientAlbum, ClientSong } from '../mock/types.ts'
import { gutter, webHref } from './shell.tsx'
import { WebSongMenu } from './song-menu.tsx'

export function WebAlbum() {
  const { id } = useParams<{ id: string }>()
  const found = useAlbum(id)
  const player = useMusicPlayer()
  const current = useAlbumPlaying(id)
  const whole = usePlayingFrom(`/music/albums/${id}`)
  const desktop = useDesktopApp()
  if (found.status === 'loading') return <AlbumSkeleton />
  if (found.status === 'error')
    return (
      <main className="grid min-h-[70vh] place-items-center px-4">
        <EmptyState
          icon="music"
          tone="error"
          title={found.error.message}
          action={
            <Button variant="primary" asChild>
              <a href={webHref('/music')}>Music</a>
            </Button>
          }
        >
          It may have been removed.
        </EmptyState>
      </main>
    )
  const { album: a, songs, duration, released, label, about, film, more } = found.data
  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-10 pb-16">
      <header className="relative isolate overflow-hidden medium:-mt-20">
        <img
          src={a.cover}
          alt=""
          className="-z-10 absolute inset-0 size-full scale-110 object-cover opacity-45 blur-[40px]"
        />
        <div className="-z-10 absolute inset-0 bg-[linear-gradient(0deg,var(--color-bg),transparent_70%)]" />
        <div
          className={cn(
            'mx-auto grid w-full max-w-[1680px] items-end gap-x-10 gap-y-6 pt-28 pb-10 medium:grid-cols-[auto_minmax(0,1fr)]',
            gutter,
          )}
        >
          <img
            src={a.cover}
            alt=""
            className="aspect-square w-[min(16rem,70vw)] rounded-poster bg-s1 object-cover shadow-[0_8px_32px_rgb(0_0_0/0.35)] medium:w-64"
          />
          <div className="grid max-w-[44rem] justify-items-start gap-3">
            <p className="font-mono text-label text-text-3 uppercase">{albumKind[a.kind]}</p>
            <h1 className="text-balance text-display">{a.title}</h1>
            <a
              href={webHref(`/music/artists/${a.artist.id}`)}
              className="rounded-sm text-heading text-text outline-none hover:underline focus-visible:ring-focus"
            >
              {a.artist.name}
            </a>
            <p className="text-body text-text-2">
              {[a.genres[0], a.year, albumSummary(songs.length, duration)]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {about && <p className="max-w-[65ch] text-body text-text">{about}</p>}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {/* while this album plays, Play is Pause, as Apple Music's is */}
              <Button
                variant="primary"
                icon={whole?.playing ? 'pause' : 'play'}
                className="min-w-32 justify-center"
                onClick={() => (whole ? player.toggle() : player.play({ album: a.id }))}
              >
                {whole?.playing ? 'Pause' : 'Play'}
              </Button>
              <Button
                icon="shuffle"
                className="min-w-32 justify-center"
                onClick={() => player.play({ album: a.id }, { shuffle: true })}
              >
                Shuffle
              </Button>
              <WebSongMenu
                target={{ songs: songs.map((x) => x.id), name: a.title, album: a }}
                on="album"
                round
              />
              {desktop && (
                <GroupDownload
                  app="desktop"
                  name={a.title}
                  sources={songs.map((x) => songSource(x, a))}
                  size="md"
                  className="ms-2"
                />
              )}
            </div>
            {film && (
              <a
                href={webHref(`/movies/${film.id}`)}
                className="flex items-center gap-1.5 rounded-sm text-caption text-text-2 outline-none hover:text-text focus-visible:ring-focus"
              >
                <Icon name="movie" size={14} />
                The score for {film.title}
              </a>
            )}
          </div>
        </div>
      </header>
      <section
        aria-label="Songs"
        className={cn('mx-auto grid w-full max-w-[1680px] gap-4', gutter)}
      >
        <SongList
          album={a}
          songs={songs}
          current={current ? (current.queue[current.index]?.id ?? null) : null}
          playing={!!current?.playing}
          onPlay={(i) =>
            current?.queue[current.index]?.id === songs[i]?.id
              ? player.toggle()
              : player.play({ album: a.id }, { start: i })
          }
        />
        <div className="grid gap-0.5 text-caption text-text-3">
          <p>{releasedOn(released)}</p>
          <p>{albumSummary(songs.length, duration)}</p>
          <p>
            © {a.year} {label}
          </p>
        </div>
      </section>
      {more.length > 0 && (
        <div className="mx-auto grid w-full max-w-[1680px] grid-cols-[minmax(0,1fr)] gap-10">
          <CarouselRow
            title={`More by ${a.artist.name}`}
            action={
              <Button variant="ghost" size="sm" asChild>
                <a href={webHref(`/music/artists/${a.artist.id}`)}>See all</a>
              </Button>
            }
          >
            {more.map((x) => (
              <Poster
                key={x.id}
                aspect="square"
                title={x.title}
                src={x.cover}
                href={webHref(`/music/albums/${x.id}`)}
                showTitle
                titleSize="body"
                caption={albumMeta(x)}
              />
            ))}
          </CarouselRow>
        </div>
      )}
    </main>
  )
}

/**
 * The songs, numbered, with their lengths at the right, as Apple Music's and Plexamp's lists are.
 * The number turns to a play icon under the pointer; the song playing has the playing mark in its
 * place and its title in the accent, and choosing it again pauses it.
 */
function SongList({
  album,
  songs,
  current,
  playing,
  onPlay,
}: {
  album: ClientAlbum
  songs: ClientSong[]
  current: string | null
  playing: boolean
  onPlay: (index: number) => void
}) {
  return (
    <ol className="grid border-line border-t">
      {songs.map((s, i) => {
        const here = s.id === current
        return (
          <li
            key={s.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 border-line border-b pe-1"
          >
            <button
              type="button"
              aria-label={
                here && playing ? `Pause ${s.title}` : `Play ${s.title}, ${songTime(s.duration)}`
              }
              aria-current={here ? 'true' : undefined}
              onClick={() => onPlay(i)}
              // a song's row: the whole row plays it, an item of the list, not a control in a row
              data-item
              className="group/song grid min-h-12 w-full cursor-pointer grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-sm px-2 text-start outline-none hover:bg-s1 focus-visible:ring-focus"
            >
              <span className="grid place-items-center text-body text-text-3 tabular-nums">
                {here ? (
                  <>
                    <PlayingBars
                      playing={playing}
                      className="text-accent-text group-hover/song:hidden"
                    />
                    <Icon
                      name={playing ? 'pause' : 'play'}
                      size={14}
                      className="hidden text-text group-hover/song:block"
                    />
                  </>
                ) : (
                  <>
                    <span className="group-hover/song:hidden">{s.number}</span>
                    <Icon
                      name="play"
                      size={14}
                      className="hidden text-text group-hover/song:block"
                    />
                  </>
                )}
              </span>
              <span className={cn('truncate text-body', here ? 'text-accent-text' : 'text-text')}>
                {s.title}
              </span>
              <span className="text-caption text-text-3 tabular-nums">{songTime(s.duration)}</span>
            </button>
            <WebSongMenu target={{ songs: [s.id], name: s.title, album }} on="album" />
          </li>
        )
      })}
    </ol>
  )
}

function AlbumSkeleton() {
  return (
    <main aria-busy className="grid grid-cols-[minmax(0,1fr)] gap-10 pb-16">
      <div
        className={cn(
          'mx-auto grid w-full max-w-[1680px] items-end gap-x-10 gap-y-6 pt-28 pb-10 medium:grid-cols-[auto_minmax(0,1fr)] medium:pt-8',
          gutter,
        )}
      >
        <Skeleton className="aspect-square w-[min(16rem,70vw)] rounded-poster medium:w-64" />
        <div className="grid max-w-[44rem] gap-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="my-1 h-9 w-[min(22rem,80%)]" />
          <Skeleton className="my-1 h-5 w-40" />
          <Skeleton className="h-4 w-56" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-10 w-32 rounded-sm" />
            <Skeleton className="h-10 w-32 rounded-sm" />
          </div>
        </div>
      </div>
      <div className={cn('mx-auto grid w-full max-w-[1680px] gap-3', gutter)}>
        <SkeletonText lines={8} />
      </div>
    </main>
  )
}

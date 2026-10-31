// SPDX-License-Identifier: AGPL-3.0-only
// An album on the web and desktop, from Apple Music's and Plexamp's album pages: the cover blurred
// behind the header, the square cover beside the kind, the title, the artist (a link to their
// page), the genre, year and length, the album's note, and Play and Shuffle. The film it scores,
// when it's here, is a link under them, so a score leads back to its film as the film's Music
// credit leads to the composer. Then the songs, numbered, each with its length, as every music app
// lists them; the release date and label under them; and the artist's other albums.
import {
  Button,
  CarouselRow,
  cn,
  EmptyState,
  Icon,
  Poster,
  Skeleton,
  SkeletonText,
} from '@highsea-tv/ui-web'
import { useParams } from 'wouter'
import { useAlbum } from '../client/data.ts'
import { albumKind, albumMeta, albumSummary, releasedOn, songTime } from '../client/music.ts'
import type { ClientSong } from '../mock/types.ts'
import { gutter, webHref } from './shell.tsx'

export function WebAlbum() {
  const { id } = useParams<{ id: string }>()
  const found = useAlbum(id)
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
              <Button variant="primary" icon="play" className="min-w-32 justify-center">
                Play
              </Button>
              <Button icon="shuffle" className="min-w-32 justify-center">
                Shuffle
              </Button>
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
        <SongList songs={songs} />
        <div className="grid gap-0.5 text-caption text-text-3">
          <p>{releasedOn(released)}</p>
          <p>{albumSummary(songs.length, duration)}</p>
          <p>
            © {a.year} {label}
          </p>
        </div>
      </section>
      {more.length > 0 && (
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
      )}
    </main>
  )
}

/**
 * The songs, numbered, with their lengths at the right, as Apple Music's and Plexamp's lists are.
 * The number turns to a play icon under the pointer. Nothing plays yet: the music player comes
 * with its own prototype.
 */
function SongList({ songs }: { songs: ClientSong[] }) {
  return (
    <ol className="grid border-line border-t">
      {songs.map((s) => (
        <li key={s.id} className="border-line border-b">
          <button
            type="button"
            aria-label={`Play ${s.title}, ${songTime(s.duration)}`}
            className="group/song grid min-h-12 w-full cursor-pointer grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-sm px-2 text-start outline-none hover:bg-s1 focus-visible:ring-focus"
          >
            <span className="grid place-items-center text-body text-text-3 tabular-nums">
              <span className="group-hover/song:hidden">{s.number}</span>
              <Icon name="play" size={14} className="hidden text-text group-hover/song:block" />
            </span>
            <span className="truncate text-body text-text">{s.title}</span>
            <span className="text-caption text-text-3 tabular-nums">{songTime(s.duration)}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}

function AlbumSkeleton() {
  return (
    <main aria-busy className="grid grid-cols-[minmax(0,1fr)] gap-10 pb-16">
      <div
        className={cn(
          'mx-auto grid w-full max-w-[1680px] items-end gap-x-10 gap-y-6 pt-8 pb-10 medium:grid-cols-[auto_minmax(0,1fr)]',
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
            <Skeleton className="h-10 w-32 rounded-button" />
            <Skeleton className="h-10 w-32 rounded-button" />
          </div>
        </div>
      </div>
      <div className={cn('mx-auto grid w-full max-w-[1680px] gap-3', gutter)}>
        <SkeletonText lines={8} />
      </div>
    </main>
  )
}

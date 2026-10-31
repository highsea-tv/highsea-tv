// SPDX-License-Identifier: AGPL-3.0-only
// An artist on the web and desktop, laid out as a person's page is (their newest cover blurred
// behind a round photo, the name, the facts and the note cut with More), with Play and Shuffle as
// Apple Music's and Plexamp's artist pages have. A composer credited on a film here links to their
// person page. Then their albums here in rows by kind, newest first, as Apple Music groups them
// (Albums, Singles and EPs, Soundtracks, Compilations), and artists who share a genre with them.
import {
  Button,
  CarouselRow,
  cn,
  EmptyState,
  Poster,
  Skeleton,
  SkeletonText,
} from '@highsea-tv/ui-web'
import { useParams } from 'wouter'
import { useArtist } from '../client/data.ts'
import { albumMeta, albumsCount, discographyTitle, songsCount } from '../client/music.ts'
import { useMusicPlayer } from '../client/music-player.ts'
import { ArtistCard, MusicCardSkeleton } from './music.tsx'
import { Bio } from './person.tsx'
import { gutter, webHref } from './shell.tsx'

export function WebArtist() {
  const { id } = useParams<{ id: string }>()
  const found = useArtist(id)
  const player = useMusicPlayer()
  if (found.status === 'loading') return <ArtistSkeleton />
  if (found.status === 'error')
    return (
      <main className="grid min-h-[70vh] place-items-center px-4">
        <EmptyState
          icon="music"
          tone="error"
          title={found.error.message}
          action={
            <Button variant="primary" asChild>
              <a href={webHref('/music/artists')}>Artists</a>
            </Button>
          }
        >
          Their albums may have been removed.
        </EmptyState>
      </main>
    )
  const { artist: a, bio, backdrop, songs, person, sections, similar } = found.data
  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-10 pb-16">
      <header className="relative isolate overflow-hidden medium:-mt-20">
        <img
          src={backdrop}
          alt=""
          className="-z-10 absolute inset-0 size-full scale-110 object-cover opacity-45 blur-[40px]"
        />
        <div className="-z-10 absolute inset-0 bg-[linear-gradient(0deg,var(--color-bg),transparent_70%)]" />
        <div
          className={cn(
            'mx-auto grid w-full max-w-[1680px] items-center gap-x-10 gap-y-6 pt-28 pb-10 medium:grid-cols-[auto_minmax(0,1fr)]',
            gutter,
          )}
        >
          <img
            src={a.photo}
            alt=""
            className="size-36 rounded-full bg-s1 object-cover shadow-[0_8px_32px_rgb(0_0_0/0.35)] medium:size-48"
          />
          <div className="grid max-w-[44rem] justify-items-start gap-3">
            <h1 className="text-balance text-display">{a.name}</h1>
            <p className="text-body text-text-2">
              {a.genres.join(' · ')} · {albumsCount(a.albums)}, {songsCount(songs)}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                variant="primary"
                icon="play"
                className="min-w-32 justify-center"
                onClick={() => player.play({ artist: a.id })}
              >
                Play
              </Button>
              <Button
                icon="shuffle"
                className="min-w-32 justify-center"
                onClick={() => player.play({ artist: a.id }, { shuffle: true })}
              >
                Shuffle
              </Button>
              {person && (
                <Button variant="ghost" icon="movie" asChild>
                  <a href={webHref(`/people/${person}`)}>Their films</a>
                </Button>
              )}
            </div>
            {bio && <Bio text={bio} />}
          </div>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-[1680px] grid-cols-[minmax(0,1fr)] gap-10">
        {sections.map(({ kind, albums }) => (
          <CarouselRow key={kind} title={discographyTitle[kind]}>
            {albums.map((x) => (
              <Poster
                key={x.id}
                aspect="square"
                title={x.title}
                src={x.cover}
                href={webHref(`/music/albums/${x.id}`)}
                showTitle
                titleSize="body"
                caption={kind === 'singles' ? albumMeta(x) : String(x.year)}
              />
            ))}
          </CarouselRow>
        ))}
        {similar.length > 0 && (
          <CarouselRow title="Similar artists">
            {similar.map((x) => (
              <ArtistCard key={x.id} artist={x} />
            ))}
          </CarouselRow>
        )}
      </div>
    </main>
  )
}

function ArtistSkeleton() {
  return (
    <main aria-busy className="grid grid-cols-[minmax(0,1fr)] gap-10 pb-16">
      <div
        className={cn(
          'mx-auto grid w-full max-w-[1680px] items-center gap-x-10 gap-y-6 pt-8 pb-10 medium:grid-cols-[auto_minmax(0,1fr)]',
          gutter,
        )}
      >
        <Skeleton className="size-36 rounded-full medium:size-48" />
        <div className="grid max-w-[44rem] gap-3">
          <Skeleton className="my-1 h-9 w-[min(22rem,80%)]" />
          <Skeleton className="my-1 h-4 w-48" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-10 w-32 rounded-button" />
            <Skeleton className="h-10 w-32 rounded-button" />
          </div>
          <SkeletonText lines={2} className="max-w-[60ch] pt-1" />
        </div>
      </div>
      <div className={cn('mx-auto grid w-full max-w-[1680px] gap-3', gutter)}>
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4">
          {Array.from({ length: 6 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
            <MusicCardSkeleton key={i} round={false} />
          ))}
        </div>
      </div>
    </main>
  )
}

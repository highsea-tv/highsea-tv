// SPDX-License-Identifier: AGPL-3.0-only
// An artist on the phone, laid out as a person's page is: Back over their newest cover blurred,
// the round photo centred, the name, the genres and counts, Play and Shuffle side by side, and the
// note cut with More. A composer credited on a film here links to their person page. Then a row
// for each kind of album, newest first, and artists who share a genre with them.
import { Button, cn, EmptyState, Icon, Poster, Skeleton, SkeletonText } from '@highsea-tv/ui-web'
import { useParams } from 'wouter'
import { useArtist } from '../client/data.ts'
import { albumMeta, albumsCount, discographyTitle, songsCount } from '../client/music.ts'
import { useMusicPlayer } from '../client/music-player.ts'
import { MobileRow, MobileRowSkeleton } from './home.tsx'
import { Bio } from './person.tsx'
import { gutter, mobileHref } from './shell.tsx'

/** Back, over the page's header: to where it was opened from, or `fallback` when it was opened first. */
export function BackBadge({ fallback }: { fallback: string }) {
  return (
    <a
      href={mobileHref(fallback)}
      onClick={(e) => {
        if (history.length > 1) {
          e.preventDefault()
          history.back()
        }
      }}
      aria-label="Back"
      className="glass-badge absolute top-2 left-3 z-10 grid size-10 place-items-center rounded-full outline-none focus-visible:ring-focus"
    >
      <Icon name="chevron-left" size={20} />
    </a>
  )
}

export function MobileArtist() {
  const { id } = useParams<{ id: string }>()
  const found = useArtist(id)
  const player = useMusicPlayer()
  const back = <BackBadge fallback="/library/music/artists" />
  if (found.status === 'loading')
    return (
      <div aria-busy className="relative grid gap-7 pb-6">
        {back}
        <div className={cn('grid justify-items-center gap-2 pt-14 text-center', gutter)}>
          <Skeleton className="mb-2 size-32 rounded-full" />
          <Skeleton className="my-1 h-7 w-3/5" />
          <Skeleton className="my-0.5 h-3.5 w-40" />
          <SkeletonText lines={3} className="w-full py-1" />
        </div>
        <MobileRowSkeleton width="w-[40%]" />
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
              <a href={mobileHref('/library/music/artists')}>Artists</a>
            </Button>
          }
        >
          Their albums may have been removed.
        </EmptyState>
      </div>
    )
  const { artist: a, bio, backdrop, songs, person, sections, similar } = found.data
  return (
    <article aria-labelledby="name" className="relative grid gap-7 pb-6">
      {back}
      <header className="relative isolate overflow-hidden">
        <img
          src={backdrop}
          alt=""
          className="-z-10 absolute inset-0 size-full scale-125 object-cover opacity-45 blur-[40px]"
        />
        <div className="-z-10 absolute inset-0 bg-[linear-gradient(0deg,var(--color-bg),transparent_75%)]" />
        <div className={cn('grid justify-items-center gap-2 pt-14 pb-2 text-center', gutter)}>
          <img
            src={a.photo}
            alt=""
            className="mb-3 size-32 rounded-full bg-s1 object-cover shadow-[0_8px_24px_rgb(0_0_0/0.35)]"
          />
          <h1 id="name" className="font-semibold text-[28px] leading-[1.15] tracking-display">
            {a.name}
          </h1>
          <p className="text-[14px] text-text-2">{a.genres.join(' · ')}</p>
          <p className="text-[13px] text-text-3">
            {albumsCount(a.albums)}, {songsCount(songs)}
          </p>
        </div>
        <div className={cn('grid grid-cols-2 gap-3 pt-3', gutter)}>
          <Button
            variant="primary"
            icon="play"
            className="justify-center"
            onClick={() => player.play({ artist: a.id })}
          >
            Play
          </Button>
          <Button
            icon="shuffle"
            className="justify-center"
            onClick={() => player.play({ artist: a.id }, { shuffle: true })}
          >
            Shuffle
          </Button>
        </div>
      </header>
      {(bio || person) && (
        <div className="grid gap-2">
          {bio && <Bio text={bio} />}
          {person && (
            <a
              href={mobileHref(`/people/${person}`)}
              className={cn(
                'flex min-h-11 items-center gap-1.5 rounded-sm text-[14px] text-text outline-none focus-visible:ring-focus',
                gutter,
              )}
            >
              <Icon name="movie" size={16} />
              Their films and shows
              <Icon name="chevron-right" size={16} className="text-text-3" />
            </a>
          )}
        </div>
      )}
      {sections.map(({ kind, albums }) => (
        <MobileRow key={kind} title={discographyTitle[kind]}>
          {albums.map((x) => (
            <li key={x.id} className="w-[40%] shrink-0 snap-start">
              <Poster
                aspect="square"
                title={x.title}
                src={x.cover}
                href={mobileHref(`/music/albums/${x.id}`)}
                showTitle
                caption={kind === 'singles' ? albumMeta(x) : String(x.year)}
              />
            </li>
          ))}
        </MobileRow>
      ))}
      {similar.length > 0 && (
        <MobileRow title="Similar artists">
          {similar.map((x) => (
            <li key={x.id} className="w-[28%] shrink-0 snap-start">
              <a
                href={mobileHref(`/music/artists/${x.id}`)}
                className="grid justify-items-center gap-1.5 rounded-sm text-center outline-none focus-visible:ring-focus"
              >
                <img
                  src={x.photo}
                  alt=""
                  className="aspect-square w-full rounded-full bg-s2 object-cover"
                />
                <span className="line-clamp-2 font-semibold text-[13px] text-text">{x.name}</span>
              </a>
            </li>
          ))}
        </MobileRow>
      )}
    </article>
  )
}

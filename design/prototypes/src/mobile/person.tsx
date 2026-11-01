// SPDX-License-Identifier: AGPL-3.0-only
// A person on mobile (docs/product/client-people.md), as the Apple TV app's iPhone page lays one
// out: Back over their best-rated film's art, blurred; the round portrait centred, the name, what
// they're known for and how much of theirs is here, born and died, and the biography cut at four
// lines with More. Then a row of posters for each department they worked in on the films here, the
// one they're known for first, each with their role and the year; then their shows and albums.
import { Button, cn, EmptyState, Icon, Poster, Skeleton, SkeletonText } from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useParams } from 'wouter'
import { usePerson } from '../client/data.ts'
import { departmentTitle, hereOf, lifeOf, roleNames } from '../client/detail-facts.ts'
import { ShowPoster } from '../client/show-card.tsx'
import { showYears } from '../client/shows.ts'
import { hitSlop } from '../kit/mobile/device.tsx'
import { LONG_BIO } from '../web/person.tsx'
import { MobileRow, MobileRowSkeleton } from './home.tsx'
import { BackBadge, gutter, mobileHref } from './shell.tsx'

export function MobilePerson() {
  const { id } = useParams<{ id: string }>()
  const found = usePerson(id)
  const back = <BackBadge fallback="/search" />
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
        <MobileRowSkeleton width="w-[30%]" />
      </div>
    )
  if (found.status === 'error')
    return (
      <div className={cn('grid min-h-full place-items-center py-16', gutter)}>
        {back}
        <EmptyState
          icon="user"
          tone="error"
          title={found.error.message}
          action={
            <Button asChild>
              <a href={mobileHref('/search')}>Search</a>
            </Button>
          }
        >
          What they were part of may have been removed.
        </EmptyState>
      </div>
    )
  const p = found.data
  const life = lifeOf(p)
  return (
    <article aria-labelledby="name" className="relative grid gap-7 pb-6">
      {back}
      <header className="relative isolate overflow-hidden">
        <img
          src={p.backdrop}
          alt=""
          className="-z-10 absolute inset-0 size-full scale-125 object-cover opacity-45 blur-[40px]"
        />
        <div className="-z-10 absolute inset-0 bg-[linear-gradient(0deg,var(--color-bg),transparent_75%)]" />
        <div className={cn('grid justify-items-center gap-2 pt-14 pb-2 text-center', gutter)}>
          <img
            src={p.photo}
            alt=""
            className="mb-3 size-32 rounded-full bg-s1 object-cover shadow-[0_8px_24px_rgb(0_0_0/0.35)]"
          />
          <h1 id="name" className="font-semibold text-[28px] leading-[1.15] tracking-display">
            {p.name}
          </h1>
          <p className="text-[14px] text-text-2">
            {departmentTitle[p.knownFor]} · {hereOf(p)}
          </p>
          {life && <p className="text-[13px] text-text-3">{life}</p>}
        </div>
      </header>
      {(p.bio || p.artist) && (
        <div className="grid gap-2">
          {p.bio && <Bio text={p.bio} />}
          {/* the reverse of the artist page's Their films and shows (prototype-gaps.md › 3.5) */}
          {p.artist && (
            <a
              href={mobileHref(`/music/artists/${p.artist}`)}
              className={cn(
                'flex min-h-11 items-center gap-1.5 rounded-sm text-[14px] text-text outline-none focus-visible:ring-focus',
                gutter,
              )}
            >
              <Icon name="music" size={16} />
              Their music
              <Icon name="chevron-right" size={16} className="text-text-3" />
            </a>
          )}
        </div>
      )}
      {p.departments.map(({ department, credits }) => (
        <MobileRow key={department} title={departmentTitle[department]}>
          {credits.map(({ item: m, role }) => (
            <li key={m.id} className="w-[30%] shrink-0 snap-start">
              <Poster
                title={m.title}
                src={m.art.poster}
                href={mobileHref(`/movies/${m.id}`)}
                showTitle
                caption={`${roleNames(role)} · ${m.year}`}
              />
            </li>
          ))}
        </MobileRow>
      ))}
      {p.shows.length > 0 && (
        <MobileRow title="Shows">
          {p.shows.map(({ show, role }) => (
            <li key={show.id} className="w-[30%] shrink-0 snap-start">
              <ShowPoster
                show={show}
                href={mobileHref(`/shows/${show.id}`)}
                caption={`${roleNames(role)} · ${showYears(show)}`}
              />
            </li>
          ))}
        </MobileRow>
      )}
      {p.albums.length > 0 && (
        <MobileRow title="Albums">
          {p.albums.map((a) => (
            <li key={a.id} className="w-[40%] shrink-0 snap-start">
              <Poster
                aspect="square"
                title={a.title}
                src={a.cover}
                href={mobileHref(`/music/albums/${a.id}`)}
                showTitle
                caption={String(a.year)}
              />
            </li>
          ))}
        </MobileRow>
      )}
    </article>
  )
}

/** A biography, cut at four lines with More when it's long; an artist's page shares it. */
export function Bio({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length >= LONG_BIO
  return (
    <div className={cn('grid justify-items-start gap-2', gutter)}>
      <p
        id="bio"
        className={cn('text-[15px] text-text-2 leading-[1.45]', long && !open && 'line-clamp-4')}
      >
        {text}
      </p>
      {long && (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls="bio"
          onClick={() => setOpen(!open)}
          className={cn('-ms-2 relative', hitSlop)}
        >
          {open ? 'Less' : 'More'}
        </Button>
      )}
    </div>
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// A person on the web and desktop (docs/product/client-people.md), from the streaming apps' common
// choices (the owner, 2026-10-31): their best-rated film's art blurred behind a round portrait, the
// name, what they're known for and how many films here, born and died, and the biography cut at
// three lines with More. Then a row of posters for each department they worked in here, the one
// they're known for first, each poster with their role and the year. Only what's on this server,
// as Jellyfin and Infuse do: the household browses what it can play.
import {
  Button,
  CarouselRow,
  cn,
  EmptyState,
  Poster,
  Skeleton,
  SkeletonText,
} from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useParams } from 'wouter'
import { usePerson } from '../client/data.ts'
import { departmentTitle, lifeOf, roleNames } from '../client/detail-facts.ts'
import { MediaPosterSkeleton } from '../client/media-card.tsx'
import type { ClientPerson } from '../mock/types.ts'
import { gutter, webHref } from './shell.tsx'

/** A biography this long or longer is cut at three lines, with More. */
export const LONG_BIO = 240

export function WebPerson() {
  const { id } = useParams<{ id: string }>()
  const found = usePerson(id)
  if (found.status === 'loading') return <PersonSkeleton />
  if (found.status === 'error')
    return (
      <main className="grid min-h-[70vh] place-items-center px-4">
        <EmptyState
          icon="user"
          tone="error"
          title={found.error.message}
          action={
            <Button variant="primary" asChild>
              <a href={webHref('/search')}>Search</a>
            </Button>
          }
        >
          Their films may have been removed.
        </EmptyState>
      </main>
    )
  const p = found.data
  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-10 pb-16">
      <header className="relative isolate overflow-hidden medium:-mt-20">
        <img
          src={p.backdrop}
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
            src={p.photo}
            alt=""
            className="size-36 rounded-full bg-s1 object-cover shadow-[0_8px_32px_rgb(0_0_0/0.35)] medium:size-48"
          />
          <div className="grid max-w-[44rem] gap-3">
            <h1 className="text-balance text-display">{p.name}</h1>
            <Facts person={p} className="text-body text-text-2" />
            {p.bio && <Bio text={p.bio} />}
          </div>
        </div>
      </header>
      {/* the rows keep to the page's width, as the film page's do */}
      <div className="mx-auto grid w-full max-w-[1680px] grid-cols-[minmax(0,1fr)] gap-10">
        {p.departments.map(({ department, credits }) => (
          <CarouselRow key={department} title={departmentTitle[department]}>
            {credits.map(({ item: m, role }) => (
              <Poster
                key={m.id}
                title={m.title}
                src={m.art.poster}
                href={webHref(`/movies/${m.id}`)}
                showTitle
                titleSize="body"
                caption={`${roleNames(role)} · ${m.year}`}
              />
            ))}
          </CarouselRow>
        ))}
      </div>
    </main>
  )
}

/** "Acting · 4 movies here", then born and died. */
export function Facts({ person: p, className }: { person: ClientPerson; className?: string }) {
  const life = lifeOf(p)
  return (
    <div className={cn('grid gap-1', className)}>
      <p>
        {departmentTitle[p.knownFor]} · {p.count} {p.count === 1 ? 'movie' : 'movies'} here
      </p>
      {life && <p className="text-text-3">{life}</p>}
    </div>
  )
}

/** A biography, cut at three lines with More when it's long; an artist's page shares it. */
export function Bio({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length >= LONG_BIO
  return (
    <div className="grid justify-items-start gap-2 pt-1">
      <p
        id="bio"
        className={cn('max-w-[65ch] text-body text-text', long && !open && 'line-clamp-3')}
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
          className="-ms-2"
        >
          {open ? 'Less' : 'More'}
        </Button>
      )}
    </div>
  )
}

function PersonSkeleton() {
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
          <SkeletonText lines={3} className="max-w-[60ch] pt-1" />
        </div>
      </div>
      <div className={cn('mx-auto grid w-full max-w-[1680px] gap-3', gutter)}>
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4">
          {Array.from({ length: 6 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
            <MediaPosterSkeleton key={i} />
          ))}
        </div>
      </div>
    </main>
  )
}

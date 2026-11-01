// SPDX-License-Identifier: AGPL-3.0-only
// A collection on the web and desktop (reference, docs/product/client-search.md#collections): its
// name, years and overview over the first part's backdrop, then its titles on this server, oldest
// first. Reached from search and Library › Collections; a smart one (docs/product/collections.md)
// says so and gives its rules in words.
import { Button, cn, EmptyState, Skeleton, SkeletonText } from '@highsea-tv/ui-web'
import { useParams } from 'wouter'
import { titlesHere, titlesRow, useCollection } from '../client/data.ts'
import { MediaPoster, MediaPosterSkeleton } from '../client/media-card.tsx'
import { ShowPoster } from '../client/show-card.tsx'
import { gutter, webHref } from './shell.tsx'

export function WebCollection() {
  const { id } = useParams<{ id: string }>()
  const found = useCollection(id, 'web')
  if (found.status === 'loading')
    return (
      <main aria-busy className="grid grid-cols-[minmax(0,1fr)] gap-8 pb-16">
        <div className={cn('mx-auto w-full grid max-w-[1680px] gap-2 pt-24 pb-6', gutter)}>
          <Skeleton className="my-0.5 h-3 w-24" />
          <Skeleton className="my-1 h-9 w-[min(28rem,80%)]" />
          <Skeleton className="my-1 h-4 w-48" />
          <SkeletonText lines={2} className="max-w-[60ch] pt-1" />
        </div>
        <div
          className={cn(
            'mx-auto grid w-full max-w-[1680px] grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6',
            gutter,
          )}
        >
          {Array.from({ length: 7 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
            <MediaPosterSkeleton key={i} />
          ))}
        </div>
      </main>
    )
  if (found.status === 'error')
    return (
      <main className="grid min-h-[70vh] place-items-center px-4">
        <EmptyState
          icon="library"
          tone="error"
          title={found.error.message}
          action={
            <Button variant="primary" asChild>
              <a href={webHref('/collections')}>Collections</a>
            </Button>
          }
        >
          It may have been removed.
        </EmptyState>
      </main>
    )
  const { collection: c, items, shows } = found.data
  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-8 pb-16">
      <header className="relative">
        <img
          src={c.art.backdrop}
          alt=""
          className="absolute inset-0 size-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,var(--color-bg),transparent)]" />
        <div className={cn('relative mx-auto w-full grid max-w-[1680px] gap-2 pt-24 pb-6', gutter)}>
          <p className="font-mono text-label text-text-3 uppercase">
            {c.smart?.words ? 'Smart collection' : 'Collection'}
          </p>
          <h1 className="text-display">{c.name}</h1>
          <p className="text-text-2 text-body">
            {titlesHere(items.length, shows.length)} here · {c.years}
          </p>
          {c.smart?.words && <p className="text-caption text-text-3">{c.smart.words}</p>}
          {c.overview && <p className="max-w-[60ch] text-body text-text-2">{c.overview}</p>}
        </div>
      </header>
      <ul
        aria-label={titlesRow(items.length, shows.length)}
        className={cn(
          'mx-auto grid w-full max-w-[1680px] grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6',
          gutter,
        )}
      >
        {items.map((m) => (
          <li key={m.id}>
            <MediaPoster item={m} titleSize="body" href={webHref(`/movies/${m.id}`)} />
          </li>
        ))}
        {shows.map((m) => (
          <li key={`show-${m.id}`}>
            <ShowPoster show={m} titleSize="body" href={webHref(`/shows/${m.id}`)} />
          </li>
        ))}
      </ul>
    </main>
  )
}

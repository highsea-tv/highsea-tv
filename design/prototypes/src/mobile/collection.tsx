// SPDX-License-Identifier: AGPL-3.0-only
// A collection on mobile (reference, docs/product/client-search.md#collections): the first part's
// backdrop with Back over it, the name, years and overview, then its titles here, oldest first. A smart one
// (docs/product/collections.md) says so and gives its rules in words.
import { Button, cn, EmptyState, Skeleton, SkeletonText } from '@highsea-tv/ui'
import { useParams } from 'wouter'
import { titlesHere, titlesRow, useCollection } from '../client/data.ts'
import { MediaPoster, MediaPosterSkeleton } from '../client/media-card.tsx'
import { ShowPoster } from '../client/show-card.tsx'
import { BackBadge, gutter, mobileHref } from './shell.tsx'

export function MobileCollection() {
  const { id } = useParams<{ id: string }>()
  const found = useCollection(id, 'mobile')
  const back = <BackBadge fallback="/library/collections" />
  if (found.status === 'loading')
    return (
      <div aria-busy className="relative grid gap-5 pb-6">
        {back}
        <div className="relative aspect-still w-full bg-s1">
          <div className="absolute inset-0 bg-[linear-gradient(0deg,var(--color-bg),transparent_60%)]" />
        </div>
        <div className={cn('-mt-12 relative grid gap-2', gutter)}>
          <Skeleton className="my-1 h-7 w-3/5" />
          <Skeleton className="my-0.5 h-3.5 w-40" />
          <SkeletonText lines={2} className="py-1" />
        </div>
        <div className={cn('grid grid-cols-3 gap-x-2 gap-y-4', gutter)}>
          {Array.from({ length: 6 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
            <MediaPosterSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  if (found.status === 'error')
    return (
      <div className={cn('grid min-h-full place-items-center py-16', gutter)}>
        {back}
        <EmptyState
          icon="library"
          tone="error"
          title={found.error.message}
          action={
            <Button asChild>
              <a href={mobileHref('/search')}>Search</a>
            </Button>
          }
        >
          It may have been removed.
        </EmptyState>
      </div>
    )
  const { collection: c, items, shows } = found.data
  return (
    <article aria-labelledby="title" className="relative grid gap-5 pb-6">
      {back}
      <div className="relative">
        <img src={c.art.backdrop} alt="" className="aspect-still w-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,var(--color-bg),transparent_60%)]" />
      </div>
      <div className={cn('-mt-12 relative grid gap-2', gutter)}>
        {c.smart?.words && (
          <p className="font-mono text-label text-text-3 uppercase">Smart collection</p>
        )}
        <h1 id="title" className="font-semibold text-[28px] leading-[1.15] tracking-display">
          {c.name}
        </h1>
        <p className="text-[14px] text-text-3">
          {titlesHere(items.length, shows.length)} here · {c.years}
        </p>
        {c.smart?.words && <p className="text-[13px] text-text-3">{c.smart.words}</p>}
        {c.overview && <p className="text-[15px] text-text-2 leading-[1.45]">{c.overview}</p>}
      </div>
      <ul
        aria-label={titlesRow(items.length, shows.length)}
        className={cn('grid grid-cols-3 gap-x-2 gap-y-4', gutter)}
      >
        {items.map((m) => (
          <li key={m.id}>
            <MediaPoster item={m} href={mobileHref(`/movies/${m.id}`)} />
          </li>
        ))}
        {shows.map((m) => (
          <li key={`show-${m.id}`}>
            <ShowPoster show={m} href={mobileHref(`/shows/${m.id}`)} />
          </li>
        ))}
      </ul>
    </article>
  )
}

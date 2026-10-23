// SPDX-License-Identifier: AGPL-3.0-only
// A collection on mobile (reference, docs/product/client-search.md#collections): the first part's
// backdrop with Back over it, the name, years and overview, then its titles here, oldest first. A smart one
// (docs/product/collections.md) says so and gives its rules in words.
import { Button, cn, EmptyState, Icon, Poster, Skeleton } from '@highsea-tv/ui-web'
import { useParams } from 'wouter'
import { left, useCollection } from '../client/data.ts'
import { gutter, mobileHref } from './shell.tsx'

export function MobileCollection() {
  const { id } = useParams<{ id: string }>()
  const found = useCollection(id, 'mobile')
  const back = (
    <a
      href={mobileHref('/library/collections')}
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
  if (found.status === 'loading')
    return (
      <div aria-busy className="grid gap-4">
        <Skeleton className="aspect-still w-full rounded-none" />
        <Skeleton className={cn('h-8 w-56', gutter)} />
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
  const { collection: c, items } = found.data
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
          {c.count} {c.count === 1 ? 'movie' : 'movies'} here · {c.years}
        </p>
        {c.smart?.words && <p className="text-[13px] text-text-3">{c.smart.words}</p>}
        {c.overview && <p className="text-[15px] text-text-2 leading-[1.45]">{c.overview}</p>}
      </div>
      <ul aria-label="Movies" className={cn('grid grid-cols-3 gap-x-2 gap-y-4', gutter)}>
        {items.map((m) => (
          <li key={m.id}>
            <Poster
              title={m.title}
              src={m.art.poster}
              href={mobileHref(`/movies/${m.id}`)}
              progress={m.progress !== null ? m.progress * 100 : undefined}
              showTitle
              caption={m.progress !== null ? left(m) : String(m.year)}
            />
          </li>
        ))}
      </ul>
    </article>
  )
}

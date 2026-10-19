// SPDX-License-Identifier: AGPL-3.0-only
// C4 Item detail, mobile (docs/product/client-detail.md#mobile): the backdrop with Back over it;
// the title, Play or Resume across the width, then Watch with, the synopsis, the cast and More
// like this. Picks are remembered per title, across devices.
import {
  Button,
  cn,
  EmptyState,
  Icon,
  Poster,
  Rating,
  Skeleton,
  SkeletonText,
} from '@highsea/ui-web'
import { useParams } from 'wouter'
import { left, runtime, useItem } from '../client/data.ts'
import { WatchWith } from '../web/detail.tsx'
import { MobileRow, PosterItems } from './home.tsx'
import { gutter, mobileHref } from './shell.tsx'

export function MobileDetail() {
  const { id } = useParams<{ id: string }>()
  const detail = useItem(id)
  const back = (
    <a
      href={mobileHref('/')}
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
  if (detail.status === 'loading')
    return (
      <div aria-busy className="grid gap-4">
        <Skeleton className="aspect-still w-full rounded-none" />
        <div className={cn('grid gap-3', gutter)}>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-11 w-full" />
          <SkeletonText lines={3} />
        </div>
      </div>
    )
  if (detail.status === 'error')
    return (
      <div className={cn('grid min-h-full place-items-center py-16', gutter)}>
        {back}
        <EmptyState
          icon="movie"
          tone="error"
          title={detail.error.message}
          action={
            <Button asChild>
              <a href={mobileHref('/')}>Go home</a>
            </Button>
          }
        >
          It may have been removed.
        </EmptyState>
      </div>
    )
  const d = detail.data
  const m = d.item
  const resuming = m.progress !== null
  return (
    <article aria-labelledby="title" className="relative grid gap-5">
      {back}
      <div className="relative">
        <img src={m.art.backdrop} alt="" className="aspect-still w-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,var(--color-bg),transparent_60%)]" />
      </div>
      <div className={cn('-mt-12 relative grid gap-3', gutter)}>
        <h1 id="title" className="font-semibold text-[28px] leading-[1.15] tracking-display">
          {m.title}
        </h1>
        <p className="flex flex-wrap items-center gap-x-2 text-[14px] text-text-2">
          {m.year} · {runtime(m.runtimeMinutes)} · {m.genres[0]}
          {m.rating > 0 && <Rating value={m.rating} size={12} />}
        </p>
        <Button variant="primary" icon="play" asChild className="h-12 w-full text-[16px]">
          <a href={mobileHref(`/play/${m.id}`)}>{resuming ? `Resume · ${left(m)}` : 'Play'}</a>
        </Button>
        {resuming && (
          <Button icon="replay" asChild className="h-11 w-full">
            <a href={mobileHref(`/play/${m.id}/start`)}>Play from the start</a>
          </Button>
        )}
        <p className="text-[15px] text-text-2 leading-[1.55]">{m.synopsis}</p>
        {d.directors.length > 0 && (
          <p className="text-[13px] text-text-3">
            Directed by {d.directors.map((x) => x.name).join(' and ')}
          </p>
        )}
      </div>
      <section aria-labelledby="watch-with" className={cn('grid gap-3', gutter)}>
        <h2 id="watch-with" className="font-semibold text-[17px]">
          Watch with
        </h2>
        <WatchWith detail={d} compact />
      </section>
      {d.cast.length > 0 && (
        <MobileRow title="Cast">
          {d.cast.map((c) => (
            <li key={c.personId} className="w-[26%] shrink-0 snap-start">
              <Poster title={c.name} src={c.photo} showTitle caption={c.character} />
            </li>
          ))}
        </MobileRow>
      )}
      {d.related.length > 0 && (
        <MobileRow title="More like this">
          <PosterItems items={d.related} />
        </MobileRow>
      )}
    </article>
  )
}

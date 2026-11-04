// SPDX-License-Identifier: AGPL-3.0-only
// A movie's card, the same on every client (the owner, 2026-10-30): the poster, or Home's 16:9
// still, with the title and year under it; an episode's is its still, its show and "S2, E6". Only Home's Continue watching shows how far you got,
// as the bar under the art and the time left; nowhere else does a card show progress. The TV draws
// its own focus stop around these props (tv/kit.tsx's TvPoster).

import { type CardOptions, createFilmsText } from '@highsea-tv/client/films'
import type { ClientItem } from '@highsea-tv/mock/types'
import { cn, Poster, type PosterProps, Skeleton } from '@highsea-tv/ui'

const films = createFilmsText('en')

/** The card's title, art and caption, as every app has them (@highsea-tv/client/films). */
export function mediaCard(item: ClientItem, options: CardOptions) {
  const card = films.card(item, options)
  // the mock's art is always drawn: a poster or a still for every title
  return { ...card, src: card.src ?? '' }
}

/** The card on the web and the phone, its title and caption shown under the art. */
export function MediaPoster({
  item,
  href,
  wide,
  resume,
  ...rest
}: CardOptions & { item: ClientItem; href: string } & Pick<
    PosterProps,
    'quality' | 'actions' | 'className' | 'titleSize'
  >) {
  const card = mediaCard(item, { wide, resume })
  return (
    <Poster
      {...rest}
      title={card.title}
      src={card.src}
      aspect={card.aspect}
      href={href}
      progress={card.progress !== null ? card.progress * 100 : undefined}
      progressBelow={card.progressBelow}
      showTitle
      caption={card.caption}
    />
  )
}

/**
 * A card while its list loads, as `MediaPoster` lays one out: the art, then a line for the title
 * and a shorter one for the caption (Continue watching's adds the bar between).
 */
export function MediaPosterSkeleton({
  wide = false,
  resume = false,
  className,
}: CardOptions & { className?: string }) {
  return (
    <div aria-hidden className={cn('min-w-0', className)}>
      <Skeleton
        className={cn('rounded-poster', wide || resume ? 'aspect-still' : 'aspect-poster')}
      />
      {resume && <Skeleton className="mt-3.5 h-1 rounded-full" />}
      <div className="mt-2 grid gap-1.5 py-1">
        <Skeleton className="h-3.5 w-4/5" />
        <Skeleton className="h-3 w-2/5" />
      </div>
    </div>
  )
}

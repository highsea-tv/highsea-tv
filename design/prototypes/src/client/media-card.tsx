// SPDX-License-Identifier: AGPL-3.0-only
// A movie's card, the same on every client (the owner, 2026-10-30): the poster, or Home's 16:9
// still, with the title and year under it; an episode's is its still, its show and "S2, E6". Only Home's Continue watching shows how far you got,
// as the bar under the art and the time left; nowhere else does a card show progress. The TV draws
// its own focus stop around these props (tv/kit.tsx's TvPoster).
import { cn, Poster, type PosterProps, Skeleton } from '@highsea-tv/ui'
import type { ClientItem } from '../mock/types.ts'
import { left } from './data.ts'

export type MediaCardOptions = {
  /** Home's 16:9 card: the still in place of the poster. */
  wide?: boolean
  /** Continue watching: the progress bar under the art and the time left, on a still. */
  resume?: boolean
}

export function mediaCard(item: ClientItem, { wide = false, resume = false }: MediaCardOptions) {
  const still = wide || resume
  // an episode is its show's name over its place: "S2, E6 · 21 min left", or its title
  const { show } = item
  return {
    title: show ? show.title : item.title,
    src: still ? item.art.still : item.art.poster,
    aspect: still ? ('still' as const) : ('poster' as const),
    caption:
      resume && item.progress !== null
        ? show
          ? `${show.code} · ${left(item)}`
          : left(item)
        : show
          ? `${show.code} · ${show.episode}`
          : String(item.year),
    progress: resume ? (item.progress ?? 0) : null,
    progressBelow: resume,
  }
}

/** The card on the web and the phone, its title and caption shown under the art. */
export function MediaPoster({
  item,
  href,
  wide,
  resume,
  ...rest
}: MediaCardOptions & { item: ClientItem; href: string } & Pick<
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
}: MediaCardOptions & { className?: string }) {
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

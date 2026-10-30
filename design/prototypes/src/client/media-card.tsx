// SPDX-License-Identifier: AGPL-3.0-only
// A movie's card, the same on every client (the owner, 2026-10-30): the poster, or Home's 16:9
// still, with the title and year under it. Only Home's Continue watching shows how far you got,
// as the bar under the art and the time left; nowhere else does a card show progress. The TV draws
// its own focus stop around these props (tv/kit.tsx's TvPoster).
import { Poster, type PosterProps } from '@highsea-tv/ui-web'
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
  return {
    title: item.title,
    src: still ? item.art.still : item.art.poster,
    aspect: still ? ('still' as const) : ('poster' as const),
    caption: resume && item.progress !== null ? left(item) : String(item.year),
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

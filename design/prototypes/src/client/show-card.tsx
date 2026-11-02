// SPDX-License-Identifier: AGPL-3.0-only
// A show's card on the web and the phone: its poster with how many episodes are left to watch, as
// Plex and Infuse count them on the art, and the title with its seasons under it. A show you've
// watched through has no count, as a film you've watched has no mark. The TV draws its own focus
// stop around the same props.
import { Badge, Poster, type PosterProps } from '@highsea-tv/ui'
import type { ClientShow } from '../mock/types.ts'
import { seasonsCount } from './shows.ts'

/** The count on the art: unwatched episodes, shown only while some are left. */
export function UnwatchedCount({ show, className }: { show: ClientShow; className?: string }) {
  if (show.unwatched === 0) return null
  return (
    <Badge overlay tone="accent" className={className}>
      {show.unwatched}
      <span className="sr-only"> unwatched {show.unwatched === 1 ? 'episode' : 'episodes'}</span>
    </Badge>
  )
}

export function ShowPoster({
  show,
  href,
  caption,
  wide = false,
  ...rest
}: {
  show: ClientShow
  href: string
  /** A 16:9 still (the backdrop), as More like this has on a film's page and a show's. */
  wide?: boolean
} & Pick<PosterProps, 'className' | 'titleSize' | 'caption'>) {
  return (
    <Poster
      {...rest}
      title={show.title}
      src={wide ? show.art.backdrop : show.art.poster}
      aspect={wide ? 'still' : 'poster'}
      href={href}
      status={<UnwatchedCount show={show} />}
      showTitle
      caption={caption ?? seasonsCount(show.seasons)}
    />
  )
}

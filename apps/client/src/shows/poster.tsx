// SPDX-License-Identifier: AGPL-3.0-only
// A show's poster (the prototype's client/show-card.tsx): its art with how many episodes are left
// to watch, as Plex and Infuse count them on it, and the title with its seasons under it. A show
// watched through has no count, as a watched film has no mark. It opens the show's page; on the
// TV, Play/Pause plays what the show's Play would (tv.md). Wide, it's the backdrop as a still, as
// More like this draws it on a show's page.
import type { ClientShow } from '@highsea-tv/api-contract'
import { episodePlayPath, showPath } from '@highsea-tv/client/shows'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { Badge, Poster } from '@highsea-tv/ui'
import { type Href, router } from 'expo-router'
import type { PosterSlot } from '../library/movies.tsx'
import { showMessages as messages } from './messages.ts'
import { useShowsText } from './text.ts'

/** The count on the art, only while episodes are left. */
export function UnwatchedCount({ show }: { show: Pick<ClientShow, 'unwatched'> }) {
  if (show.unwatched === 0) return null
  return (
    <Badge overlay tone="accent">
      {String(show.unwatched)}
    </Badge>
  )
}

export function ShowPoster({
  show,
  wide = false,
  caption,
  ...slot
}: {
  show: ClientShow
  /** The backdrop as a 16:9 still. */
  wide?: boolean
  /** In place of the seasons. */
  caption?: string
} & PosterSlot) {
  const t = useT(messages)
  const text = useShowsText()
  const media = useMedia()
  const under = caption ?? text.seasonsCount(show.seasons)
  const next = show.next
  return (
    <Poster
      {...slot}
      title={show.title}
      src={media(wide ? show.art.backdrop : show.art.poster)}
      aspect={wide ? 'still' : 'poster'}
      status={<UnwatchedCount show={show} />}
      showTitle
      caption={under}
      accessibilityLabel={t('posterLabel', {
        title: show.title,
        caption: under,
        unwatched: show.unwatched,
      })}
      onPress={() => router.push(showPath(show.id) as Href)}
      onPlay={
        next
          ? () => router.push(episodePlayPath(next.episode.id, next.kind === 'again') as Href)
          : undefined
      }
    />
  )
}

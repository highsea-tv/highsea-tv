// SPDX-License-Identifier: AGPL-3.0-only
// A film's card on the phone, as on every client (the prototype's client/media-card.tsx): the
// poster, or Home's 16:9 still, with the title and year under it. Only Continue watching shows how
// far you got, as the bar under the art and the time left; nowhere else does a card show progress.
import type { ClientItem } from '@highsea-tv/api-contract'
import { LONG_PRESS_MS } from '@highsea-tv/client/library'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import { Poster, Row, usePosterWidth } from '@highsea-tv/ui'
import { router } from 'expo-router'

export const openMovie = (id: number) => router.push(`/movies/${id}`)

/** A film's poster with its title and year: the libraries' grids and Search. */
export function FilmPoster({ item, width }: { item: ClientItem; width: number }) {
  const media = useMedia()
  return (
    <Poster
      title={item.title}
      src={media(item.art.poster)}
      width={width}
      onPress={() => openMovie(item.id)}
      showTitle
      caption={item.year ? String(item.year) : undefined}
    />
  )
}

/**
 * A row of 16:9 stills, two and a peek, each with its title and year under it: Home's rows and
 * More like this.
 */
export function FilmRow({
  title,
  suffix,
  items,
}: {
  title: string
  suffix?: string | null
  items: ClientItem[]
}) {
  const media = useMedia()
  const width = usePosterWidth(0.46)
  return (
    <Row
      title={title}
      suffix={suffix}
      items={items}
      itemWidth={width}
      keyOf={(m) => String(m.id)}
      render={(m) => (
        <Poster
          title={m.title}
          src={media(m.art.backdrop)}
          aspect="still"
          width={width}
          onPress={() => openMovie(m.id)}
          showTitle
          caption={m.year ? String(m.year) : undefined}
        />
      )}
    />
  )
}

/** Continue watching's card: the still, the bar under it, the title and the time left. */
export function ContinuePoster({
  item,
  width,
  onMenu,
  menuLabel,
}: {
  item: ClientItem
  width: number
  onMenu: () => void
  menuLabel: string
}) {
  const media = useMedia()
  const f = useFormat()
  return (
    <Poster
      title={item.title}
      src={media(item.art.backdrop)}
      aspect="still"
      width={width}
      onPress={() => router.push(`/play/${item.id}`)}
      onLongPress={onMenu}
      longPressLabel={menuLabel}
      longPressMs={LONG_PRESS_MS}
      progress={(item.progress ?? 0) * 100}
      progressBelow
      showTitle
      caption={f.left(item) ?? undefined}
    />
  )
}

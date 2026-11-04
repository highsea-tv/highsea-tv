// SPDX-License-Identifier: AGPL-3.0-only
// Home's music rows (Recently played; the prototypes' {web,mobile,tv}/home.tsx `music` layout),
// which only a server that serves music sends: an album's square cover with its artist under it,
// or an artist's round photo, each opening its page (`homeMusicCard`). Touch draws them at 30% of
// the width (mobile/home.tsx's MusicItems), a pointer at the row's own width, and the TV an album
// at 12u and an artist at 10u (tv/home.tsx). ../home/rows.tsx and ../home/tv.tsx draw them in
// the row's place among the films'.
import type { HomeMusic, HomeRow } from '@highsea-tv/api-contract'
import { useMedia } from '@highsea-tv/native/media'
import { Poster, pointerItemWidth, Row, useFormFactor } from '@highsea-tv/ui'
import type { ViewHandle } from '@highsea-tv/ui/tv'
import { type Href, router } from 'expo-router'
import type { RefObject } from 'react'
import { useWindowDimensions } from 'react-native'
import { useFilmsText } from '../films.ts'
import { useMusicText } from './parts.tsx'
import { TV_MUSIC } from './sizes.ts'

type MusicRow = Extract<HomeRow, { layout: 'music' }>

/** The phone's share of the width for each (w-[30%]). */
const PHONE_SHARE = 0.3

const keyOf = (x: HomeMusic) => (x.kind === 'album' ? x.album.id : x.artist.id)

/** Home's music row by touch or with a pointer. */
export function MusicHomeRow({ row }: { row: MusicRow }) {
  const films = useFilmsText()
  const text = useMusicText()
  const media = useMedia()
  const input = useFormFactor().input
  const window = useWindowDimensions().width
  const width = input === 'touch' ? window * PHONE_SHARE : pointerItemWidth(window)
  return (
    <Row
      title={films.rowTitle(row)}
      suffix={row.suffix}
      items={row.items}
      itemWidth={width}
      keyOf={keyOf}
      render={(x) => {
        const c = text.homeMusicCard(x)
        return (
          <Poster
            aspect="square"
            round={c.round}
            title={c.title}
            src={media(c.src)}
            width={width}
            showTitle
            caption={c.caption}
            onPress={() => router.push(c.path as Href)}
          />
        )
      }}
    />
  )
}

/**
 * Home's music row on the TV. The first row with no featured card above it takes focus at its
 * first tile (`lead`), as ../home/tv.tsx's other rows do, and says when focus is on it for Back.
 */
export function TvMusicHomeRow({
  row,
  lead,
  first,
  setOnFirst,
}: {
  row: MusicRow
  lead: boolean
  first: RefObject<ViewHandle | null>
  setOnFirst: (on: boolean) => void
}) {
  const films = useFilmsText()
  const text = useMusicText()
  const media = useMedia()
  return (
    <Row
      title={films.rowTitle(row)}
      suffix={row.suffix}
      items={row.items}
      keyOf={keyOf}
      itemWidth={TV_MUSIC.homeAlbum}
      render={(x, at) => {
        const c = text.homeMusicCard(x)
        const head = lead && at.index === 0
        return (
          <Poster
            ref={head ? first : undefined}
            preferred={head}
            aspect="square"
            round={c.round}
            title={c.title}
            caption={c.caption}
            src={media(c.src)}
            width={c.round ? TV_MUSIC.homeArtist : TV_MUSIC.homeAlbum}
            showTitle
            onFocus={() => {
              at.onFocus()
              setOnFirst(head)
            }}
            onPress={() => router.push(c.path as Href)}
          />
        )
      }}
    />
  )
}

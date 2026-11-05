// SPDX-License-Identifier: AGPL-3.0-only
// A spotlight with a pointer (client-home.md › Web and desktop, the web prototype's SpotlightRow):
// for a curated theme, wider cards than a row's, each its still, title and line, then two lines of
// synopsis. On a phone a spotlight reads as a row (there's no room for a synopsis beside the art),
// and on the TV as a film row, whose card describes its film.
import type { HomeItem } from '@highsea-tv/api-contract'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import { Poster, Row, Text, tokens } from '@highsea-tv/ui'
import { useWindowDimensions, View } from 'react-native'
import { useFilmsText } from '../films.ts'
import { openTitle } from './go.ts'

const { space } = tokens

/** 30% of the window, from 17rem to 27rem (the prototype's w-[clamp(17rem,30vw,27rem)]). */
const SPOT_OF_WINDOW = 0.3

export function HomeSpotlightRow({
  title,
  suffix,
  items,
}: {
  title: string
  suffix: string | null
  items: HomeItem[]
}) {
  const media = useMedia()
  const format = useFormat()
  const films = useFilmsText()
  const { width: window } = useWindowDimensions()
  const width = Math.min(Math.max(SPOT_OF_WINDOW * window, space['16'] * 4.25), space['16'] * 6.75)
  return (
    <Row
      title={title}
      suffix={suffix}
      items={items}
      itemWidth={width}
      keyOf={(m) => m.id}
      render={(m) => (
        <View style={{ width, gap: space['1'] }}>
          <Poster
            title={m.title}
            src={media(films.card(m, { wide: true }).src)}
            aspect="still"
            width={width}
            showTitle
            caption={format.meta(m)}
            onPress={() => openTitle(m)}
          />
          <Text variant="body" color="text-2" numberOfLines={2}>
            {m.synopsis}
          </Text>
        </View>
      )}
    />
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// Home's rows on touch and with a pointer, and the words around them:
// - touch: the phone prototype's rows of 16:9 stills, 46% of the row with two and a peek, each
//   with its title and year under the art (mobile/home.tsx PosterItems wide); spotlights read as
//   these rows too;
// - a pointer: the library's FilmRow, looping, its first slot fixed (web/home.tsx WebFilmRow), and
//   a spotlight's wider cards (./spotlight.tsx);
// - both: Continue watching (./continue.tsx), and on a server that serves shows (B3) Next up's and
//   New episodes' stills, which play the episode, and Recently added shows' posters (the
//   prototypes' home.tsx rows of episodes and shows); music's rows are ../music/home.tsx's.
// What was just said (marked as watched) is the shell's toast region's (kit's useSay).
import type { HomeItem, HomeRow as Section } from '@highsea-tv/api-contract'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import {
  FilmRow,
  Poster,
  pointerItemWidth,
  Row,
  tokens,
  useFormFactor,
  usePosterWidth,
} from '@highsea-tv/ui'
import { useWindowDimensions } from 'react-native'
import { useFilmsText } from '../films.ts'
import { MusicHomeRow } from '../music/home.tsx'
import { ShowPoster } from '../shows/poster.tsx'
import { HomeContinueRow } from './continue.tsx'
import { openTitle, playCard, playTitle } from './go.ts'
import { HOME } from './sizes.ts'
import { HomeSpotlightRow } from './spotlight.tsx'

const { space } = tokens

/** With a pointer, between the featured card and each row: the prototype's gap-20. */
export const POINTER_APART = space['16'] + space['4']

/** One of Home's rows below the featured section, at this form factor (not the TV's). */
export function HomeRow({ section }: { section: Section }) {
  const films = useFilmsText()
  const format = useFormat()
  const media = useMedia()
  const input = useFormFactor().input
  const stillWidth = usePosterWidth(HOME.stillShare)
  const window = useWindowDimensions().width
  const title = films.rowTitle(section)
  // music's rows are b3-music's (../music/home.tsx)
  if (section.layout === 'music') return <MusicHomeRow row={section} />
  if (section.layout === 'shows') {
    const width = input === 'pointer' ? pointerItemWidth(window) : stillWidth
    return (
      <Row
        title={title}
        suffix={section.suffix}
        items={section.items}
        itemWidth={width}
        keyOf={(x) => x.id}
        render={(x) => <ShowPoster show={x} wide={input === 'touch'} width={width} />}
      />
    )
  }
  if (section.layout === 'episodes') {
    const width = input === 'pointer' ? pointerItemWidth(window, 'still') : stillWidth
    return (
      <Row
        title={title}
        suffix={section.suffix}
        items={section.items}
        itemWidth={width}
        keyOf={(m) => m.id}
        render={(m) => <EpisodeCard item={m} width={width} />}
      />
    )
  }
  if (section.layout === 'continue') return <HomeContinueRow title={title} items={section.items} />
  if (input === 'pointer')
    return section.layout === 'spotlight' ? (
      <HomeSpotlightRow title={title} suffix={section.suffix} items={section.items} />
    ) : (
      <FilmRow
        title={title}
        suffix={section.suffix}
        items={section.items}
        art={(m) => ({
          poster: media(films.card(m).src),
          backdrop: media(films.card(m, { wide: true }).src),
        })}
        meta={format.meta}
        loop
        onOpen={openTitle}
        onPlay={(m) => playTitle(m.id)}
      />
    )
  return (
    <Row
      title={title}
      suffix={section.suffix}
      items={section.items}
      itemWidth={stillWidth}
      keyOf={(m) => m.id}
      render={(m) => {
        const card = films.card(m, { wide: true })
        return (
          <Poster
            title={card.title}
            src={media(card.src)}
            aspect={card.aspect}
            width={stillWidth}
            showTitle
            caption={card.caption}
            onPress={() => openTitle(m)}
          />
        )
      }}
    />
  )
}

/** An episode on Next up or New episodes: its still, the show over "S2, E6", playing it. */
function EpisodeCard({ item, width }: { item: HomeItem; width: number }) {
  const films = useFilmsText()
  const media = useMedia()
  const card = films.card(item, { wide: true })
  return (
    <Poster
      title={card.title}
      src={media(card.src)}
      aspect="still"
      width={width}
      showTitle
      caption={card.caption}
      onPress={() => playCard(item)}
    />
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// Home's rows on touch and with a pointer, and the words around them:
// - touch: the phone prototype's rows of 16:9 stills, 46% of the row with two and a peek, each
//   with its title and year under the art (mobile/home.tsx PosterItems wide); spotlights read as
//   these rows too;
// - a pointer: the library's FilmRow, looping, its first slot fixed (web/home.tsx WebFilmRow), and
//   a spotlight's wider cards (./spotlight.tsx);
// - both: Continue watching (./continue.tsx).
// What was just said (marked as watched) is the shell's toast region's (kit's useSay).
import type { HomeSection } from '@highsea-tv/api-contract'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import { FilmRow, Poster, Row, tokens, useFormFactor, usePosterWidth } from '@highsea-tv/ui'
import { useFilmsText } from '../films.ts'
import { HomeContinueRow } from './continue.tsx'
import { openTitle, playTitle } from './go.ts'
import { HOME } from './sizes.ts'
import { HomeSpotlightRow } from './spotlight.tsx'

const { space } = tokens

/** With a pointer, between the featured card and each row: the prototype's gap-20. */
export const POINTER_APART = space['16'] + space['4']

/** One of Home's rows below the featured section, at this form factor (not the TV's). */
export function HomeRow({ section }: { section: HomeSection }) {
  const films = useFilmsText()
  const format = useFormat()
  const media = useMedia()
  const input = useFormFactor().input
  const stillWidth = usePosterWidth(HOME.stillShare)
  const title = films.rowTitle(section)
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

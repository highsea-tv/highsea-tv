// SPDX-License-Identifier: AGPL-3.0-only
// Home's featured section (client-home.md), on the library's FeaturedCard, by the form factor:
// - touch: the phone prototype's carousel (mobile/home.tsx Featured), a Row of cards 78% of the
//   row (FEATURED_SHARE) and 12 apart (FEATURED_GAP), the next peeking, each with its kicker
//   ("New · 2010 · Fantasy") over the title; it never moves by itself;
// - a pointer: the web prototype's card (web/home.tsx FeaturedCard), inside the page's gutters and
//   no wider than the page's measure, with Play or Resume and More info, and the library's Pager
//   through the section's titles from a medium window up. It never moves by itself.
// The TV's is the same part in its TV form, in the screen itself (./tv.tsx).
import type { HomeItem } from '@highsea-tv/api-contract'
import { filmsMessages } from '@highsea-tv/client/films'
import { useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import { web } from '@highsea-tv/tokens'
import {
  Button,
  FEATURED_GAP,
  FEATURED_SHARE,
  FeaturedCard,
  Pager,
  Row,
  usePageGutter,
  usePosterWidth,
} from '@highsea-tv/ui'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { useFilmsText } from '../films.ts'
import { openTitle, playTitle } from './go.ts'
import { homeMessages } from './messages.ts'

/**
 * The featured title's colour for the bloom behind its card (the library's Bloom). The server is to
 * work it out once, when it caches the artwork, and send it with the item (the owner, 2026-10-30,
 * in design/prototypes/src/client/vibrant.ts); until it does there's none, and the bloom draws
 * nothing.
 */
export const bloomColor = (_item: HomeItem): string | null => null

/** The phone's carousel, named by its section. */
export function HomeCarousel({ items, label }: { items: HomeItem[]; label: string }) {
  const media = useMedia()
  const films = useFilmsText()
  const width = usePosterWidth(FEATURED_SHARE)
  // the device's clock: the mock transport moves its dates onto it (@highsea-tv/mock's `wall`), so
  // a mock build and a real server read New the same way
  const now = Date.now()
  return (
    <Row
      title={label}
      titleHidden
      items={items}
      keyOf={(m) => m.id}
      itemWidth={width}
      itemGap={FEATURED_GAP}
      render={(m, at) => (
        <FeaturedCard
          title={m.title}
          kicker={films.kicker(m, at.index === 0, now)}
          poster={media(films.card(m).src)}
          width={width}
          onPress={() => openTitle(m)}
        />
      )}
    />
  )
}

/** The web's featured card, paging through the section's titles. */
export function HomeFeatured({
  items,
  onShow,
}: {
  items: HomeItem[]
  /** The title the pager is on, for the bloom behind the card. */
  onShow?: (item: HomeItem) => void
}) {
  const t = useT(homeMessages)
  const f = useT(filmsMessages)
  const films = useFilmsText()
  const media = useMedia()
  const format = useFormat()
  const gutter = usePageGutter()
  const [chosen, setAt] = useState(0)
  // a refresh can leave fewer titles than the one on show
  const at = Math.min(chosen, items.length - 1)
  const item = items[at]
  useEffect(() => {
    if (item) onShow?.(item)
  }, [item, onShow])
  if (!item) return null
  return (
    <View
      style={{
        paddingHorizontal: gutter,
        width: '100%',
        maxWidth: web.maxWidth,
        alignSelf: 'center',
      }}
    >
      <FeaturedCard
        key={item.id}
        title={item.title}
        meta={format.meta(item)}
        tagline={item.tagline ?? item.synopsis}
        backdrop={media(films.card(item, { wide: true }).src)}
        accessibilityLabel={t('featured')}
        onPress={() => openTitle(item)}
        actions={
          <>
            <Button variant="primary" icon="play" onPress={() => playTitle(item.id)}>
              {item.progress !== null ? f('resume') : f('play')}
            </Button>
            <Button variant="secondary" icon="info" onPress={() => openTitle(item)}>
              {t('moreInfo')}
            </Button>
          </>
        }
        pager={
          <Pager
            count={items.length}
            current={at}
            onChange={setAt}
            previousLabel={t('previous')}
            nextLabel={t('next')}
            pageLabel={(i) => t('show', { title: items[i]?.title ?? '' })}
          />
        }
      />
    </View>
  )
}

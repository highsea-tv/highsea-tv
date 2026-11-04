// SPDX-License-Identifier: AGPL-3.0-only
// Home on the TV (client-home.md#tv, the prototype's tv/home.tsx), under the shell's head: the
// featured section's first title as one large card across the page (OK opens the film), then the
// rows: Continue watching's wide cards, which resume, with OK held opening their menu, and the
// others as film rows that loop. The page follows focus (the library's TvPage), resting at its top
// while focus is on the featured card. Back at the root returns focus to the featured card, and
// from there leaves highsea (homeBack); with the menu open it closes the menu, focus going back to
// its card, or to the row's next once the card has gone, and nowhere once Go to the film has left.
// The head lies over the page and scrolls away with it (kit's useChromeOverlay), as the prototype's.
import type { HomeItem, HomeSection } from '@highsea-tv/api-contract'
import { heroOf, rowsOf } from '@highsea-tv/client/films'
import { LONG_PRESS_MS } from '@highsea-tv/client/library'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import { Bloom, FeaturedCard, FilmRow, Poster, Row, tokens, useTheme } from '@highsea-tv/ui'
import {
  focusOn,
  homeBack,
  Kept,
  TV_HEAD_HEIGHT,
  TV_ROW_GAP,
  TvPage,
  type ViewHandle,
} from '@highsea-tv/ui/tv'
import { useIsFocused } from 'expo-router'
import { useRef, useState } from 'react'
import { type NativeScrollEvent, type NativeSyntheticEvent, View } from 'react-native'
import { useBack, useLeaveOnBack } from '../back.tsx'
import { useFilmsText } from '../films.ts'
import { useChromeOverlay } from '../kit.tsx'
import { HomeTvContinueMenu, type MenuClose } from './continue.tsx'
import { bloomColor } from './featured.tsx'
import { openTitle, playTitle } from './go.ts'
import { HOME } from './sizes.ts'

const tv = tokens.tv

/**
 * Where a row lands as focus reaches it, its centre this far down the screen: a row's title then
 * sits near the safe area's top, under the head (tv.md › Scrolling).
 */
const ROW_KEEP = 0.4

const WEIGHT: Record<MenuClose, number> = { stay: 0, gone: 1, leave: 2 }
/** Of two closes for one choice, the one that says more: leaving wins, then the card going. */
const weightier = (a: MenuClose, b: MenuClose) => (WEIGHT[b] > WEIGHT[a] ? b : a)

export function HomeTv({ sections }: { sections: HomeSection[] }) {
  const films = useFilmsText()
  const format = useFormat()
  const u = useTheme().u
  const media = useMedia()
  const chrome = useChromeOverlay()
  // the bloom behind the featured card shows while the page rests at its top (tv/home.tsx's
  // shown={!lifted})
  const [lifted, setLifted] = useState(false)
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    chrome.onScroll(e)
    setLifted(e.nativeEvent.contentOffset.y > 0)
  }

  const featured = heroOf(sections)?.items[0]
  const rows = rowsOf(sections)
  const [menu, setMenu] = useState<HomeItem | null>(null)
  const cards = useRef(new Map<number, ViewHandle | null>())

  // Back: to the featured card (or the first row's first stop), then out of highsea
  const first = useRef<ViewHandle>(null)
  const [onFirst, setOnFirst] = useState(false)
  // Home stays mounted under the screens opened from it, which need Back for their own
  const onView = useIsFocused()
  useLeaveOnBack(onFirst && onView && !menu)
  useBack(() => {
    if (menu) {
      closeMenu('stay')
      return true
    }
    // not taken: the platform's, which leaves highsea
    if (homeBack(onFirst) === 'exit') return false
    focusOn(first.current)
    return true
  })

  // the menu closes as a choice is made, then the choice says how: one move of focus after both,
  // to the card, to the row's next once the card has gone, or none once Go to has left Home
  const closing = useRef<{ how: MenuClose } | null>(null)
  const closeMenu = (how: MenuClose) => {
    if (!menu) return
    if (closing.current) {
      closing.current.how = weightier(closing.current.how, how)
      return
    }
    const pending = { how }
    closing.current = pending
    const row = rows.find((x) => x.layout === 'continue')?.items ?? []
    const i = row.findIndex((m) => m.id === menu.id)
    setMenu(null)
    setTimeout(() => {
      closing.current = null
      if (pending.how === 'leave') return
      const to = pending.how === 'gone' ? (row[i + 1] ?? row[i - 1]) : menu
      if (to) focusOn(cards.current.get(to.id))
    }, 0)
  }

  return (
    <View style={{ flex: 1 }}>
      {featured ? <Bloom color={bloomColor(featured)} shown={!lifted} /> : null}
      <TvPage keep={ROW_KEEP} onScroll={onScroll} scrollEventThrottle={chrome.scrollEventThrottle}>
        <View
          style={{
            // clear of the head laid over the page, then the prototype's pt-[1.6cqw]
            paddingTop: (TV_HEAD_HEIGHT + TV_ROW_GAP) * u,
            paddingBottom: tv.safe.y * u,
            gap: TV_ROW_GAP * u,
          }}
        >
          {featured ? (
            <Kept
              rest
              style={{ paddingHorizontal: tv.safe.x * u, paddingVertical: HOME.tvFeaturedPad * u }}
            >
              <FeaturedCard
                ref={first}
                preferred
                title={featured.title}
                meta={format.meta(featured)}
                tagline={featured.tagline ?? featured.synopsis}
                backdrop={media(films.card(featured, { wide: true }).src)}
                onFocus={() => setOnFirst(true)}
                onPress={() => openTitle(featured)}
              />
            </Kept>
          ) : null}
          {rows.map((section, i) => {
            const lead = !featured && i === 0
            const title = films.rowTitle(section)
            return (
              <Kept key={section.id}>
                {section.layout === 'continue' ? (
                  <Row
                    title={title}
                    suffix={section.suffix}
                    items={section.items}
                    keyOf={(m) => m.id}
                    itemWidth={HOME.tvContinueWidth}
                    render={(m, at) => {
                      const card = films.card(m, { resume: true })
                      return (
                        <Poster
                          ref={(node) => {
                            cards.current.set(m.id, node)
                            if (lead && at.index === 0) first.current = node
                          }}
                          preferred={lead && at.index === 0}
                          title={card.title}
                          caption={card.caption}
                          src={media(card.src)}
                          aspect="still"
                          width={HOME.tvContinueWidth}
                          progress={(card.progress ?? 0) * 100}
                          progressBelow
                          onFocus={() => {
                            at.onFocus()
                            setOnFirst(lead && at.index === 0)
                          }}
                          onPress={() => playTitle(m.id)}
                          onPlay={() => playTitle(m.id)}
                          onLongPress={() => setMenu(m)}
                          longPressMs={LONG_PRESS_MS}
                        />
                      )
                    }}
                  />
                ) : (
                  <FilmRow
                    ref={lead ? first : undefined}
                    title={title}
                    suffix={section.suffix}
                    items={section.items}
                    art={(m) => ({
                      poster: media(films.card(m).src),
                      backdrop: media(films.card(m, { wide: true }).src),
                    })}
                    meta={format.meta}
                    loop
                    preferred={lead}
                    onFocus={() => setOnFirst(lead)}
                    onOpen={openTitle}
                    onPlay={(m) => playTitle(m.id)}
                  />
                )}
              </Kept>
            )
          })}
        </View>
      </TvPage>
      {menu ? <HomeTvContinueMenu item={menu} onClose={closeMenu} /> : null}
    </View>
  )
}

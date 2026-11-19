// SPDX-License-Identifier: AGPL-3.0-only
// Home's featured section when it leads Home (leadHeroOf, the owner's call of 2026-11-18): the
// title hero a film's page has (../detail/hero.tsx), full bleed at Home's top, with the title the
// section is on:
// - touch: the section's titles side by side, a screen wide each, swiped one at a time, their art
//   at the featured card's 4:5 under the status bar, faded into the page; the header (the server
//   switcher and the avatar) over the art's top on a fade of the page's colour, so it and the
//   status bar read on any art, scrolling away with the page as it did; under the art the kicker,
//   the title's logo, Play or Resume and More info; no dots (the owner's call of 2026-11-19), the
//   scroller's label saying which title of how many;
// - a pointer: PointerHero, the art filling the first screen under the clear top bar, the words
//   low on the left (the logo, the meta line, the tagline, Play or Resume and More info) and the
//   Pager's arrows alone at the foot's end (no dots: the owner's call of 2026-11-19, a server's
//   fifty titles ran them across half the screen), Left and Right paging from inside the hero;
// - the TV: TvHero, the art across the first screen behind the head, the words low on the left,
//   Play or Resume (where focus starts, and where Back returns) and More info.
// Further down Home, or with none, the featured section stays the card it was (./featured.tsx).
import type { HomeItem } from '@highsea-tv/api-contract'
import { filmsMessages } from '@highsea-tv/client/films'
import { useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import {
  alpha,
  Button,
  NamedAction,
  Pager,
  ROUND_ACTION_ROOM,
  Text,
  TitleBackdrop,
  TitleLogo,
  tokens,
  useControl,
  useTheme,
} from '@highsea-tv/ui'
import { FocusGuide, type ViewHandle } from '@highsea-tv/ui/tv'
import { type ReactNode, type Ref, useState } from 'react'
import { ScrollView, useWindowDimensions, View, type ViewProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { HERO_WORDS, PointerHero, TvHero } from '../detail/hero.tsx'
import { useFilmsText } from '../films.ts'
import { openTitle, playTitle } from './go.ts'
import { homeMessages } from './messages.ts'

const { space } = tokens

type KeyDown = Parameters<NonNullable<ViewProps['onKeyDown']>>[0]

/** Touch's hero frame: the featured card's 4:5, taller than a title page's 16:9. */
const TOUCH_FRAME = 4 / 5

// ---------------------------------------------------------------- touch

export function TouchHomeHero({
  title,
  items,
  header,
}: {
  /** The section's title ("Featured on Harbor"), what the hero is read as. */
  title: string
  items: HomeItem[]
  header: ReactNode
}) {
  const window = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const theme = useTheme()
  const t = useT(homeMessages)
  const [chosen, setAt] = useState(0)
  const at = Math.min(chosen, items.length - 1)
  const width = window.width
  const bg = theme.colors.bg
  return (
    <View>
      {/* React Native's own scroller: react-native-web's pagingEnabled snaps each direct child
          (ScrollView's web source wraps every child in a snap box), and the library's ScrollView
          hands it one, its scroll source's provider, so the pages would share one box */}
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // no dots under the titles (the owner's call of 2026-11-19), so the label says where it is
        accessibilityLabel={
          items.length > 1 ? t('page', { section: title, n: at + 1, count: items.length }) : title
        }
        scrollEventThrottle={16}
        onScroll={(e) => setAt(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width)))}
      >
        {items.map((m, i) => (
          <TouchPage key={m.id} item={m} index={i} width={width} />
        ))}
      </ScrollView>
      {/* the header over the art's top, on the page's colour faded out, under the status bar */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          paddingTop: insets.top + space['1'],
          paddingBottom: space['6'],
          backgroundImage: `linear-gradient(180deg, ${alpha(bg, 0.7)} 0%, ${alpha(bg, 0)} 100%)`,
        }}
      >
        {header}
      </View>
    </View>
  )
}

function TouchPage({ item, index, width }: { item: HomeItem; index: number; width: number }) {
  const media = useMedia()
  const films = useFilmsText()
  const f = useT(filmsMessages)
  const t = useT(homeMessages)
  const m = useControl()
  // the device's clock, as the carousel reads New (./featured.tsx)
  const now = Date.now()
  const kicker = films.kicker(item, index === 0, now)
  return (
    <View style={{ width }}>
      <TitleBackdrop source={media(films.card(item, { wide: true }).src)} aspect={TOUCH_FRAME} />
      <View
        style={{
          marginTop: -space['16'] * 2,
          paddingHorizontal: tokens.mobile.gutter,
          gap: space['3'],
        }}
      >
        {kicker ? (
          <Text variant="caption" color="text-2" numberOfLines={1}>
            {kicker}
          </Text>
        ) : null}
        <TitleLogo
          title={item.title}
          logo={media(item.art.logo)}
          variant="largeTitle"
          numberOfLines={2}
        />
        <View style={{ flexDirection: 'row', gap: m.gap }}>
          <View style={{ flex: 1 }}>
            <Button variant="primary" icon="play" block onPress={() => playTitle(item.id)}>
              {item.progress !== null ? f('resume') : f('play')}
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button variant="secondary" icon="info" block onPress={() => openTitle(item)}>
              {t('moreInfo')}
            </Button>
          </View>
        </View>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------- a pointer

/** The pointer's hero, paging through the section's titles. Hand it usePointerHero's `hero`. */
export function PointerHomeHero({
  title,
  items,
  hero,
}: {
  /** The section's title ("Featured on Harbor"), what the hero is read as. */
  title: string
  items: HomeItem[]
  hero: { minHeight: number; pad: number }
}) {
  const t = useT(homeMessages)
  const f = useT(filmsMessages)
  const films = useFilmsText()
  const media = useMedia()
  const format = useFormat()
  const c = useControl()
  const [chosen, setAt] = useState(0)
  // a refresh can leave fewer titles than the one on show
  const at = Math.min(chosen, items.length - 1)
  const item = items[at]
  if (!item) return null
  const tagline = item.tagline ?? item.synopsis
  const count = items.length
  // Left and Right page the hero while the keyboard's focus is in it (Play, More info, the
  // arrows); the key's event bubbles to the region from whichever has the focus
  const step = (e: KeyDown) => {
    const k = e.nativeEvent
    if (count < 2 || k.altKey || k.ctrlKey || k.metaKey || k.shiftKey) return
    const by = k.key === 'ArrowRight' ? 1 : k.key === 'ArrowLeft' ? -1 : 0
    if (!by) return
    e.preventDefault()
    setAt((at + by + count) % count)
  }
  return (
    <View accessibilityRole="region" accessibilityLabel={title} onKeyDown={step}>
      <PointerHero
        key={item.id}
        source={media(films.card(item, { wide: true }).src)}
        hero={hero}
        end={
          <Pager
            count={items.length}
            current={at}
            onChange={setAt}
            previousLabel={t('previous')}
            nextLabel={t('next')}
            dots={false}
          />
        }
      >
        <View style={{ maxWidth: HERO_WORDS, gap: space['3'] }}>
          <TitleLogo title={item.title} logo={media(item.art.logo)} variant="display" />
          <Text variant="caption" color="text-2">
            {format.meta(item)}
          </Text>
          {tagline ? (
            <Text variant="body" numberOfLines={3}>
              {tagline}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: c.gap }}>
          <View style={{ minWidth: space['16'] * 2 }}>
            <Button variant="primary" icon="play" block onPress={() => playTitle(item.id)}>
              {item.progress !== null ? f('resume') : f('play')}
            </Button>
          </View>
          <Button variant="secondary" icon="info" onPress={() => openTitle(item)}>
            {t('moreInfo')}
          </Button>
        </View>
      </PointerHero>
    </View>
  )
}

// ---------------------------------------------------------------- the TV

/**
 * The TV's hero, the section's first title as the TV's card had it. Put it in the page's
 * `<Kept rest>`; `first` is Play, where focus starts and where Back returns.
 */
export function TvHomeHero({
  item,
  first,
  onFocus,
}: {
  item: HomeItem
  first: Ref<ViewHandle>
  onFocus: (first: boolean) => void
}) {
  const t = useT(homeMessages)
  const f = useT(filmsMessages)
  const films = useFilmsText()
  const media = useMedia()
  const format = useFormat()
  const c = useControl()
  const u = useTheme().u
  const tagline = item.tagline ?? item.synopsis
  return (
    <TvHero source={media(films.card(item, { wide: true }).src)}>
      <TitleLogo
        title={item.title}
        logo={media(item.art.logo)}
        variant="heroTitle"
        numberOfLines={2}
      />
      <Text variant="pill" color="text-2">
        {format.meta(item)}
      </Text>
      {tagline ? (
        <Text variant="synopsis" numberOfLines={3}>
          {tagline}
        </Text>
      ) : null}
      {/* room under the actions for the name a round button shows on focus, as a film's page */}
      <View style={{ paddingBottom: ROUND_ACTION_ROOM * u }}>
        <FocusGuide autoFocus style={{ flexDirection: 'row', alignItems: 'center', gap: c.rowGap }}>
          <View style={{ minWidth: tokens.tv.poster.width * u }}>
            <Button
              ref={first}
              variant="primary"
              hasTVPreferredFocus
              icon="play"
              block
              onFocus={() => onFocus(true)}
              onPress={() => playTitle(item.id)}
            >
              {item.progress !== null ? f('resume') : f('play')}
            </Button>
          </View>
          <NamedAction
            icon="info"
            label={t('moreInfo')}
            onFocus={() => onFocus(false)}
            onPress={() => openTitle(item)}
          />
        </FocusGuide>
      </View>
    </TvHero>
  )
}

// SPDX-License-Identifier: AGPL-3.0-only
// C2 Home, TV (client-home.md#tv, the prototype's tv/home.tsx): the head, then the featured
// section's first title as one large card across the page (OK opens the film), then the rows:
// Continue watching's 16:9 cards, which resume, with OK held opening their menu, and the others as
// film rows that loop (@highsea-tv/ui/tv's TvFilmRow). The page is a scroll view: it rests at the
// top while focus is on the head or the featured card, and on any row below lifts so that row's
// title sits at the safe area's top (react-native-tvos's `scrollSnapOffset`). Back at the root
// returns focus to the featured card, and from there leaves highsea (homeBack). An announcement that
// must be acknowledged comes first, on its own. Built-in rows have no title from the server; they're
// named here.
import type { HomeItem, HomeSection } from '@highsea-tv/api-contract'
import { useAnnouncements, useContinueActions, useHome } from '@highsea-tv/client/data'
import { createFormat } from '@highsea-tv/client/format'
import { createLibraryText, LONG_PRESS_MS } from '@highsea-tv/client/library'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { Button, Icon, Text, tokens, useTheme } from '@highsea-tv/ui'
import {
  focusOn,
  homeBack,
  TvFeaturedCard,
  TvFilmRow,
  TvMenu,
  TvMessage,
  TvRow,
  TvTile,
  type ViewHandle,
} from '@highsea-tv/ui/tv'
import { Image } from 'expo-image'
import { router, useIsFocused } from 'expo-router'
import { useMemo, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import { useReducedMotion } from 'react-native-reanimated'
import { useBack } from '../back.ts'
import { appKind, ServerIdentity, TvHead } from '../kit.tsx'
import { home as messages, shell } from '../messages.ts'
import { useLeaveOnBack } from '../remote.tsx'

const tv = tokens.tv

/** Continue watching's cards, in units: larger than a poster row's (the owner, 2026-10-30). */
const CONTINUE_WIDTH = 22

type T = ReturnType<typeof useT<typeof messages>>

const titleOf = (s: HomeSection, t: T) =>
  s.title ?? (s.id === 'continue' ? t('continue') : s.id === 'recent' ? t('recent') : '')

export default function HomeScreen() {
  const t = useT(messages)
  const home = useHome(appKind)
  const a = useAnnouncements(appKind)
  const theme = useTheme()
  if (a.modal) return <Acknowledge />
  if (home.status === 'loading')
    return (
      <View accessibilityState={{ busy: true }} style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors['text-3']} />
      </View>
    )
  if (home.status === 'error')
    return (
      <TvMessage
        title={t('failed')}
        actions={
          <Button variant="primary" hasTVPreferredFocus onPress={home.refetch}>
            {t('tryAgain')}
          </Button>
        }
      >
        {home.error.message}
      </TvMessage>
    )
  if (home.data.length === 0) return <Empty />
  return <Home sections={home.data} />
}

function Empty() {
  const t = useT(messages)
  const s = useT(shell)
  return (
    <>
      <ServerIdentity corner />
      <TvMessage
        title={t('emptyTitle')}
        actions={
          <Button
            variant="overlay"
            hasTVPreferredFocus
            icon="movie"
            onPress={() => router.push('/movies')}
          >
            {s('movies')}
          </Button>
        }
      >
        {t('emptyBody')}
      </TvMessage>
    </>
  )
}

function Home({ sections }: { sections: HomeSection[] }) {
  const t = useT(messages)
  const locale = useLocale()
  const format = useMemo(() => createFormat(locale), [locale])
  const u = useTheme().u
  const reduced = useReducedMotion()
  const media = useMedia()

  const hero = sections.find((x) => x.layout === 'hero')
  const featured = hero?.items[0]
  const rows = sections.filter((x) => x !== hero)
  // the head takes Up only while the page rests at the top
  const [atRow, setAtRow] = useState(0)
  const [menu, setMenu] = useState<HomeItem | null>(null)
  const cards = useRef(new Map<number, ViewHandle | null>())

  // Back: to the featured card, then out of highsea
  const first = useRef<ViewHandle>(null)
  const [onFirst, setOnFirst] = useState(false)
  // Home stays mounted under the screens opened from it, which need Menu for their own Back
  const onView = useIsFocused()
  const leave = useLeaveOnBack(onFirst && onView && !menu)
  useBack(() => {
    if (menu) return closeMenu(false)
    if (homeBack(onFirst) === 'exit') leave()
    else focusOn(first.current)
  })

  // closing the menu, focus goes back to its card; to the row's next card once it has gone
  const closeMenu = (gone: boolean) => {
    if (!menu) return
    const row = rows.find((x) => x.layout === 'continue')?.items ?? []
    const i = row.findIndex((m) => m.id === menu.id)
    const to = gone ? (row[i + 1] ?? row[i - 1]) : menu
    setMenu(null)
    if (to) setTimeout(() => focusOn(cards.current.get(to.id)), 0)
  }

  const reached = (row: number, firstStop = false) => {
    setAtRow(row)
    setOnFirst(firstStop)
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        snapToAlignment="item"
        scrollAnimationEnabled={!reduced}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        {/* the head scrolls away with the page */}
        <TvHead reachable={atRow === 0} />
        <View style={{ paddingTop: 1.6 * u, paddingBottom: tv.safe.y * u, gap: 1.6 * u }}>
          {featured ? (
            <View
              scrollSnapOffset={0}
              style={{ paddingHorizontal: tv.safe.x * u, paddingVertical: 1 * u }}
            >
              <TvFeaturedCard
                ref={first}
                preferred
                title={featured.title}
                meta={format.meta(featured)}
                tagline={featured.tagline ?? featured.synopsis}
                backdrop={media(featured.art.backdrop)}
                onFocus={() => reached(0, true)}
                onPress={() => router.push(`/movies/${featured.id}`)}
              />
            </View>
          ) : null}
          {rows.map((section, i) => {
            // row 0 is the page's top, from which Up reaches the head: the first row when there's
            // no featured card
            const row = featured ? i + 1 : i
            return (
              <View key={section.id} scrollSnapOffset={tv.safe.y * u}>
                {section.layout === 'continue' ? (
                  <TvRow
                    title={titleOf(section, t)}
                    suffix={section.suffix}
                    items={section.items}
                    keyOf={(m) => m.id}
                    itemWidth={CONTINUE_WIDTH}
                    onFocusItem={() => reached(row)}
                    render={(m, at) => (
                      <TvTile
                        ref={(node) => {
                          cards.current.set(m.id, node)
                        }}
                        preferred={!featured && at.index === 0}
                        title={m.title}
                        caption={m.progress !== null ? format.left(m) : format.meta(m)}
                        src={media(m.art.backdrop)}
                        wide
                        width={CONTINUE_WIDTH}
                        progress={m.progress}
                        progressBelow
                        onFocus={at.onFocus}
                        onPress={() => router.push(`/play/${m.id}`)}
                        onPlay={() => router.push(`/play/${m.id}`)}
                        onLongPress={() => setMenu(m)}
                        delayLongPress={LONG_PRESS_MS}
                      />
                    )}
                  />
                ) : (
                  <TvFilmRow
                    title={titleOf(section, t)}
                    suffix={section.suffix}
                    items={section.items}
                    art={(m) => ({ poster: media(m.art.poster), backdrop: media(m.art.backdrop) })}
                    meta={format.meta}
                    loop
                    preferred={!featured && i === 0}
                    onFocus={() => reached(row)}
                    onOpen={(m) => router.push(`/movies/${m.id}`)}
                    onPlay={(m) => router.push(`/play/${m.id}`)}
                  />
                )}
              </View>
            )
          })}
        </View>
      </ScrollView>
      {menu ? <ContinueMenu item={menu} onClose={closeMenu} /> : null}
    </View>
  )
}

/**
 * Continue watching's menu (client-home.md › Continue watching), from OK held on a card: go to the
 * film, mark it watched, or take it off the row. Back closes it (Home's Back, above).
 */
function ContinueMenu({ item, onClose }: { item: HomeItem; onClose: (gone: boolean) => void }) {
  const locale = useLocale()
  const words = useMemo(() => createLibraryText(locale).continueMenu(item), [locale, item])
  const actions = useContinueActions(item.id)
  return (
    <TvMenu
      title={item.title}
      options={[
        {
          label: words.goTo.label,
          icon: 'movie',
          onPress: () => {
            onClose(false)
            router.push(words.goTo.path as `/movies/${number}`)
          },
        },
        {
          label: words.markWatched,
          icon: 'check',
          onPress: () => {
            onClose(true)
            void actions.markWatched.run()
          },
        },
        {
          label: words.remove,
          icon: 'remove',
          onPress: () => {
            onClose(true)
            void actions.remove.run()
          },
        },
      ]}
    />
  )
}

function Acknowledge() {
  const s = useT(shell)
  const theme = useTheme()
  const u = theme.u
  const media = useMedia()
  const a = useAnnouncements(appKind)
  const m = a.modal
  if (!m) return null
  const image = media(m.image)
  return (
    <View style={styles.center}>
      <View
        style={{
          maxWidth: 44 * u,
          gap: 1.4 * u,
          overflow: 'hidden',
          borderRadius: 1 * u,
          backgroundColor: theme.colors.s1,
          padding: 2.4 * u,
        }}
      >
        {image ? (
          <Image
            source={image}
            style={{ margin: -2.4 * u, marginBottom: 0.4 * u, aspectRatio: 21 / 9 }}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0.6 * u }}>
          <Icon name="announcement" size={1.1} color="accent-text" />
          <Text variant="eyebrow" color="accent-text">
            {s('fromOwner')}
          </Text>
        </View>
        <Text variant="heroTitle" size={2.4} accessibilityRole="header">
          {m.title}
        </Text>
        <Text variant="synopsis" color="text-2">
          {m.body}
        </Text>
        <View style={{ flexDirection: 'row' }}>
          <Button variant="primary" hasTVPreferredFocus onPress={() => void a.dismiss(m.id)}>
            {s('gotIt')}
          </Button>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})

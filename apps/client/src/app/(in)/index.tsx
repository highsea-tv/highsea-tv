// SPDX-License-Identifier: AGPL-3.0-only
// C2 Home (client-home.md), one screen for every client, films only for now: the featured section,
// Continue watching with its menu, Recently added, the owner's rows and spotlights, and the owner's
// announcements. Built-in rows have no title from the server; the shared words name them
// (the films' words' rowTitle). Laid out by the form factor, in three compositions, since each
// prototype lays Home out its own way:
// - touch (the prototype's mobile/home.tsx, the locked Tabs + carousel layout): kit's TouchHeader
//   (the server switcher and the avatar), the owner's announcement card, then the sections in the
//   server's order: a featured section as its carousel, the others as rows of stills (spotlights
//   read as rows), Continue watching's menu held open in a sheet; pull to refresh, which fetches
//   Home and the announcements again;
// - a pointer (web/home.tsx): under the top bar laid over it, the featured card with its pager,
//   then the rows a screen apart,
//   Continue watching with ⋯, spotlights' wider cards with their synopsis, and the other rows as
//   film rows that loop, no wider than the page's measure;
// - the TV (tv/home.tsx, ../../home/tv.tsx): the featured card and the rows, with Back to the
//   featured card and then out.
// One that must be acknowledged, and with a pointer the toasts, are the shell's, over every
// destination (../../shell/announcements.tsx), as is what was said after a change (kit's useSay).
// Rows with nothing in them aren't drawn (rowsOf). While Home loads, each draws it as it will be
// (../../home/skeleton.tsx).
import type { HomeSection } from '@highsea-tv/api-contract'
import { useHome } from '@highsea-tv/client/data'
import { heroOf, rowsOf } from '@highsea-tv/client/films'
import { shellMessages } from '@highsea-tv/client/gate'
import { useT } from '@highsea-tv/i18n/react'
import { web } from '@highsea-tv/tokens'
import {
  Bloom,
  Button,
  EmptyState,
  ScrollView,
  tokens,
  useFormFactor,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import { TvMessage } from '@highsea-tv/ui/tv'
import { router, useIsFocused } from 'expo-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  RefreshControl,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLeaveOnBack } from '../../back.tsx'
import { useFilmsText } from '../../films.ts'
import { bloomColor, HomeCarousel, HomeFeatured } from '../../home/featured.tsx'
import { homeMessages } from '../../home/messages.ts'
import { HomeRow, POINTER_APART } from '../../home/rows.tsx'
import { HomeSkeleton } from '../../home/skeleton.tsx'
import { HomeTv } from '../../home/tv.tsx'
import { useDeviceClient } from '../../host'
import { TouchHeader, useChromeOverlay, useSay } from '../../kit.tsx'
import { AnnouncementCard, useHereAnnouncements } from '../../shell/announcements.tsx'

const { space } = tokens

/** How long pull to refresh's spinner waits for an answer: a quiet refresh that fails says nothing. */
const PULL_TIMEOUT_MS = 10_000

export default function Home() {
  const input = useFormFactor().input
  if (input === 'tv') return <TvHome />
  return input === 'pointer' ? <PointerHome /> : <TouchHome />
}

type HomeQuery = ReturnType<typeof useHome>

/** Loading, a failure, or nothing to show yet; null once there are sections to draw. */
function States({ home }: { home: HomeQuery }) {
  const t = useT(homeMessages)
  const s = useT(shellMessages)
  if (home.status === 'loading') return <HomeSkeleton />
  if (home.status === 'error')
    return (
      <EmptyState
        tone="error"
        icon="alert"
        title={t('failed')}
        action={<Button onPress={home.refetch}>{s('tryAgain')}</Button>}
      >
        {home.error.message}
      </EmptyState>
    )
  if (rowsOf(home.data).length === 0 && !heroOf(home.data))
    return (
      <EmptyState icon="movie" title={t('emptyTitle')}>
        {t('emptyBody')}
      </EmptyState>
    )
  return null
}

// ---------------------------------------------------------------- touch

function TouchHome() {
  const home = useHome(useDeviceClient())
  const a = useHereAnnouncements()
  const insets = useSafeAreaInsets()
  const theme = useTheme()
  const films = useFilmsText()
  const f = useT(homeMessages)
  const say = useSay()
  const gutter = tokens.mobile.gutter
  // pull to refresh: the spinner shows until Home and the announcements have both answered, or
  // for so long at most; a refresh that fails says why and keeps what's on screen
  const [pulling, setPulling] = useState(false)
  const pulls = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const pull = () => {
    const mine = ++pulls.current
    const end = () => {
      if (pulls.current !== mine) return
      clearTimeout(timer.current)
      setPulling(false)
    }
    setPulling(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(end, PULL_TIMEOUT_MS)
    void Promise.allSettled([home.refresh(), a.list.refresh()]).then((done) => {
      const failed = done.find((x) => x.status === 'rejected')
      if (failed && pulls.current === mine)
        say({ title: f('refreshFailed', { message: messageOf(failed.reason) }) })
      end()
    })
  }
  const sections = home.status === 'success' ? home.data : []
  // the sections in the server's order, a featured one among the rows wherever it put it
  const drawn = sections.filter((s) => s.items.length > 0)
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={pulling}
            tintColor={theme.colors['text-3']}
            onRefresh={pull}
          />
        }
        contentContainerStyle={{
          // the prototype's pt-1 under the status bar
          paddingTop: insets.top + space['1'],
          paddingBottom: space['8'],
          gap: tokens.mobile.rowGap,
        }}
      >
        {a.cards.length > 0 ? (
          <View style={{ gap: space['6'] }}>
            <TouchHeader />
            <View style={{ paddingHorizontal: gutter }}>
              <AnnouncementCard />
            </View>
          </View>
        ) : (
          <TouchHeader />
        )}
        {home.status === 'loading' ? (
          <HomeSkeleton />
        ) : drawn.length > 0 ? (
          drawn.map((s) =>
            s.layout === 'hero' ? (
              <HomeCarousel key={s.id} items={s.items} label={films.rowTitle(s) || f('featured')} />
            ) : (
              <HomeRow key={s.id} section={s} />
            ),
          )
        ) : (
          <View style={{ paddingHorizontal: gutter, paddingTop: space['10'] }}>
            <States home={home} />
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

// ---------------------------------------------------------------- a pointer

function PointerHome() {
  const home = useHome(useDeviceClient())
  const gutter = usePageGutter()
  return (
    <View style={{ flex: 1 }}>
      {home.status === 'loading' ? (
        <HomeSkeleton />
      ) : home.status === 'success' && (heroOf(home.data) || rowsOf(home.data).length > 0) ? (
        <PointerSections sections={home.data} />
      ) : (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: gutter,
            width: '100%',
            maxWidth: web.maxWidth,
            alignSelf: 'center',
          }}
        >
          <States home={home} />
        </View>
      )}
    </View>
  )
}

function PointerSections({ sections }: { sections: HomeSection[] }) {
  const hero = heroOf(sections)
  // the top bar lies over the page, clear until the page scrolls under it, as the prototype's
  // overHero="bloom"
  const chrome = useChromeOverlay()
  // the bloom behind the featured card, in the colour of the title the pager is on, until the card
  // has mostly scrolled out of view (the prototype's 40% still showing)
  const [shown, setShown] = useState(hero?.items[0] ?? null)
  const [card, setCard] = useState({ top: 0, height: 0 })
  const [inView, setInView] = useState(true)
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    chrome.onScroll(e)
    const y = e.nativeEvent.contentOffset.y
    setInView(card.height === 0 || y + chrome.pad < card.top + card.height * MOSTLY)
  }
  return (
    <ScrollView
      onScroll={onScroll}
      scrollEventThrottle={chrome.scrollEventThrottle}
      contentContainerStyle={{
        // clear of the bar, then the prototype's pt-4
        paddingTop: chrome.pad + space['4'],
        paddingBottom: space['16'],
        gap: POINTER_APART,
      }}
    >
      {/* from the page's top, behind the bar */}
      {shown ? <Bloom color={bloomColor(shown)} shown={inView} /> : null}
      {hero ? (
        <View
          onLayout={(e) =>
            setCard({ top: e.nativeEvent.layout.y, height: e.nativeEvent.layout.height })
          }
        >
          <HomeFeatured items={hero.items} onShow={setShown} />
        </View>
      ) : null}
      <View
        style={{ width: '100%', maxWidth: web.maxWidth, alignSelf: 'center', gap: POINTER_APART }}
      >
        {rowsOf(sections).map((s) => (
          <HomeRow key={s.id} section={s} />
        ))}
      </View>
    </ScrollView>
  )
}

/** How much of the featured card scrolls away before its bloom fades: the prototype's 40% left. */
const MOSTLY = 0.6

// ---------------------------------------------------------------- the TV

function TvHome() {
  const t = useT(homeMessages)
  const s = useT(shellMessages)
  const kind = useDeviceClient()
  const home = useHome(kind)
  if (home.status === 'loading')
    return (
      <AtRoot>
        <HomeSkeleton />
      </AtRoot>
    )
  if (home.status === 'error')
    return (
      <AtRoot>
        <TvMessage
          title={t('failed')}
          actions={
            <Button variant="primary" hasTVPreferredFocus onPress={home.refetch}>
              {s('tryAgain')}
            </Button>
          }
        >
          {home.error.message}
        </TvMessage>
      </AtRoot>
    )
  if (!heroOf(home.data) && rowsOf(home.data).length === 0)
    return (
      <AtRoot>
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
      </AtRoot>
    )
  return <HomeTv sections={home.data} />
}

/** Home with nothing of its own to go back to: Back leaves highsea. */
function AtRoot({ children }: { children: ReactNode }) {
  useLeaveOnBack(useIsFocused())
  return <>{children}</>
}

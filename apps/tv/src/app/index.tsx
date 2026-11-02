// SPDX-License-Identifier: AGPL-3.0-only
// C2 Home, TV (client-home.md#tv, the prototype's tv/home.tsx): the locked Hero + rows layout
// (tv.md#layout). The hero follows focus through the featured row after the 220 ms dwell and
// cross-fades; rows below it don't bind it, and focus there scrolls the page so that row's title
// sits at the safe area's top (homeRowAt). The page is a scroll view, so tvOS's focus engine reaches
// the rows below the screen. Up from the hero's actions opens the global navigation. Back
// at the root returns focus to the first item of the top row, and from there leaves highsea
// (homeBack). An announcement that must be acknowledged comes first, on its own. Built-in rows
// have no title from the server; they're named here.
import type { HomeItem, HomeSection } from '@highsea-tv/api-contract'
import { useAnnouncements, useHome } from '@highsea-tv/client/data'
import { createFormat } from '@highsea-tv/client/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { useServers } from '@highsea-tv/native/servers'
import { Button, Icon, Text, tokens, useTheme } from '@highsea-tv/ui'
import {
  focusOn,
  HERO_DWELL_MS,
  homeBack,
  homeRowAt,
  TvMessage,
  TvRow,
  TvTile,
  type ViewHandle,
} from '@highsea-tv/ui/tv'
import { Image } from 'expo-image'
import { router, useIsFocused } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated'
import { useBack } from '../back.ts'
import { AnnouncementPill, appKind, GlobalNav, ServerIdentity } from '../kit.tsx'
import { home as messages, shell } from '../messages.ts'
import { useLeaveOnBack } from '../remote.tsx'

const tv = tokens.tv

type T = ReturnType<typeof useT<typeof messages>>

const titleOf = (s: HomeSection, t: T) =>
  s.title ?? (s.id === 'continue' ? t('continue') : s.id === 'recent' ? t('recent') : '')

/** Hold a value until it has stayed put for the dwell (tv.md#hero-behavior). */
function useDwell<V>(value: V, ms: number) {
  const [held, setHeld] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setHeld(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return held
}

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
      <ServerIdentity />
      <TvMessage
        title={t('emptyTitle')}
        actions={
          <Button
            variant="overlay"
            hasTVPreferredFocus
            icon="library"
            onPress={() => router.push('/library')}
          >
            {s('library')}
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
  const s = useT(shell)
  const locale = useLocale()
  const format = useMemo(() => createFormat(locale), [locale])
  const theme = useTheme()
  const u = theme.u
  const { width } = useWindowDimensions()
  const reduced = useReducedMotion()
  const media = useMedia()
  const server = useServers().current?.server.name ?? ''

  const hero = sections.find((x) => x.layout === 'hero')
  const first = hero?.items[0] ?? sections[0]?.items[0]
  const [focused, setFocused] = useState<HomeItem | undefined>(first)
  const shown = useDwell(focused, HERO_DWELL_MS) ?? first
  // the hero's own titles lead the rows, so focus can reach every featured title
  const rows = sections
  const featured = hero ? sections.indexOf(hero) : -1

  // where each row lands as focus reaches it (homeRowAt), from where it's laid out on the page
  const [tops, setTops] = useState<number[]>([])
  const [rowsTop, setRowsTop] = useState(0)
  const [atRow, setAtRow] = useState(-1)

  // Back: to the first item of the top row, then out of highsea
  const firstTile = useRef<ViewHandle>(null)
  const [onFirst, setOnFirst] = useState(false)
  // Home stays mounted under the screens opened from it, which need Menu for their own Back
  const onView = useIsFocused()
  const leave = useLeaveOnBack(onFirst && onView)
  useBack(() => {
    if (homeBack(onFirst) === 'exit') leave()
    else focusOn(firstTile.current)
  })

  const toHero = () => {
    setAtRow(-1)
    setOnFirst(false)
  }

  if (!shown) return null
  const playLabel = shown.progress !== null ? t('resume') : t('play')
  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        snapToAlignment="item"
        scrollAnimationEnabled={!reduced}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
      >
        <Backdrop source={media(shown.art.backdrop)} />
        <ServerIdentity />
        <AnnouncementPill />
        {/* the hero lands where it's laid out, so the page rests at the top */}
        <View
          scrollSnapOffset={tv.hero.copyTop * u}
          style={{
            position: 'absolute',
            top: tv.hero.copyTop * u,
            left: tv.safe.x * u,
            width: tv.hero.copyWidth * u,
            gap: 1.6 * u,
          }}
        >
          <Animated.View
            key={shown.id}
            entering={reduced ? undefined : FadeIn.duration(tokens.durations.dwell)}
            exiting={reduced ? undefined : FadeOut.duration(tokens.durations.fadeOut)}
            style={{ gap: 0.8 * u }}
          >
            <Text variant="eyebrow" color="accent-text">
              {hero?.title ?? s('onServer', { name: server })}
            </Text>
            <Text variant="heroTitle" numberOfLines={2} accessibilityRole="header">
              {shown.title}
            </Text>
            <Text variant="meta" color="text-2">
              {[format.meta(shown), shown.progress !== null ? format.left(shown) : '']
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Text variant="synopsis" color="text-2" numberOfLines={2} style={{ maxWidth: 34 * u }}>
              {shown.tagline ?? shown.synopsis}
            </Text>
          </Animated.View>
          {/* Play acts on what the hero shows (tv.md#hero-behavior) */}
          <View style={{ flexDirection: 'row', gap: 1 * u }}>
            <Button
              variant="primary"
              hasTVPreferredFocus
              icon="play"
              accessibilityLabel={`${playLabel}, ${shown.title}`}
              onFocus={toHero}
              onPress={() => router.push(`/play/${shown.id}`)}
            >
              {playLabel}
            </Button>
            <Button
              variant="overlay"
              icon="info"
              onFocus={toHero}
              onPress={() => router.push(`/movies/${shown.id}`)}
            >
              {t('details')}
            </Button>
          </View>
        </View>
        {/* the rows start about half way down, so the next row's title shows under the featured
        one */}
        <View
          onLayout={(e) => setRowsTop(e.nativeEvent.layout.y)}
          style={{ paddingTop: 28.5 * u, paddingBottom: tv.safe.y * u, gap: 1.6 * u }}
        >
          {rows.map((section, row) => {
            const wide = section.layout === 'continue'
            const binds = section.id === hero?.id
            return (
              <View
                key={section.id}
                onLayout={(e) => {
                  const y = e.nativeEvent.layout.y
                  setTops((all) => (all[row] === y ? all : Object.assign([...all], { [row]: y })))
                }}
                scrollSnapOffset={homeRowAt({
                  row,
                  featured: Math.max(featured, 0),
                  rowTop: rowsTop + (tops[row] ?? 0),
                  width,
                })}
              >
                <TvRow
                  title={titleOf(section, t)}
                  suffix={section.suffix}
                  items={section.items}
                  keyOf={(m) => m.id}
                  wide={wide}
                  onFocusItem={(m, index) => {
                    setAtRow(row)
                    setOnFirst(row === 0 && index === 0)
                    if (binds) setFocused(m)
                  }}
                  render={(m, at) => (
                    <TvTile
                      ref={row === 0 && at.index === 0 ? firstTile : undefined}
                      title={m.title}
                      caption={
                        wide && m.progress !== null
                          ? format.left(m)
                          : m.year
                            ? String(m.year)
                            : format.runtime(m.runtimeMinutes)
                      }
                      src={media(wide ? m.art.backdrop : m.art.poster)}
                      wide={wide}
                      progress={m.progress}
                      onFocus={at.onFocus}
                      onPress={() => router.push(wide ? `/play/${m.id}` : `/movies/${m.id}`)}
                      onPlay={() => router.push(`/play/${m.id}`)}
                    />
                  )}
                />
              </View>
            )
          })}
        </View>
      </ScrollView>
      {/* once the page scrolls, the tabs' guide would catch Up from a row, so they take focus only
          while the hero's actions sit between it and focus (rows up to the featured one) */}
      <GlobalNav reachable={atRow <= Math.max(featured, 0)} />
    </View>
  )
}

/** Two layers cross-fading: the new one loads behind, then comes forward. */
function Backdrop({ source }: { source: ReturnType<ReturnType<typeof useMedia>> }) {
  const theme = useTheme()
  const u = theme.u
  const bg = theme.colors.bg
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 34.9 * u }}>
      {source ? (
        <Image
          source={source}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={700}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            experimental_backgroundImage: `linear-gradient(90deg, ${bg} 8%, transparent 60%), linear-gradient(0deg, ${bg}, transparent 45%)`,
          },
        ]}
      />
    </View>
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

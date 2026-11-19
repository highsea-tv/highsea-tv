// SPDX-License-Identifier: AGPL-3.0-only
// A collection's page (client-search.md#collections, collections.md): its name, how many are here
// and their years, its overview, then its films here, oldest first; a smart one says so and gives
// its rules in words. An error says it may have been removed. One composition per form factor:
// - touch (the prototype's mobile/collection.tsx): the backdrop with Back over it, the words under
//   it, then three posters a row; its error offers Search;
// - a pointer (web/collection.tsx): the words over the backdrop, then the grid across the page;
//   its error offers Collections;
// - the TV (tv/collection.tsx): the backdrop, the words, then the films as a film row, which takes
//   focus; Back goes back to wherever it was opened from. Its error offers Collections.
// The backdrop is the title hero a film's page draws (../detail/hero.tsx, the owner's call of
// 2026-11-18): full bleed, under the status bar by touch and under the top bar with a pointer,
// which stays clear until the page scrolls under it; sharp across the TV's first screen.
import { useCollection } from '@highsea-tv/client/data'
import { playPath } from '@highsea-tv/client/library'
import { useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import {
  Button,
  EmptyState,
  FilmRow,
  FilmRowSkeleton,
  ScrollView,
  Skeleton,
  SkeletonText,
  Text,
  TitleBackdrop,
  TitleLogo,
  tokens,
  usePageGutter,
  usePageMeasure,
  useTheme,
} from '@highsea-tv/ui'
import { TV_HEAD_HEIGHT, TvMessage, type ViewHandle } from '@highsea-tv/ui/tv'
import { type Href, router } from 'expo-router'
import { type ReactNode, useCallback, useState } from 'react'
import { View } from 'react-native'
import { OverlayBack } from '../detail/back.tsx'
import { HERO_WORDS, PointerHero, TouchHero, usePointerHero } from '../detail/hero.tsx'
import { isMissing } from '../detail/parts.tsx'
import { useFilmsText } from '../films.ts'
import { useDeviceClient } from '../host'
import { useChromeOverlay, useHeadDown } from '../kit.tsx'
import { libraryScreenMessages as messages } from './messages.ts'
import { LibraryGrid, LibraryLoading, LibraryPoster } from './parts.tsx'
import { TV_LIBRARY } from './sizes.ts'

const { space } = tokens
const tv = tokens.tv
/** The phone's collection name, the prototype's 28. */
const PHONE_TITLE = space['6'] + space['1']

type Found = ReturnType<typeof useCollection>

/**
 * The error's heading: a collection the server answered not-found for (404) in the prototype's own
 * words, "That collection isn't on this server." (web/collection.tsx, from the prototypes' mock),
 * since the server's message ("There's no collection with that id.", curation's) is written for
 * the API, not the page; any other failure says what the server said.
 */
const errorTitle = (error: Error | null, t: (key: 'notHere') => string) =>
  isMissing(error) ? t('notHere') : (error?.message ?? t('notHere'))
type Loaded = Extract<Found, { status: 'success' }>['data']

/** "3 movies here · 2013–2016", and the kind's word: what the page says of the collection. */
function useWords({ collection: c, items }: Loaded) {
  const t = useT(messages)
  const f = useFormat()
  const tile = useFilmsText().tileOf({ ...c, smart: c.smart ?? null })
  const here = f.moviesHere(items.length)
  return {
    kind: tile.kind,
    smart: tile.smart,
    here: c.years ? t('here', { titles: here, years: c.years }) : here,
  }
}

export function TouchCollection({ id }: { id: string }) {
  const t = useT(messages)
  const theme = useTheme()
  const found = useCollection(id, useDeviceClient())
  const gutter = tokens.mobile.gutter
  // Back over the art, loaded, loading or failed alike (the shared OverlayBack)
  const backButton = <OverlayBack />
  if (found.status === 'loading')
    return (
      <View
        accessibilityState={{ busy: true }}
        aria-busy
        style={{ flex: 1, backgroundColor: theme.colors.bg, gap: space['5'] }}
      >
        {/* the hero's art, the name, the count and two lines over the posters */}
        <TouchHero source={undefined} gap={space['2']}>
          <Skeleton height={PHONE_TITLE} width="60%" />
          <Skeleton height={space['3'] + space['0.5']} width={space['16'] * 2 + space['8']} />
          <SkeletonText lines={2} />
        </TouchHero>
        <View style={{ paddingHorizontal: gutter }}>
          <LibraryLoading touch={6} />
        </View>
        {backButton}
      </View>
    )
  if (found.status === 'error')
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          paddingHorizontal: gutter,
          backgroundColor: theme.colors.bg,
        }}
      >
        {backButton}
        <EmptyState
          icon="library"
          tone="error"
          title={errorTitle(found.error, t)}
          action={<Button onPress={() => router.navigate('/search' as Href)}>{t('search')}</Button>}
        >
          {t('gone')}
        </EmptyState>
      </View>
    )
  return <TouchLoaded data={found.data} back={backButton} />
}

function TouchLoaded({ data, back: backButton }: { data: Loaded; back: ReactNode }) {
  const theme = useTheme()
  const media = useMedia()
  const words = useWords(data)
  const { collection: c, items } = data
  const f = useFormat()
  const gutter = tokens.mobile.gutter
  const backdrop = media(c.art.backdrop)
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: space['6'], gap: space['5'] }}>
        <TouchHero source={backdrop} gap={space['2']}>
          {words.smart ? (
            <Text variant="label" color="text-3">
              {words.kind}
            </Text>
          ) : null}
          {/* its logo, or its name at the prototype's text-[28px] (mobile/collection.tsx) */}
          <TitleLogo
            title={c.name}
            logo={media(c.art.logo)}
            variant="largeTitle"
            size={PHONE_TITLE}
            aria-level={1}
          />
          <Text variant="callout" color="text-3">
            {words.here}
          </Text>
          {c.smart?.words ? (
            <Text variant="caption" color="text-3">
              {c.smart.words}
            </Text>
          ) : null}
          {c.overview ? (
            <Text variant="body" color="text-2">
              {c.overview}
            </Text>
          ) : null}
        </TouchHero>
        <View style={{ paddingHorizontal: gutter }}>
          <LibraryGrid
            items={items}
            label={f.titlesRow(items.length)}
            keyOf={(m) => String(m.id)}
            render={(m, width) => <LibraryPoster item={m} width={width} />}
          />
        </View>
      </ScrollView>
      {backButton}
    </View>
  )
}

export function PointerCollection({ id }: { id: string }) {
  const t = useT(messages)
  const theme = useTheme()
  const found = useCollection(id, useDeviceClient())
  if (found.status === 'loading') return <PointerSkeleton />
  if (found.status === 'error')
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          paddingHorizontal: space['4'],
          backgroundColor: theme.colors.bg,
        }}
      >
        <EmptyState
          icon="library"
          tone="error"
          title={errorTitle(found.error, t)}
          action={
            <Button variant="primary" onPress={() => router.navigate('/collections' as Href)}>
              {t('collections')}
            </Button>
          }
        >
          {t('gone')}
        </EmptyState>
      </View>
    )
  return <PointerLoaded data={found.data} />
}

/** A collection's page while it loads, its hero where the loaded page's stands. */
function PointerSkeleton() {
  const theme = useTheme()
  const gutter = usePageGutter()
  const measure = usePageMeasure()
  // the hero lies under the top bar as the loaded page's does, so the bar doesn't move as it loads
  const { hero } = usePointerHero()
  return (
    <View
      accessibilityState={{ busy: true }}
      aria-busy
      style={{ flex: 1, backgroundColor: theme.colors.bg, gap: space['8'] }}
    >
      <PointerHero source={undefined} hero={hero}>
        <View style={{ maxWidth: HERO_WORDS, gap: space['2'] }}>
          <Skeleton height={space['3']} width={space['16'] + space['8']} />
          <View style={{ width: '80%', maxWidth: space['16'] * 7 }}>
            <Skeleton height={space['8'] + space['1']} />
          </View>
          <Skeleton height={space['4']} width={space['16'] * 3} />
          <SkeletonText lines={2} />
        </View>
      </PointerHero>
      <View
        style={{ width: '100%', maxWidth: measure, alignSelf: 'center', paddingHorizontal: gutter }}
      >
        <LibraryLoading pointer={7} />
      </View>
    </View>
  )
}

function PointerLoaded({ data }: { data: Loaded }) {
  const theme = useTheme()
  const media = useMedia()
  const gutter = usePageGutter()
  const measure = usePageMeasure()
  const f = useFormat()
  const words = useWords(data)
  const { collection: c, items } = data
  // from medium the art runs under the top bar, which turns to glass as the page scrolls
  const { hero, chrome } = usePointerHero()
  return (
    <ScrollView
      onScroll={chrome.onScroll}
      scrollEventThrottle={chrome.scrollEventThrottle}
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ gap: space['8'], paddingBottom: space['16'] }}
    >
      <PointerHero source={media(c.art.backdrop)} hero={hero}>
        <View accessibilityRole="summary" style={{ maxWidth: HERO_WORDS, gap: space['2'] }}>
          <Text variant="label" color="text-3">
            {words.kind}
          </Text>
          <TitleLogo title={c.name} logo={media(c.art.logo)} variant="display" aria-level={1} />
          <Text variant="body" color="text-2">
            {words.here}
          </Text>
          {c.smart?.words ? (
            <Text variant="caption" color="text-3">
              {c.smart.words}
            </Text>
          ) : null}
          {c.overview ? (
            <Text variant="body" color="text-2" numberOfLines={4}>
              {c.overview}
            </Text>
          ) : null}
        </View>
      </PointerHero>
      <View
        style={{ width: '100%', maxWidth: measure, alignSelf: 'center', paddingHorizontal: gutter }}
      >
        <LibraryGrid
          items={items}
          label={f.titlesRow(items.length)}
          keyOf={(m) => String(m.id)}
          render={(m, width) => <LibraryPoster item={m} width={width} />}
        />
      </View>
    </ScrollView>
  )
}

export function TvCollection({ id }: { id: string }) {
  const t = useT(messages)
  const found = useCollection(id, useDeviceClient())
  // the ambient art runs under the head, which lies over the page, as the prototype's
  useChromeOverlay()
  if (found.status === 'loading') return <TvSkeleton />
  if (found.status === 'error')
    return (
      <TvMessage
        title={errorTitle(found.error, t)}
        actions={
          <Button
            variant="primary"
            hasTVPreferredFocus
            onPress={() => router.navigate('/collections' as Href)}
          >
            {t('collections')}
          </Button>
        }
      >
        {t('gone')}
      </TvMessage>
    )
  return <TvLoaded data={found.data} />
}

/** A collection's page on the TV while it loads, as the prototype draws it (tv/collection.tsx). */
function TvSkeleton() {
  const theme = useTheme()
  const u = theme.u
  const k = TV_LIBRARY.skeleton
  const meta = (width: number) => (
    <View style={{ marginVertical: k.metaMargin * u }}>
      <Skeleton height={k.meta * u} width={width * u} />
    </View>
  )
  return (
    <View
      accessibilityState={{ busy: true }}
      aria-busy
      style={{
        flex: 1,
        overflow: 'hidden',
        backgroundColor: theme.colors.bg,
        gap: TV_LIBRARY.collectionGap * u,
        paddingTop: (TV_HEAD_HEIGHT + TV_LIBRARY.collectionGap) * u,
      }}
    >
      <TitleBackdrop source={undefined} />
      <View
        style={{
          maxWidth: TV_LIBRARY.collectionWords * u,
          paddingHorizontal: tv.safe.x * u,
          gap: TV_LIBRARY.collectionWordsGap * u,
        }}
      >
        {meta(k.kind)}
        <View style={{ marginVertical: k.titleMargin * u }}>
          <Skeleton height={k.title * u} width={k.titleWidth * u} radius={k.titleRadius * u} />
        </View>
        {meta(k.here)}
        <View
          style={{
            maxWidth: TV_LIBRARY.overview * u,
            gap: k.lineGap * u,
            paddingVertical: k.titleMargin * u,
          }}
        >
          <Skeleton height={k.line * u} />
          <Skeleton height={k.line * u} width="60%" />
        </View>
      </View>
      <FilmRowSkeleton />
    </View>
  )
}

function TvLoaded({ data }: { data: Loaded }) {
  const theme = useTheme()
  const u = theme.u
  const media = useMedia()
  const f = useFormat()
  const words = useWords(data)
  const { collection: c, items } = data
  // Down from the head lands on the films (the prototype's down="parts")
  const [down, setDown] = useState<ViewHandle | null>(null)
  const downRef = useCallback((v: ViewHandle | null) => setDown(v), [])
  useHeadDown(down)
  return (
    <View style={{ flex: 1, overflow: 'hidden', backgroundColor: theme.colors.bg }}>
      <TitleBackdrop source={media(c.art.backdrop)} />
      <View
        style={{
          gap: TV_LIBRARY.collectionGap * u,
          // clear of the head laid over the page
          paddingTop: (TV_HEAD_HEIGHT + TV_LIBRARY.collectionGap) * u,
        }}
      >
        <View
          accessibilityRole="summary"
          style={{
            maxWidth: TV_LIBRARY.collectionWords * u,
            paddingHorizontal: tv.safe.x * u,
            gap: TV_LIBRARY.collectionWordsGap * u,
          }}
        >
          <Text variant="meta" color="text-3">
            {words.kind}
          </Text>
          {/* its logo, or its name at the prototype's 3.6cqw, which the type scale has no step for */}
          <TitleLogo
            title={c.name}
            logo={media(c.art.logo)}
            variant="heroTitle"
            size={TV_LIBRARY.collectionTitle}
            aria-level={1}
          />
          <Text variant="meta" color="text-2">
            {words.here}
          </Text>
          {c.smart?.words ? (
            <Text variant="pill" color="text-3">
              {c.smart.words}
            </Text>
          ) : null}
          {c.overview ? (
            <Text
              variant="synopsis"
              color="text-2"
              numberOfLines={3}
              style={{ maxWidth: TV_LIBRARY.overview * u }}
            >
              {c.overview}
            </Text>
          ) : null}
        </View>
        <FilmRow
          ref={downRef}
          preferred
          title={f.titlesRow(items.length)}
          items={items}
          art={(m) => ({
            poster: media(m.art.poster),
            backdrop: media(m.art.backdrop),
            logo: media(m.art.logo),
          })}
          meta={f.meta}
          onOpen={(m) => router.push(`/movies/${m.id}` as Href)}
          // the remote's Play/Pause plays the focused film (tv.md)
          onPlay={(m) => router.push(playPath(m.id) as Href)}
        />
      </View>
    </View>
  )
}

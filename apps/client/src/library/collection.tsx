// SPDX-License-Identifier: AGPL-3.0-only
// A collection's page (client-search.md#collections, collections.md): its name, how many are here
// and their years, its overview, then its films here, oldest first; a smart one says so and gives
// its rules in words. An error says it may have been removed. One composition per form factor:
// - touch (the prototype's mobile/collection.tsx): the backdrop with Back over it, the words under
//   it, then three posters a row; its error offers Search;
// - a pointer (web/collection.tsx): the words over the backdrop, faded, then the grid across the
//   page; its error offers Collections;
// - the TV (tv/collection.tsx): the ambient backdrop, the words, then the films as a film row,
//   which takes focus; Back goes back to wherever it was opened from. Its error offers Collections.
import { useCollection } from '@highsea-tv/client/data'
import { playPath } from '@highsea-tv/client/library'
import { useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import { web } from '@highsea-tv/tokens'
import {
  Button,
  EmptyState,
  FilmRow,
  FilmRowSkeleton,
  ScrollView,
  Skeleton,
  SkeletonText,
  Text,
  tokens,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import { TV_HEAD_HEIGHT, TvAmbient, TvMessage, type ViewHandle } from '@highsea-tv/ui/tv'
import { Image } from 'expo-image'
import { type Href, router } from 'expo-router'
import { type ReactNode, useCallback, useState } from 'react'
import { View } from 'react-native'
import { OverlayBack } from '../detail/back.tsx'
import { isMissing } from '../detail/parts.tsx'
import { useFilmsText } from '../films.ts'
import { useDeviceClient } from '../host'
import { useChromeOverlay, useHeadDown } from '../kit.tsx'
import { libraryScreenMessages as messages } from './messages.ts'
import { LibraryGrid, LibraryLoading, LibraryPoster } from './parts.tsx'
import { TV_LIBRARY } from './sizes.ts'

const { space } = tokens
const tv = tokens.tv
/** The overview's measure with a pointer, near the prototype's 60ch of body text. */
const OVERVIEW = space['16'] * 9
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
        {/* the prototype's still, the name, the count and two lines over the posters */}
        <View
          style={{
            width: '100%',
            aspectRatio: tokens.aspect.still[0] / tokens.aspect.still[1],
            backgroundColor: theme.colors.s1,
          }}
        />
        <View style={{ marginTop: -space['12'], paddingHorizontal: gutter, gap: space['2'] }}>
          <Skeleton height={PHONE_TITLE} width="60%" />
          <Skeleton height={space['3'] + space['0.5']} width={space['16'] * 2 + space['8']} />
          <SkeletonText lines={2} />
        </View>
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
        <View
          style={{
            width: '100%',
            aspectRatio: tokens.aspect.still[0] / tokens.aspect.still[1],
            backgroundColor: theme.colors.s1,
          }}
        >
          {backdrop ? (
            <Image
              source={backdrop}
              style={{ position: 'absolute', inset: 0 }}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : null}
          <View
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `linear-gradient(0deg, ${theme.colors.bg}, transparent 60%)`,
            }}
          />
        </View>
        <View
          accessibilityRole="summary"
          style={{ marginTop: -space['12'], paddingHorizontal: gutter, gap: space['2'] }}
        >
          {words.smart ? (
            <Text variant="label" color="text-3">
              {words.kind}
            </Text>
          ) : null}
          {/* the prototype's text-[28px] (mobile/collection.tsx), under the large title's 30 */}
          <Text variant="largeTitle" size={PHONE_TITLE} accessibilityRole="header" aria-level={1}>
            {c.name}
          </Text>
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
        </View>
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

/** A collection's page while it loads, as the web prototype draws it (web/collection.tsx). */
function PointerSkeleton() {
  const theme = useTheme()
  const gutter = usePageGutter()
  const column = {
    width: '100%' as const,
    maxWidth: web.maxWidth,
    alignSelf: 'center' as const,
    paddingHorizontal: gutter,
  }
  return (
    <View
      accessibilityState={{ busy: true }}
      aria-busy
      style={{ flex: 1, backgroundColor: theme.colors.bg, gap: space['8'] }}
    >
      <View
        style={{
          ...column,
          gap: space['2'],
          paddingTop: space['16'] + space['8'],
          paddingBottom: space['6'],
        }}
      >
        <Skeleton height={space['3']} width={space['16'] + space['8']} />
        <View style={{ width: '80%', maxWidth: space['16'] * 7 }}>
          <Skeleton height={space['8'] + space['1']} />
        </View>
        <Skeleton height={space['4']} width={space['16'] * 3} />
        <View style={{ maxWidth: OVERVIEW }}>
          <SkeletonText lines={2} />
        </View>
      </View>
      <View style={column}>
        <LibraryLoading pointer={7} />
      </View>
    </View>
  )
}

function PointerLoaded({ data }: { data: Loaded }) {
  const theme = useTheme()
  const media = useMedia()
  const gutter = usePageGutter()
  const f = useFormat()
  const words = useWords(data)
  const { collection: c, items } = data
  const backdrop = media(c.art.backdrop)
  const column = {
    width: '100%' as const,
    maxWidth: web.maxWidth,
    paddingHorizontal: gutter,
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ alignItems: 'center', gap: space['8'], paddingBottom: space['16'] }}
    >
      <View style={{ width: '100%', alignItems: 'center' }}>
        {backdrop ? (
          <Image
            source={backdrop}
            style={{ position: 'absolute', inset: 0, opacity: 0.35 }}
            contentFit="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}
        <View
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `linear-gradient(0deg, ${theme.colors.bg}, transparent)`,
          }}
        />
        <View
          accessibilityRole="summary"
          style={{
            ...column,
            gap: space['2'],
            paddingTop: space['12'] * 2,
            paddingBottom: space['6'],
          }}
        >
          <Text variant="label" color="text-3">
            {words.kind}
          </Text>
          <Text variant="display" accessibilityRole="header" aria-level={1}>
            {c.name}
          </Text>
          <Text variant="body" color="text-2">
            {words.here}
          </Text>
          {c.smart?.words ? (
            <Text variant="caption" color="text-3">
              {c.smart.words}
            </Text>
          ) : null}
          {c.overview ? (
            <Text variant="body" color="text-2" style={{ maxWidth: OVERVIEW }}>
              {c.overview}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={column}>
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
      <TvAmbient source={media(c.art.backdrop)} />
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
          {/* the prototype's 3.6cqw, which the type scale has no step for yet */}
          <Text
            variant="heroTitle"
            size={TV_LIBRARY.collectionTitle}
            accessibilityRole="header"
            aria-level={1}
          >
            {c.name}
          </Text>
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

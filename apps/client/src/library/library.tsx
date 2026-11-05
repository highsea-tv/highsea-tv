// SPDX-License-Identifier: AGPL-3.0-only
// The phone's Library tab (client-library.md#mobile, the prototype's mobile/library.tsx and
// collections.tsx): the phone's header with its title and the account, Movies or Collections as a
// pair of chips (`?view=`), then the view chosen (./movies.tsx, ./collections.tsx), each the page's
// own scroller. On a server that serves them (`useServes`, one-client-platform-b.md › B3), Shows
// (../library/shows.tsx) and Music (../music/library.tsx) are views here too, in the prototype's
// order: Movies, Shows, Collections, Music (mobile/collections.tsx's LibraryNav). Each view reads only its own answer, and its pull to refresh fetches that answer
// again quietly, keeping what's on screen: the pull ends when the fetch settles, and says so when
// it fails. A pointer and the TV have Movies and Collections as destinations of their own instead.
import { useCollections, useLibrary, useServes } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { Chip, tokens, useControl, usePageGutter, useTheme } from '@highsea-tv/ui'
import { type Href, router, useLocalSearchParams } from 'expo-router'
import { type ReactElement, useEffect, useRef, useState } from 'react'
import { Platform, RefreshControl, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useDeviceClient } from '../host'
import { TouchHeader, useSay } from '../kit.tsx'
import { MusicView } from '../music/library.tsx'
import { TouchCollections } from './collections.tsx'
import { libraryScreenMessages as messages } from './messages.ts'
import { TouchMovies } from './movies.tsx'
import { ShowsView } from './shows.tsx'

const { space } = tokens

export type LibraryView = 'movies' | 'shows' | 'collections' | 'music'

/** Each view's address: Movies is the Library's own. */
const VIEW_PATH: Record<LibraryView, string> = {
  movies: '/library',
  shows: '/library?view=shows',
  collections: '/library?view=collections',
  music: '/library?view=music',
}

/** How long a pull's mark stays at most, if the fetch never settles. */
const REFRESH_LIMIT_MS = 10_000

export function TouchLibrary() {
  const t = useT(messages)
  const theme = useTheme()
  const m = useControl()
  const gutter = usePageGutter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ view?: string }>()
  const shows = useServes('shows')
  const music = useServes('music')
  const views: LibraryView[] = [
    'movies',
    ...(shows ? (['shows'] as const) : []),
    'collections',
    ...(music ? (['music'] as const) : []),
  ]
  const view: LibraryView = views.find((v) => v !== 'movies' && v === params.view) ?? 'movies'
  const header = (
    <View style={{ paddingTop: insets.top + space['1'], gap: space['4'] }}>
      {/* the phone's header, as every destination's; it keeps its own gutter, so it stands out of
          the grid's */}
      <View style={{ marginHorizontal: -gutter }}>
        <TouchHeader title={t('library')} />
      </View>
      <View
        collapsable={false}
        role="navigation"
        accessibilityLabel={t('views')}
        style={{ flexDirection: 'row', gap: m.gap }}
      >
        {views.map((v) => (
          <Chip
            key={v}
            // each view is a page of the Library's navigation, the one on view its current page
            // (mobile/collections.tsx's links with aria-current="page")
            accessibilityRole="link"
            selected={view === v}
            current={view === v ? 'page' : undefined}
            onPress={() => {
              // in a browser each view is a page of its own, so its Back returns to the other
              if (Platform.OS === 'web') router.push(VIEW_PATH[v] as Href)
              else router.setParams({ view: v === 'movies' ? undefined : v, music: undefined })
            }}
          >
            {t(v)}
          </Chip>
        ))}
      </View>
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {view === 'movies' ? (
        <MoviesView header={header} />
      ) : view === 'shows' ? (
        <ShowsView header={header} />
      ) : view === 'music' ? (
        <MusicView header={header} />
      ) : (
        <CollectionsView header={header} />
      )}
    </View>
  )
}

function MoviesView({ header }: { header: ReactElement }) {
  const library = useLibrary()
  const refreshControl = usePull(library.refresh)
  return <TouchMovies library={library} header={header} refreshControl={refreshControl} />
}

function CollectionsView({ header }: { header: ReactElement }) {
  const collections = useCollections(useDeviceClient())
  const refreshControl = usePull(collections.refresh)
  return <TouchCollections list={collections} header={header} refreshControl={refreshControl} />
}

/**
 * Pull to refresh over a view's answer: its mark shows until the fetch settles (the SDK's
 * `refresh`, which keeps the old answer on screen), or REFRESH_LIMIT_MS at most; a fetch that
 * fails says so, and what's on screen stays.
 */
export function usePull(refresh: () => Promise<unknown>) {
  const t = useT(messages)
  const theme = useTheme()
  const say = useSay()
  const [refreshing, setRefreshing] = useState(false)
  // the latest pull, so an earlier one settling late doesn't end it
  const pull = useRef(0)
  useEffect(
    () => () => {
      pull.current = -1
    },
    [],
  )
  useEffect(() => {
    if (!refreshing) return
    const timer = setTimeout(() => setRefreshing(false), REFRESH_LIMIT_MS)
    return () => clearTimeout(timer)
  }, [refreshing])
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        pull.current += 1
        const mine = pull.current
        setRefreshing(true)
        refresh().then(
          () => {
            if (pull.current === mine) setRefreshing(false)
          },
          (e: unknown) => {
            if (pull.current !== mine) return
            setRefreshing(false)
            say({
              title: t('refreshFailed'),
              body: t('refreshFailedBody', { reason: e instanceof Error ? e.message : '' }).trim(),
            })
          },
        )
      }}
      title={refreshing ? t('refreshing') : t('pull')}
      tintColor={theme.colors['text-3']}
      titleColor={theme.colors['text-3']}
    />
  )
}

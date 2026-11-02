// SPDX-License-Identifier: AGPL-3.0-only
// C3 Library on the phone (client-library.md#mobile), from the prototype's mobile/library.tsx and
// collections.tsx: a large title, Movies or Collections, then for Movies the count and one Sort
// and filter button that opens a sheet (Show, Sort by, Genre), and three posters a row, each with
// its title and year; sorted by title, the A–Z index stands at the right edge (letter-index.tsx).
// For Collections, the collections three a row with smart ones marked. Pull to refresh on both.
import type { ClientItem } from '@highsea-tv/api-contract'
import { useCollections, useLibrary } from '@highsea-tv/client/data'
import {
  ALL,
  arrange,
  genresOf,
  LETTERS,
  letterOf,
  type Show,
  SORTS,
  type Sort,
} from '@highsea-tv/client/library'
import { useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import {
  Button,
  Chip,
  EmptyState,
  LETTER_INDEX_WIDTH,
  LetterIndex,
  Sheet,
  Text,
  useTheme,
} from '@highsea-tv/ui'
import { router, useLocalSearchParams } from 'expo-router'
import {
  type ComponentRef,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react'
import { ActivityIndicator, type ScrollView, View } from 'react-native'
import { FilmPoster } from '../../../cards.tsx'
import { CollectionTile } from '../../../collection-art.tsx'
import { Grid, Label, Screen } from '../../../kit.tsx'
import { library as messages } from '../../../messages.ts'
import { Header, Reachable } from '../../../shell.tsx'

function Loading() {
  const theme = useTheme()
  return (
    <View style={{ paddingTop: 60, alignItems: 'center' }}>
      <ActivityIndicator color={theme.colors['text-3']} />
    </View>
  )
}

/** What the page above the grid hands Movies: its scroller, and the slot for the A–Z index. */
type Page = {
  scroll: RefObject<ComponentRef<typeof ScrollView> | null>
  setAside: (aside: ReactNode) => void
}

function Movies({ page }: { page: Page }) {
  const t = useT(messages)
  const library = useLibrary()
  const [genre, setGenre] = useState(ALL)
  const [sort, setSort] = useState<Sort>('title')
  const [show, setShow] = useState<Show>('all')
  const [open, setOpen] = useState(false)
  const items = library.data ?? []
  const shown = arrange(items, genre, sort, show === 'unwatched')
  const filtered = genre !== ALL || sort !== 'title' || show !== 'all'
  // where the grid starts in the page, and where each letter's first title starts in the grid
  const gridTop = useRef(0)
  const starts = useRef(new Map<string, number>())
  const titled = sort === 'title' && library.status === 'success' && shown.length > 0
  const present = titled ? [...new Set(shown.map((m) => letterOf(m.title)))].join('') : ''
  const firstOf = (i: number) =>
    i === 0 || letterOf(shown[i - 1]?.title ?? '') !== letterOf(shown[i]?.title ?? '')
  const firsts = new Set(shown.filter((_, i) => titled && firstOf(i)).map((m) => m.id))
  const { setAside, scroll } = page
  useEffect(() => {
    setAside(
      present ? (
        <LetterIndex
          letters={LETTERS}
          present={new Set(present)}
          label={t('letters')}
          onLetter={(l) =>
            scroll.current?.scrollTo({
              y: gridTop.current + (starts.current.get(l) ?? 0) - 16,
              animated: false,
            })
          }
        />
      ) : null,
    )
  }, [present, setAside, scroll, t])
  useEffect(() => () => setAside(null), [setAside])
  const onCell = (m: ClientItem, y: number) => {
    if (firsts.has(m.id)) starts.current.set(letterOf(m.title), y)
  }

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text variant="caption" size={13} color="text-3" style={{ flex: 1 }}>
          {library.status === 'success'
            ? t('shown', { shown: shown.length, total: items.length })
            : ''}
        </Text>
        <Button icon="filter" onPress={() => setOpen(true)}>
          {filtered ? t('sorted') : t('sortFilter')}
        </Button>
      </View>
      {library.status === 'loading' ? (
        <Loading />
      ) : library.status === 'error' ? (
        <EmptyState
          tone="error"
          icon="alert"
          title={t('failed')}
          action={<Button onPress={library.refetch}>{t('tryAgain')}</Button>}
        >
          {library.error.message}
        </EmptyState>
      ) : items.length === 0 ? (
        <EmptyState icon="library" title={t('emptyTitle')}>
          {t('emptyBody')}
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon="filter" title={t('noMatchTitle')}>
          {show === 'unwatched' ? t('noMatchUnwatched') : t('noMatch')}
        </EmptyState>
      ) : (
        <View
          onLayout={(e) => {
            gridTop.current = e.nativeEvent.layout.y
          }}
        >
          <Grid
            items={shown}
            keyOf={(m) => String(m.id)}
            inset={titled ? LETTER_INDEX_WIDTH - 8 : 0}
            onCell={titled ? onCell : undefined}
            render={(m, width) => <FilmPoster item={m} width={width} />}
          />
        </View>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={t('sortFilter')}>
        <View style={{ gap: 20 }}>
          <View style={{ gap: 8 }}>
            <Label>{t('show')}</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip selected={show === 'all'} onPress={() => setShow('all')}>
                {t('allMovies')}
              </Chip>
              <Chip selected={show === 'unwatched'} onPress={() => setShow('unwatched')}>
                {t('unwatched')}
              </Chip>
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Label>{t('sortBy')}</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SORTS.map((s) => (
                <Chip key={s} selected={sort === s} onPress={() => setSort(s)}>
                  {t(`sort.${s}`)}
                </Chip>
              ))}
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Label>{t('genre')}</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[ALL, ...genresOf(items)].map((g) => (
                <Chip key={g} selected={genre === g} onPress={() => setGenre(g)}>
                  {g === ALL ? t('all') : g}
                </Chip>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              variant="ghost"
              onPress={() => {
                setGenre(ALL)
                setSort('title')
                setShow('all')
              }}
            >
              {t('reset')}
            </Button>
            <Button variant="primary" onPress={() => setOpen(false)}>
              {t('showCount', { count: shown.length })}
            </Button>
          </View>
        </View>
      </Sheet>
    </>
  )
}

function Collections() {
  const t = useT(messages)
  const f = useFormat()
  const list = useCollections('ios')
  const xs = list.data ?? []
  return (
    <>
      <Text variant="caption" size={13} color="text-3">
        {list.status === 'success' ? f.collections(xs.length) : ''}
      </Text>
      {list.status === 'loading' ? (
        <Loading />
      ) : list.status === 'error' ? (
        <EmptyState
          tone="error"
          icon="alert"
          title={t('collectionsFailed')}
          action={<Button onPress={list.refetch}>{t('tryAgain')}</Button>}
        >
          {list.error.message}
        </EmptyState>
      ) : xs.length === 0 ? (
        <EmptyState icon="library" title={t('noCollectionsTitle')}>
          {t('noCollections')}
        </EmptyState>
      ) : (
        <Grid
          items={xs}
          keyOf={(c) => c.id}
          render={(c) => {
            const caption = f.caption(c)
            const smart = c.smart?.words ? t('smart') : null
            return (
              <CollectionTile
                name={c.name}
                caption={caption}
                label={t(smart ? 'smartTileLabel' : 'tileLabel', { name: c.name, caption })}
                poster={c.art.poster}
                mosaic={c.smart?.mosaic}
                smart={smart}
                onPress={() => router.push(`/collections/${c.id}`)}
              />
            )
          }}
        />
      )}
    </>
  )
}

export default function Library() {
  const t = useT(messages)
  const params = useLocalSearchParams<{ view?: string }>()
  const [view, setView] = useState<'movies' | 'collections'>(
    params.view === 'collections' ? 'collections' : 'movies',
  )
  const library = useLibrary()
  const collections = useCollections('ios')
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null)
  const [aside, setAside] = useState<ReactNode>(null)
  return (
    <Reachable>
      <Screen
        tabs
        scrollRef={scroll}
        aside={view === 'movies' ? aside : null}
        refreshing={false}
        onRefresh={view === 'movies' ? library.refetch : collections.refetch}
      >
        <Header title={t('title')} />
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8 }}>
          <Chip selected={view === 'movies'} onPress={() => setView('movies')}>
            {t('movies')}
          </Chip>
          <Chip selected={view === 'collections'} onPress={() => setView('collections')}>
            {t('collections')}
          </Chip>
        </View>
        {view === 'movies' ? <Movies page={{ scroll, setAside }} /> : <Collections />}
      </Screen>
    </Reachable>
  )
}

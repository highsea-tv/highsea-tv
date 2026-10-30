// SPDX-License-Identifier: AGPL-3.0-only
// C3 Library on the phone (client-library.md#mobile), from the prototype's mobile/library.tsx and
// collections.tsx: a large title, Movies or Collections, then for Movies the count and one Sort
// and filter button that opens a sheet (Show, Sort by, Genre), and three posters a row; for
// Collections, the collections three a row with smart ones marked.
import { useCollections, useLibrary } from '@highsea-tv/client/data'
import { ALL, arrange, genresOf, type Show, SORTS, type Sort } from '@highsea-tv/client/library'
import { useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import { Button, EmptyState, Poster, Sheet, Text, useTheme } from '@highsea-tv/ui-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { CollectionTile } from '../../../collection-art.tsx'
import { Chip, Grid, Label, Screen } from '../../../kit.tsx'
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

function Movies() {
  const t = useT(messages)
  const f = useFormat()
  const media = useMedia()
  const library = useLibrary()
  const [genre, setGenre] = useState(ALL)
  const [sort, setSort] = useState<Sort>('title')
  const [show, setShow] = useState<Show>('all')
  const [open, setOpen] = useState(false)
  const items = library.data ?? []
  const shown = arrange(items, genre, sort, show === 'unwatched')
  const filtered = genre !== ALL || sort !== 'title' || show !== 'all'

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
        <Grid
          items={shown}
          keyOf={(m) => String(m.id)}
          render={(m, width) => (
            <Poster
              title={m.title}
              src={media(m.art.poster)}
              width={width}
              onPress={() => router.push(`/movies/${m.id}`)}
              progress={m.progress !== null ? m.progress * 100 : undefined}
              showTitle
              caption={
                m.progress !== null ? (f.left(m) ?? undefined) : m.year ? String(m.year) : undefined
              }
            />
          )}
        />
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={t('sortFilter')}>
        <View style={{ gap: 20 }}>
          <View style={{ gap: 8 }}>
            <Label>{t('show')}</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip pressed={show === 'all'} onPress={() => setShow('all')}>
                {t('allMovies')}
              </Chip>
              <Chip pressed={show === 'unwatched'} onPress={() => setShow('unwatched')}>
                {t('unwatched')}
              </Chip>
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Label>{t('sortBy')}</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SORTS.map((s) => (
                <Chip key={s} pressed={sort === s} onPress={() => setSort(s)}>
                  {t(`sort.${s}`)}
                </Chip>
              ))}
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Label>{t('genre')}</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[ALL, ...genresOf(items)].map((g) => (
                <Chip key={g} pressed={genre === g} onPress={() => setGenre(g)}>
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
  return (
    <Reachable>
      <Screen tabs>
        <Header title={t('title')} />
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 8 }}>
          <Chip pressed={view === 'movies'} onPress={() => setView('movies')}>
            {t('movies')}
          </Chip>
          <Chip pressed={view === 'collections'} onPress={() => setView('collections')}>
            {t('collections')}
          </Chip>
        </View>
        {view === 'movies' ? <Movies /> : <Collections />}
      </Screen>
    </Reachable>
  )
}

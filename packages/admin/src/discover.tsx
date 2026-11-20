'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A4 Discover (docs/product/movies.md#discover-a4), ported from the prototype: TMDB's lists until
// you type, then instant results. A poster opens the movie's page, the same page whether it's in
// the library or not (ADR 0014, by TMDB id). Add opens the add dialog.
//
// What real data changes:
// - with no query, four tabs (Trending, Popular, Now playing, Upcoming) replace "Trending this
//   week" (checkpoint 4 plan, decision 7);
// - the query and the tab live in the address (`?q=`, `?list=`), so Back returns to them;
// - TMDB answers a page at a time: the grid is the libraries' windowed one and reads the next page
//   as it draws its last row, with no Show more (the owner, 2026-11-19, HT-115; ./discover-grid.tsx);
// - no TMDB key says so, and links to Settings › General (decision 1).
// Drawn with the library's native renderer since D2 (one-client-platform-d.md).
import { DISCOVER_LISTS, type DiscoverMovie } from '@highsea-tv/api-contract'
import { useT } from '@highsea-tv/i18n/react'
import type { HighseaClient } from '@highsea-tv/sdk'
import {
  Button,
  EmptyState,
  Poster,
  Rating,
  SearchField,
  Tabs,
  Text,
  tokens,
} from '@highsea-tv/ui/native'
import { useDeferredValue, useState } from 'react'
import { View } from 'react-native'
import { AddMovieDialog, isNoMetadataKey, METADATA_SETTINGS } from './add-dialog.tsx'
import { useAddressParam } from './address.ts'
import { DiscoverGrid } from './discover-grid.tsx'
import { discover as messages } from './discover-messages.ts'
import { useDiscoverPages } from './discover-pages.ts'
import { FindKind, FindRow, SEARCH } from './discover-shows.tsx'
import { Loadable, PosterSkeletons } from './loadable.tsx'
import { moviePath } from './media-links.ts'
import { InLibraryLink } from './media-sections.tsx'
import { AdminPage } from './shell.tsx'

type List = (typeof DISCOVER_LISTS)[number]

/** Library changes flip a result's In library badge in place. */
const LIVE = ['movies.updated']

const viewKey = (list: List, query: string) => `discover:${query ? `q:${query}` : list}`

const fetchPage = (list: List, query: string) => (c: HighseaClient, page: number) =>
  c.movies.discover({ query: query ? { query, page } : { list, page } })

const idOf = (m: DiscoverMovie) => String(m.id)

function Result({ movie: m, onAdd }: { movie: DiscoverMovie; onAdd: (m: DiscoverMovie) => void }) {
  const t = useT(messages)
  return (
    <View style={{ gap: tokens.space['2'] }}>
      <View>
        <Poster
          title={m.title}
          src={m.art.poster ?? undefined}
          href={moviePath(m.id)}
          showTitle
          titleSize="ui"
        />
        {/* the caption: the year and TMDB's rating, which a Poster's string caption can't hold */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: tokens.space['2'],
            marginTop: tokens.space['0.5'],
          }}
        >
          {m.year === null ? null : (
            <Text variant="caption" color="text-3">
              {String(m.year)}
            </Text>
          )}
          {m.rating > 0 && <Rating value={m.rating} size={tokens.icon.size['2xs']} />}
        </View>
      </View>
      {m.inLibrary ? (
        <InLibraryLink
          href={moviePath(m.id)}
          label={t('inLibrary.label', { title: m.title })}
          text={t('inLibrary')}
        />
      ) : (
        <Button
          size="sm"
          icon="add"
          onPress={() => onAdd(m)}
          accessibilityLabel={t('add.label', { title: m.title })}
        >
          {t('add')}
        </Button>
      )}
    </View>
  )
}

export function Discover() {
  const t = useT(messages)
  const [query, setQuery] = useAddressParam<string>('q', '')
  const [list, setList] = useAddressParam<List>('list', 'trending', DISCOVER_LISTS)
  const deferred = useDeferredValue(query.trim())
  // TMDB's pages for this search or list; another starts again from its first
  const pages = useDiscoverPages(viewKey(list, deferred), fetchPage(list, deferred), idOf, LIVE)
  const first = pages.query
  const [adding, setAdding] = useState<DiscoverMovie[]>([])
  const onAdd = (m: DiscoverMovie) => setAdding([m])

  const noKey = first.status === 'error' && isNoMetadataKey(first.error)

  const results = noKey ? (
    <EmptyState
      icon="key"
      title={t('noKey')}
      action={<Button href={METADATA_SETTINGS}>{t('noKey.link')}</Button>}
    />
  ) : (
    <Loadable query={first} what={t('what')} skeleton={<PosterSkeletons />}>
      {(items) =>
        items.length === 0 ? (
          deferred ? (
            <EmptyState icon="search" title={t('empty.query', { query: deferred })}>
              {t('empty.queryBody')}
            </EmptyState>
          ) : (
            <EmptyState icon="discover" title={t('empty.list')}>
              {t('empty.listBody')}
            </EmptyState>
          )
        ) : (
          <DiscoverGrid
            items={items}
            pages={pages}
            keyOf={idOf}
            label={deferred ? t('results', { query: deferred }) : t(`list.${list}`)}
            render={(m) => <Result movie={m} onAdd={onAdd} />}
          />
        )
      }
    </Loadable>
  )

  return (
    <AdminPage title={t('title')} description={t('description')}>
      {/* Movies or Shows beside the search, only when the server serves shows (D3, answer 5) */}
      <FindRow>
        <FindKind value="movies" />
        <View style={SEARCH}>
          <SearchField
            label={t('search')}
            value={query}
            onChangeText={setQuery}
            placeholder={t('placeholder')}
            spellCheck={false}
            autoCorrect={false}
          />
        </View>
      </FindRow>
      {deferred ? (
        <>
          <Text variant="title" role="heading" aria-level={2}>
            {t('results', { query: deferred })}
          </Text>
          {results}
        </>
      ) : (
        // the lists are tabs, and the grid what they show (decision 7)
        <View style={{ gap: tokens.space['5'] }}>
          <Tabs
            aria-label={t('lists')}
            value={list}
            onValueChange={(v) => setList(v as List)}
            options={DISCOVER_LISTS.map((l) => ({ value: l, label: t(`list.${l}`) }))}
          />
          {results}
        </View>
      )}
      <AddMovieDialog movies={adding} onOpenChange={(o) => !o && setAdding([])} />
    </AdminPage>
  )
}

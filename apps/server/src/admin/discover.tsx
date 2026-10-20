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
// - TMDB answers a page at a time: Show more under the grid loads the next;
// - no TMDB key says so, and links to Settings › General (decision 1).
import { DISCOVER_LISTS, type DiscoverMovie } from '@highsea/api-contract'
import { useT } from '@highsea/i18n/react'
import type { ApiError, HighseaClient } from '@highsea/sdk'
import { useQuery } from '@highsea/sdk/react'
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Poster,
  Rating,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@highsea/ui-web'
import { useDeferredValue, useState } from 'react'
import { AddMovieDialog, isNoMetadataKey, METADATA_SETTINGS } from './add-dialog.tsx'
import { useAddressParam } from './address.ts'
import { discover as messages } from './discover-messages.ts'
import { Loadable, PosterSkeletons } from './loadable.tsx'
import { moviePath, useCanManageLibrary } from './media-links.ts'
import { isStaff } from './nav.ts'
import { AdminPage, useShell } from './shell.tsx'

type List = (typeof DISCOVER_LISTS)[number]

/** Library changes flip a result's In library badge in place. */
const LIVE = ['movies.updated']

const pageKey = (list: List, query: string, page: number) =>
  `discover:${query ? `q:${query}` : list}:${page}`

const fetchPage = (list: List, query: string, page: number) => (c: HighseaClient) =>
  c.movies.discover({ query: query ? { query, page } : { list, page } })

function Result({
  movie: m,
  canAdd,
  onAdd,
}: {
  movie: DiscoverMovie
  canAdd: boolean
  onAdd: (m: DiscoverMovie) => void
}) {
  const t = useT(messages)
  return (
    <li className="grid content-start gap-2">
      <Poster
        title={m.title}
        src={m.art.poster ?? undefined}
        href={moviePath(m.id)}
        showTitle
        caption={
          <span className="flex items-center gap-2">
            {m.year}
            {m.rating > 0 && <Rating value={m.rating} size={11} />}
          </span>
        }
      />
      {m.inLibrary ? (
        <a
          href={moviePath(m.id)}
          className="justify-self-start"
          aria-label={t('inLibrary.label', { title: m.title })}
        >
          <Badge tone="success">{t('inLibrary')}</Badge>
        </a>
      ) : (
        <Button
          size="sm"
          icon="add"
          onClick={() => onAdd(m)}
          disabled={!canAdd}
          aria-label={t('add.label', { title: m.title })}
          className="justify-self-start"
        >
          {t('add')}
        </Button>
      )}
    </li>
  )
}

/** Pages after the first: their results join the same grid, placeholders while they load. */
function MoreResults({
  list,
  query,
  page,
  canAdd,
  onAdd,
}: {
  list: List
  query: string
  page: number
  canAdd: boolean
  onAdd: (m: DiscoverMovie) => void
}) {
  const t = useT(messages)
  const results = useQuery(pageKey(list, query, page), fetchPage(list, query, page), LIVE)
  if (results.status === 'loading')
    return Array.from({ length: 6 }, (_, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
      <li key={i} aria-busy>
        <Skeleton className="aspect-poster rounded-poster" />
      </li>
    ))
  if (results.status === 'error')
    return (
      <li className="col-span-full grid justify-items-start gap-2 text-caption text-text-3">
        {results.error.message}
        <Button size="sm" onClick={results.refetch}>
          {t('more')}
        </Button>
      </li>
    )
  return results.data.items.map((m) => (
    <Result key={m.id} movie={m} canAdd={canAdd} onAdd={onAdd} />
  ))
}

export function Discover() {
  const t = useT(messages)
  const { role } = useShell()
  const canAdd = useCanManageLibrary()
  const [query, setQuery] = useAddressParam<string>('q', '')
  const [list, setList] = useAddressParam<List>('list', 'trending', DISCOVER_LISTS)
  const deferred = useDeferredValue(query.trim())
  const first = useQuery(pageKey(list, deferred, 1), fetchPage(list, deferred, 1), LIVE)
  // how many pages are shown, for this search or list; another starts again from its first
  const view = pageKey(list, deferred, 1)
  const [more, setMore] = useState({ view, pages: 1 })
  const pages = more.view === view ? more.pages : 1
  const [adding, setAdding] = useState<DiscoverMovie[]>([])
  const onAdd = (m: DiscoverMovie) => setAdding([m])

  const forbidden = first.status === 'error' && (first.error as ApiError).status === 403
  const noKey = first.status === 'error' && isNoMetadataKey(first.error)

  const results = (
    <>
      {noKey ? (
        <EmptyState
          icon="key"
          title={t('noKey')}
          action={
            isStaff(role) ? (
              <Button asChild>
                <a href={METADATA_SETTINGS}>{t('noKey.link')}</a>
              </Button>
            ) : undefined
          }
        >
          {isStaff(role) ? undefined : t('noKey.member')}
        </EmptyState>
      ) : forbidden ? (
        <EmptyState icon="lock" title={t('member')} />
      ) : (
        <Loadable query={first} what={t('what')} skeleton={<PosterSkeletons />}>
          {(page) =>
            page.items.length === 0 ? (
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
              <>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-4 gap-y-5">
                  {page.items.map((m) => (
                    <Result key={m.id} movie={m} canAdd={canAdd} onAdd={onAdd} />
                  ))}
                  {Array.from({ length: pages - 1 }, (_, i) => (
                    <MoreResults
                      key={pageKey(list, deferred, i + 2)}
                      list={list}
                      query={deferred}
                      page={i + 2}
                      canAdd={canAdd}
                      onAdd={onAdd}
                    />
                  ))}
                </ul>
                {pages < Math.min(page.totalPages, 500) && (
                  <Button
                    className="justify-self-center"
                    onClick={() => setMore({ view, pages: pages + 1 })}
                  >
                    {t('more')}
                  </Button>
                )}
              </>
            )
          }
        </Loadable>
      )}
    </>
  )

  return (
    <AdminPage title={t('title')} description={t('description')}>
      <div className="grid max-w-xl gap-1.5">
        <Input
          type="search"
          icon="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('placeholder')}
          aria-label={t('search')}
          spellCheck={false}
        />
      </div>
      {deferred ? (
        <>
          <h2 className="text-title text-text">{t('results', { query: deferred })}</h2>
          {results}
        </>
      ) : (
        // the lists are tabs, and the grid their panel (decision 7)
        <Tabs value={list} onValueChange={(v) => setList(v as List)} className="grid gap-5">
          <TabsList aria-label={t('lists')} className="max-w-full overflow-x-auto">
            {DISCOVER_LISTS.map((l) => (
              <TabsTrigger key={l} value={l}>
                {t(`list.${l}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={list} className="grid gap-5">
            {results}
          </TabsContent>
        </Tabs>
      )}
      {!canAdd && first.status === 'success' && (
        <p className="text-caption text-text-3">{t('member')}</p>
      )}
      <AddMovieDialog movies={adding} onOpenChange={(o) => !o && setAdding([])} />
    </AdminPage>
  )
}

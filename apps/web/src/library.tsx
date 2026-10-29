// SPDX-License-Identifier: AGPL-3.0-only
// C3 Library on the web (docs/product/client-library.md), ported from
// design/prototypes/src/web/library.tsx: everything there is to play on this server as a poster
// grid, with Unwatched (client-library.md#unwatched), a genre and a sort. The whole library is
// read a page at a time, so filters and sorts work on all of it.
import type { ClientItem } from '@highsea-tv/api-contract'
import { useLibrary } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { Button, cn, EmptyState, Poster, Select, Skeleton } from '@highsea-tv/ui-web'
import { useState } from 'react'
import { library as messages } from './messages.ts'
import { gutter, href, useFormat } from './shell.tsx'

export const SORTS = ['title', 'added', 'year', 'rating'] as const
export type Sort = (typeof SORTS)[number]
export type Show = 'all' | 'unwatched'
export const ALL = 'all'

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/** "The Matrix" files under M, as the admin's sort title does. */
const sortTitle = (title: string) => title.replace(/^(the|a|an)\s+/i, '')

/** The genre, then Unwatched, then the sort. Titles without a year sort last by year. */
export function arrange(items: ClientItem[], genre: string, sort: Sort, unwatched = false) {
  const shown = items.filter(
    (m) => (genre === ALL || m.genres.includes(genre)) && !(unwatched && m.watched),
  )
  return [...shown].sort((a, b) =>
    sort === 'added'
      ? Date.parse(b.addedAt) - Date.parse(a.addedAt)
      : sort === 'year'
        ? (b.year ?? 0) - (a.year ?? 0)
        : sort === 'rating'
          ? b.rating - a.rating
          : collator.compare(sortTitle(a.title), sortTitle(b.title)),
  )
}

export const genresOf = (items: ClientItem[]) =>
  [...new Set(items.flatMap((m) => m.genres))].sort((a, b) => collator.compare(a, b))

const grid = 'grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6'

const link =
  'rounded-full px-3.5 py-1.5 text-text-2 text-ui outline-none hover:text-text focus-visible:ring-focus aria-[current=page]:bg-text aria-[current=page]:text-bg'

/** Movies or Collections: the library's two views. */
export function LibraryNav({ current }: { current: 'movies' | 'collections' }) {
  const t = useT(messages)
  return (
    <nav aria-label={t('libraryNav')} className="flex gap-1">
      <a
        href={href('/library')}
        aria-current={current === 'movies' ? 'page' : undefined}
        className={link}
      >
        {t('movies')}
      </a>
      <a
        href={href('/library/collections')}
        aria-current={current === 'collections' ? 'page' : undefined}
        className={link}
      >
        {t('collections')}
      </a>
    </nav>
  )
}

/** A title in a grid: its poster, where you are in it, or its year. */
export function ItemPoster({ item: m }: { item: ClientItem }) {
  const f = useFormat()
  return (
    <Poster
      title={m.title}
      src={m.art.poster ?? undefined}
      href={href(`/movies/${m.id}`)}
      progress={m.progress !== null ? m.progress * 100 : undefined}
      showTitle
      caption={m.progress !== null ? f.left(m) : (m.year ?? undefined)}
    />
  )
}

export function PosterGridSkeleton({ count }: { count: number }) {
  return (
    <div aria-busy className={grid}>
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
        <Skeleton key={i} className="aspect-poster rounded-poster" />
      ))}
    </div>
  )
}

export function WebLibrary() {
  const t = useT(messages)
  const f = useFormat()
  const library = useLibrary()
  const [genre, setGenre] = useState(ALL)
  const [sort, setSort] = useState<Sort>('title')
  const [show, setShow] = useState<Show>('all')
  const items = library.data ?? []
  const shown = arrange(items, genre, sort, show === 'unwatched')
  return (
    <main className={cn('mx-auto w-full grid max-w-[1680px] gap-6 pt-6 pb-16', gutter)}>
      <LibraryNav current="movies" />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <h1 className="text-heading">{t('movies')}</h1>
          {library.status === 'success' && (
            <p className="text-caption text-text-3">{f.movies(items.length)}</p>
          )}
        </div>
        <div className="ms-auto flex flex-wrap gap-2">
          <Select
            aria-label={t('show')}
            value={show}
            onValueChange={(v) => setShow(v as Show)}
            options={[
              { value: 'all', label: t('all') },
              { value: 'unwatched', label: t('unwatched') },
            ]}
            className="w-40"
          />
          <Select
            aria-label={t('genre')}
            value={genre}
            onValueChange={setGenre}
            options={[
              { value: ALL, label: t('allGenres') },
              ...genresOf(items).map((g) => ({ value: g, label: g })),
            ]}
            className="w-44"
          />
          <Select
            aria-label={t('sort')}
            value={sort}
            onValueChange={(v) => setSort(v as Sort)}
            options={SORTS.map((s) => ({ value: s, label: t(`sort.${s}`) }))}
            className="w-44"
          />
        </div>
      </div>
      {library.status === 'loading' ? (
        <PosterGridSkeleton count={14} />
      ) : library.status === 'error' ? (
        <EmptyState
          tone="error"
          icon="alert"
          title={t('failed')}
          action={<Button onClick={library.refetch}>{t('tryAgain')}</Button>}
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
        <ul aria-label={t('movies')} className={grid}>
          {shown.map((m) => (
            <li key={m.id}>
              <ItemPoster item={m} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

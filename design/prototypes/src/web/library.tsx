// SPDX-License-Identifier: AGPL-3.0-only
// C3 Library browse, web/desktop (docs/product/client-library.md). Everything you can watch on this
// server as a poster grid, with a genre filter and a sort. Other media types appear as tabs only
// once the server has them; in M1 it's movies only, so there are no tabs.
import { Button, cn, EmptyState, Poster, Select, Skeleton } from '@highsea-tv/ui-web'
import { useState } from 'react'
import { left, useLibrary } from '../client/data.ts'
import type { ClientItem } from '../mock/types.ts'
import { LibraryNav } from './collections.tsx'
import { gutter, webHref } from './shell.tsx'

export type Sort = 'title' | 'added' | 'year' | 'rating'

export const sorts: { value: Sort; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'added', label: 'Recently added' },
  { value: 'year', label: 'Newest first' },
  { value: 'rating', label: 'Highest rated' },
]

export const ALL = 'all'

export function arrange(items: ClientItem[], genre: string, sort: Sort) {
  const shown = genre === ALL ? items : items.filter((m) => m.genres.includes(genre))
  return [...shown].sort((a, b) =>
    sort === 'added'
      ? Date.parse(b.addedAt) - Date.parse(a.addedAt)
      : sort === 'year'
        ? b.year - a.year
        : sort === 'rating'
          ? b.rating - a.rating
          : a.sortTitle.localeCompare(b.sortTitle),
  )
}

export const genresOf = (items: ClientItem[]) =>
  [...new Set(items.flatMap((m) => m.genres))].sort((a, b) => a.localeCompare(b))

export function WebLibrary() {
  const library = useLibrary()
  const [genre, setGenre] = useState(ALL)
  const [sort, setSort] = useState<Sort>('title')
  const items = library.data ?? []
  const shown = arrange(items, genre, sort)
  return (
    <main className={cn('mx-auto grid max-w-[1680px] gap-6 pt-6 pb-16', gutter)}>
      <LibraryNav current="movies" />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <h1 className="text-heading">Movies</h1>
          {library.status === 'success' && (
            <p className="text-caption text-text-3">
              {items.length} {items.length === 1 ? 'movie' : 'movies'}
            </p>
          )}
        </div>
        <div className="ms-auto flex flex-wrap gap-2">
          <Select
            aria-label="Genre"
            value={genre}
            onValueChange={setGenre}
            options={[
              { value: ALL, label: 'All genres' },
              ...genresOf(items).map((g) => ({ value: g, label: g })),
            ]}
            className="w-44"
          />
          <Select
            aria-label="Sort"
            value={sort}
            onValueChange={(v) => setSort(v as Sort)}
            options={sorts}
            className="w-44"
          />
        </div>
      </div>
      {library.status === 'loading' ? (
        <div
          aria-busy
          className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6"
        >
          {Array.from({ length: 14 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
            <Skeleton key={i} className="aspect-poster rounded-poster" />
          ))}
        </div>
      ) : library.status === 'error' ? (
        <EmptyState
          tone="error"
          icon="alert"
          title="Couldn’t load the library"
          action={<Button onClick={library.refetch}>Try again</Button>}
        >
          {library.error.message}
        </EmptyState>
      ) : items.length === 0 ? (
        <EmptyState icon="library" title="No movies yet">
          When the server’s owner adds movies, they show up here.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon="filter" title="No movies match">
          Try another genre.
        </EmptyState>
      ) : (
        <ul
          aria-label="Movies"
          className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6"
        >
          {shown.map((m) => (
            <li key={m.id}>
              <Poster
                title={m.title}
                src={m.art.poster}
                href={webHref(`/movies/${m.id}`)}
                progress={m.progress !== null ? m.progress * 100 : undefined}
                showTitle
                caption={m.progress !== null ? left(m) : m.year}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

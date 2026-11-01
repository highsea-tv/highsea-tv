// SPDX-License-Identifier: AGPL-3.0-only
// Shows on the web and desktop: the shows library, laid out as Movies is (C3) so the two read as
// one library: the title and count, Show, Genre and Sort at the right, the A–Z index when sorted
// by title, and a poster grid. Each poster counts the episodes left to watch on its art, as Plex
// and Infuse do, and names its seasons under the title.
import { Button, cn, EmptyState, Select, Skeleton } from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useShows } from '../client/data.ts'
import { MediaPosterSkeleton } from '../client/media-card.tsx'
import { ShowPoster } from '../client/show-card.tsx'
import {
  ALL_SHOW_GENRES,
  arrangeShows,
  type ShowFilter,
  type ShowSort,
  showFilters,
  showGenresOf,
  showSorts,
  showsCount,
} from '../client/shows.ts'
import { LetterIndex, letterOf, stuck } from './library.tsx'
import { gutter, webHref } from './shell.tsx'
import { useWindowChrome } from './window.tsx'

const grid = 'grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6'

export function WebShows() {
  const shows = useShows()
  const [genre, setGenre] = useState(ALL_SHOW_GENRES)
  const [sort, setSort] = useState<ShowSort>('title')
  const [filter, setFilter] = useState<ShowFilter>('all')
  const all = shows.data ?? []
  const shown = arrangeShows(all, genre, sort, filter === 'unwatched')
  const place = useWindowChrome() === 'bar' ? 'bar' : 'under'
  const indexed = sort === 'title' && shows.status !== 'error' && shown.length > 0
  const present = new Set(shown.map((s) => letterOf(s.sortTitle)))
  return (
    <main className={cn('mx-auto w-full grid max-w-[1680px] gap-6 pt-6 pb-16', gutter)}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <h1 className="text-heading">Shows</h1>
          {shows.status === 'loading' && <Skeleton className="my-0.5 h-3 w-20" />}
          {shows.status === 'success' && (
            <p className="text-caption text-text-3">{showsCount(all.length)}</p>
          )}
        </div>
        <div className="ms-auto flex flex-wrap gap-2">
          <Select
            aria-label="Show"
            value={filter}
            onValueChange={(v) => setFilter(v as ShowFilter)}
            options={showFilters}
            className="w-40"
          />
          <Select
            aria-label="Genre"
            value={genre}
            onValueChange={setGenre}
            options={[
              { value: ALL_SHOW_GENRES, label: 'All genres' },
              ...showGenresOf(all).map((g) => ({ value: g, label: g })),
            ]}
            className="w-44"
          />
          <Select
            aria-label="Sort"
            value={sort}
            onValueChange={(v) => setSort(v as ShowSort)}
            options={showSorts}
            className="w-44"
          />
        </div>
      </div>
      <div className="flex items-start">
        <LetterIndex
          shown={indexed || (sort === 'title' && shows.status === 'loading')}
          present={present}
          place={place}
        />
        <div className="min-w-0 flex-1">
          {shows.status === 'loading' ? (
            <div aria-busy className={grid}>
              {Array.from({ length: 14 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
                <MediaPosterSkeleton key={i} />
              ))}
            </div>
          ) : shows.status === 'error' ? (
            <EmptyState
              tone="error"
              icon="alert"
              title="Couldn’t load the shows"
              action={<Button onClick={shows.refetch}>Try again</Button>}
            >
              {shows.error.message}
            </EmptyState>
          ) : all.length === 0 ? (
            <EmptyState icon="series" title="No shows yet">
              When the server’s owner adds shows, they show up here.
            </EmptyState>
          ) : shown.length === 0 ? (
            <EmptyState icon="filter" title="No shows match">
              {filter === 'unwatched' ? 'You’ve watched every episode here. ' : ''}Try another genre
              {filter === 'unwatched' ? ', or show all shows' : ''}.
            </EmptyState>
          ) : (
            <ul aria-label="Shows" className={grid}>
              {shown.map((s, i) => {
                const l = letterOf(s.sortTitle)
                const first = indexed && (i === 0 || letterOf(shown[i - 1]?.sortTitle ?? '') !== l)
                return (
                  <li
                    key={s.id}
                    {...(first ? { 'data-letter': l } : {})}
                    className={stuck.margin[place]}
                  >
                    <ShowPoster show={s} titleSize="body" href={webHref(`/shows/${s.id}`)} />
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  )
}

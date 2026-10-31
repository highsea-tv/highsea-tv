// SPDX-License-Identifier: AGPL-3.0-only
// C3 Library browse, web/desktop (docs/product/client-library.md). Everything you can watch on this
// server as a poster grid, with a genre filter and a sort. Other media types appear as tabs only
// once the server has them; in M1 it's movies only, so there are no tabs. Sorted by title, an A–Z
// index stands in its own column at the container's left, sticky under the top bar, and the grid
// fills the rest (the owner, 2026-10-30).
import { Button, cn, EmptyState, Select, Skeleton } from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useLibrary } from '../client/data.ts'
import { MediaPoster, MediaPosterSkeleton } from '../client/media-card.tsx'
import type { ClientItem } from '../mock/types.ts'
import { gutter, webHref } from './shell.tsx'
import { useWindowChrome } from './window.tsx'

export const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
export const letterOf = (sortTitle: string) => {
  const c = sortTitle.charAt(0).toUpperCase()
  return /[A-Z]/.test(c) ? c : '#'
}

// under the sticky top bar (80px and its border, and the desktop app's title bar above it), with
// the page's gap; a letter's first title scrolls to the same line. The letters are square, 1.5rem
// or a 27th of the height left under the bar, whichever is less
export const stuck = {
  top: { under: 'top-[calc(5rem+1px+1.5rem)]', bar: 'top-[calc(7rem+1px+1.5rem)]' },
  size: {
    under: 'w-[min(1.5rem,calc((100svh-5rem-1px-3rem)/27))]',
    bar: 'w-[min(1.5rem,calc((100svh-7rem-1px-3rem)/27))]',
  },
  margin: {
    under: 'scroll-mt-[calc(5rem+1px+1.5rem)]',
    bar: 'scroll-mt-[calc(7rem+1px+1.5rem)]',
  },
}

/**
 * The A–Z index: every letter, those without titles dimmed and skipped. A letter scrolls the page to
 * its first title and focuses it. While the library loads, every letter shows dimmed, so nothing
 * moves when it's ready. Only from `medium` up: on a phone-sized window, touch scrolls the grid
 * quickly, and the grid needs the room. It stays in the page when another sort hides it, so its
 * column closes and opens with spring.quick and the grid widens and narrows with it, rather than
 * snapping (the owner, 2026-10-30); its letters' focus ring is drawn inside them, as the column
 * clips.
 */
export function LetterIndex({
  shown,
  present,
  place,
}: {
  shown: boolean
  present: Set<string>
  place: keyof typeof stuck.top
}) {
  const jump = (l: string) => {
    const li = document.querySelector<HTMLElement>(`[data-letter="${l}"]`)
    if (!li) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    li.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' })
    li.querySelector<HTMLElement>('a')?.focus({ preventScroll: true })
  }
  return (
    <nav
      aria-label="Jump to a letter"
      aria-hidden={!shown || undefined}
      inert={!shown}
      className={cn(
        'sticky hidden shrink-0 self-start overflow-hidden transition-[width,margin-inline-end,opacity] duration-(--duration-spring-quick) ease-(--ease-spring-quick) medium:block',
        stuck.top[place],
        shown ? cn(stuck.size[place], 'me-4 opacity-100') : 'me-0 w-0 opacity-0',
      )}
    >
      <div className={cn('flex flex-col', stuck.size[place])}>
        {LETTERS.map((l) => (
          <button
            key={l}
            type="button"
            disabled={!present.has(l)}
            onClick={() => jump(l)}
            className="grid aspect-square w-full cursor-pointer place-items-center rounded-sm font-semibold text-caption text-text-2 leading-none outline-none transition-tint focus-ring-inset hover:text-text disabled:cursor-default disabled:text-text-3/40"
          >
            {l}
          </button>
        ))}
      </div>
    </nav>
  )
}

export type Sort = 'title' | 'added' | 'year' | 'rating'

export const sorts: { value: Sort; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'added', label: 'Recently added' },
  { value: 'year', label: 'Newest first' },
  { value: 'rating', label: 'Highest rated' },
]

export const ALL = 'all'

export type Show = 'all' | 'unwatched'
export const shows: { value: Show; label: string }[] = [
  { value: 'all', label: 'All movies' },
  { value: 'unwatched', label: 'Unwatched' },
]

/** The genre, then Unwatched (client-library.md#unwatched, checkpoint 4.0b), then the sort. */
export function arrange(items: ClientItem[], genre: string, sort: Sort, unwatched = false) {
  const shown = items.filter(
    (m) => (genre === ALL || m.genres.includes(genre)) && !(unwatched && m.watched),
  )
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
  const [show, setShow] = useState<Show>('all')
  const items = library.data ?? []
  const shown = arrange(items, genre, sort, show === 'unwatched')
  const place = useWindowChrome() === 'bar' ? 'bar' : 'under'
  const indexed = sort === 'title' && library.status !== 'error' && shown.length > 0
  const present = new Set(shown.map((m) => letterOf(m.sortTitle)))
  return (
    <main className={cn('mx-auto w-full grid max-w-[1680px] gap-6 pt-6 pb-16', gutter)}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <h1 className="text-heading">Movies</h1>
          {library.status === 'loading' && <Skeleton className="my-0.5 h-3 w-20" />}
          {library.status === 'success' && (
            <p className="text-caption text-text-3">
              {items.length} {items.length === 1 ? 'movie' : 'movies'}
            </p>
          )}
        </div>
        <div className="ms-auto flex flex-wrap gap-2">
          <Select
            aria-label="Show"
            value={show}
            onValueChange={(v) => setShow(v as Show)}
            options={shows}
            className="w-40"
          />
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
      <div className="flex items-start">
        <LetterIndex
          shown={indexed || (sort === 'title' && library.status === 'loading')}
          present={present}
          place={place}
        />
        <div className="min-w-0 flex-1">
          {library.status === 'loading' ? (
            <div
              aria-busy
              className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6"
            >
              {Array.from({ length: 14 }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
                <MediaPosterSkeleton key={i} />
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
              {show === 'unwatched' ? 'You’ve watched everything here. ' : ''}Try another genre
              {show === 'unwatched' ? ', or show all movies' : ''}.
            </EmptyState>
          ) : (
            <ul
              aria-label="Movies"
              className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-4 gap-y-6"
            >
              {shown.map((m, i) => {
                const l = letterOf(m.sortTitle)
                const first = indexed && (i === 0 || letterOf(shown[i - 1]?.sortTitle ?? '') !== l)
                return (
                  <li
                    key={m.id}
                    {...(first ? { 'data-letter': l } : {})}
                    className={stuck.margin[place]}
                  >
                    <MediaPoster item={m} titleSize="body" href={webHref(`/movies/${m.id}`)} />
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

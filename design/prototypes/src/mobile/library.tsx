// SPDX-License-Identifier: AGPL-3.0-only
// C3 Library browse, mobile (docs/product/client-library.md#mobile): a large title, the count and
// one Sort and filter button that opens a sheet; then three posters a row.
import { Button, cn, EmptyState, Sheet, SheetContent, Skeleton } from '@highsea-tv/ui-web'
import { useState } from 'react'
import { useLibrary } from '../client/data.ts'
import { MediaPoster, MediaPosterSkeleton } from '../client/media-card.tsx'
import { hitSlop } from '../kit/mobile/device.tsx'
import { ALL, arrange, genresOf, type Show, type Sort, shows, sorts } from '../web/library.tsx'
import { LibraryNav } from './collections.tsx'
import { LetterIndexed, useLetters } from './letter-index.tsx'
import { PullToRefresh } from './pull.tsx'
import { gutter, Header, mobileHref } from './shell.tsx'

const chip = cn(
  'relative min-h-9 cursor-pointer rounded-full border border-line px-3.5 text-[14px] text-text-2 outline-none focus-visible:ring-focus aria-pressed:border-transparent aria-pressed:bg-text aria-pressed:text-bg',
  hitSlop,
)

export function MobileLibrary() {
  const library = useLibrary()
  const [genre, setGenre] = useState(ALL)
  const [sort, setSort] = useState<Sort>('title')
  const [show, setShow] = useState<Show>('all')
  const [open, setOpen] = useState(false)
  const items = library.data ?? []
  const shown = arrange(items, genre, sort, show === 'unwatched')
  const filtered = genre !== ALL || sort !== 'title' || show !== 'all'
  const letters = useLetters(
    shown.map((m) => m.sortTitle),
    sort === 'title' && library.status === 'success',
  )
  return (
    <PullToRefresh onRefresh={library.refetch}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 pt-1">
        <Header title="Library" />
        <LibraryNav current="movies" />
        <div className={cn('flex items-center gap-2', gutter)}>
          {library.status === 'loading' ? (
            <Skeleton className="h-3 w-24" />
          ) : (
            <p className="text-[13px] text-text-3">
              {library.status === 'success' ? `${shown.length} of ${items.length} movies` : ' '}
            </p>
          )}
          <Button
            size="sm"
            icon="filter"
            className={cn('relative ms-auto', hitSlop)}
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
          >
            {filtered ? 'Sorted and filtered' : 'Sort and filter'}
          </Button>
        </div>
        <div className={gutter}>
          {library.status === 'loading' ? (
            <div aria-busy className="grid grid-cols-3 gap-x-2 gap-y-4">
              {Array.from({ length: 9 }, (_, i) => (
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
            <LetterIndexed letters={letters}>
              <ul className="grid grid-cols-3 gap-x-2 gap-y-4">
                {shown.map((m, i) => (
                  <li key={m.id} {...letters.mark(i)}>
                    <MediaPoster item={m} href={mobileHref(`/movies/${m.id}`)} />
                  </li>
                ))}
              </ul>
            </LetterIndexed>
          )}
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent
            title="Sort and filter"
            footer={
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setGenre(ALL)
                    setSort('title')
                    setShow('all')
                  }}
                >
                  Reset
                </Button>
                <Button variant="primary" onClick={() => setOpen(false)}>
                  Show {shown.length} movies
                </Button>
              </>
            }
          >
            <div className="grid gap-5">
              <fieldset className="grid gap-2">
                <legend className="mb-2 font-mono text-label text-text-3 uppercase">Show</legend>
                <div className="flex flex-wrap gap-2">
                  {shows.map((x) => (
                    <button
                      key={x.value}
                      type="button"
                      aria-pressed={show === x.value}
                      onClick={() => setShow(x.value)}
                      className={chip}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="grid gap-2">
                <legend className="mb-2 font-mono text-label text-text-3 uppercase">Sort by</legend>
                <div className="flex flex-wrap gap-2">
                  {sorts.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      aria-pressed={sort === s.value}
                      onClick={() => setSort(s.value)}
                      className={chip}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset className="grid gap-2">
                <legend className="mb-2 font-mono text-label text-text-3 uppercase">Genre</legend>
                <div className="flex flex-wrap gap-2">
                  {[ALL, ...genresOf(items)].map((g) => (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={genre === g}
                      onClick={() => setGenre(g)}
                      className={chip}
                    >
                      {g === ALL ? 'All' : g}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </PullToRefresh>
  )
}

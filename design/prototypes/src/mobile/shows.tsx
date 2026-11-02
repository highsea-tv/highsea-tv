// SPDX-License-Identifier: AGPL-3.0-only
// Library › Shows, mobile: laid out as Movies is, a large title with the library's views, the count
// and one Sort and filter button that opens a sheet; then three posters a row, each with how many
// episodes are left to watch.
import { Button, Chip, cn, EmptyState, Sheet, SheetContent, Skeleton } from '@highsea-tv/ui'
import { useState } from 'react'
import { useShows } from '../client/data.ts'
import { MediaPosterSkeleton } from '../client/media-card.tsx'
import { ShowPoster } from '../client/show-card.tsx'
import {
  ALL_SHOW_GENRES as ALL,
  arrangeShows,
  type ShowFilter,
  type ShowSort,
  showFilters,
  showGenresOf,
  showSorts,
} from '../client/shows.ts'
import { LibraryNav } from './collections.tsx'
import { LetterIndexed, useLetters } from './letter-index.tsx'
import { PullToRefresh } from './pull.tsx'
import { gutter, Header, mobileHref } from './shell.tsx'

export function MobileShows() {
  const library = useShows()
  const [genre, setGenre] = useState(ALL)
  const [sort, setSort] = useState<ShowSort>('title')
  const [show, setShow] = useState<ShowFilter>('all')
  const [open, setOpen] = useState(false)
  const items = library.data ?? []
  const shown = arrangeShows(items, genre, sort, show === 'unwatched')
  const filtered = genre !== ALL || sort !== 'title' || show !== 'all'
  const letters = useLetters(
    shown.map((s) => s.sortTitle),
    sort === 'title' && library.status === 'success',
  )
  return (
    <PullToRefresh onRefresh={library.refetch}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 pt-1">
        <Header title="Library" />
        <LibraryNav current="shows" />
        <div className={cn('flex items-center gap-2', gutter)}>
          {library.status === 'loading' ? (
            <Skeleton className="h-3 w-24" />
          ) : (
            <p className="text-[13px] text-text-3">
              {library.status === 'success' ? `${shown.length} of ${items.length} shows` : ' '}
            </p>
          )}
          <Button
            size="sm"
            icon="filter"
            className="ms-auto"
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
            <EmptyState icon="library" title="No shows yet">
              When the server’s owner adds shows, they show up here.
            </EmptyState>
          ) : shown.length === 0 ? (
            <EmptyState icon="filter" title="No shows match">
              {show === 'unwatched' ? 'You’ve watched every show here. ' : ''}Try another genre
              {show === 'unwatched' ? ', or show all shows' : ''}.
            </EmptyState>
          ) : (
            <LetterIndexed letters={letters}>
              <ul className="grid grid-cols-3 gap-x-2 gap-y-4">
                {shown.map((m, i) => (
                  <li key={m.id} {...letters.mark(i)}>
                    <ShowPoster show={m} href={mobileHref(`/shows/${m.id}`)} />
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
                  Show {shown.length} shows
                </Button>
              </>
            }
          >
            <div className="grid gap-5">
              <fieldset className="grid gap-2">
                <legend className="mb-2 font-mono text-label text-text-3 uppercase">Shows</legend>
                <div className="flex flex-wrap gap-2">
                  {showFilters.map((x) => (
                    <Chip
                      key={x.value}
                      selected={show === x.value}
                      onClick={() => setShow(x.value)}
                    >
                      {x.label}
                    </Chip>
                  ))}
                </div>
              </fieldset>
              <fieldset className="grid gap-2">
                <legend className="mb-2 font-mono text-label text-text-3 uppercase">Sort by</legend>
                <div className="flex flex-wrap gap-2">
                  {showSorts.map((s) => (
                    <Chip
                      key={s.value}
                      selected={sort === s.value}
                      onClick={() => setSort(s.value)}
                    >
                      {s.label}
                    </Chip>
                  ))}
                </div>
              </fieldset>
              <fieldset className="grid gap-2">
                <legend className="mb-2 font-mono text-label text-text-3 uppercase">Genre</legend>
                <div className="flex flex-wrap gap-2">
                  {[ALL, ...showGenresOf(items)].map((g) => (
                    <Chip key={g} selected={genre === g} onClick={() => setGenre(g)}>
                      {g === ALL ? 'All' : g}
                    </Chip>
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

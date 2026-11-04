// SPDX-License-Identifier: AGPL-3.0-only
// Shows (client-library.md; the prototype's web/, mobile/ and tv/shows.tsx): every show on this
// server, laid out as Movies is so the two read as one library (./movies.tsx's compositions with
// SHOWS_GRID): Show (all or unwatched), a genre and a sort, the A–Z index when sorted by title,
// and posters counting the episodes left (../shows/poster.tsx). On the phone it's the Library's
// Shows view (./library.tsx); with a pointer and on the TV a destination of its own, /shows. Drawn
// only when the server serves shows: the shell has no entry for it otherwise.
import type { ClientShow } from '@highsea-tv/api-contract'
import { useShows } from '@highsea-tv/client/data'
import { arrangeShows, showGenresOf } from '@highsea-tv/client/shows'
import type { ReactElement } from 'react'
import { ShowPoster } from '../shows/poster.tsx'
import { useShowsText } from '../shows/text.ts'
import { usePull } from './library.tsx'
import { type GridKind, PointerGrid, TouchGrid, TvLibraryGrid } from './movies.tsx'

export const SHOWS_GRID: GridKind<ClientShow> = {
  name: 'shows',
  icon: 'series',
  useItems: useShows,
  arrange: arrangeShows,
  genresOf: showGenresOf,
  // the prototype letters a show by its sort title
  titleOf: (s) => s.sortTitle,
  useWords: () => {
    const text = useShowsText()
    return { shows: text.filters, sorts: text.sorts, count: text.showsCount }
  },
  words: {
    failed: 'showsFailed',
    shown: 'showsShown',
    showCount: 'showsShowCount',
    emptyTitle: 'showsEmptyTitle',
    emptyBody: 'showsEmptyBody',
    noMatchTitle: 'showsNoMatchTitle',
    noMatchUnwatched: 'showsNoMatchUnwatched',
    noUnwatched: 'showsNoUnwatched',
    watchedAllIn: 'showsWatchedAllIn',
  },
  poster: (show, slot) => <ShowPoster show={show} {...slot} />,
}

/** The phone's Library › Shows, under the Library's title and views. */
export function ShowsView({ header }: { header: ReactElement }) {
  const shows = useShows()
  const refreshControl = usePull(shows.refresh)
  return (
    <TouchGrid kind={SHOWS_GRID} library={shows} header={header} refreshControl={refreshControl} />
  )
}

export const PointerShows = () => <PointerGrid kind={SHOWS_GRID} />
export const TvShows = () => <TvLibraryGrid kind={SHOWS_GRID} />

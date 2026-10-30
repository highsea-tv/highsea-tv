// SPDX-License-Identifier: AGPL-3.0-only
// C3 Library's arranging, shared by the apps (ADR 0055): Unwatched (client-library.md#unwatched),
// a genre and a sort, over the whole library read a page at a time.
import type { ClientItem } from '@highsea-tv/api-contract'

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

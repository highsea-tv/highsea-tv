'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Addresses of media pages (the prototype's media/links.ts; docs/product/media-pages.md#addresses):
// a title's address is its TMDB id, the same whether it's in the library or not (ADR 0014,
// amended 2026-10-20). Also the library statuses' tones.
import type { MovieStatus } from '@highsea-tv/api-contract'
import type { BadgeTone } from '@highsea-tv/ui'
import type { library } from './library-messages.ts'
import { episodeCode, showPath } from './show-data.ts'

export const moviePath = (id: number) => `/movies/${id}`
export const personPath = (id: number) => `/people/${id}`
export const collectionPath = (id: number) => `/collections/${id}`

/** What a download, a history entry or a blocklist entry is for (Phase 5 C1 adds a show's). */
type ForTitle = {
  movieId: number | null
  show: { id: string; season: number; episodes: number[] } | null
}

/** Its page: the show's or the film's; none for a manual torrent. */
export const titlePath = (x: ForTitle): string | null =>
  x.show ? showPath(x.show.id) : x.movieId === null ? null : moviePath(x.movieId)

/**
 * Its name as Activity says it: a film's with its year, a show's with its episodes ("Chernobyl
 * S01E02–E03"), or the show's alone for its blocklist, which is the show's.
 */
export const titleOf = (x: ForTitle & { title: string; year: number | null }): string =>
  x.show
    ? x.show.episodes.length
      ? `${x.title} ${episodeCode(x.show.season, x.show.episodes)}`
      : x.title
    : `${x.title}${x.year ? ` (${x.year})` : ''}`

/** Each library status: its badge tone and its label in library-messages.ts. */
export const movieStatus: Record<
  MovieStatus,
  { tone: BadgeTone; label: `status.${MovieStatus}` & keyof typeof library }
> = {
  // the prototype's tones: wanted is its "Missing", not released its "Not released"
  available: { tone: 'success', label: 'status.available' },
  wanted: { tone: 'danger', label: 'status.wanted' },
  downloading: { tone: 'accent', label: 'status.downloading' },
  'not-released': { tone: 'info', label: 'status.not-released' },
  unmonitored: { tone: 'neutral', label: 'status.unmonitored' },
}

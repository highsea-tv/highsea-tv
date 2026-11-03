// SPDX-License-Identifier: AGPL-3.0-only
// What the shows pages share on every client: the library's filter and sorts (as Movies has them),
// and the words for a show's years, its seasons, an episode's place and what Play plays, as the
// Apple TV app writes them ("Resume S2, E6").

import type {
  ClientEpisode,
  ClientShow,
  ClientShowDetail,
  NextEpisode,
} from '@highsea-tv/mock/types'
import { useEffect } from 'react'
import { useParams } from 'wouter'

export type ShowSort = 'title' | 'added' | 'year' | 'rating'
export const showSorts: { value: ShowSort; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'added', label: 'Recently added' },
  { value: 'year', label: 'Newest first' },
  { value: 'rating', label: 'Highest rated' },
]

export type ShowFilter = 'all' | 'unwatched'
export const showFilters: { value: ShowFilter; label: string }[] = [
  { value: 'all', label: 'All shows' },
  { value: 'unwatched', label: 'Unwatched' },
]

export const ALL_SHOW_GENRES = 'all'

export const showGenresOf = (shows: ClientShow[]) =>
  [...new Set(shows.flatMap((s) => s.genres))].sort((a, b) => a.localeCompare(b))

/** The genre, then Unwatched (shows with episodes left), then the sort. */
export function arrangeShows(
  shows: ClientShow[],
  genre: string,
  sort: ShowSort,
  unwatched = false,
) {
  const shown = shows.filter(
    (s) => (genre === ALL_SHOW_GENRES || s.genres.includes(genre)) && !(unwatched && s.watched),
  )
  return [...shown].sort((a, b) =>
    sort === 'added'
      ? Date.parse(b.addedAt) - Date.parse(a.addedAt)
      : sort === 'year'
        ? b.year - a.year || a.sortTitle.localeCompare(b.sortTitle)
        : sort === 'rating'
          ? b.rating - a.rating
          : a.sortTitle.localeCompare(b.sortTitle),
  )
}

export const showsCount = (n: number) => `${n} ${n === 1 ? 'show' : 'shows'}`
export const seasonsCount = (n: number) => `${n} ${n === 1 ? 'season' : 'seasons'}`
export const episodesCount = (n: number) => `${n} ${n === 1 ? 'episode' : 'episodes'}`

/** "2019–present", "2015–2021", or one year for a show that ran within it. */
export const showYears = (s: Pick<ClientShow, 'year' | 'endYear'>) =>
  s.endYear === null
    ? `${s.year}–present`
    : s.endYear === s.year
      ? String(s.year)
      : `${s.year}–${s.endYear}`

/** "S2, E6", as the Apple TV app shortens an episode's place; a special is "Special 1". */
export const episodeCode = (e: Pick<ClientEpisode, 'season' | 'number'>) =>
  e.season === 0 ? `Special ${e.number}` : `S${e.season}, E${e.number}`

/** "Season 2, Episode 6", for screen readers and the player's title. */
export const episodePlace = (e: Pick<ClientEpisode, 'season' | 'number'>) =>
  e.season === 0 ? `Special ${e.number}` : `Season ${e.season}, Episode ${e.number}`

/** Play's words: "Resume S2, E6" part way, "Play S3, E1" otherwise. */
export const playLabel = (next: NextEpisode) =>
  `${next.kind === 'resume' ? 'Resume' : 'Play'} ${episodeCode(next.episode)}`

/** The line over Play: what's next, in the Apple TV app's words. */
export const nextLine = (next: NextEpisode) =>
  ({ resume: 'Continue watching', next: 'Up next', start: 'Start watching', again: 'Watch again' })[
    next.kind
  ]

/** "21 min left" part way; otherwise the episode's length. */
export const episodeTime = (e: ClientEpisode) =>
  e.progress !== null
    ? `${Math.max(1, Math.round(e.runtimeMinutes * (1 - e.progress)))} min left`
    : `${e.runtimeMinutes} min`

/** "12 Mar 2024", an episode's air date. */
export const airedDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

/** "3 seasons · 2019–present · Drama": the line under a show's title. */
export const showMeta = (s: ClientShow) =>
  [seasonsCount(s.seasons), showYears(s), s.genres[0]].filter(Boolean).join(' · ')

/**
 * A show opened at an episode (`/shows/{id}/episodes/{episode}`, from Search or Continue watching's
 * menu): its season is the one shown, and its row is scrolled to once drawn. Otherwise the season
 * is `fallback`, Play's.
 */
export function useEpisodeTarget(d: ClientShowDetail, fallback: number) {
  const { episode } = useParams<{ episode?: string }>()
  const season = episode
    ? d.seasons.find((x) => x.episodes.some((e) => e.id === episode))?.number
    : undefined
  const found = season !== undefined
  useEffect(() => {
    if (!found) return
    const t = requestAnimationFrame(() =>
      document.querySelector(`[data-episode="${episode}"]`)?.scrollIntoView({ block: 'center' }),
    )
    return () => cancelAnimationFrame(t)
  }, [episode, found])
  return { episode: found ? (episode ?? null) : null, season: season ?? fallback }
}

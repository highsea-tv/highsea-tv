// SPDX-License-Identifier: AGPL-3.0-only
// What the shows pages share on every client (one-client-platform-b.md › B3), moved from the
// prototype's design/prototypes/src/client/shows.ts: the library's filter and sorts (as Movies has
// them), and the words for a show's years, its seasons, an episode's place and what Play plays, as
// the Apple TV app writes them ("Resume S2, E6"). React without the DOM; the words come from
// `createShowsText(locale)`. Each function takes only the fields it reads, so the prototype's mock
// types and the contract's both fit.
import { createT, defineMessages } from '@highsea-tv/i18n'

export const SHOW_SORTS = ['title', 'added', 'year', 'rating'] as const
export type ShowSort = (typeof SHOW_SORTS)[number]
export const SHOW_FILTERS = ['all', 'unwatched'] as const
export type ShowFilter = (typeof SHOW_FILTERS)[number]
export const ALL_SHOW_GENRES = 'all'

type Arrangeable = {
  genres: string[]
  watched: boolean
  addedAt: string
  year: number
  rating: number
  sortTitle: string
}

export const showGenresOf = (shows: Pick<Arrangeable, 'genres'>[]) =>
  [...new Set(shows.flatMap((s) => s.genres))].sort((a, b) => a.localeCompare(b))

/** The genre, then Unwatched (shows with episodes left), then the sort. */
export function arrangeShows<T extends Arrangeable>(
  shows: T[],
  genre: string,
  sort: ShowSort,
  unwatched = false,
): T[] {
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

/** An episode's place, as the shows' words need it. */
export type Place = { season: number; number: number }
/** What Play plays on a show, with why. */
export type NextKind = 'resume' | 'next' | 'start' | 'again'

export const showsMessages = defineMessages({
  sortByTitle: 'Title',
  sortByAdded: 'Recently added',
  sortByYear: 'Newest first',
  sortByRating: 'Highest rated',
  allShows: 'All shows',
  unwatched: 'Unwatched',
  shows: '{count, plural, one {# show} other {# shows}}',
  seasons: '{count, plural, one {# season} other {# seasons}}',
  episodes: '{count, plural, one {# episode} other {# episodes}}',
  running: '{year}–present',
  ran: '{year}–{end}',
  code: 'S{season}, E{number}',
  special: 'Special {number}',
  place: 'Season {season}, Episode {number}',
  resume: 'Resume {code}',
  play: 'Play {code}',
  lineResume: 'Continue watching',
  lineNext: 'Up next',
  lineStart: 'Start watching',
  lineAgain: 'Watch again',
  minutesLeft: '{minutes} min left',
  minutes: '{minutes} min',
})

export function createShowsText(locale = 'en') {
  const t = createT(showsMessages, locale)
  const code = (e: Place) =>
    e.season === 0
      ? t('special', { number: e.number })
      : t('code', { season: e.season, number: e.number })
  const seasons = (n: number) => t('seasons', { count: n })
  const years = (s: { year: number; endYear: number | null }) =>
    s.endYear === null
      ? t('running', { year: s.year })
      : s.endYear === s.year
        ? String(s.year)
        : t('ran', { year: s.year, end: s.endYear })
  return {
    sorts: [
      { value: 'title', label: t('sortByTitle') },
      { value: 'added', label: t('sortByAdded') },
      { value: 'year', label: t('sortByYear') },
      { value: 'rating', label: t('sortByRating') },
    ] as { value: ShowSort; label: string }[],
    filters: [
      { value: 'all', label: t('allShows') },
      { value: 'unwatched', label: t('unwatched') },
    ] as { value: ShowFilter; label: string }[],
    showsCount: (n: number) => t('shows', { count: n }),
    seasonsCount: seasons,
    episodesCount: (n: number) => t('episodes', { count: n }),
    /** "2019–present", "2015–2021", or one year for a show that ran within it. */
    showYears: years,
    /** "S2, E6", as the Apple TV app shortens an episode's place; a special is "Special 1". */
    episodeCode: code,
    /** "Season 2, Episode 6", for screen readers and the player's title. */
    episodePlace: (e: Place) =>
      e.season === 0
        ? t('special', { number: e.number })
        : t('place', { season: e.season, number: e.number }),
    /** Play's words: "Resume S2, E6" part way, "Play S3, E1" otherwise. */
    playLabel: (next: { kind: NextKind; episode: Place }) =>
      t(next.kind === 'resume' ? 'resume' : 'play', { code: code(next.episode) }),
    /** The line over Play: what's next, in the Apple TV app's words. */
    nextLine: (next: { kind: NextKind }) =>
      ({
        resume: t('lineResume'),
        next: t('lineNext'),
        start: t('lineStart'),
        again: t('lineAgain'),
      })[next.kind],
    /** "21 min left" part way; otherwise the episode's length. */
    episodeTime: (e: { progress: number | null; runtimeMinutes: number }) =>
      e.progress !== null
        ? t('minutesLeft', {
            minutes: Math.max(1, Math.round(e.runtimeMinutes * (1 - e.progress))),
          })
        : t('minutes', { minutes: e.runtimeMinutes }),
    /** "12 Mar 2024", an episode's air date. */
    airedDate: (date: string) =>
      new Date(`${date}T12:00:00Z`).toLocaleDateString(locale === 'en' ? 'en-GB' : locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    /** "3 seasons · 2019–present · Drama": the line under a show's title. */
    showMeta: (s: { seasons: number; year: number; endYear: number | null; genres: string[] }) =>
      [seasons(s.seasons), years(s), s.genres[0]].filter(Boolean).join(' · '),
  }
}

export type ShowsText = ReturnType<typeof createShowsText>

/**
 * The season a show's page opens on: the one holding `episode` when it was opened at one (from
 * Search or Continue watching's menu), else `fallback`, Play's. The page scrolls to the episode
 * itself, as each platform does.
 */
export function seasonOf<E extends { id: unknown }>(
  seasons: { number: number; episodes: E[] }[],
  episode: E['id'] | undefined,
  fallback: number,
): { episode: E['id'] | null; season: number } {
  const season =
    episode === undefined
      ? undefined
      : seasons.find((x) => x.episodes.some((e) => e.id === episode))?.number
  return season === undefined
    ? { episode: null, season: fallback }
    : { episode: episode ?? null, season }
}

/** A show's page; opened at an episode (`episode`), its season is shown and its row scrolled to. */
export const showPath = (id: number | string, episode?: number | string) =>
  episode === undefined ? `/shows/${id}` : `/shows/${id}?episode=${episode}`

/**
 * An episode's player, from where the person left off or from the start: `/play/episode/{id}`,
 * since an episode's TMDB number can't be told from a film's by itself.
 */
export const episodePlayPath = (id: number | string, start = false) =>
  `/play/episode/${id}${start ? '/start' : ''}`

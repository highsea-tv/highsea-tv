// SPDX-License-Identifier: AGPL-3.0-only
// What Shows' screens share (docs/product/shows.md), moved from the prototype with D3 (answer 5):
// Sonarr's counts and states for a show, a season and an episode, and their addresses.
import type {
  EpisodeStatus,
  Series,
  SeriesEpisode,
  SeriesSeason,
  ShowMonitor,
} from '@highsea-tv/api-contract'
import type { BadgeTone, ProgressBarTone } from '@highsea-tv/ui/native'

/** A show's page: `/shows/{id}`, Files at `/shows/{id}/files`. */
export const showPath = (id: string) => `/shows/${id}`

/** The tabs, each at its own address (`/shows/{id}/{tab}`, Seasons at `/shows/{id}`). */
export const SHOW_TABS = ['seasons', 'files'] as const
export type ShowTab = (typeof SHOW_TABS)[number]

/** Monitored, aired episodes without a file (downloading ones included, as Sonarr counts them). */
export const missing = (s: Series) => s.episodes.monitored - s.episodes.have

/** Airing or ended, as Sonarr's index shows it. */
export const showState = (s: Series): { label: 'state.airing' | 'state.ended'; tone: BadgeTone } =>
  s.airing ? { label: 'state.airing', tone: 'info' } : { label: 'state.ended', tone: 'neutral' }

/** The episode bar's colour: whole, still to get, or not watched for. */
export const episodesTone = (s: Series): ProgressBarTone =>
  !s.monitored ? 'neutral' : missing(s) > 0 ? 'warning' : 'success'

/** The episode bar's fill, 0–100. */
export const episodesShare = (s: Series) =>
  s.episodes.monitored ? (s.episodes.have / s.episodes.monitored) * 100 : 0

/** "12 Mar 2026": an air date, which is a day with no time. */
export const airDate = (day: string, locale?: string) =>
  new Intl.DateTimeFormat(locale && locale !== 'en' ? locale : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`))

export const episodeStatus: Record<
  EpisodeStatus,
  { label: `status.${EpisodeStatus}`; tone: BadgeTone }
> = {
  available: { label: 'status.available', tone: 'success' },
  downloading: { label: 'status.downloading', tone: 'accent' },
  missing: { label: 'status.missing', tone: 'danger' },
  'cutoff-unmet': { label: 'status.cutoff-unmet', tone: 'warning' },
  unaired: { label: 'status.unaired', tone: 'info' },
}

const pad = (n: number) => String(n).padStart(2, '0')
/** S01E02, or S01E01–E02 for a file that holds both. */
export const episodeCode = (season: number, numbers: number[]) =>
  `S${pad(season)}E${pad(numbers[0] ?? 0)}${numbers.length > 1 ? `–E${pad(numbers[numbers.length - 1] ?? 0)}` : ''}`

/** Monitored, with no file or one below the cutoff: what a search looks for. */
export const wanted = (e: SeriesEpisode) =>
  e.monitored && (e.status === 'missing' || e.status === 'cutoff-unmet')

/**
 * A season's line, counted as the show's is: aired episodes monitored or on disk, how many have a
 * file, and its files' size (each file once).
 */
export function seasonFigures(season: SeriesSeason) {
  const aired = season.episodes.filter((e) => (e.monitored || e.file) && e.status !== 'unaired')
  const files = new Map(season.episodes.flatMap((e) => (e.file ? [[e.file.path, e.file]] : [])))
  return {
    have: aired.filter((e) => e.file).length,
    monitored: aired.length,
    size: [...files.values()].reduce((n, f) => n + f.size, 0),
  }
}

export const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)
export const dirname = (path: string) => path.slice(0, path.lastIndexOf('/'))

/** Sonarr's Monitor choices, in Add a show's order. */
export const MONITOR_OPTIONS: ShowMonitor[] = ['all', 'future', 'missing', 'first-season', 'none']

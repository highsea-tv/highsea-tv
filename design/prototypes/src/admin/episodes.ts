// SPDX-License-Identifier: AGPL-3.0-only
// Episodes as the admin's movie screens name them (stage 6 of docs/plans/prototype-gaps.md): the
// show, then the number as Sonarr writes it ("Saltmarsh · S02E04"), linked to the show's page.
import type { AdminEpisode, AdminShow, EpisodeStatus, MediaItem } from '@highsea-tv/mock/types'
import { adminHref } from './shell.tsx'

/** "S03E05", or "S01E01–E02" for a file that holds two. */
export function episodeCode(season: number, numbers: number | number[]) {
  const xs = [...(Array.isArray(numbers) ? numbers : [numbers])].sort((a, b) => a - b)
  const e = (n: number) => `E${String(n).padStart(2, '0')}`
  const first = xs[0] ?? 0
  const last = xs.at(-1) ?? first
  return `S${String(season).padStart(2, '0')}${e(first)}${last !== first ? `–${e(last)}` : ''}`
}

/** An episode's show, from its id ("saltmarsh-s2e4" is Saltmarsh's). */
export const showOfEpisode = (id: string) => id.replace(/-s\d+e\d+$/, '')

export const isEpisodeId = (id: string) => /-s\d+e\d+$/.test(id)

export const showHref = (showId: string) => adminHref(`/shows/${showId}`)

/** "Night Shift at Hollow Creek · S03E05". */
export const episodeName = (show: { title: string }, e: { season: number; number: number }) =>
  `${show.title} · ${episodeCode(e.season, e.number)}`

/** A date that's a day ("2026-11-05") or a moment, as the local calendar day it falls on. */
export function localDay(date: string) {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  return day
    ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
    : new Date(Date.parse(date))
}

/**
 * One entry on the calendar and in Upcoming: a film on its release date, or an episode on its air
 * date, each with the state its outline colour shows.
 */
export type Dated = {
  key: string
  kind: 'movie' | 'episode'
  date: Date
  /** What the chip says: the film's title, or the show and number. */
  label: string
  /** The whole name, for screen readers and the tooltip: an episode's title too. */
  name: string
  href: string
  state: 'available' | 'downloading' | 'wanted'
  /** The right-hand detail in Upcoming: the film's versions, or the episode's title. */
  detail: string
}

const movieState = (s: MediaItem['status']): Dated['state'] =>
  s === 'available' ? 'available' : s === 'downloading' || s === 'queued' ? 'downloading' : 'wanted'

// below its cutoff, an episode is still wanted, as a film is
const episodeState = (s: EpisodeStatus): Dated['state'] =>
  s === 'available' ? 'available' : s === 'downloading' ? 'downloading' : 'wanted'

export const movieDated = (m: MediaItem): Dated => ({
  key: m.id,
  kind: 'movie',
  date: localDay(m.releaseDate),
  label: m.title,
  name: m.title,
  href: adminHref(`/movies/${m.id}`),
  state: movieState(m.status),
  detail: m.versions.map((v) => v.label).join(' + '),
})

export const episodeDated = ({
  show,
  episode: e,
}: {
  show: AdminShow
  episode: AdminEpisode
}): Dated => ({
  key: e.id,
  kind: 'episode',
  date: localDay(e.aired),
  label: episodeName(show, e),
  name: `${episodeName(show, e)}, ${e.title}`,
  href: showHref(show.id),
  state: episodeState(e.status),
  detail: e.title,
})

export const byDate = (a: Dated, b: Dated) =>
  a.date.getTime() - b.date.getTime() || a.label.localeCompare(b.label)

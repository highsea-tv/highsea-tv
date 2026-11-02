// SPDX-License-Identifier: AGPL-3.0-only
// The words and numbers the apps put under titles (ADR 0055): clock times, running times, what's
// left, a title's meta line, and a collection's caption and row name. Pure, in i18n catalogs
// (ADR 0021), so web, mobile, TV and the prototype say the same thing the same way. A collection
// counts shows beside movies (prototype-gaps.md › 4.3); until the server has shows, only movies
// reach it.
import { createT, defineMessages } from '@highsea-tv/i18n'

export const formatMessages = defineMessages({
  hoursMinutes: '{hours}h {minutes}m',
  hours: '{hours}h',
  minutes: '{minutes}m',
  leftHours: '{hours}h {minutes}m left',
  leftMinutes: '{minutes} min left',
  movies: '{count, plural, one {# movie} other {# movies}}',
  moviesHere: '{count, plural, one {# movie here} other {# movies here}}',
  collections: '{count, plural, one {# collection} other {# collections}}',
  caption: '{movies} · {years}',
  thisServer: 'this server',
  shows: '{count, plural, one {# show} other {# shows}}',
  both: '{movies} and {shows}',
  rowFilms: 'Films',
  rowShows: 'Shows',
  rowBoth: 'Films and shows',
})

/** What a title needs for its meta line and time left. */
export type Timed = {
  year: number | null
  runtimeMinutes: number | null
  genres: string[]
  position: number
}

export function createFormat(locale = 'en') {
  const t = createT(formatMessages, locale)

  /** 1:04:05 or 12:04. */
  function clock(seconds: number) {
    const s = Math.max(0, Math.round(seconds))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const ss = String(s % 60).padStart(2, '0')
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
  }

  /** 1h 36m, 2h, or 15m; empty when unknown. */
  function runtime(minutes: number | null) {
    if (!minutes) return ''
    const hours = Math.floor(minutes / 60)
    const m = minutes % 60
    if (!hours) return t('minutes', { minutes: m })
    return m ? t('hoursMinutes', { hours, minutes: m }) : t('hours', { hours })
  }

  /** "52 min left", for Continue watching and Resume. */
  function left(item: Pick<Timed, 'runtimeMinutes' | 'position'>) {
    const s = (item.runtimeMinutes ?? 0) * 60 - item.position
    const m = Math.max(1, Math.round(s / 60))
    return m >= 60
      ? t('leftHours', { hours: Math.floor(m / 60), minutes: m % 60 })
      : t('leftMinutes', { minutes: m })
  }

  /** "2010 · 15m · Fantasy". */
  const meta = (item: Timed) =>
    [item.year ? String(item.year) : '', runtime(item.runtimeMinutes), item.genres[0] ?? '']
      .filter(Boolean)
      .join(' · ')

  function titlesHere(movies: number, shows = 0) {
    const m = movies ? t('movies', { count: movies }) : ''
    const s = shows ? t('shows', { count: shows }) : ''
    return m && s ? t('both', { movies: m, shows: s }) : m || s
  }

  return {
    clock,
    runtime,
    left,
    meta,
    /** The server's name as its owner set it, and "this server" until it's known (prototype-gaps.md › 3.7). */
    serverName: (name: string | null | undefined) => name || t('thisServer'),
    /** "6 movies". */
    movies: (count: number) => t('movies', { count }),
    /** "6 movies here". */
    moviesHere: (count: number) => t('moviesHere', { count }),
    /** "3 collections". */
    collections: (count: number) => t('collections', { count }),
    /** "4 movies and 1 show", leaving out a kind it has none of. */
    titlesHere,
    /** A collection's row, named by what's in it, the films first. */
    titlesRow: (movies: number, shows = 0) =>
      movies && shows ? t('rowBoth') : shows ? t('rowShows') : t('rowFilms'),
    /** "6 movies · 2010–2020", or "4 movies and 1 show · 2006–2019". */
    caption: (c: { count: number; years: string; shows?: number }) => {
      const titles = c.shows ? titlesHere(c.count, c.shows) : t('movies', { count: c.count })
      return c.years ? t('caption', { movies: titles, years: c.years }) : titles
    },
  }
}

export type Format = ReturnType<typeof createFormat>

/** A run of an announcement's body: plain, bold, italic, or a link with its address. */
export type InlinePart =
  | { kind: 'text' | 'bold' | 'italic'; text: string }
  | { kind: 'link'; text: string; url: string }

const INLINE = /(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)\s]+\))/

/**
 * Announcement bodies' inline markdown, the part the composer offers (**bold**, _italic_ and
 * [links](https://…)), as runs every app draws in its own way: the web and the phone open a link,
 * a TV can't follow one and shows its words.
 */
export function inlineParts(text: string): InlinePart[] {
  return text
    .split(INLINE)
    .filter((part) => part !== '')
    .map((part): InlinePart => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
        return { kind: 'bold', text: part.slice(2, -2) }
      if (part.startsWith('_') && part.endsWith('_') && part.length > 2)
        return { kind: 'italic', text: part.slice(1, -1) }
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
      if (link) return { kind: 'link', text: link[1] as string, url: link[2] as string }
      return { kind: 'text', text: part }
    })
}

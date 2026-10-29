// SPDX-License-Identifier: AGPL-3.0-only
// The words and numbers the apps put under titles (ADR 0055): clock times, running times, what's
// left, a title's meta line and a collection's caption. Pure, in i18n catalogs (ADR 0021), so web,
// mobile, TV and the prototype say the same thing the same way.
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

  return {
    clock,
    runtime,
    left,
    meta,
    /** "6 movies". */
    movies: (count: number) => t('movies', { count }),
    /** "6 movies here". */
    moviesHere: (count: number) => t('moviesHere', { count }),
    /** "3 collections". */
    collections: (count: number) => t('collections', { count }),
    /** "6 movies · 2010–2020". */
    caption: (c: { count: number; years: string }) =>
      c.years
        ? t('caption', { movies: t('movies', { count: c.count }), years: c.years })
        : t('movies', { count: c.count }),
  }
}

export type Format = ReturnType<typeof createFormat>

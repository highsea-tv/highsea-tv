// SPDX-License-Identifier: AGPL-3.0-only
// Figures as highsea shows them (moved from the prototype's admin/format.ts): decimal units, as
// disks and speeds are sold, one decimal place, short durations. typography.md#figures: these
// render in mono or with tabular figures. Units of time and dates come from Intl, so they follow
// the locale. Pure, so the admin, the prototype and the clients can share it.

const UNITS = ['B', 'kB', 'MB', 'GB', 'TB', 'PB']

/** 6.2 TB, 412 MB. Returns [value, unit] so the unit can be set in a lighter style. */
export function bytesParts(n: number): [string, string] {
  let v = Math.max(0, n)
  let i = 0
  while (v >= 1000 && i < UNITS.length - 1) {
    v /= 1000
    i++
  }
  return [i === 0 ? String(Math.round(v)) : v.toFixed(v >= 100 ? 0 : 1), UNITS[i] as string]
}

export const bytes = (n: number) => bytesParts(n).join(' ')

/** 18.4 MB/s; 0 B/s stays as is. */
export function rateParts(n: number): [string, string] {
  const [v, u] = bytesParts(n)
  return [v, `${u}/s`]
}

export const rate = (n: number) => rateParts(n).join(' ')

const unit = (locale: string, u: 'second' | 'minute' | 'hour' | 'day') =>
  new Intl.NumberFormat(locale, { style: 'unit', unit: u, unitDisplay: 'narrow' })

/** 4h 12m, 12m, 45s. */
export function duration(seconds: number, locale = 'en'): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return unit(locale, 'second').format(s)
  const m = Math.floor(s / 60)
  if (m < 60) return unit(locale, 'minute').format(m)
  const h = Math.floor(m / 60)
  if (h < 48)
    return m % 60
      ? `${unit(locale, 'hour').format(h)} ${unit(locale, 'minute').format(m % 60)}`
      : unit(locale, 'hour').format(h)
  return unit(locale, 'day').format(Math.floor(h / 24))
}

/** "in 9m" or "4m ago", from `now`. Apps with a message catalog word it themselves. */
export function relative(iso: string, now: number, locale = 'en'): string {
  const d = (Date.parse(iso) - now) / 1000
  return d >= 0 ? `in ${duration(d, locale)}` : `${duration(-d, locale)} ago`
}

export const percent = (fraction: number) => `${Math.floor(fraction * 100)}%`

/** "Fri 24". */
export const shortDate = (iso: string, locale = 'en-GB') =>
  new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' })
    .format(new Date(iso))
    .replace(',', '')

// SPDX-License-Identifier: AGPL-3.0-only
// Figures as the admin shows them (the prototype's format.ts): decimal units, as disks are sold,
// one decimal place, short durations. Units of time come from Intl, so they follow the locale.

const UNITS = ['B', 'kB', 'MB', 'GB', 'TB', 'PB']

/** 6.2 TB, 412 MB. */
export function bytes(n: number): string {
  let v = Math.max(0, n)
  let i = 0
  while (v >= 1000 && i < UNITS.length - 1) {
    v /= 1000
    i++
  }
  return `${i === 0 ? String(Math.round(v)) : v.toFixed(v >= 100 ? 0 : 1)} ${UNITS[i]}`
}

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

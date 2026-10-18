// SPDX-License-Identifier: AGPL-3.0-only
// Figures as admin shows them: decimal units (as disks and speeds are sold), one decimal place,
// short durations. typography.md#figures: these render in mono or with tabular figures.

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

/** 4h 12m, 12m, 45s. */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`
  return `${Math.floor(h / 24)}d`
}

/** "in 9m" or "4m ago", from simulated now. */
export function relative(iso: string, now: number): string {
  const d = (Date.parse(iso) - now) / 1000
  return d >= 0 ? `in ${duration(d)}` : `${duration(-d)} ago`
}

export const percent = (fraction: number) => `${Math.floor(fraction * 100)}%`

const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric' })
/** "Fri 24". */
export const shortDate = (iso: string) => day.format(new Date(iso)).replace(',', '')

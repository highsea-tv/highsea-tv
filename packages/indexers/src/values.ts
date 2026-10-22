// SPDX-License-Identifier: AGPL-3.0-only
// Reading what sites write: sizes, dates and numbers in the forms trackers use, and the field
// filters a definition chains (ADR 0033). Each filter takes text and gives text, or null when the
// value isn't there; the conversion to numbers and dates happens once, in `toRelease`.
import type { FieldFilter } from '@highsea-tv/schemas/indexers'

const UNITS: Record<string, number> = { b: 0, k: 1, m: 2, g: 3, t: 4, p: 5 }

/**
 * "1.4 GB", "700 MiB", "4,2 GB", "1,234,567" to bytes. Units are powers of 1024, as trackers mean
 * them whichever way they spell them; a bare number is bytes.
 */
export function parseSize(text: string | null | undefined): number | null {
  if (text == null) return null
  const m = /^\s*([\d.,\s]*\d)\s*([kmgtp]?)(i?b|o)?\s*$/i.exec(text.replace(/ /g, ' '))
  if (!m) return null
  let digits = (m[1] as string).replace(/\s/g, '')
  const unit = (m[2] as string).toLowerCase()
  // "4,2 GB" is a decimal comma; "1,234,567" groups thousands
  if (/^\d+,\d{1,2}$/.test(digits) && unit) digits = digits.replace(',', '.')
  else digits = digits.replace(/,/g, '')
  if ((digits.match(/\./g) ?? []).length > 1) digits = digits.replace(/\./g, '')
  const n = Number(digits)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 1024 ** (UNITS[unit || 'b'] as number))
}

/** "1,234", "12", "1.5" to a number; anything else to null. */
export function parseNumber(text: string | null | undefined): number | null {
  if (text == null) return null
  const cleaned = text.trim().replace(/[,\s]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  return Number(cleaned)
}

const RELATIVE_UNITS: [RegExp, number][] = [
  [/^(s|sec|secs|second|seconds)$/, 1000],
  [/^(m|min|mins|minute|minutes)$/, 60_000],
  [/^(h|hr|hrs|hour|hours)$/, 3_600_000],
  [/^(d|day|days)$/, 86_400_000],
  [/^(w|wk|wks|week|weeks)$/, 7 * 86_400_000],
  [/^(mo|month|months)$/, 30 * 86_400_000],
  [/^(y|yr|yrs|year|years)$/, 365 * 86_400_000],
]

/** "3 hours ago", "1 day, 2 hours", "yesterday", "just now", relative to `now`. */
function parseRelative(text: string, now: number): number | null {
  const t = text.trim().toLowerCase()
  if (t === 'now' || t === 'just now' || t === 'today') return now
  if (t === 'yesterday') return now - 86_400_000
  let total = 0
  let found = false
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*([a-z]+)/g)) {
    const unit = RELATIVE_UNITS.find(([re]) => re.test(m[2] as string))
    if (!unit) continue
    total += Number(m[1]) * unit[1]
    found = true
  }
  return found ? now - total : null
}

/** To an ISO date. `text` reads ISO 8601 and RFC 2822 (RSS's `pubDate`) as `Date.parse` does. */
export function parseDate(
  text: string | null | undefined,
  format: 'text' | 'unix' | 'unixms' | 'relative',
  now: number,
): string | null {
  if (text == null || text.trim() === '') return null
  let ms: number | null
  if (format === 'unix' || format === 'unixms') {
    const n = parseNumber(text)
    ms = n === null ? null : format === 'unix' ? n * 1000 : n
  } else if (format === 'relative') ms = parseRelative(text, now)
  else {
    const parsed = Date.parse(text.trim())
    ms = Number.isNaN(parsed) ? parseRelative(text, now) : parsed
  }
  if (ms === null || !Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}

const patterns = new Map<string, RegExp>()
function pattern(source: string, ignoreCase: boolean, global = false): RegExp {
  const key = `${global ? 'g' : ''}${ignoreCase ? 'i' : ''}/${source}`
  let re = patterns.get(key)
  if (!re) {
    re = new RegExp(source, `${global ? 'g' : ''}${ignoreCase ? 'i' : ''}`)
    patterns.set(key, re)
  }
  return re
}

/** Runs a field's filters in order. A filter that finds nothing ends the chain with null. */
export function applyFilters(
  value: string | null,
  filters: readonly FieldFilter[],
  now: number,
): string | null {
  let v = value
  for (const f of filters) {
    if (v === null) return null
    switch (f.filter) {
      case 'trim':
        v = v.replace(/\s+/g, ' ').trim()
        break
      case 'replace':
        v = v.replace(pattern(f.pattern, f.ignoreCase, true), f.with)
        break
      case 'match': {
        const m = pattern(f.pattern, f.ignoreCase).exec(v)
        v = m ? (m[f.group] ?? null) : null
        break
      }
      case 'split': {
        const parts = v.split(f.by)
        v = parts.at(f.index) ?? null
        break
      }
      case 'prepend':
        v = `${f.value}${v}`
        break
      case 'append':
        v = `${v}${f.value}`
        break
      case 'querystring': {
        try {
          v = new URL(v, 'https://example.invalid/').searchParams.get(f.param)
        } catch {
          v = null
        }
        break
      }
      case 'map': {
        const key = f.ignoreCase ? v.trim().toLowerCase() : v.trim()
        const hit = Object.entries(f.values).find(
          ([k]) => (f.ignoreCase ? k.toLowerCase() : k) === key,
        )
        if (hit) v = hit[1]
        break
      }
      case 'size': {
        const n = parseSize(v)
        v = n === null ? null : String(n)
        break
      }
      case 'number': {
        const n = parseNumber(v)
        v = n === null ? null : String(n)
        break
      }
      case 'date':
        v = parseDate(v, f.format, now)
        break
    }
  }
  return v
}

/** An IMDb id as `tt` and at least seven digits, from `tt0111161`, `0111161` or `111161`. */
export function normalizeImdbId(text: string | null | undefined): string | null {
  const m = text ? /^(?:tt)?(\d{1,10})$/i.exec(text.trim()) : null
  if (!m || Number(m[1]) === 0) return null
  return `tt${(m[1] as string).padStart(7, '0')}`
}

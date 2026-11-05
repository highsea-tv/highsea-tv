// SPDX-License-Identifier: AGPL-3.0-only
// A seeding rule's fields as the forms type them: a ratio, and times in hours where the API keeps
// minutes. Download client's default and an indexer's own rule (A9) share them. Empty is null:
// no limit on Download client, "use Download client's" on an indexer.

const YEAR_MINUTES = 60 * 24 * 365

/** 4320 → "72"; 90 → "1.5"; null → "". */
export const hoursText = (minutes: number | null) =>
  minutes === null ? '' : String(Math.round((minutes / 60) * 100) / 100)

export const ratioText = (ratio: number | null) => (ratio === null ? '' : String(ratio))

/** "72" → 4320; "" → null; anything else, or past a year, → undefined (invalid). */
export function minutesOf(text: string): number | null | undefined {
  const s = text.trim()
  if (!s) return null
  const hours = Number(s)
  if (!Number.isFinite(hours) || hours < 0) return undefined
  const minutes = Math.round(hours * 60)
  return minutes <= YEAR_MINUTES ? minutes : undefined
}

/** "1.5" → 1.5; "" → null; outside 0 to 100 → undefined (invalid). */
export function ratioOf(text: string): number | null | undefined {
  const s = text.trim()
  if (!s) return null
  const ratio = Number(s)
  return Number.isFinite(ratio) && ratio >= 0 && ratio <= 100 ? ratio : undefined
}

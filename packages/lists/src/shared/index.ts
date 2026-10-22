// SPDX-License-Identifier: AGPL-3.0-only
// What every import list source shares (checkpoint 8a, ADR 0045): a list read as entries, each a
// movie by TMDB id or IMDb id with its title for the result's wording, and requests through the fetch
// seam (ADR 0029) with a timeout and their failures in plain words.
import { AppError, type Fetch } from '@highsea/core'

/** A movie on a list. A source gives its TMDB id when it knows it, else its IMDb id. */
export type ListEntry = {
  tmdbId: number | null
  imdbId: string | null
  title: string
  year: number | null
}

/** How many of a chart (popular, trending and the rest) a check takes: its first page on TMDB. */
export const CHART_SIZE = 20
/** The most pages a list is read to, so a huge list can't run a check for ever. */
export const MAX_PAGES = 50

export const TIMEOUT_MS = 30_000

/** One request with a timeout; a network failure is `unavailable` with the source's name. */
export async function request(
  fetch: Fetch,
  what: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    const err = e as Error
    const why =
      err.name === 'TimeoutError' ? 'it took longer than 30 seconds.' : err.message || 'no answer.'
    throw new AppError('unavailable', `${what} didn’t answer: ${why}`, { reason: 'unreachable' })
  }
}

/** The response's JSON, or `unavailable` when it isn't JSON. */
export async function jsonOf<T>(what: string, res: Response): Promise<T> {
  try {
    return (await res.json()) as T
  } catch {
    throw new AppError('unavailable', `${what} answered with something that isn’t JSON.`, {
      reason: 'bad-answer',
    })
  }
}

/** `tt` and digits, the IMDb id format; anything else is null. */
export function imdbIdOf(value: unknown): string | null {
  return typeof value === 'string' && /^tt\d{1,10}$/.test(value.trim()) ? value.trim() : null
}

/** A positive whole number, or null. */
export function idOf(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null
}

/** "Title (2010)", the way unmatched titles are listed. */
export const entryName = (e: Pick<ListEntry, 'title' | 'year'>) =>
  e.year ? `${e.title} (${e.year})` : e.title

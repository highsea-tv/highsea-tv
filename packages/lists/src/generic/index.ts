// SPDX-License-Identifier: AGPL-3.0-only
// A generic list (checkpoint 8a, the owner's answer 4): an address answering a JSON array in the
// format Radarr calls "StevenLu Custom", `[{ "title": …, "imdb_id": "tt…" }]`
// (https://wiki.servarr.com/radarr/supported). MDBList and similar tools
// publish IMDb and Letterboxd lists in it. A `tmdb_id` is used when an entry has one, so the IMDb
// lookup is skipped; MDBList's `id` and `release_year` are read too when `mediatype` is `movie`.
import { AppError, type Fetch } from '@highsea-tv/core'
import { idOf, imdbIdOf, jsonOf, type ListEntry, request } from '../shared/index.ts'

/** The most entries a generic list is read to. */
export const GENERIC_MAX = 5000

/** An http(s) address, or an AppError for the URL field. */
export function genericUrl(value: string): string {
  try {
    const url = new URL(value.trim())
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString()
  } catch {}
  throw new AppError('invalid', 'Use the full address, starting with http:// or https://.', {
    field: 'settings.url',
    reason: 'bad-url',
  })
}

export async function readGeneric(fetch: Fetch, address: string): Promise<ListEntry[]> {
  const url = genericUrl(address)
  const what = new URL(url).host
  const res = await request(fetch, what, url, { headers: { accept: 'application/json' } })
  if (!res.ok)
    throw new AppError('unavailable', `${what} answered ${res.status} for the list.`, {
      reason: 'bad-answer',
    })
  const body = await jsonOf<unknown>(what, res)
  if (!Array.isArray(body))
    throw new AppError('unavailable', `${what} didn’t answer with a list of movies.`, {
      reason: 'bad-answer',
    })
  const out: ListEntry[] = []
  for (const raw of body.slice(0, GENERIC_MAX)) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    if (typeof r.mediatype === 'string' && r.mediatype !== 'movie') continue
    const tmdbId = idOf(r.tmdb_id ?? r.tmdbId ?? (r.mediatype === 'movie' ? r.id : undefined))
    const imdbId = imdbIdOf(r.imdb_id ?? r.imdbId)
    if (!tmdbId && !imdbId) continue
    out.push({
      tmdbId,
      imdbId,
      title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : (imdbId ?? ''),
      year: idOf(r.year ?? r.release_year),
    })
  }
  return out
}

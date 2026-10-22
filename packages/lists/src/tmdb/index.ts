// SPDX-License-Identifier: AGPL-3.0-only
// TMDB as an import list source (checkpoint 8a): a public list by id or address, read a page at a
// time (https://developer.themoviedb.org/reference/list-details), or one of TMDB's charts for the
// server's region, its first page. Everything goes through `@highsea/metadata`, so the server's TMDB
// key, language and region apply, and the recordings answer in tests.
import { AppError } from '@highsea/core'
import type { Metadata } from '@highsea/metadata'
import { type ListEntry, MAX_PAGES } from '../shared/index.ts'

export type TmdbListSource = 'list' | 'popular' | 'top-rated' | 'upcoming' | 'now-playing'

/**
 * A TMDB list's id from what the owner pasted: `8512345`, or an address such as
 * `https://www.themoviedb.org/list/8512345-blender-open-films`. Null when it's neither.
 */
export function tmdbListId(value: string): string | null {
  const s = value.trim()
  if (/^\d{1,12}$/.test(s)) return s
  try {
    const url = new URL(s)
    if (!/(^|\.)themoviedb\.org$/i.test(url.hostname)) return null
    const m = url.pathname.match(/^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?list\/(\d{1,12})/)
    return m?.[1] ?? null
  } catch {
    return null
  }
}

export async function readTmdb(
  metadata: Metadata,
  settings: { source: TmdbListSource; list?: string | undefined },
): Promise<ListEntry[]> {
  const entry = (m: { id: number; title: string; year: number | null }): ListEntry => ({
    tmdbId: m.id,
    imdbId: null,
    title: m.title,
    year: m.year,
  })
  if (settings.source !== 'list') {
    const page = await metadata.discover.list(settings.source)
    return page.results.map(entry)
  }
  const id = tmdbListId(settings.list ?? '')
  if (!id)
    throw new AppError('invalid', 'Use the list’s number or its address on themoviedb.org.', {
      field: 'settings.list',
      reason: 'bad-list',
    })
  const out: ListEntry[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const result = await metadata.discover.publicList(id, page)
    out.push(...result.results.map(entry))
    if (page >= result.totalPages) break
  }
  return out
}

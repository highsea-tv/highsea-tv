// SPDX-License-Identifier: AGPL-3.0-only
// Checking a release name by hand, as Radarr's Parse page does: what the parser reads, the named
// quality, the custom formats it matches, what they score in each profile, and the library movie
// it points to.
import type { ParseResult } from '@highsea/api-contract'
import { schema } from '@highsea/db'
import { type ParsedRelease, parse } from '@highsea/parser'
import { type FormatInput, matchingFormats, qualityOf, scoreFormats } from '@highsea/quality'
import { and, eq, sql } from 'drizzle-orm'
import type { Catalog } from './catalog.ts'
import type { Ctx } from './context.ts'
import type { Library } from './library.ts'
import type { ItemRow } from './map.ts'
import { matchKey } from './titles.ts'

const { mediaItems, movieMetadata } = schema

export function createParse(
  { db }: Ctx,
  { catalog, library }: { catalog: Catalog; library: Library },
) {
  /**
   * The library movie a name points to: an id in the name (TMDB's, then IMDb's), else the title
   * and year, compared letters and digits only. A name without a year or an id matches nothing:
   * titles alone are too often shared.
   */
  function match(release: ParsedRelease): ItemRow | null {
    if (release.ids.tmdb) {
      const row = library.internal.rowOf(release.ids.tmdb)
      if (row) return row
    }
    if (release.ids.imdb) {
      const hit = db
        .select({ id: movieMetadata.tmdbId })
        .from(movieMetadata)
        .innerJoin(
          mediaItems,
          and(eq(mediaItems.type, 'movie'), eq(mediaItems.tmdbId, movieMetadata.tmdbId)),
        )
        .where(
          sql`coalesce(json_extract(${movieMetadata.data}, '$.external_ids.imdb_id'), json_extract(${movieMetadata.data}, '$.imdb_id')) = ${release.ids.imdb}`,
        )
        .get()
      if (hit) return library.internal.rowOf(hit.id) ?? null
    }
    const key = matchKey(release.title)
    if (!key) return null
    const candidates =
      release.year !== null
        ? // a year's movies come off the year index
          db
            .select()
            .from(mediaItems)
            .where(
              and(
                eq(mediaItems.type, 'movie'),
                sql`${mediaItems.year} BETWEEN ${release.year - 1} AND ${release.year + 1}`,
              ),
            )
            .all()
        : []
    const sameTitle = (r: ItemRow) => {
      const meta = library.internal.cached(r.tmdbId)
      return [r.title, meta?.originalTitle].some((t) => t && matchKey(t) === key)
    }
    // the exact year first; a year either side covers regional release dates
    const exact = candidates.filter((r) => r.year === release.year && sameTitle(r))
    if (exact[0]) return exact[0]
    const near = candidates.filter(sameTitle)
    if (near.length === 1) return near[0] ?? null
    return null
  }

  return function parseTitle(title: string): ParseResult {
    const release = parse(title)
    const row = match(release)
    const meta = row ? library.internal.cached(row.tmdbId) : null
    const formats = catalog.customFormats()
    const input: FormatInput = { release, originalLanguage: meta?.originalLanguage ?? null }
    const matched = matchingFormats(formats, input)
    return {
      release,
      quality: qualityOf(release.quality),
      formats: matched.map((f) => ({ id: f.id, name: f.name })),
      scores: catalog.profiles.list().map((p) => ({
        profileId: p.id,
        name: p.name,
        score: scoreFormats(p, matched, input).formatScore,
      })),
      movie: row ? { id: row.tmdbId, title: row.title, year: row.year } : null,
    }
  }
}

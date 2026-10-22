// SPDX-License-Identifier: AGPL-3.0-only
// The movie library as smart collections see it (checkpoint 8d, ADR 0049): a collection's titles
// from its rules (`collection-query.ts`), the editor's choices from what's in the library, people
// by name and role, and TMDB's collections with titles here. Curation doesn't import
// `@highsea/media`; the runtime hands it this.
//
// Language names are the platform's (`Intl.DisplayNames`, ECMA-402 § 12), so they follow the
// server's language without a table of our own. People's names live in TMDB's credits in the
// metadata cache, read with SQLite's json_each (https://sqlite.org/json1.html), as search does.
import type { RuleField, RulePerson } from '@highsea/api-contract'
import { ROLE_JOBS } from '@highsea/api-contract'
import type { Clock } from '@highsea/core'
import type { CollectionLibrary, Option, TmdbCollection } from '@highsea/curation/collections'
import { type Db, schema } from '@highsea/db'
import type { Movies } from '@highsea/media/movies'
import { DEFAULT_SIZES, imageUrl } from '@highsea/metadata'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { collectionQuery, IN_LIBRARY, PLAYABLE, PRIMARY_SUBTAG } from './collection-query.ts'

const { mediaItems } = schema
const CHUNK = 500

const list = (xs: readonly (string | number)[]) =>
  sql`(SELECT value FROM json_each(${JSON.stringify(xs)}))`

/** ffprobe's codec names as people say them. */
const CODECS: Record<string, string> = {
  h264: 'H.264',
  hevc: 'HEVC',
  av1: 'AV1',
  vp9: 'VP9',
  mpeg4: 'MPEG-4',
  mpeg2video: 'MPEG-2',
  vc1: 'VC-1',
}

const byLabel = (a: Option, b: Option) => a.label.localeCompare(b.label)

export function createCollectionLibrary(deps: {
  db: Db
  clock: Clock
  movies: Movies
  /** The server's language, for language names. */
  locale?: () => string
  /** The region's certifications from mildest, from `@highsea/metadata`; null until known. */
  certifications?: () => string[] | null
}): CollectionLibrary {
  const { db, clock, movies } = deps

  const languageName = (() => {
    let names: Intl.DisplayNames | null = null
    let at = ''
    return (code: string) => {
      const locale = deps.locale?.() ?? 'en'
      if (!names || at !== locale) {
        names = new Intl.DisplayNames([locale, 'en'], { type: 'language', fallback: 'code' })
        at = locale
      }
      try {
        return names.of(code) ?? code
      } catch {
        return code
      }
    }
  })()

  const values = (query: ReturnType<typeof sql>) =>
    db
      .all<{ value: string | number | null }>(query)
      .flatMap((r) => (r.value === null || r.value === '' ? [] : [String(r.value)]))

  const languages = (codes: string[]): Option[] =>
    [...new Set(codes)].map((c) => ({ value: c, label: languageName(c) })).sort(byLabel)

  const ratings = () => deps.certifications?.() ?? null

  function options(field: RuleField): Option[] {
    switch (field) {
      case 'certification':
        // what the library holds; the editor offers the region's whole list when it's known
        return values(
          sql`SELECT DISTINCT mm.certification AS value FROM media_items mi
            JOIN movie_metadata mm ON mm.tmdb_id = mi.tmdb_id
            WHERE ${IN_LIBRARY} AND mm.certification IS NOT NULL ORDER BY value`,
        ).map((v) => ({ value: v, label: v }))
      case 'decade':
        return values(
          sql`SELECT DISTINCT (mi.year / 10) * 10 AS value FROM media_items mi
            WHERE ${IN_LIBRARY} AND mi.year IS NOT NULL ORDER BY value`,
        ).map((d) => ({ value: d, label: `${d}s` }))
      case 'originalLanguage':
        return languages(
          values(sql`SELECT DISTINCT mm.original_language AS value FROM media_items mi
            JOIN movie_metadata mm ON mm.tmdb_id = mi.tmdb_id WHERE ${IN_LIBRARY}`),
        )
      case 'audioLanguage':
        return languages(
          values(sql`SELECT DISTINCT l.language AS value FROM media_file_languages l
            WHERE l.kind = 'audio'`),
        )
      case 'subtitleLanguage':
        return languages(
          values(sql`SELECT l.language AS value FROM media_file_languages l WHERE l.kind = 'subtitle'
            UNION SELECT ${PRIMARY_SUBTAG} FROM subtitle_files sf`),
        )
      case 'genre':
      case 'keyword':
      case 'studio':
      case 'country':
        return db
          .all<{ value: string; label: string }>(
            sql`SELECT t.value AS value, max(t.label) AS label FROM movie_terms t
              JOIN media_items mi ON mi.tmdb_id = t.movie_id
              WHERE ${IN_LIBRARY} AND t.kind = ${field}
              GROUP BY t.value ORDER BY label COLLATE NOCASE`,
          )
          .map((r) => ({ value: String(r.value), label: r.label }))
      case 'collection':
        return db
          .all<{ value: number; label: string }>(
            sql`SELECT DISTINCT mm.collection_id AS value,
                json_extract(mm.data, '$.belongs_to_collection.name') AS label
              FROM media_items mi JOIN movie_metadata mm ON mm.tmdb_id = mi.tmdb_id
              WHERE ${IN_LIBRARY} AND mm.collection_id IS NOT NULL AND label IS NOT NULL
              ORDER BY label COLLATE NOCASE`,
          )
          .map((r) => ({ value: String(r.value), label: r.label }))
      case 'tag':
        return db
          .all<{ value: string; label: string }>(
            sql`SELECT id AS value, label FROM tags ORDER BY label COLLATE NOCASE`,
          )
          .map((r) => ({ value: r.value, label: r.label }))
      case 'rootFolder':
        return values(
          sql`SELECT path AS value FROM root_folders
            UNION SELECT DISTINCT mi.root_folder FROM media_items mi WHERE ${IN_LIBRARY}
            ORDER BY value`,
        ).map((p) => ({ value: p, label: p }))
      case 'qualityProfile':
        return db
          .all<{ value: string; label: string }>(
            sql`SELECT id AS value, name AS label FROM quality_profiles ORDER BY position`,
          )
          .map((r) => ({ value: r.value, label: r.label }))
      case 'videoCodec':
        return values(
          sql`SELECT DISTINCT video_codec AS value FROM media_files WHERE video_codec IS NOT NULL`,
        )
          .map((c) => ({ value: c, label: CODECS[c] ?? c.toUpperCase() }))
          .sort(byLabel)
      case 'edition':
        return values(
          sql`SELECT DISTINCT edition AS value FROM media_files WHERE edition IS NOT NULL
            ORDER BY edition COLLATE NOCASE`,
        ).map((e) => ({ value: e, label: e }))
      default:
        return []
    }
  }

  function people(query: string, field: RuleField | undefined, limit: number): RulePerson[] {
    const like = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    const cast = !field || field === 'person' || field === 'actor'
    const jobs = field ? ROLE_JOBS[field as keyof typeof ROLE_JOBS] : undefined
    const crew = !field || field === 'person' || !!jobs
    const branches = [
      cast
        ? sql`SELECT json_extract(c.value, '$.id') AS id, json_extract(c.value, '$.name') AS name,
            json_extract(c.value, '$.profile_path') AS photo, mi.tmdb_id AS movie
          FROM media_items mi JOIN movie_metadata mm ON mm.tmdb_id = mi.tmdb_id,
            json_each(mm.data, '$.credits.cast') c
          WHERE ${IN_LIBRARY} AND json_extract(c.value, '$.name') LIKE ${like} ESCAPE '\\'`
        : null,
      crew
        ? sql`SELECT json_extract(c.value, '$.id') AS id, json_extract(c.value, '$.name') AS name,
            json_extract(c.value, '$.profile_path') AS photo, mi.tmdb_id AS movie
          FROM media_items mi JOIN movie_metadata mm ON mm.tmdb_id = mi.tmdb_id,
            json_each(mm.data, '$.credits.crew') c
          WHERE ${IN_LIBRARY} AND json_extract(c.value, '$.name') LIKE ${like} ESCAPE '\\'
            ${jobs ? sql`AND json_extract(c.value, '$.job') IN ${list(jobs)}` : sql``}`
        : null,
    ].filter((b) => b !== null)
    if (!branches.length) return []
    return db
      .all<{ id: number; name: string; photo: string | null; titles: number }>(
        sql`SELECT id, max(name) AS name, max(photo) AS photo, count(DISTINCT movie) AS titles
          FROM (${sql.join(branches, sql` UNION ALL `)})
          GROUP BY id ORDER BY titles DESC, name COLLATE NOCASE LIMIT ${limit}`,
      )
      .map((r) => ({
        id: Number(r.id),
        name: r.name,
        photo: imageUrl('person', Number(r.id), 'profile', DEFAULT_SIZES.profile, r.photo),
        titles: Number(r.titles),
      }))
  }

  function personNames(ids: number[]): Map<number, string> {
    const out = new Map<number, string>()
    if (!ids.length) return out
    // one credit of each person, then their name from that film's credits; the people cache
    // answers for anyone whose films have since left
    for (const r of db.all<{ id: number; name: string | null }>(
      sql`SELECT cr.person_id AS id,
          (SELECT json_extract(j.value, '$.name') FROM movie_metadata m,
            json_each(m.data, '$.credits.' || cr.kind) j
            WHERE m.tmdb_id = cr.movie_id AND json_extract(j.value, '$.id') = cr.person_id) AS name
        FROM credits cr
        WHERE cr.rowid IN (SELECT min(rowid) FROM credits WHERE person_id IN ${list(ids)}
          GROUP BY person_id)`,
    ))
      if (r.name) out.set(Number(r.id), r.name)
    const missing = ids.filter((id) => !out.has(id))
    if (missing.length)
      for (const p of db
        .select({ id: schema.people.tmdbId, name: schema.people.name })
        .from(schema.people)
        .where(inArray(schema.people.tmdbId, missing))
        .all())
        out.set(p.id, p.name)
    return out
  }

  function tmdbCollections(): TmdbCollection[] {
    const parts = db.all<{
      id: number
      name: string | null
      poster: string | null
      backdrop: string | null
      tmdbId: number
      year: number | null
    }>(
      sql`SELECT mm.collection_id AS id,
          json_extract(mm.data, '$.belongs_to_collection.name') AS name,
          json_extract(mm.data, '$.belongs_to_collection.poster_path') AS poster,
          json_extract(mm.data, '$.belongs_to_collection.backdrop_path') AS backdrop,
          mi.tmdb_id AS tmdbId, mi.year AS year
        FROM media_items mi JOIN movie_metadata mm ON mm.tmdb_id = mi.tmdb_id
        WHERE ${IN_LIBRARY} AND mm.collection_id IS NOT NULL AND ${PLAYABLE}
        ORDER BY mi.year IS NULL, mi.year, mi.release_date, mi.id`,
    )
    const groups = new Map<number, typeof parts>()
    for (const p of parts) groups.set(p.id, [...(groups.get(p.id) ?? []), p])
    const ids = [...groups.keys()]
    const overview = new Map<number, string>()
    for (let i = 0; i < ids.length; i += CHUNK)
      for (const c of db
        .select({ id: schema.collections.tmdbId, data: schema.collections.data })
        .from(schema.collections)
        .where(inArray(schema.collections.tmdbId, ids.slice(i, i + CHUNK)))
        .all())
        overview.set(c.id, (c.data as { overview?: string | null }).overview ?? '')
    return [...groups.entries()]
      .flatMap(([id, ps]) => {
        const first = ps[0]
        if (!first?.name) return []
        return [
          {
            id,
            name: first.name,
            overview: overview.get(id) ?? '',
            art: {
              poster: imageUrl('collection', id, 'poster', DEFAULT_SIZES.poster, first.poster),
              backdrop: imageUrl(
                'collection',
                id,
                'backdrop',
                DEFAULT_SIZES.backdrop,
                first.backdrop,
              ),
            },
            tmdbIds: ps.map((p) => p.tmdbId),
            years: ps.flatMap((p) => (p.year === null ? [] : [p.year])),
          },
        ]
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  return {
    evaluate(def, lookup) {
      return db
        .all<{ itemId: string; tmdbId: number; playable: number }>(
          collectionQuery(def, lookup, clock.now(), ratings()),
        )
        .map((r) => ({ itemId: r.itemId, tmdbId: r.tmdbId, playable: !!r.playable }))
    },
    itemIds(tmdbIds) {
      const out = new Map<number, string>()
      for (let i = 0; i < tmdbIds.length; i += CHUNK)
        for (const r of db
          .select({ id: mediaItems.id, tmdbId: mediaItems.tmdbId })
          .from(mediaItems)
          .where(
            and(
              eq(mediaItems.type, 'movie'),
              inArray(mediaItems.tmdbId, tmdbIds.slice(i, i + CHUNK)),
            ),
          )
          .all())
          out.set(r.tmdbId, r.id)
      return out
    },
    tmdbIds(itemIds) {
      const out = new Map<string, number>()
      for (let i = 0; i < itemIds.length; i += CHUNK)
        for (const r of db
          .select({ id: mediaItems.id, tmdbId: mediaItems.tmdbId })
          .from(mediaItems)
          .where(inArray(mediaItems.id, itemIds.slice(i, i + CHUNK)))
          .all())
          out.set(r.id, r.tmdbId)
      return out
    },
    items: (tmdbIds, userId) => movies.client.byIds(tmdbIds, userId),
    options,
    people,
    personNames,
    tmdbCollections,
    certifications: ratings,
  }
}

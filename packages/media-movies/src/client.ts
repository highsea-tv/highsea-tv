// SPDX-License-Identifier: AGPL-3.0-only
// The client API (client-library.md, client-detail.md, client-search.md): the library as the
// household's apps read it, with each person's place in each title. Watch positions are read from
// `watch_positions`; playback writes them in Phase 4.
import type {
  ClientCollection,
  ClientDetail,
  ClientItem,
  ClientItemPage,
  SearchPerson,
  SearchResults,
  SearchSection,
} from '@highsea/api-contract'
import { schema } from '@highsea/db'
import { DEFAULT_SIZES, imageUrl } from '@highsea/metadata'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { type Ctx, notInLibrary } from './context.ts'
import { type Library, titleMatch } from './library.ts'
import {
  type ItemRow,
  toApiCredit,
  toApiDiscoverMovie,
  toApiVideo,
  toClientItem,
  type WatchState,
} from './map.ts'
import type { Dir, Sort } from './paging.ts'
import { fold } from './titles.ts'

const { mediaItems, movieMetadata, watchPositions, collections } = schema

/** Results per section. */
const SECTION_LIMIT = 20

export type ClientListQuery = {
  type?: 'movie'
  genre?: string
  playable?: boolean | 'true' | 'false'
  sort?: Sort
  dir?: Dir
  cursor?: string
  limit?: number
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 2 when a name starts with the query at a word, 1 when it contains it, 0 otherwise. */
export function matchScore(name: string, query: string): number {
  const n = fold(name)
  const q = fold(query)
  if (!q || !n.includes(q)) return 0
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(q)}`, 'u').test(n) ? 2 : 1
}

export function createClient(ctx: Ctx, { library }: { library: Library }) {
  const { db, metadata } = ctx
  const log = ctx.logger.child('movies')

  function watchOf(userId: string, rows: ItemRow[]): Map<string, WatchState> {
    const out = new Map<string, WatchState>()
    if (rows.length === 0) return out
    for (const w of db
      .select()
      .from(watchPositions)
      .where(
        and(
          eq(watchPositions.userId, userId),
          inArray(
            watchPositions.itemId,
            rows.map((r) => r.id),
          ),
        ),
      )
      .all())
      out.set(w.itemId, { positionSeconds: w.positionSeconds, durationSeconds: w.durationSeconds })
    return out
  }

  function items(rows: ItemRow[], userId: string): ClientItem[] {
    const watch = watchOf(userId, rows)
    return rows.map((r) =>
      toClientItem(r, library.internal.cached(r.tmdbId), watch.get(r.id) ?? null),
    )
  }

  /** The library a page at a time, with this person's watch state. Movies are the only type yet. */
  function list(query: ClientListQuery, userId: string): ClientItemPage {
    const playable =
      query.playable === undefined
        ? undefined
        : query.playable === true || query.playable === 'true'
    const filters = { genre: query.genre, playable }
    const { rows, next } = library.internal.pageOf({
      ...filters,
      sort: query.sort,
      dir: query.dir,
      cursor: query.cursor,
      limit: query.limit,
    })
    return { items: items(rows, userId), next, total: library.internal.countOf(filters) }
  }

  /** A title's page and the player. 404 when it isn't in the library. */
  async function item(type: 'movie', tmdbId: number, userId: string): Promise<ClientDetail> {
    if (type !== 'movie') throw notInLibrary()
    const row = library.internal.rowOf(tmdbId)
    if (!row) throw notInLibrary()
    const meta = library.internal.cached(tmdbId)
    const versions = library.internal.versionsOf([row.id]).get(row.id) ?? []
    let related: ClientItem[] = []
    try {
      const recommended = (await metadata.recommendations(tmdbId)).map((m) => m.id)
      const here = library.inLibrary(recommended)
      const rows = recommended
        .filter((id) => here.has(id))
        .flatMap((id) => library.internal.rowOf(id) ?? [])
      related = items(rows, userId)
    } catch (e) {
      log.warn('couldn’t read recommendations', { tmdbId, error: (e as Error).message })
    }
    const cast = meta?.cast ?? []
    const crew = meta?.crew ?? []
    return {
      item: items([row], userId)[0] as ClientItem,
      originalTitle: meta?.originalTitle ?? row.title,
      tagline: meta?.tagline ?? null,
      certification: meta?.certification ?? null,
      studios: meta?.studios ?? [],
      cast: cast.map((c, i) => toApiCredit(c, tmdbId, 'cast', i)),
      directors: crew.flatMap((c, i) =>
        c.job === 'Director' ? [toApiCredit(c, tmdbId, 'crew', i)] : [],
      ),
      videos: (meta?.videos ?? []).map(toApiVideo),
      collection: meta?.collection ?? null,
      // no version has a file until checkpoint 6
      versions: versions.map((v) => ({ id: v.id, label: v.label, detail: null, playable: false })),
      related,
    }
  }

  // ------------------------------------------------------------ search

  /**
   * Library titles by name, genre or person (cast or crew), from the cached TMDB data. Title
   * matches come first. Genres and people are read from each title's cached JSON
   * (`json_each`, https://sqlite.org/json1.html#jeach), which is fine for thousands of titles; a
   * names index is a follow-up for libraries far larger.
   */
  function searchMovies(query: string, userId: string): ClientItem[] {
    const like = `%${escapeLike(query)}%`
    const rows = db
      .select()
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.type, 'movie'),
          sql`(${titleMatch(query)} OR ${mediaItems.tmdbId} IN (
            SELECT m.tmdb_id FROM movie_metadata m, json_each(m.data, '$.genres') g
              WHERE json_extract(g.value, '$.name') LIKE ${like} ESCAPE '\\'
            UNION SELECT m.tmdb_id FROM movie_metadata m, json_each(m.data, '$.credits.cast') c
              WHERE json_extract(c.value, '$.name') LIKE ${like} ESCAPE '\\'
            UNION SELECT m.tmdb_id FROM movie_metadata m, json_each(m.data, '$.credits.crew') c
              WHERE json_extract(c.value, '$.name') LIKE ${like} ESCAPE '\\'))`,
        ),
      )
      .orderBy(mediaItems.sortTitle, mediaItems.id)
      .limit(SECTION_LIMIT * 5)
      .all()
    const ranked = rows
      .map((r, i) => ({ r, i, score: matchScore(r.title, query) }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, SECTION_LIMIT)
      .map((x) => x.r)
    return items(ranked, userId)
  }

  /** Collections with a part here, by name or a part's title. Only the parts here count. */
  function searchCollections(query: string): ClientCollection[] {
    const like = `%${escapeLike(query)}%`
    const parts = db
      .select({
        collectionId: movieMetadata.collectionId,
        name: sql<string>`json_extract(${movieMetadata.data}, '$.belongs_to_collection.name')`,
        poster: sql<
          string | null
        >`json_extract(${movieMetadata.data}, '$.belongs_to_collection.poster_path')`,
        backdrop: sql<
          string | null
        >`json_extract(${movieMetadata.data}, '$.belongs_to_collection.backdrop_path')`,
        title: mediaItems.title,
        year: mediaItems.year,
      })
      .from(mediaItems)
      .innerJoin(movieMetadata, eq(movieMetadata.tmdbId, mediaItems.tmdbId))
      .where(
        and(
          eq(mediaItems.type, 'movie'),
          sql`${movieMetadata.collectionId} IN (
            SELECT m.collection_id FROM media_items i JOIN movie_metadata m ON m.tmdb_id = i.tmdb_id
            WHERE i.type = 'movie' AND m.collection_id IS NOT NULL AND (
              json_extract(m.data, '$.belongs_to_collection.name') LIKE ${like} ESCAPE '\\'
              OR i.title LIKE ${like} ESCAPE '\\'))`,
        ),
      )
      .all()
    const byId = new Map<number, typeof parts>()
    for (const p of parts) {
      if (p.collectionId === null) continue
      byId.set(p.collectionId, [...(byId.get(p.collectionId) ?? []), p])
    }
    const ids = [...byId.keys()]
    const cachedRows = ids.length
      ? db.select().from(collections).where(inArray(collections.tmdbId, ids)).all()
      : []
    const overview = new Map(
      cachedRows.map((c) => [c.tmdbId, (c.data as { overview?: string | null }).overview ?? '']),
    )
    return [...byId.entries()]
      .map(([id, ps]) => {
        const first = ps[0] as (typeof ps)[number]
        const years = ps.map((p) => p.year).filter((y): y is number => y !== null)
        const min = Math.min(...years)
        const max = Math.max(...years)
        return {
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
          count: ps.length,
          years: years.length === 0 ? '' : min === max ? String(min) : `${min}–${max}`,
          score: Math.max(
            matchScore(first.name, query),
            ...ps.map((p) => matchScore(p.title, query)),
          ),
        }
      })
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, SECTION_LIMIT)
      .map(({ score: _score, ...c }) => c)
  }

  /** People in the library's titles, cast or crew, by name, with how many titles here they're in. */
  function searchPeople(query: string): SearchPerson[] {
    const like = `%${escapeLike(query)}%`
    const rows = db.all<{ id: number; name: string; photo: string | null; titles: number }>(sql`
      SELECT id, max(name) AS name, max(photo) AS photo, count(DISTINCT movie) AS titles FROM (
        SELECT json_extract(c.value, '$.id') AS id, json_extract(c.value, '$.name') AS name,
          json_extract(c.value, '$.profile_path') AS photo, i.tmdb_id AS movie
        FROM media_items i JOIN movie_metadata m ON m.tmdb_id = i.tmdb_id,
          json_each(m.data, '$.credits.cast') c
        WHERE i.type = 'movie' AND json_extract(c.value, '$.name') LIKE ${like} ESCAPE '\\'
        UNION ALL
        SELECT json_extract(c.value, '$.id'), json_extract(c.value, '$.name'),
          json_extract(c.value, '$.profile_path'), i.tmdb_id
        FROM media_items i JOIN movie_metadata m ON m.tmdb_id = i.tmdb_id,
          json_each(m.data, '$.credits.crew') c
        WHERE i.type = 'movie' AND json_extract(c.value, '$.name') LIKE ${like} ESCAPE '\\'
      ) GROUP BY id ORDER BY titles DESC, name LIMIT ${SECTION_LIMIT * 3}`)
    return rows
      .map((r, i) => ({ r, i, score: matchScore(r.name, query) }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, SECTION_LIMIT)
      .map(({ r }) => ({
        id: Number(r.id),
        name: r.name,
        photo: imageUrl('person', Number(r.id), 'profile', DEFAULT_SIZES.profile, r.photo),
        titles: Number(r.titles),
      }))
  }

  /**
   * The library's titles, collections and people, the best-matching kind first (client-search.md,
   * Ranking). For people who may ask for titles, TMDB's matches that aren't here follow, to request
   * (ADR 0032), left out when TMDB can't be reached or no key is set.
   */
  async function search(
    query: string,
    { userId, mayRequest }: { userId: string; mayRequest: boolean },
  ): Promise<SearchResults> {
    const q = query.trim()
    if (!q) return { sections: [] }
    const best = (names: string[]) => Math.max(0, ...names.map((n) => matchScore(n, q)))
    const movies = searchMovies(q, userId)
    const cols = searchCollections(q)
    const people = searchPeople(q)
    const ranked: { section: SearchSection; score: number }[] = [
      {
        section: { kind: 'movies' as const, items: movies },
        score: best(movies.map((m) => m.title)),
      },
      {
        section: { kind: 'collections' as const, items: cols },
        score: best(cols.map((c) => c.name)),
      },
      {
        section: { kind: 'people' as const, items: people },
        score: best(people.map((p) => p.name)),
      },
    ]
    const sections = ranked
      .filter((s) => s.section.items.length > 0)
      .map((s, i) => ({ ...s, i }))
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .map((s) => s.section)
    if (mayRequest) {
      try {
        const page = await metadata.discover.search(q)
        const here = library.inLibrary(page.results.map((m) => m.id))
        const found = page.results
          .filter((m) => !here.has(m.id))
          .slice(0, SECTION_LIMIT)
          .map((m) => toApiDiscoverMovie(m, false))
        if (found.length) sections.push({ kind: 'discover', items: found })
      } catch (e) {
        log.debug('search left TMDB out', { error: (e as Error).message })
      }
    }
    return { sections }
  }

  return { list, item, search }
}

export type Client = ReturnType<typeof createClient>

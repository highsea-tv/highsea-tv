// SPDX-License-Identifier: AGPL-3.0-only
// The movie library as curation sees it (checkpoint 8c, ADR 0048): which titles are here and have
// a file, what a section's rule picks, the home's built-in rows, and the genres and collections a
// rule can name. Curation doesn't import `@highsea/media`; the runtime hands it this.
//
// A title counts once a version has a file: the prototype's "playable", which streaming (Phase 4)
// will narrow to what can actually be played. The rules read TMDB's own JSON in the metadata cache
// with SQLite's json_each and json_extract (https://sqlite.org/json1.html), as the genre rows do.
import type { Clock } from '@highsea/core'
import type { BuiltInRow, CurationLibrary, FilterTerm, RulePick } from '@highsea/curation/service'
import { type Db, schema } from '@highsea/db'
import type { Movies } from '@highsea/media/movies'
import { and, eq, inArray, type SQL, sql } from 'drizzle-orm'
import { homeRows } from './home-rows.ts'

const { mediaItems } = schema
const CHUNK = 500
/** Titles in a built-in row. */
const ROW_MAX = 20
const DAY = 86_400_000

/** A library movie with a file. The queries repeat it as their base. */
const HAS_FILE = sql`mi.type = 'movie' AND mi.parent_id IS NULL AND EXISTS (
  SELECT 1 FROM versions v WHERE v.item_id = mi.id AND v.file_id IS NOT NULL)`

const OPS: Record<FilterTerm['op'], SQL> = {
  '<': sql`<`,
  '<=': sql`<=`,
  '>': sql`>`,
  '>=': sql`>=`,
  '=': sql`=`,
}

/** The ratings are out of 5 in the API, TMDB's 0–10 halved, as the client sees them. */
const termSql = (t: FilterTerm): SQL =>
  t.field === 'year'
    ? sql`mi.year ${OPS[t.op]} ${t.value}`
    : sql`round(mi.rating / 2.0, 1) ${OPS[t.op]} ${t.value}`

/** Where a rule looks and in what order: newest first, best rated first, or the films' order. */
function ruleSql(pick: RulePick, now: number): { where: SQL; order: SQL } {
  switch (pick.rule) {
    case 'recently-added':
      return {
        where: sql`mi.added_at >= ${now - pick.days * DAY}`,
        order: sql`mi.added_at DESC, mi.id`,
      }
    case 'genre':
      return {
        where: sql`EXISTS (SELECT 1 FROM movie_metadata mm, json_each(mm.data, '$.genres') g
          WHERE mm.tmdb_id = mi.tmdb_id AND lower(json_extract(g.value, '$.name')) = lower(${pick.genre}))`,
        order: sql`mi.rating DESC, mi.sort_title, mi.id`,
      }
    case 'collection':
      return {
        where: sql`EXISTS (SELECT 1 FROM movie_metadata mm
          WHERE mm.tmdb_id = mi.tmdb_id AND mm.collection_id = ${pick.collectionId})`,
        order: sql`mi.release_date, mi.year, mi.id`,
      }
    case 'filter':
      return {
        where: sql.join(pick.terms.map(termSql), sql` AND `),
        order: sql`mi.rating DESC, mi.sort_title, mi.id`,
      }
  }
}

export function createCurationLibrary(deps: {
  db: Db
  clock: Clock
  movies: Movies
}): CurationLibrary {
  const { db, clock, movies } = deps

  const byTmdb = (tmdbIds: number[]) => {
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
  }

  const withFile = (tmdbIds: number[]) => {
    const out = new Set<number>()
    for (let i = 0; i < tmdbIds.length; i += CHUNK) {
      const ids = sql.join(
        tmdbIds.slice(i, i + CHUNK).map((id) => sql`${id}`),
        sql`, `,
      )
      for (const r of db.all<{ tmdbId: number }>(
        sql`SELECT mi.tmdb_id AS tmdbId FROM media_items mi WHERE ${HAS_FILE} AND mi.tmdb_id IN (${ids})`,
      ))
        out.add(r.tmdbId)
    }
    return out
  }

  const pickWhere = (where: SQL, order: SQL, limit: number) =>
    db
      .all<{ tmdbId: number }>(
        sql`SELECT mi.tmdb_id AS tmdbId FROM media_items mi
          WHERE ${HAS_FILE} AND ${where} ORDER BY ${order} LIMIT ${limit}`,
      )
      .map((r) => r.tmdbId)

  const items = (tmdbIds: number[], userId: string): ReturnType<CurationLibrary['items']> =>
    movies.client.byIds(tmdbIds, userId)

  return {
    itemIds: byTmdb,
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
    withFile,
    pick(pick, limit) {
      const { where, order } = ruleSql(pick, clock.now())
      // `all`, not `get`: for a raw query, Drizzle's bun:sqlite `get` returns the row as an array
      // of values (drizzle-orm/bun-sqlite/session.js), better-sqlite3's an object
      const [count] = db.all<{ n: number }>(
        sql`SELECT count(*) AS n FROM media_items mi WHERE ${HAS_FILE} AND ${where}`,
      )
      const total = count?.n ?? 0
      return { tmdbIds: total ? pickWhere(where, order, limit) : [], total }
    },
    items,
    builtIn(userId) {
      // Continue watching: started and not finished, most recent first (playback writes it in Phase 4)
      const started = db
        .all<{ tmdbId: number }>(
          sql`SELECT mi.tmdb_id AS tmdbId FROM watch_positions w
            JOIN media_items mi ON mi.id = w.item_id
            WHERE w.user_id = ${userId} AND ${HAS_FILE}
            ORDER BY w.updated_at DESC LIMIT ${ROW_MAX}`,
        )
        .map((r) => r.tmdbId)
      const rows: BuiltInRow[] = [
        {
          id: 'continue',
          title: null,
          items: items(started, userId).filter((m) => m.progress !== null),
        },
      ]
      for (const r of homeRows(db)) {
        if (r.id === 'recent')
          rows.push({
            id: 'recent',
            title: null,
            items: items(pickWhere(sql`1 = 1`, sql`mi.added_at DESC, mi.id`, ROW_MAX), userId),
          })
        else if (r.id.startsWith('genre:')) {
          const genreId = Number(r.id.slice('genre:'.length))
          const where = sql`EXISTS (SELECT 1 FROM movie_metadata mm, json_each(mm.data, '$.genres') g
            WHERE mm.tmdb_id = mi.tmdb_id AND json_extract(g.value, '$.id') = ${genreId})`
          rows.push({
            id: r.id,
            title: r.title,
            items: items(
              pickWhere(where, sql`mi.rating DESC, mi.sort_title, mi.id`, ROW_MAX),
              userId,
            ),
          })
        }
      }
      return rows
    },
    ruleOptions() {
      const genres = db
        .all<{ name: string }>(
          sql`SELECT DISTINCT json_extract(g.value, '$.name') AS name
            FROM media_items mi
            JOIN movie_metadata mm ON mm.tmdb_id = mi.tmdb_id, json_each(mm.data, '$.genres') g
            WHERE mi.type = 'movie' AND mi.parent_id IS NULL AND name IS NOT NULL
            ORDER BY name`,
        )
        .map((r) => r.name)
      const collections = db.all<{ id: number; name: string }>(
        sql`SELECT DISTINCT mm.collection_id AS id,
            json_extract(mm.data, '$.belongs_to_collection.name') AS name
          FROM media_items mi JOIN movie_metadata mm ON mm.tmdb_id = mi.tmdb_id
          WHERE mi.type = 'movie' AND mi.parent_id IS NULL AND mm.collection_id IS NOT NULL
            AND name IS NOT NULL
          ORDER BY name`,
      )
      return { genres, collections }
    },
  }
}

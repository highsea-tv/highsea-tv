// SPDX-License-Identifier: AGPL-3.0-only
// The rows a person can arrange on the client home (checkpoint 4 › The dashboard and home): Continue
// watching (empty until playback writes positions in Phase 4), Recently added, and one row for each
// genre in the library, most titles first. Built-in rows have no title, so each app names them from
// its own catalog; a genre row carries TMDB's genre name in the metadata language, and its id keeps
// TMDB's genre id, which doesn't change with the language.
import type { Db } from '@highsea/db'
import type { HomeRow } from '@highsea/personalization'
import { sql } from 'drizzle-orm'

/** Enough rows to browse by; the rest of the genres are in the library's Genre filter. */
export const GENRE_ROWS_MAX = 8

export function homeRows(db: Db): HomeRow[] {
  // SQLite's json_each over the cached TMDB movie's `genres` (https://sqlite.org/json1.html#jeach)
  const genres = db.all<{ genreId: number; name: string }>(sql`
    SELECT json_extract(g.value, '$.id') AS genreId, json_extract(g.value, '$.name') AS name
    FROM media_items mi
    JOIN movie_metadata mm ON mm.tmdb_id = mi.tmdb_id, json_each(mm.data, '$.genres') g
    WHERE mi.type = 'movie' AND mi.parent_id IS NULL
    GROUP BY genreId
    ORDER BY count(*) DESC, name
    LIMIT ${GENRE_ROWS_MAX}
  `)
  return [
    { id: 'continue', title: null },
    { id: 'recent', title: null },
    ...genres.map((g) => ({ id: `genre:${g.genreId}`, title: g.name })),
  ]
}

// SPDX-License-Identifier: AGPL-3.0-only
// The rows a person can arrange on the client home (checkpoint 4 › The dashboard and home): Continue
// watching (empty until playback writes positions in Phase 4), Recently added, and one row for each
// genre in the library, most titles first. Built-in rows have no title, so each app names them from
// its own catalog; a genre row carries TMDB's genre name in the metadata language, and its id keeps
// TMDB's genre id, which doesn't change with the language.
import type { Db } from '@highsea-tv/db'
import type { HomeRow } from '@highsea-tv/personalization'
import { sql } from 'drizzle-orm'

/** Enough rows to browse by; the rest of the genres are in the library's Genre filter. */
export const GENRE_ROWS_MAX = 8

export function homeRows(db: Db): HomeRow[] {
  // the genres' facts (`movie_terms`, checkpoint 8d), read through their index, so a home screen
  // doesn't parse every cached movie's TMDB response: at 100k movies that took seconds (9a)
  const genres = db.all<{ genreId: number; name: string }>(sql`
    SELECT CAST(t.value AS INTEGER) AS genreId, min(t.label) AS name
    FROM movie_terms t
    JOIN media_items mi ON mi.type = 'movie' AND mi.tmdb_id = t.movie_id
    WHERE t.kind = 'genre' AND mi.parent_id IS NULL
    GROUP BY t.value
    ORDER BY count(*) DESC, name
    LIMIT ${GENRE_ROWS_MAX}
  `)
  return [
    { id: 'continue', title: null },
    { id: 'recent', title: null },
    ...genres.map((g) => ({ id: `genre:${g.genreId}`, title: g.name })),
  ]
}

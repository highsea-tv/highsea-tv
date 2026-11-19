// SPDX-License-Identifier: AGPL-3.0-only
// The rows a person can arrange on the client home (checkpoint 4 › The dashboard and home): Continue
// watching (empty until playback writes positions in Phase 4), Next up (with shows), Recently added,
// New episodes and Recently added shows (with shows), and one row for each genre in the library,
// most titles first. Continue watching and Recently added have no title, so each app names them
// from its own catalog; a genre row carries TMDB's genre name in the metadata language, and its id keeps
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
  // shows' rows (Phase 5 B), once there's an episode to play; named here, as the mock names them
  const [shows] = db.all<{ n: number }>(sql`
    SELECT EXISTS (SELECT 1 FROM media_items e JOIN versions v ON v.item_id = e.id
      WHERE e.type = 'episode' AND v.file_id IS NOT NULL) AS n`)
  const showRows = (shows?.n ?? 0) > 0
  return [
    { id: 'continue', title: null },
    ...(showRows ? [{ id: 'next-up', title: 'Next up' }] : []),
    { id: 'recent', title: null },
    ...(showRows
      ? [
          { id: 'new-episodes', title: 'New episodes' },
          { id: 'recent-shows', title: 'Recently added shows' },
        ]
      : []),
    ...genres.map((g) => ({ id: `genre:${g.genreId}`, title: g.name })),
  ]
}

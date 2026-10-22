// SPDX-License-Identifier: AGPL-3.0-only
// The metadata cache (ADR 0030): TMDB's responses keyed by TMDB id beside the library, each with
// the time it was fetched. Writing a response replaces the row whole, so writing it twice changes
// nothing (ADR 0022).
import { type Db, schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'
import { movieColumns, replaceTerms } from './facts.ts'
import { departmentOf } from './map.ts'
import type {
  TmdbCollection,
  TmdbMovie,
  TmdbMovieItem,
  TmdbPage,
  TmdbPerson,
} from './tmdb/types.ts'
import type { CacheKind } from './types.ts'

const { movieMetadata, people, collections, credits } = schema

const yearOf = (d: string | undefined) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null)

export function createCache(db: Db) {
  const tables = { movie: movieMetadata, person: people, collection: collections }

  return {
    movie: (id: number) =>
      db.select().from(movieMetadata).where(eq(movieMetadata.tmdbId, id)).get(),
    person: (id: number) => db.select().from(people).where(eq(people.tmdbId, id)).get(),
    collection: (id: number) =>
      db.select().from(collections).where(eq(collections.tmdbId, id)).get(),

    /**
     * Writes a movie and replaces its cast and crew rows and its terms, in one transaction. The
     * certification follows `region`, the server's.
     */
    putMovie(movie: TmdbMovie, language: string, now: number, region: string) {
      const row = {
        tmdbId: movie.id,
        title: movie.title,
        originalTitle: movie.original_title ?? movie.title,
        year: yearOf(movie.release_date),
        releaseDate: movie.release_date || null,
        voteAverage: movie.vote_average ?? 0,
        voteCount: movie.vote_count ?? 0,
        popularity: movie.popularity ?? 0,
        collectionId: movie.belongs_to_collection?.id ?? null,
        ...movieColumns(movie, region),
        language,
        data: movie,
        fetchedAt: now,
        goneAt: null,
      }
      db.transaction((tx) => {
        tx.insert(movieMetadata)
          .values(row)
          .onConflictDoUpdate({ target: movieMetadata.tmdbId, set: row })
          .run()
        tx.delete(credits).where(eq(credits.movieId, movie.id)).run()
        const rows = [
          ...(movie.credits?.cast ?? []).map((c, i) => ({
            id: c.credit_id,
            movieId: movie.id,
            personId: c.id,
            kind: 'cast' as const,
            department: 'Acting',
            role: c.character ?? '',
            order: c.order ?? i,
          })),
          ...(movie.credits?.crew ?? []).map((c, i) => ({
            id: c.credit_id,
            movieId: movie.id,
            personId: c.id,
            kind: 'crew' as const,
            department: departmentOf(c.department),
            role: c.job,
            order: i,
          })),
        ]
        // a credit id is TMDB's and unique; a repeat inside one response is skipped, not fatal
        const seen = new Set<string>()
        const unique = rows.filter((r) => !seen.has(r.id) && seen.add(r.id))
        for (let i = 0; i < unique.length; i += 200)
          tx.insert(credits)
            .values(unique.slice(i, i + 200))
            .onConflictDoNothing()
            .run()
        replaceTerms(tx, movie)
      })
    },

    /** Keeps TMDB's "similar" list with the movie, for when it has no recommendations. */
    putSimilar(id: number, similar: TmdbPage<TmdbMovieItem>) {
      const row = db.select().from(movieMetadata).where(eq(movieMetadata.tmdbId, id)).get()
      if (!row) return
      db.update(movieMetadata)
        .set({ data: { ...(row.data as TmdbMovie), similar } })
        .where(eq(movieMetadata.tmdbId, id))
        .run()
    },

    putPerson(person: TmdbPerson, language: string, now: number) {
      const row = {
        tmdbId: person.id,
        name: person.name,
        language,
        data: person,
        fetchedAt: now,
        goneAt: null,
      }
      db.insert(people).values(row).onConflictDoUpdate({ target: people.tmdbId, set: row }).run()
    },

    putCollection(collection: TmdbCollection, language: string, now: number) {
      const row = {
        tmdbId: collection.id,
        name: collection.name,
        language,
        data: collection,
        fetchedAt: now,
        goneAt: null,
      }
      db.insert(collections)
        .values(row)
        .onConflictDoUpdate({ target: collections.tmdbId, set: row })
        .run()
    },

    /** TMDB answered 404 for a cached id: keep the rows, and say when it went. */
    markGone(kind: CacheKind, id: number, now: number) {
      const table = tables[kind]
      db.update(table).set({ goneAt: now }).where(eq(table.tmdbId, id)).run()
    },
  }
}

export type Cache = ReturnType<typeof createCache>

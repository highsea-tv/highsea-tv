// SPDX-License-Identifier: AGPL-3.0-only
// What collection rules ask of a cached movie (checkpoint 8d, ADR 0049), read from TMDB's response
// into columns and rows SQL can index: the original language, the runtime, the certification for
// the server's region, and the genres, keywords, production companies and countries as
// `movie_terms`. Written with the movie, and again by `metadata.facts` when the region changes or
// rows from before 8d are filled, always from the stored response, so it's safe to repeat.
import { type Db, readSetting, schema, writeSetting } from '@highsea-tv/db'
import { asc, eq, gt } from 'drizzle-orm'
import { certificationFor } from './map.ts'
import type { TmdbMovie } from './tmdb/types.ts'

const { movieMetadata, movieTerms } = schema

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export type MovieTermRow = typeof movieTerms.$inferInsert

/** The settings row that says which region the stored certifications follow. */
export const FACTS_STATE_KEY = 'metadata.facts'
/** Raised when what's derived changes, so every row is derived again. */
export const FACTS_VERSION = 1

export type FactsState = { version: number; region: string | null }

/** The columns beside `data` that rules read. */
export function movieColumns(movie: TmdbMovie, region: string) {
  return {
    originalLanguage: movie.original_language?.trim().toLowerCase() || null,
    runtime: movie.runtime || null,
    certification: certificationFor(movie, region),
  }
}

/** The movie's terms: genre, keyword and company by TMDB id, country by ISO 3166-1. */
export function movieTermsOf(movie: TmdbMovie): MovieTermRow[] {
  const rows: MovieTermRow[] = [
    ...(movie.genres ?? []).map((g) => ({
      kind: 'genre' as const,
      value: String(g.id),
      label: g.name,
    })),
    ...(movie.keywords?.keywords ?? []).map((k) => ({
      kind: 'keyword' as const,
      value: String(k.id),
      label: k.name,
    })),
    ...(movie.production_companies ?? []).map((c) => ({
      kind: 'studio' as const,
      value: String(c.id),
      label: c.name,
    })),
    ...(movie.production_countries ?? []).map((c) => ({
      kind: 'country' as const,
      value: c.iso_3166_1.toUpperCase(),
      label: c.name,
    })),
  ].map((r) => ({ ...r, movieId: movie.id }))
  // TMDB doesn't repeat a term, but the primary key would refuse it if it did
  const seen = new Set<string>()
  return rows.filter((r) => {
    const key = `${r.kind}:${r.value}`
    return !seen.has(key) && seen.add(key)
  })
}

/** Replaces a movie's terms inside the caller's transaction. */
export function replaceTerms(tx: Tx, movie: TmdbMovie) {
  tx.delete(movieTerms).where(eq(movieTerms.movieId, movie.id)).run()
  const rows = movieTermsOf(movie)
  for (let i = 0; i < rows.length; i += 200)
    tx.insert(movieTerms)
      .values(rows.slice(i, i + 200))
      .onConflictDoNothing()
      .run()
}

export const readFactsState = (db: Db) =>
  readSetting<FactsState>(db, FACTS_STATE_KEY, { version: 0, region: null })

/** Whether the stored facts were derived for this version and region. */
export const factsCurrent = (db: Db, region: string) => {
  const s = readFactsState(db)
  return s.version === FACTS_VERSION && s.region === region
}

/**
 * Derives every cached movie's facts again from its stored response, `batch` rows a transaction,
 * yielding between batches so a large library doesn't hold the event loop. Then records the region
 * they follow. Keywords come only from responses fetched since 8d: older rows gain them with the
 * metadata refresh (`metadata.sweep` reaches every library movie within 30 days).
 */
export async function deriveAllFacts(
  db: Db,
  region: string,
  now: number,
  { batch = 250, yieldFn = () => new Promise<void>((r) => setImmediate(r)) } = {},
) {
  let after = 0
  let count = 0
  for (;;) {
    const rows = db
      .select({ tmdbId: movieMetadata.tmdbId, data: movieMetadata.data })
      .from(movieMetadata)
      .where(gt(movieMetadata.tmdbId, after))
      .orderBy(asc(movieMetadata.tmdbId))
      .limit(batch)
      .all()
    if (!rows.length) break
    db.transaction((tx) => {
      for (const row of rows) {
        const movie = row.data as TmdbMovie
        tx.update(movieMetadata)
          .set(movieColumns(movie, region))
          .where(eq(movieMetadata.tmdbId, row.tmdbId))
          .run()
        replaceTerms(tx, { ...movie, id: row.tmdbId })
      }
    })
    count += rows.length
    after = rows[rows.length - 1]?.tmdbId ?? after
    await yieldFn()
  }
  writeSetting(db, FACTS_STATE_KEY, { version: FACTS_VERSION, region } satisfies FactsState, now)
  return count
}

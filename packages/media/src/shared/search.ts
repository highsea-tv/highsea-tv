// SPDX-License-Identifier: AGPL-3.0-only
// Ranking names against what someone typed, for every media type's search. Pure and browser-safe,
// so `@highsea-tv/media/search` hands the same rules to the clients' mock (ADR 0061).
import { fold } from './fold.ts'

export { fold, sortTitleOf } from './fold.ts'

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 2 when a name starts with the query at a word, 1 when it contains it, 0 otherwise. */
export function matchScore(name: string, query: string): number {
  const n = fold(name)
  const q = fold(query)
  if (!q || !n.includes(q)) return 0
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(q)}`, 'u').test(n) ? 2 : 1
}

// ---------------------------------------------------------------- the library's search

/** Each kind's most results (client-search.md, Ranking). */
export const SEARCH_LIMIT = 20
/** How many titles are read, in sort-title order, before they're ranked and cut to the limit. */
export const SEARCH_MOVIE_POOL = SEARCH_LIMIT * 5
/** How many people are read, most titles here first, before they're ranked and cut to the limit. */
export const SEARCH_PEOPLE_POOL = SEARCH_LIMIT * 3

/**
 * Rows ranked by their score, best first, then cut to the limit. Ties keep `tie`'s order, or the
 * order the rows came in (a stable sort), so the read's own order decides between equal matches.
 */
export function rankByMatch<T>(
  rows: readonly T[],
  scoreOf: (row: T) => number,
  tie?: (a: T, b: T) => number,
): T[] {
  return rows
    .map((row, i) => ({ row, i, score: scoreOf(row) }))
    .sort((a, b) => b.score - a.score || (tie ? tie(a.row, b.row) : 0) || a.i - b.i)
    .slice(0, SEARCH_LIMIT)
    .map((x) => x.row)
}

export type RankedSection<M, C, P> =
  | { kind: 'movies'; items: M[] }
  | { kind: 'collections'; items: C[] }
  | { kind: 'people'; items: P[] }

/**
 * The kinds that found anything, the best-matching first by their best name's score; ties keep the
 * order films, collections, people.
 */
export function rankSections<
  M extends { title: string },
  C extends { name: string },
  P extends { name: string },
>(query: string, found: { movies: M[]; collections: C[]; people: P[] }): RankedSection<M, C, P>[] {
  const best = (names: string[]) => Math.max(0, ...names.map((n) => matchScore(n, query)))
  const ranked: { section: RankedSection<M, C, P>; score: number }[] = [
    {
      section: { kind: 'movies', items: found.movies },
      score: best(found.movies.map((m) => m.title)),
    },
    {
      section: { kind: 'collections', items: found.collections },
      score: best(found.collections.map((c) => c.name)),
    },
    {
      section: { kind: 'people', items: found.people },
      score: best(found.people.map((p) => p.name)),
    },
  ]
  return ranked
    .filter((s) => s.section.items.length > 0)
    .map((s, i) => ({ ...s, i }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((s) => s.section)
}

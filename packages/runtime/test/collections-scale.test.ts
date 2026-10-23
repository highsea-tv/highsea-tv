// SPDX-License-Identifier: AGPL-3.0-only
// Smart collections at 100k movies (checkpoint 8d): the owner's example, a genre-and-audio rule, a
// collection named in another's rules, and a day's shuffle with a limit, each one query. The
// sibling of packages/media's library-scale test, here because the SQL lives in the runtime and
// media can't import it.
import { beforeAll, describe, expect, test } from 'bun:test'
import type { RuleCondition, RuleGroup } from '@highsea-tv/api-contract'
import { createFakeClock } from '@highsea-tv/core'
import type { CollectionDef, CollectionLibrary } from '@highsea-tv/curation/collections'
import { migrate, openDatabase } from '@highsea-tv/db'
import type { Movies } from '@highsea-tv/media/movies'
import { createCollectionLibrary } from '../src/collection-library.ts'

const ROWS = 100_000
const GENRES = ['18', '35', '27', '878', '16']
const LANGUAGES = ['en', 'de', 'fr', 'ja']
/**
 * Unlike the library's pages, a collection returns every title it holds, so its cost grows with
 * them: on an idle machine the owner's example (a few thousand titles) takes about 15 ms and a
 * rule matching 20,000 under 250 ms. Generous for slow CI machines.
 */
const BUDGET_MS = 600

let library: CollectionLibrary

beforeAll(() => {
  const { db, raw } = openDatabase(':memory:')
  migrate(raw)
  library = createCollectionLibrary({
    db,
    clock: createFakeClock(Date.parse('2026-10-22T12:00:00Z')),
    movies: { client: { byIds: () => [] } } as unknown as Movies,
  })
  raw.exec('BEGIN')
  for (let i = 0; i < ROWS; i++) {
    const id = `itm_${String(i).padStart(6, '0')}`
    const tmdb = 10_000_000 + i
    const year = i % 50 === 0 ? null : 1900 + (i % 126)
    raw.run(
      `INSERT INTO media_items (id, type, tmdb_id, title, sort_title, year, rating, release_date,
        status, monitored, minimum_availability, quality_profile_id, root_folder, path, added_at,
        updated_at)
       VALUES (?, 'movie', ?, ?, ?, ?, ?, ?, 'available', 1, 'released', 'qp-hd', '/movies', ?, ?, ?)`,
      id,
      tmdb,
      `Movie ${i}`,
      `movie ${(i * 7919) % ROWS}`,
      year,
      (i % 100) / 10,
      year === null ? null : `${year}-01-01`,
      `/movies/${i}`,
      i * 1000,
      i * 1000,
    )
    raw.run(
      `INSERT INTO movie_metadata (tmdb_id, title, original_title, year, vote_average, vote_count,
        popularity, original_language, runtime, language, data, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'en-US', '{}', 0)`,
      tmdb,
      `Movie ${i}`,
      `Movie ${i}`,
      year,
      (i % 100) / 10,
      i % 5000,
      i % 997,
      LANGUAGES[i % LANGUAGES.length],
      60 + (i % 120),
    )
    raw.run(
      `INSERT INTO movie_terms (movie_id, kind, value, label) VALUES (?, 'genre', ?, 'x')`,
      tmdb,
      GENRES[i % GENRES.length],
    )
    // a file on two in three, with its audio
    if (i % 3 !== 0) {
      raw.run(
        `INSERT INTO media_files (id, item_id, path, size, resolution, hdr, video_codec, added_at)
         VALUES (?, ?, ?, ?, ?, 'none', 'h264', 0)`,
        `file_${i}`,
        id,
        `/movies/${i}.mkv`,
        2e9,
        i % 2 ? 1080 : 2160,
      )
      raw.run(
        `INSERT INTO media_file_languages (file_id, kind, language) VALUES (?, 'audio', ?)`,
        `file_${i}`,
        LANGUAGES[(i >> 1) % LANGUAGES.length],
      )
    }
    raw.run(
      `INSERT INTO versions (id, item_id, label, quality_profile_id, file_id, position, created_at)
       VALUES (?, ?, '1080p', 'qp-hd', ?, 0, 0)`,
      `ver_${i}`,
      id,
      i % 3 !== 0 ? `file_${i}` : null,
    )
  }
  raw.exec('COMMIT')
  raw.exec('ANALYZE')
})

/** Timed once warm: the first run fills SQLite's page cache from a fresh database. */
const timed = <T>(fn: () => T): { ms: number; result: T } => {
  fn()
  const started = performance.now()
  const result = fn()
  return { ms: performance.now() - started, result }
}

const cond = (
  id: string,
  field: RuleCondition['field'],
  op: RuleCondition['op'],
  value: RuleCondition['value'],
): RuleCondition => ({ kind: 'condition', id, field, op, value })
const all = (...rules: RuleGroup['rules']): RuleGroup => ({
  kind: 'group',
  id: 'root',
  match: 'all',
  rules,
})
const def = (id: string, rules: RuleGroup, over: Partial<CollectionDef> = {}): CollectionDef => ({
  id,
  rules,
  include: [],
  exclude: [],
  sort: 'rating',
  descending: true,
  limit: null,
  ...over,
})

describe(`smart collections at ${ROWS.toLocaleString('en')} movies`, () => {
  test('released 2010–2020, rated 4.5 or more, in English', () => {
    const example = def(
      'sc-example',
      all(
        cond('a', 'year', 'between', [2010, 2020]),
        cond('b', 'rating', 'atLeast', 4.5),
        cond('c', 'originalLanguage', 'is', 'en'),
      ),
    )
    const { ms, result } = timed(() => library.evaluate(example, () => null))
    expect(result.length).toBeGreaterThan(0)
    expect(result.length).toBeLessThan(ROWS / 10)
    expect(ms).toBeLessThan(BUDGET_MS)
  })

  test('a genre with English audio in 4K, newest first', () => {
    const rules = def(
      'sc-genre',
      all(
        cond('a', 'genre', 'anyOf', ['35']),
        cond('b', 'audioLanguage', 'includes', ['en']),
        cond('c', 'resolution', 'atLeast', '2160'),
      ),
      { sort: 'year' },
    )
    const { ms, result } = timed(() => library.evaluate(rules, () => null))
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((m) => m.playable)).toBe(true)
    expect(ms).toBeLessThan(BUDGET_MS)
  })

  test('a collection named in another’s rules, shuffled for the day, the first 20', () => {
    const inner = def('sc-inner', all(cond('a', 'rating', 'atLeast', 4)))
    const outer = def(
      'sc-outer',
      all(cond('a', 'collection', 'oneOf', ['sc-inner']), cond('b', 'runtime', 'atMost', 90)),
      { sort: 'random', limit: 20 },
    )
    const lookup = (id: string) => (id === 'sc-inner' ? inner : null)
    const { ms, result } = timed(() => library.evaluate(outer, lookup))
    expect(result).toHaveLength(20)
    expect(library.evaluate(outer, lookup)).toEqual(result)
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})

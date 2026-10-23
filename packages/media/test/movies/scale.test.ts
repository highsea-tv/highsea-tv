// SPDX-License-Identifier: AGPL-3.0-only
// The library at 100k movies, through the service: every sort's first page, a page deep in the
// library, each filter and the status counts stay fast. packages/db's library-scale test checks the
// same queries use their indexes; this one checks the service issues them.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { setup } from './helpers.ts'

const ROWS = 100_000
const STATUSES = ['available', 'wanted', 'downloading', 'not-released', 'unmonitored']
const PROFILES = ['qp-any', 'qp-hd', 'qp-uhd']
/** Generous for slow CI machines; locally each call takes a few milliseconds. */
const BUDGET_MS = 60
/**
 * The status counts under a profile or monitored filter read each matching row's status (about
 * 40 ms here): no index covers (profile, status). Still well inside a page load.
 */
const FILTERED_BUDGET_MS = 150

let s: Awaited<ReturnType<typeof setup>>

beforeAll(async () => {
  s = await setup()
  const { raw } = s
  raw.exec('BEGIN')
  for (let i = 0; i < ROWS; i++) {
    raw.run(
      `INSERT INTO media_items (id, type, tmdb_id, title, sort_title, year, rating, release_date,
        status, monitored, minimum_availability, quality_profile_id, root_folder, path, added_at,
        updated_at)
       VALUES (?, 'movie', ?, ?, ?, ?, ?, ?, ?, ?, 'released', ?, '/data/media/movies', ?, ?, ?)`,
      `itm_${String(i).padStart(6, '0')}`,
      10_000_000 + i,
      `Movie ${i}`,
      `movie ${(i * 7919) % ROWS}`,
      i % 50 === 0 ? null : 1900 + (i % 126),
      (i % 100) / 10,
      `${1900 + (i % 126)}-01-01`,
      STATUSES[i % STATUSES.length],
      i % 3 === 0 ? 0 : 1,
      PROFILES[i % PROFILES.length],
      `/data/media/movies/Movie ${i}`,
      i * 1000,
      i * 1000,
    )
    raw.run(
      `INSERT INTO versions (id, item_id, label, quality_profile_id, position, created_at)
       VALUES (?, ?, '1080p', ?, 0, 0)`,
      `ver_${i}`,
      `itm_${String(i).padStart(6, '0')}`,
      PROFILES[i % PROFILES.length],
    )
  }
  raw.exec('COMMIT')
  raw.exec('ANALYZE')
})

afterAll(() => s.cleanup())

const timed = <T>(fn: () => T): { ms: number; result: T } => {
  const started = performance.now()
  const result = fn()
  const ms = performance.now() - started
  return { ms, result }
}

describe(`the library service at ${ROWS.toLocaleString('en')} movies`, () => {
  test('every sort’s first page, both ways, with the counts', () => {
    for (const sort of ['title', 'added', 'year', 'rating'] as const)
      for (const dir of ['asc', 'desc'] as const) {
        const { ms, result } = timed(() => s.movies.list({ sort, dir }))
        expect(result.items).toHaveLength(60)
        expect(result.total).toBe(ROWS)
        expect({ sort, dir, fast: ms < BUDGET_MS }).toEqual({ sort, dir, fast: true })
      }
  })

  test('the counts are right', () => {
    const page = s.movies.list({ limit: 1 })
    expect(page.counts).toEqual({
      all: ROWS,
      available: ROWS / 5,
      wanted: ROWS / 5,
      downloading: ROWS / 5,
      'not-released': ROWS / 5,
      unmonitored: ROWS / 5,
    })
  })

  test('a page deep in the library costs what the first does', () => {
    let cursor: string | null = null
    // walk a few pages, then jump far in with a cursor of the same shape
    for (let i = 0; i < 3; i++) cursor = s.movies.list({ cursor: cursor ?? undefined }).next
    expect(cursor).not.toBeNull()
    const deep = Buffer.from(
      JSON.stringify({ s: 'title', d: 'asc', v: 'movie 50000', i: 'itm_000000' }),
    ).toString('base64url')
    const { ms, result } = timed(() => s.movies.list({ cursor: deep }))
    expect(result.items[0]?.sortTitle).toBe('movie 50000')
    expect(ms).toBeLessThan(BUDGET_MS)
    const year = Buffer.from(
      JSON.stringify({ s: 'year', d: 'desc', v: 1950, i: 'itm_050000' }),
    ).toString('base64url')
    const y = timed(() => s.movies.list({ sort: 'year', cursor: year }))
    expect(y.result.items.every((m) => m.year === null || m.year <= 1950)).toBe(true)
    expect(y.ms).toBeLessThan(BUDGET_MS)
  })

  test('the status, profile and monitored filters, with their counts', () => {
    const cases = [
      { status: 'wanted' as const },
      { qualityProfileId: 'qp-hd' },
      { monitored: 'true' as const },
      { status: 'unmonitored' as const, qualityProfileId: 'qp-any', monitored: false },
    ]
    for (const query of cases) {
      const { ms, result } = timed(() => s.movies.list(query))
      expect(result.items.length).toBeGreaterThan(0)
      expect({ query, fast: ms < FILTERED_BUDGET_MS }).toEqual({ query, fast: true })
    }
  })

  test('Wanted’s lists and the sweep (checkpoint 8a)', () => {
    const missing = timed(() => s.movies.wanted.missing())
    expect(missing.result.items).toHaveLength(60)
    expect(missing.ms).toBeLessThan(FILTERED_BUDGET_MS)
    const cutoff = timed(() => s.movies.wanted.cutoff())
    expect(cutoff.result.total).toBe(0)
    expect(cutoff.ms).toBeLessThan(FILTERED_BUDGET_MS)
    const due = timed(() => s.movies.wanted.takeDue())
    expect(due.result).toHaveLength(20)
    expect(due.ms).toBeLessThan(BUDGET_MS)
    const plan = s.raw
      .all(
        `EXPLAIN QUERY PLAN SELECT id FROM media_items WHERE type = 'movie' AND monitored = 1
         AND (status = 'wanted' OR cutoff_unmet = 1) AND (next_search_at IS NULL OR next_search_at <= 0)
         ORDER BY next_search_at, id LIMIT 20`,
      )
      .map((r) => String((r as { detail: string }).detail))
      .join(' | ')
    expect(plan).toContain('media_items_wanted')
  })

  test('paging to the end of a sort visits every movie once', () => {
    // a filter keeps it to a few thousand rows: the walk itself is what's tested
    const ids = new Set<number>()
    let cursor: string | undefined
    let pages = 0
    do {
      const page = s.movies.list({
        sort: 'year',
        dir: 'asc',
        status: 'wanted',
        qualityProfileId: 'qp-hd',
        cursor,
        limit: 200,
      })
      for (const m of page.items) ids.add(m.id)
      cursor = page.next ?? undefined
      pages++
    } while (cursor)
    expect(ids.size).toBe(s.movies.list({ status: 'wanted', qualityProfileId: 'qp-hd' }).total)
    expect(pages).toBeGreaterThan(1)
  })

  test('a title filter answers in reasonable time', () => {
    const { ms, result } = timed(() => s.movies.list({ title: 'movie 9999' }))
    expect(result.items.map((m) => m.title)).toContain('Movie 9999')
    // a substring scans; it's typed, not paged through
    expect(ms).toBeLessThan(FILTERED_BUDGET_MS * 2)
  })
})

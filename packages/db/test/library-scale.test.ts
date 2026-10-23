// SPDX-License-Identifier: AGPL-3.0-only
// The parent plan designs for 100k items: every library filter and sort has an index, and this test
// seeds 100k movies and checks the queries the library issues use one and stay fast. SQLite's
// EXPLAIN QUERY PLAN says whether a query scans the table or sorts in a temporary B-tree
// (https://sqlite.org/eqp.html); either at 100k rows would make the library slow to page.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { migrate, openDatabase, type RawDatabase } from '../src/index.ts'

const ROWS = 100_000
const STATUSES = ['available', 'wanted', 'downloading', 'not-released', 'unmonitored']
const PROFILES = ['any', 'hd-1080p', 'uhd-2160p']
let raw: RawDatabase

beforeAll(() => {
  raw = openDatabase(':memory:').raw
  migrate(raw)
  raw.exec('BEGIN')
  for (let i = 0; i < ROWS; i++) {
    raw.run(
      `INSERT INTO media_items (id, type, tmdb_id, title, sort_title, year, rating, release_date,
        status, monitored, minimum_availability, quality_profile_id, root_folder, path, added_at,
        updated_at)
       VALUES (?, 'movie', ?, ?, ?, ?, ?, ?, ?, ?, 'released', ?, '/data/media/movies', ?, ?, ?)`,
      `itm_${i}`,
      i + 1,
      `Movie ${i}`,
      `movie ${(i * 7919) % ROWS}`,
      1900 + (i % 126),
      (i % 100) / 10,
      `${1900 + (i % 126)}-01-01`,
      STATUSES[i % STATUSES.length],
      i % 3 === 0 ? 0 : 1,
      PROFILES[i % PROFILES.length],
      `/data/media/movies/Movie ${i}`,
      i * 1000,
      i * 1000,
    )
  }
  raw.exec('COMMIT')
  raw.exec('ANALYZE')
})

afterAll(() => raw.close())

const PAGE = 'LIMIT 60'

/** Each query the library issues: a page of a sort, with or without a filter, and the tab counts. */
const QUERIES: Record<string, string> = {
  'title, A to Z': `SELECT id FROM media_items WHERE type = 'movie' ORDER BY sort_title, id ${PAGE}`,
  'title, Z to A': `SELECT id FROM media_items WHERE type = 'movie' ORDER BY sort_title DESC, id DESC ${PAGE}`,
  'title, after a cursor': `SELECT id FROM media_items WHERE type = 'movie' AND (sort_title, id) > ('movie 5', 'itm_0') ORDER BY sort_title, id ${PAGE}`,
  'date added, newest first': `SELECT id FROM media_items WHERE type = 'movie' ORDER BY added_at DESC, id DESC ${PAGE}`,
  'year, newest first': `SELECT id FROM media_items WHERE type = 'movie' ORDER BY year DESC, id DESC ${PAGE}`,
  'rating, highest first': `SELECT id FROM media_items WHERE type = 'movie' ORDER BY rating DESC, id DESC ${PAGE}`,
  'release date': `SELECT id FROM media_items WHERE type = 'movie' ORDER BY release_date, id ${PAGE}`,
  'a status tab, by title': `SELECT id FROM media_items WHERE type = 'movie' AND status = 'wanted' ORDER BY sort_title, id ${PAGE}`,
  'a quality profile, by title': `SELECT id FROM media_items WHERE type = 'movie' AND quality_profile_id = 'hd-1080p' ORDER BY sort_title, id ${PAGE}`,
  'monitored, by title': `SELECT id FROM media_items WHERE type = 'movie' AND monitored = 1 ORDER BY sort_title, id ${PAGE}`,
  'the tab counts': `SELECT status, count(*) AS n FROM media_items WHERE type = 'movie' GROUP BY status`,
  'the tab counts for a quality profile': `SELECT status, count(*) AS n FROM media_items WHERE type = 'movie' AND quality_profile_id = 'hd-1080p' GROUP BY status`,
  'the tab counts for monitored movies': `SELECT status, count(*) AS n FROM media_items WHERE type = 'movie' AND monitored = 1 GROUP BY status`,
  'one movie by its TMDB id': `SELECT id FROM media_items WHERE type = 'movie' AND tmdb_id = 4242`,
}

const plan = (sql: string) =>
  raw
    .all(`EXPLAIN QUERY PLAN ${sql}`)
    .map((r) => String(r.detail))
    .join('\n')

describe(`the library at ${ROWS.toLocaleString('en')} movies`, () => {
  for (const [name, sql] of Object.entries(QUERIES)) {
    test(`${name} uses an index, without a temporary sort`, () => {
      const p = plan(sql)
      expect(p).not.toMatch(/SCAN media_items(?! USING)/)
      expect(p).not.toContain('TEMP B-TREE')
    })
  }

  test('every page and the counts come back within 20 ms', () => {
    for (const [name, sql] of Object.entries(QUERIES)) {
      const started = performance.now()
      raw.all(sql)
      const ms = performance.now() - started
      expect({ name, fast: ms < 20 }).toEqual({ name, fast: true })
    }
  })

  test('a title filter pages through the title index', () => {
    // a substring can't use a B-tree, but walking the title index in order stops after one page
    const p = plan(
      `SELECT id FROM media_items WHERE type = 'movie' AND title LIKE '%movie 99%' ORDER BY sort_title, id ${PAGE}`,
    )
    expect(p).toContain('media_items_title')
    expect(p).not.toContain('TEMP B-TREE')
  })
})

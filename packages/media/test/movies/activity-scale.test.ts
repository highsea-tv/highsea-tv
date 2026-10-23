// SPDX-License-Identifier: AGPL-3.0-only
// Activity › History, Wanted and the calendar at 100k movies (checkpoint 9a): the pages the parent
// plan's 100k test didn't reach until now. History holds three entries a movie (300k rows), paged
// for everything and for one movie, first and deep; Wanted's Missing and Cutoff unmet, first and
// later pages; the calendar's month, and the feed's 400 days. Each query is checked with EXPLAIN
// QUERY PLAN (https://sqlite.org/eqp.html) to search an index rather than scan `media_items` or
// `history`, as packages/db's library-scale test does for the library.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { CALENDAR_MAX_DAYS } from '../../src/movies/index.ts'
import { setup } from './helpers.ts'

const ROWS = 100_000
const STATUSES = ['available', 'wanted', 'downloading', 'not-released', 'unmonitored']
const HISTORY_TYPES = ['grabbed', 'imported', 'subtitle-downloaded']
const DAY = 86_400_000
/** Generous for slow CI machines, as packages/media's scale test: locally a few milliseconds. */
const BUDGET_MS = 60
/** Wanted's counts read each matching row's status, as the library's filtered counts do. */
const FILTERED_BUDGET_MS = 150

let s: Awaited<ReturnType<typeof setup>>

const pad = (i: number) => String(i).padStart(6, '0')
/** Dates spread over 30 years from 2000, a few hundred movies a month. */
const dateOf = (i: number, plus = 0) =>
  new Date(Date.UTC(2000, 0, 1) + ((i * 7919) % (30 * 365)) * DAY + plus * DAY)
    .toISOString()
    .slice(0, 10)

beforeAll(async () => {
  s = await setup()
  const { raw } = s
  raw.exec('BEGIN')
  for (let i = 0; i < ROWS; i++) {
    const id = `itm_${pad(i)}`
    const status = STATUSES[i % STATUSES.length] as string
    raw.run(
      `INSERT INTO media_items (id, type, tmdb_id, title, sort_title, year, rating, release_date,
        digital_release, physical_release, status, cutoff_unmet, monitored, minimum_availability,
        quality_profile_id, root_folder, path, added_at, updated_at)
       VALUES (?, 'movie', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'released', 'qp-hd', '/data/media/movies', ?, ?, ?)`,
      id,
      10_000_000 + i,
      `Movie ${i}`,
      `movie ${(i * 7919) % ROWS}`,
      Number(dateOf(i).slice(0, 4)),
      (i % 100) / 10,
      dateOf(i),
      dateOf(i, 90),
      dateOf(i, 120),
      status,
      // one available movie in two is under its cutoff: 10k for Cutoff unmet
      status === 'available' && i % 2 === 0 ? 1 : 0,
      i % 3 === 0 ? 0 : 1,
      `/data/media/movies/Movie ${i}`,
      i * 1000,
      i * 1000,
    )
    raw.run(
      `INSERT INTO versions (id, item_id, label, quality_profile_id, position, created_at)
       VALUES (?, ?, '1080p', 'qp-hd', 0, 0)`,
      `ver_${i}`,
      id,
    )
    for (const [k, type] of HISTORY_TYPES.entries())
      raw.run(
        `INSERT INTO history (id, item_id, type, date, source_title, quality)
         VALUES (?, ?, ?, ?, ?, 'Bluray-1080p')`,
        `his_${pad(i)}_${k}`,
        id,
        type,
        i * 1000 + k,
        `Movie.${i}.1080p.BluRay.x264-GRP`,
      )
  }
  raw.exec('COMMIT')
  raw.exec('ANALYZE')
  // seeding takes a few seconds, more on a busy machine than bun's default 5 s allows
}, 60_000)

afterAll(() => s.cleanup())

const timed = <T>(fn: () => T): { ms: number; result: T } => {
  const started = performance.now()
  const result = fn()
  return { ms: performance.now() - started, result }
}

const plan = (sql: string) =>
  s.raw
    .all(`EXPLAIN QUERY PLAN ${sql}`)
    .map((r) => String((r as { detail: string }).detail))
    .join(' | ')

/** No full scan of a big table; a search of an index (`SEARCH t USING INDEX …`) is what we want. */
const noScan = (p: string) => {
  expect(p).not.toMatch(/SCAN (media_items|history|mi|h)(?! USING)/)
}

describe(`Activity › History at ${(ROWS * 3).toLocaleString('en')} entries`, () => {
  test('everything, the first page and one deep in it', () => {
    const first = timed(() => s.media.history.list())
    expect(first.result.items).toHaveLength(50)
    expect(first.result.items[0]?.title).toBe(`Movie ${ROWS - 1}`)
    expect(first.ms).toBeLessThan(BUDGET_MS)
    let cursor = first.result.next
    for (let i = 0; i < 3; i++) cursor = s.media.history.list(cursor ?? undefined).next
    expect(cursor).not.toBeNull()
    const deep = Buffer.from(JSON.stringify({ d: 50_000_000, i: 'his_050000_0' })).toString(
      'base64url',
    )
    const page = timed(() => s.media.history.list(deep))
    expect(page.result.items[0]?.date).toBe(new Date(49_999_002).toISOString())
    expect(page.ms).toBeLessThan(BUDGET_MS)
    const p = plan(
      `SELECT h.id FROM history h JOIN media_items mi ON mi.id = h.item_id
       WHERE (h.date, h.id) < (50000000, 'his_050000_0') ORDER BY h.date DESC, h.id DESC LIMIT 51`,
    )
    noScan(p)
    expect(p).toContain('history_date')
    expect(p).not.toContain('TEMP B-TREE')
  })

  test('one movie’s, the first page and the next', () => {
    const item = 'itm_042424'
    const first = timed(() => s.media.history.forItem(item, undefined, 2))
    expect(first.result.items.map((h) => h.type)).toEqual(['subtitle-downloaded', 'imported'])
    expect(first.ms).toBeLessThan(BUDGET_MS)
    const next = timed(() => s.media.history.forItem(item, first.result.next ?? undefined, 2))
    expect(next.result.items.map((h) => h.type)).toEqual(['grabbed'])
    expect(next.result.next).toBeNull()
    expect(next.ms).toBeLessThan(BUDGET_MS)
    const p = plan(
      `SELECT h.id FROM history h JOIN media_items mi ON mi.id = h.item_id
       WHERE h.item_id = '${item}' ORDER BY h.date DESC, h.id DESC LIMIT 51`,
    )
    noScan(p)
    expect(p).toContain('history_item')
    expect(p).not.toContain('TEMP B-TREE')
  })
})

describe(`Wanted at ${ROWS.toLocaleString('en')} movies`, () => {
  test('Missing: the first page, a later one and its count', () => {
    const first = timed(() => s.movies.wanted.missing())
    expect(first.result.items).toHaveLength(60)
    // wanted is one status in five, and two in three of those are monitored
    expect(first.result.total).toBe(
      s.raw.all(
        `SELECT count(*) AS n FROM media_items WHERE status = 'wanted' AND monitored = 1`,
      )[0]?.n as number,
    )
    expect(first.ms).toBeLessThan(FILTERED_BUDGET_MS)
    let page = first.result
    for (let i = 0; i < 5; i++) page = s.movies.wanted.missing({ cursor: page.next ?? undefined })
    const later = timed(() => s.movies.wanted.missing({ cursor: page.next ?? undefined }))
    expect(later.result.items).toHaveLength(60)
    expect(later.result.items.every((m) => m.status === 'wanted' && m.monitored)).toBe(true)
    expect(later.ms).toBeLessThan(FILTERED_BUDGET_MS)
    const p = plan(
      `SELECT id FROM media_items WHERE type = 'movie' AND status = 'wanted' AND monitored = 1
       AND (sort_title, id) > ('movie 5', 'itm_000000') ORDER BY sort_title, id LIMIT 61`,
    )
    noScan(p)
    expect(p).toContain('media_items_status')
    expect(p).not.toContain('TEMP B-TREE')
    noScan(
      plan(
        `SELECT status, count(*) FROM media_items WHERE type = 'movie' AND monitored = 1
         GROUP BY status`,
      ),
    )
  })

  test('Cutoff unmet: the first page, a later one and its count', () => {
    const first = timed(() => s.movies.wanted.cutoff())
    expect(first.result.items).toHaveLength(60)
    expect(first.result.total).toBe(
      s.raw.all(`SELECT count(*) AS n FROM media_items WHERE cutoff_unmet = 1 AND monitored = 1`)[0]
        ?.n as number,
    )
    expect(first.result.total).toBeGreaterThan(5000)
    expect(first.ms).toBeLessThan(FILTERED_BUDGET_MS)
    let page = first.result
    for (let i = 0; i < 5; i++) page = s.movies.wanted.cutoff({ cursor: page.next ?? undefined })
    const later = timed(() => s.movies.wanted.cutoff({ cursor: page.next ?? undefined }))
    expect(later.result.items).toHaveLength(60)
    expect(later.ms).toBeLessThan(FILTERED_BUDGET_MS)
    const p = plan(
      `SELECT id FROM media_items WHERE type = 'movie' AND monitored = 1 AND cutoff_unmet = 1
       AND (sort_title, id) > ('movie 5', 'itm_000000') ORDER BY sort_title, id LIMIT 61`,
    )
    noScan(p)
    expect(p).toContain('media_items_cutoff')
    expect(p).not.toContain('TEMP B-TREE')
    noScan(
      plan(
        `SELECT status, count(*) FROM media_items WHERE type = 'movie' AND monitored = 1
         AND cutoff_unmet = 1 GROUP BY status`,
      ),
    )
  })
})

describe(`the calendar at ${ROWS.toLocaleString('en')} movies`, () => {
  test('a month: every kind of date in it, soonest first', () => {
    const { ms, result } = timed(() => s.movies.wanted.calendar('2015-03-01', '2015-03-31'))
    expect(result.length).toBeGreaterThan(100)
    expect(new Set(result.map((e) => e.kind))).toEqual(new Set(['cinema', 'digital', 'physical']))
    expect(result.every((e) => e.date >= '2015-03-01' && e.date <= '2015-03-31')).toBe(true)
    expect(result.map((e) => e.date)).toEqual(result.map((e) => e.date).sort())
    expect(ms).toBeLessThan(FILTERED_BUDGET_MS)
  })

  test('the feed’s range (400 days) answers, capped at a chunk a kind', () => {
    const from = '2015-01-01'
    const to = new Date(Date.parse(from) + CALENDAR_MAX_DAYS * DAY).toISOString().slice(0, 10)
    const { ms, result } = timed(() => s.movies.wanted.calendar(from, to))
    expect(result.length).toBeGreaterThan(1000)
    // three range reads of at most a chunk each, plus their movies
    expect(ms).toBeLessThan(FILTERED_BUDGET_MS * 4)
  })

  test('each kind of date reads its own index', () => {
    for (const [column, index] of [
      ['release_date', 'media_items_release'],
      ['digital_release', 'media_items_digital'],
      ['physical_release', 'media_items_physical'],
    ]) {
      const p = plan(
        `SELECT id FROM media_items WHERE type = 'movie' AND ${column} >= '2015-03-01'
         AND ${column} <= '2015-03-31' AND monitored = 1 ORDER BY ${column}, id LIMIT 500`,
      )
      noScan(p)
      expect(p).toContain(index as string)
    }
  })
})

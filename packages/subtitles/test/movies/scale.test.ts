// SPDX-License-Identifier: AGPL-3.0-only
// Subtitles at 100k movies (checkpoint 7's plan, "Data"): the wanted page, a page deep in it, the
// stats and the wanted job's pick stay on their indexes, as checkpoints 4 and 6 checked theirs.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { must } from '../must.ts'
import { setup } from './helpers.ts'

const ROWS = 100_000
/** One movie in ten wants something; one in five has a downloaded track. */
const WANTED_EVERY = 10
const TRACK_EVERY = 5
/** Generous for slow CI machines; locally each call takes a few milliseconds. */
const BUDGET_MS = 60

let s: ReturnType<typeof setup>

beforeAll(() => {
  s = setup({ providers: [] })
  const { raw } = s
  const id = (i: number) => `itm_${String(i).padStart(6, '0')}`
  raw.exec('BEGIN')
  for (let i = 0; i < ROWS; i++) {
    raw.run(
      `INSERT INTO media_items (id, type, tmdb_id, title, sort_title, year, status, monitored,
        minimum_availability, quality_profile_id, language_profile_id, root_folder, path, added_at,
        updated_at)
       VALUES (?, 'movie', ?, ?, ?, 2010, 'available', 1, 'released', 'qp-hd', 'lp-en', '/m', ?, 0, 0)`,
      id(i),
      10_000_000 + i,
      `Movie ${i}`,
      `movie ${(i * 7919) % ROWS}`,
      `/m/Movie ${i}`,
    )
    raw.run(
      `INSERT INTO media_files (id, item_id, path, size, added_at) VALUES (?, ?, ?, 1, 0)`,
      `fil_${i}`,
      id(i),
      `/m/Movie ${i}/Movie ${i}.mkv`,
    )
    if (i % WANTED_EVERY === 0)
      for (const forced of [0, 1])
        raw.run(
          `INSERT INTO subtitle_wanted (item_id, media_file_id, language, forced, hi, next_search_at, searches)
           VALUES (?, ?, 'en', ?, 0, ?, 0)`,
          id(i),
          `fil_${i}`,
          forced,
          i * 1000,
        )
    if (i % TRACK_EVERY === 1)
      raw.run(
        `INSERT INTO subtitle_files (id, media_file_id, item_id, language, forced, hi, format, kind, path,
          provider, score, matches, chosen, sync_status, manual_offset_ms, created_at, updated_at)
         VALUES (?, ?, ?, 'en', 0, 0, 'srt', 'external', ?, 'subdl', 90, '[]', 0, 'unsynced', 0, ?, ?)`,
        `sub_${i}`,
        `fil_${i}`,
        id(i),
        `/m/Movie ${i}/Movie ${i}.en.srt`,
        i,
        i,
      )
  }
  raw.exec('COMMIT')
  raw.exec('ANALYZE')
})

afterAll(() => s.cleanup())

const timed = <T>(fn: () => T): { ms: number; result: T } => {
  const started = performance.now()
  const result = fn()
  return { ms: performance.now() - started, result }
}

describe(`subtitles at ${ROWS.toLocaleString('en')} movies`, () => {
  test('the wanted page’s first page and its total', () => {
    const { ms, result } = timed(() => s.subtitles.wanted())
    expect(result.items).toHaveLength(50)
    expect(result.total).toBe(ROWS / WANTED_EVERY)
    expect(result.items[0]?.missingLanguages).toEqual(['en'])
    expect(ms).toBeLessThan(BUDGET_MS)
  })

  test('a page deep in the list', () => {
    let page = s.subtitles.wanted(undefined, 200)
    for (let i = 0; i < 20; i++) page = s.subtitles.wanted(must(page.next), 200)
    const { ms, result } = timed(() => s.subtitles.wanted(must(page.next), 200))
    expect(result.items).toHaveLength(200)
    expect(ms).toBeLessThan(BUDGET_MS)
  })

  test('the pages cover every wanted movie once', () => {
    const seen = new Set<number>()
    let next: string | null | undefined
    do {
      const page = s.subtitles.wanted(next ?? undefined, 200)
      for (const m of page.items) seen.add(m.movie.id)
      next = page.next
    } while (next)
    expect(seen.size).toBe(ROWS / WANTED_EVERY)
  })

  test('the stats', () => {
    const { ms, result } = timed(() => s.subtitles.stats())
    expect(result).toEqual({
      syncedToday: 0,
      waiting: ROWS / TRACK_EVERY,
      avgOffsetMs: 0,
      avgConfidence: 0,
    })
    expect(ms).toBeLessThan(BUDGET_MS)
  })

  test('the queries use their indexes', () => {
    const plan = (sql: string) =>
      s.raw
        .all(`EXPLAIN QUERY PLAN ${sql}`)
        .map((r) => String(r.detail))
        .join(' | ')
    expect(
      plan(
        `SELECT count(*) FROM subtitle_files WHERE sync_status IN ('queued','syncing','unsynced')`,
      ),
    ).toContain('subtitle_files_sync')
    expect(
      plan(
        `SELECT DISTINCT media_file_id FROM subtitle_wanted WHERE next_search_at <= 5 ORDER BY next_search_at LIMIT 200`,
      ),
    ).toContain('subtitle_wanted_next')
    expect(plan(`SELECT count(DISTINCT item_id) FROM subtitle_wanted`)).not.toMatch(
      /SCAN media_items/,
    )
  })
})

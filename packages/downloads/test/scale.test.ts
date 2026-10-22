// SPDX-License-Identifier: AGPL-3.0-only
// Activity › Queue at 100k downloads (checkpoint 9a): a library of 100,000 movies, each grabbed
// once, nearly all long since imported and let go. The queue reads only what's still in it (the
// active states, and completed downloads still seeding), so its size follows the queue, not the
// history. EXPLAIN QUERY PLAN (https://sqlite.org/eqp.html) checks it reads the partial index
// `downloads_queue` and A6's In the queue card `downloads_item`, never scanning `downloads`. Activity › History is
// packages/media's activity-scale test.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { setup } from './helpers.ts'

const ROWS = 100_000
/** One in a thousand still downloading, one in a thousand still seeding: 200 in the queue. */
const EVERY = 1000
/** Generous for slow CI machines, as packages/media's scale test: locally a few milliseconds. */
const BUDGET_MS = 60

let s: Awaited<ReturnType<typeof setup>>

const pad = (i: number) => String(i).padStart(6, '0')

beforeAll(async () => {
  s = await setup()
  const { raw } = s
  raw.exec('BEGIN')
  for (let i = 0; i < ROWS; i++) {
    const item = `itm_${pad(i)}`
    raw.run(
      `INSERT INTO media_items (id, type, tmdb_id, title, sort_title, year, status, monitored,
        minimum_availability, quality_profile_id, root_folder, path, added_at, updated_at)
       VALUES (?, 'movie', ?, ?, ?, 2000, 'available', 1, 'released', 'qp-hd', '/data/media/movies', ?, ?, ?)`,
      item,
      10_000_000 + i,
      `Movie ${i}`,
      `movie ${i}`,
      `/data/media/movies/Movie ${i}`,
      i * 1000,
      i * 1000,
    )
    const seeding = i % EVERY === 1
    if (seeding)
      raw.run(
        `INSERT INTO torrents (id, info_hash, name, trackers, save_path, category, intent, position,
          added_at)
         VALUES (?, ?, ?, '[]', '/data/downloads', 'movies', 'active', ?, ?)`,
        `tor_${pad(i)}`,
        i.toString(16).padStart(40, '0'),
        `Movie.${i}.1080p.BluRay.x264-GRP`,
        i,
        i * 1000,
      )
    raw.run(
      `INSERT INTO downloads (id, torrent_id, item_id, info_hash, release_title, quality, size,
        release, state, progress_at, grabbed_at, imported_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'Bluray-1080p', 8000000000, '{}', ?, ?, ?, ?, ?)`,
      `dl_${pad(i)}`,
      seeding ? `tor_${pad(i)}` : null,
      item,
      i.toString(16).padStart(40, '0'),
      `Movie.${i}.1080p.BluRay.x264-GRP`,
      i % EVERY === 0 ? 'downloading' : i % 97 === 0 && !seeding ? 'failed' : 'completed',
      i * 1000,
      i * 1000,
      i % EVERY === 0 ? null : i * 1000 + 500,
      i * 1000,
    )
  }
  raw.exec('COMMIT')
  raw.exec('ANALYZE')
  // seeding takes a few seconds, more on a busy machine than bun's default 5 s allows
}, 60_000)

afterAll(() => s.close())

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

describe(`Activity › Queue at ${ROWS.toLocaleString('en')} downloads`, () => {
  test('the queue holds what’s downloading or seeding, newest first', () => {
    const { ms, result } = timed(() => s.downloads.queue())
    expect(result).toHaveLength((ROWS / EVERY) * 2)
    expect(result[0]?.release).toBe(`Movie.${ROWS - EVERY + 1}.1080p.BluRay.x264-GRP`)
    // the engine here holds none of these torrents, so their rows alone say what's in the queue
    expect(result.every((q) => Number(q.id.slice(3)) % EVERY <= 1)).toBe(true)
    expect(ms).toBeLessThan(BUDGET_MS)
    const p = plan(
      `SELECT id FROM downloads WHERE state IN ('downloading', 'importing', 'import-blocked')
       OR (state = 'completed' AND torrent_id IS NOT NULL) ORDER BY grabbed_at DESC`,
    )
    expect(p).not.toMatch(/SCAN downloads(?! USING)/)
    expect(p).toContain('downloads_queue')
    expect(p).not.toContain('TEMP B-TREE')
  })

  test('one movie’s downloads in the queue', () => {
    const { ms, result } = timed(() => s.downloads.queueFor(`itm_${pad(42 * EVERY)}`))
    expect(result.map((q) => q.release)).toEqual([`Movie.${42 * EVERY}.1080p.BluRay.x264-GRP`])
    expect(ms).toBeLessThan(BUDGET_MS)
    const p = plan(
      `SELECT id FROM downloads WHERE item_id = 'itm_042000'
       AND state IN ('downloading', 'importing', 'import-blocked') ORDER BY grabbed_at DESC`,
    )
    expect(p).not.toMatch(/SCAN downloads(?! USING)/)
    expect(p).toContain('downloads_item')
  })
})

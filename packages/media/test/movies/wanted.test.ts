// SPDX-License-Identifier: AGPL-3.0-only
// Wanted (checkpoint 8a): the missing and cutoff-unmet lists, what each movie wants, the backlog
// sweep's backoff on a fake clock, RSS's targets, the calendar's three dates, and the queries'
// use of the partial index `media_items_wanted`.
import { afterEach, describe, expect, test } from 'bun:test'
import { schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'
import { SWEEP_SIZE } from '../../src/movies/index.ts'
import {
  BIG_BUCK_BUNNY,
  CAT_IN_THE_HAT,
  DAY,
  METROPOLIS,
  NOSFERATU,
  SINTEL,
  setup,
  TEARS_OF_STEEL,
} from './helpers.ts'

let s: Awaited<ReturnType<typeof setup>>
afterEach(() => s?.cleanup())

/** Gives a movie's first version a file, as an import would, and settles its status. */
function giveFile(tmdbId: number, sceneName: string, quality: string) {
  const row = s.db
    .select()
    .from(schema.mediaItems)
    .where(eq(schema.mediaItems.tmdbId, tmdbId))
    .get()
  if (!row) throw new Error('not in the library')
  const version = s.db
    .select()
    .from(schema.versions)
    .where(eq(schema.versions.itemId, row.id))
    .get()
  if (!version) throw new Error('no version')
  const fileId = `fil_${tmdbId}`
  s.db
    .insert(schema.mediaFiles)
    .values({
      id: fileId,
      itemId: row.id,
      versionId: version.id,
      path: `${row.path}/${sceneName}.mkv`,
      size: 4 * 1024 ** 3,
      quality,
      sceneName,
      addedAt: s.clock.now(),
    })
    .run()
  s.db.update(schema.versions).set({ fileId }).where(eq(schema.versions.id, version.id)).run()
  s.db
    .update(schema.mediaItems)
    .set({ status: 'available' })
    .where(eq(schema.mediaItems.id, row.id))
    .run()
  return row.id
}

describe('the lists', () => {
  test('missing holds monitored movies without a file; cutoff those under their cutoff', async () => {
    s = await setup()
    await s.add(SINTEL)
    await s.add(BIG_BUCK_BUNNY)
    await s.add(TEARS_OF_STEEL)
    await s.add(METROPOLIS, { monitored: false })
    // not out yet: not missing
    await s.add(CAT_IN_THE_HAT)
    // a WEB 1080p file is under HD 1080p's cutoff (Bluray-1080p); a Bluray x265 one meets it
    giveFile(BIG_BUCK_BUNNY, 'Big.Buck.Bunny.2008.1080p.WEB-DL.DDP5.1.H.264-GRP', 'WEB 1080p')
    giveFile(TEARS_OF_STEEL, 'Tears.of.Steel.2012.1080p.BluRay.x265-GRP', 'Bluray-1080p')
    s.movies.wanted.backfill()

    expect(s.movies.wanted.missing().items.map((m) => m.id)).toEqual([SINTEL])
    expect(s.movies.wanted.cutoff().items.map((m) => m.id)).toEqual([BIG_BUCK_BUNNY])
    expect(s.movies.wanted.wants(SINTEL)).toEqual([
      { versionId: expect.any(String), upgrade: false },
    ])
    expect(s.movies.wanted.wants(BIG_BUCK_BUNNY)).toEqual([
      { versionId: expect.any(String), upgrade: true },
    ])
    expect(s.movies.wanted.wants(TEARS_OF_STEEL)).toEqual([])
    expect(s.movies.wanted.wants(METROPOLIS)).toEqual([])
    expect(
      s.movies.wanted
        .rssTargets()
        .map((t) => t.tmdbId)
        .sort(),
    ).toEqual([SINTEL, BIG_BUCK_BUNNY].sort())
    const sintel = s.movies.wanted.rssTargets().find((t) => t.tmdbId === SINTEL)
    expect(sintel).toMatchObject({ title: 'Sintel', year: 2010, imdbId: 'tt1727587' })
  })

  test('a profile without upgrades leaves its movies off Cutoff unmet', async () => {
    s = await setup()
    await s.add(BIG_BUCK_BUNNY, { versions: [{ label: 'Any', qualityProfileId: 'qp-any' }] })
    giveFile(BIG_BUCK_BUNNY, 'Big.Buck.Bunny.2008.720p.WEB-DL-GRP', 'WEB 720p')
    s.movies.wanted.backfill()
    expect(s.movies.wanted.cutoff().items).toEqual([])
  })
})

describe('the sweep', () => {
  test('takes the movies due, then backs off 1, 3, 7 and 14 days', async () => {
    s = await setup()
    await s.add(SINTEL)
    await s.add(NOSFERATU)
    const first = s.movies.wanted.takeDue()
    expect(first.sort()).toEqual([SINTEL, NOSFERATU].sort())
    // taken again at once: nothing is due
    expect(s.movies.wanted.takeDue()).toEqual([])
    for (const days of [1, 3, 7, 14, 14]) {
      s.clock.advance(days * DAY - 1000)
      expect(s.movies.wanted.takeDue()).toEqual([])
      s.clock.advance(1000)
      expect(s.movies.wanted.takeDue().length).toBe(2)
    }
    // a grab starts the backoff again from a day
    s.movies.wanted.found(SINTEL)
    s.clock.advance(14 * DAY)
    s.movies.wanted.takeDue()
    s.clock.advance(DAY)
    expect(s.movies.wanted.takeDue()).toEqual([SINTEL])
  })

  test('takes at most a sweep’s worth', async () => {
    s = await setup()
    const now = s.clock.now()
    for (let i = 0; i < SWEEP_SIZE + 5; i++)
      s.raw.run(
        `INSERT INTO media_items (id, type, tmdb_id, title, sort_title, status, monitored,
          minimum_availability, quality_profile_id, root_folder, path, added_at, updated_at)
         VALUES (?, 'movie', ?, ?, ?, 'wanted', 1, 'released', 'qp-hd', ?, ?, ?, ?)`,
        `itm_${i}`,
        20_000_000 + i,
        `Movie ${i}`,
        `movie ${i}`,
        s.folder.path,
        `${s.folder.path}/Movie ${i}`,
        now,
        now,
      )
    expect(s.movies.wanted.takeDue().length).toBe(SWEEP_SIZE)
    expect(s.movies.wanted.takeDue().length).toBe(5)
  })

  test('the sweep and RSS read the partial index', async () => {
    s = await setup()
    const plan = (sql: string) =>
      (s.raw.all(`EXPLAIN QUERY PLAN ${sql}`) as { detail: string }[])
        .map((r) => r.detail)
        .join(' | ')
    const wanted = `monitored = 1 AND (status = 'wanted' OR cutoff_unmet = 1)`
    expect(
      plan(
        `SELECT id FROM media_items WHERE type = 'movie' AND ${wanted}
         AND (next_search_at IS NULL OR next_search_at <= 0) ORDER BY next_search_at, id LIMIT 20`,
      ),
    ).toContain('media_items_wanted')
  })
})

describe('the calendar', () => {
  test('each of a monitored movie’s dates is its own entry, soonest first', async () => {
    s = await setup()
    await s.add(CAT_IN_THE_HAT)
    await s.add(SINTEL, { monitored: false })
    s.db
      .update(schema.mediaItems)
      .set({ digitalRelease: '2026-12-01', physicalRelease: '2027-01-20' })
      .where(eq(schema.mediaItems.tmdbId, CAT_IN_THE_HAT))
      .run()
    const entries = s.movies.wanted.calendar('2026-10-01', '2027-02-01')
    expect(entries.map((e) => [e.date, e.kind, e.movie.id])).toEqual([
      ['2026-11-06', 'cinema', CAT_IN_THE_HAT],
      ['2026-12-01', 'digital', CAT_IN_THE_HAT],
      ['2027-01-20', 'physical', CAT_IN_THE_HAT],
    ])
    expect(s.movies.wanted.calendar('2026-12-02', '2027-01-19')).toEqual([])
  })
})

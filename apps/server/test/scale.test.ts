// SPDX-License-Identifier: AGPL-3.0-only
// The booted server at 100k movies (checkpoint 9a): what reads across the whole library and isn't a
// page of it. One runtime, seeded once:
// - the calendar's iCal feed, over its 395-day window, as a calendar app fetches it;
// - the home screen and announcements for 50 people of each role, with featured sections picked by
//   hand, by a rule over the library and for one role, as the apps ask for them;
// - an import list of 5,000 movies (a generic list's most) matched against the library;
// - a backup of the 100k database, read back the way a restore reads it: the manifest, the
//   database's SHA-256, then SQLite's own integrity check.
// The pages' queries have their EXPLAIN QUERY PLAN checks (https://sqlite.org/eqp.html) in the
// packages' scale tests; the home's, which only the runtime puts together, are checked here. The
// budgets are for the whole request.

import type { Database as BunDatabase } from 'bun:sqlite'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { AnnouncementInput, FeaturedSectionInput } from '@highsea-tv/api-contract'
import { silentLogger } from '@highsea-tv/core'
import { openDatabase } from '@highsea-tv/db'
import { createFakeLists } from '@highsea-tv/lists/fake'
import { createReplayFetch } from '@highsea-tv/metadata/replay'
import { beginRestore, DATABASE_NAME, RESTORE_MARKER, type Runtime } from '@highsea-tv/runtime'
import { createApi } from '../src/api/app.ts'
import { bootRuntime, cleanup, clientFor, ORIGIN, tokenFor, withOwner } from './helpers.ts'

const ROWS = 100_000
const PEOPLE = 50
const LIST_SIZE = 5000
const SINTEL = 45745
const GENERIC_URL = 'https://lists.example/everything.json'
const GENRES = [
  { id: 35, name: 'Comedy' },
  { id: 18, name: 'Drama' },
  { id: 27, name: 'Horror' },
  { id: 878, name: 'Science Fiction' },
]
const DAY = 86_400_000
/**
 * Generous for slow CI machines. Locally the feed takes about 200 ms, the list tens of milliseconds
 * and the backup a second or two. A person's home and announcements take about half a second, the
 * slowest under 0.8 s: each genre here holds a quarter of the library, and its rows and rule read
 * all 25,000 of its movies to rank them, as the built-in rows' genre count reads every genre of
 * every movie. Each budget is a few times what it takes.
 */
const FEED_BUDGET_MS = 1000
const HOME_BUDGET_MS = 2000
const LIST_BUDGET_MS = 10_000
const BACKUP_BUDGET_MS = 30_000

let runtime: Runtime
let app: ReturnType<typeof createApi>
let ownerToken: string
let root: string
const people: { id: string; role: 'admin' | 'user'; token: string }[] = []
const lists = createFakeLists()

/** The runtime's own connection: tests run on bun:sqlite, which Drizzle keeps as `$client`. */
const client = () => (runtime.db as unknown as { $client: BunDatabase }).$client

const pad = (i: number) => String(i).padStart(6, '0')
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

beforeAll(async () => {
  runtime = await bootRuntime({ fetch: createReplayFetch(), lists: { fetch: lists.fetch } })
  app = createApi(runtime)
  const { owner, token } = await withOwner(runtime)
  ownerToken = token
  await runtime.metadata.settings.setKey('test-tmdb-key')
  runtime.metadata.settings.update({ region: 'US' })
  root = join(runtime.config.dataDir, 'media', 'movies')
  mkdirSync(root, { recursive: true })
  runtime.media.rootFolders.add(root)

  // release dates two years either side of today, so the feed's window holds thousands
  const now = Date.now()
  const raw = client()
  raw.exec('BEGIN')
  for (let i = 0; i < ROWS; i++) {
    const id = `itm_${pad(i)}`
    const tmdb = 10_000_000 + i
    const released = now + (((i * 7919) % (4 * 365)) - 2 * 365) * DAY
    raw.run(
      `INSERT INTO media_items (id, type, tmdb_id, title, sort_title, year, rating, release_date,
        digital_release, physical_release, status, monitored, minimum_availability,
        quality_profile_id, root_folder, path, added_at, updated_at)
       VALUES (?, 'movie', ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, 'released', 'qp-hd', ?, ?, ?, ?)`,
      [
        id,
        tmdb,
        `Movie ${i}`,
        `movie ${(i * 7919) % ROWS}`,
        new Date(released).getUTCFullYear(),
        (i % 100) / 10,
        dayOf(released),
        dayOf(released + 90 * DAY),
        dayOf(released + 120 * DAY),
        i % 3 === 0 ? 0 : 1,
        root,
        join(root, `Movie ${i}`),
        now - (ROWS - i) * 60_000,
        now,
      ],
    )
    const genre = GENRES[i % GENRES.length] as (typeof GENRES)[number]
    raw.run(
      `INSERT INTO movie_metadata (tmdb_id, title, original_title, year, vote_average, vote_count,
        popularity, original_language, runtime, language, data, fetched_at)
       VALUES (?, ?, ?, ?, ?, 100, 1, 'en', 100, 'en-US', ?, ?)`,
      [
        tmdb,
        `Movie ${i}`,
        `Movie ${i}`,
        new Date(released).getUTCFullYear(),
        (i % 100) / 10,
        JSON.stringify({ id: tmdb, title: `Movie ${i}`, genres: [genre] }),
        now,
      ],
    )
    // the genre as metadata's facts keep it (checkpoint 8d)
    raw.run(`INSERT INTO movie_terms (movie_id, kind, value, label) VALUES (?, 'genre', ?, ?)`, [
      tmdb,
      String(genre.id),
      genre.name,
    ])
    // a file on two in three, so most can be featured
    if (i % 3 !== 0)
      raw.run(
        `INSERT INTO media_files (id, item_id, path, size, resolution, hdr, video_codec, added_at)
         VALUES (?, ?, ?, 2000000000, 1080, 'none', 'h264', 0)`,
        [`file_${i}`, id, join(root, `Movie ${i}`, `Movie ${i}.mkv`)],
      )
    raw.run(
      `INSERT INTO versions (id, item_id, label, quality_profile_id, file_id, position, created_at)
       VALUES (?, ?, '1080p', 'qp-hd', ?, 0, 0)`,
      [`ver_${i}`, id, i % 3 !== 0 ? `file_${i}` : null],
    )
  }
  // 49 more people: a fifth of them admins
  for (let i = 1; i < PEOPLE; i++) {
    const role = i % 5 === 0 ? 'admin' : 'user'
    raw.run(
      `INSERT INTO users (id, username, display_name, role, webauthn_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [`usr_scale_${i}`, `person${i}`, `Person ${i}`, role, `w-scale-${i}`, now, now],
    )
  }
  raw.exec('COMMIT')
  raw.exec('ANALYZE')
  for (let i = 1; i < PEOPLE; i++) {
    const id = `usr_scale_${i}`
    people.push({ id, role: i % 5 === 0 ? 'admin' : 'user', token: tokenFor(runtime, id) })
  }
  expect(owner.id).toBeTruthy()
}, 120_000)

afterAll(() => cleanup())

const timed = async <T>(fn: () => Promise<T>): Promise<{ ms: number; result: T }> => {
  const started = performance.now()
  const result = await fn()
  return { ms: performance.now() - started, result }
}

describe(`the server at ${ROWS.toLocaleString('en')} movies`, () => {
  test('the iCal feed, its whole window', async () => {
    const api = clientFor(app, { token: ownerToken })
    const made = await api.wanted.makeFeedKey()
    const url = new URL(made.url ?? '')
    const { ms, result } = await timed(async () => {
      const res = await app.request(`${ORIGIN}${url.pathname}${url.search}`)
      return { status: res.status, body: await res.text() }
    })
    expect(result.status).toBe(200)
    expect(result.body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(result.body.endsWith('END:VCALENDAR\r\n')).toBe(true)
    // each kind of date is read up to a chunk of the window: well over a thousand events
    expect(result.body.split('BEGIN:VEVENT').length - 1).toBeGreaterThan(1000)
    expect(ms).toBeLessThan(FEED_BUDGET_MS)
  })

  test('the home screen and announcements for 50 people', async () => {
    const owner = clientFor(app, { token: ownerToken })
    const live = () => ({ start: new Date(Date.now() - 60_000).toISOString(), end: null })
    const section = (patch: Partial<FeaturedSectionInput>): FeaturedSectionInput => ({
      title: 'Staff picks',
      tagline: null,
      layout: 'row',
      source: { kind: 'manual', itemIds: [] },
      overrides: [],
      audience: { kind: 'everyone' },
      schedule: live(),
      ...patch,
    })
    const announcement = (patch: Partial<AnnouncementInput>): AnnouncementInput => ({
      title: 'Movie night',
      body: 'Friday at 8.',
      image: null,
      cta: null,
      severity: 'notice',
      placements: ['banner'],
      audience: { kind: 'everyone' },
      schedule: live(),
      acknowledgement: 'dismiss',
      draft: false,
      ...patch,
    })
    await owner.curation.addSection({
      body: section({
        title: 'Tonight',
        layout: 'hero',
        source: { kind: 'manual', itemIds: [10_000_001, 10_000_002, 10_000_004] },
      }),
    })
    await owner.curation.addSection({
      body: section({
        source: { kind: 'manual', itemIds: Array.from({ length: 40 }, (_, i) => 10_000_001 + i) },
      }),
    })
    await owner.curation.addSection({
      body: section({
        title: 'New here',
        source: { kind: 'rule', rule: 'recently-added', value: '30d' },
      }),
    })
    await owner.curation.addSection({
      body: section({ title: 'Laughs', source: { kind: 'rule', rule: 'genre', value: 'Comedy' } }),
    })
    await owner.curation.addSection({
      body: section({
        title: 'For the staff',
        source: { kind: 'rule', rule: 'genre', value: 'Horror' },
        audience: { kind: 'roles', roles: ['admin'] },
      }),
    })
    const everyone = await owner.curation.addAnnouncement({ body: announcement({}) })
    const staff = await owner.curation.addAnnouncement({
      body: announcement({ title: 'Maintenance', audience: { kind: 'roles', roles: ['admin'] } }),
    })

    const times: number[] = []
    for (const person of people) {
      const api = clientFor(app, { token: person.token })
      const { ms, result } = await timed(async () => ({
        home: await api.home.sections({ query: { client: 'tvos' } }),
        announcements: await api.announcements.active({ query: { client: 'tvos' } }),
      }))
      times.push(ms)
      const titles = result.home.map((s) => s.title)
      expect(titles).toEqual(
        expect.arrayContaining(['Tonight', 'Staff picks', 'New here', 'Laughs']),
      )
      expect(titles.includes('For the staff')).toBe(person.role === 'admin')
      expect(result.home.every((s) => s.items.length > 0)).toBe(true)
      expect(result.announcements.map((a) => a.id).sort()).toEqual(
        (person.role === 'admin' ? [everyone.id, staff.id] : [everyone.id]).sort(),
      )
    }
    expect(people.filter((p) => p.role === 'admin')).toHaveLength(9)
    expect(Math.max(...times)).toBeLessThan(HOME_BUDGET_MS)
  }, 120_000)

  test('the home’s queries search their indexes', () => {
    // prepared and finalized, not `query()`'s cached statement, which would stay open and stop the
    // backup's VACUUM INTO ("SQL statements in progress")
    const plan = (query: string) => {
      const statement = client().prepare(`EXPLAIN QUERY PLAN ${query}`)
      try {
        return statement
          .all()
          .map((r) => String((r as { detail: string }).detail))
          .join(' | ')
      } finally {
        statement.finalize()
      }
    }
    const noScan = (p: string) =>
      expect(p).not.toMatch(/SCAN (media_items|movie_terms|mi|t|g)(?! USING)/)
    // a genre rule: the name to TMDB's id, then that genre's movies
    const rule = plan(
      `SELECT mi.tmdb_id FROM media_items mi WHERE mi.type = 'movie' AND mi.tmdb_id IN (
         SELECT t.movie_id FROM movie_terms t WHERE t.kind = 'genre' AND t.value = (
           SELECT g.value FROM movie_terms g WHERE g.kind = 'genre' AND lower(g.label) = lower('comedy') LIMIT 1))
       ORDER BY mi.rating DESC, mi.sort_title, mi.id LIMIT 20`,
    )
    noScan(rule)
    expect(rule).toContain('movie_terms_label')
    expect(rule).toContain('movie_terms_value')
    expect(rule).not.toContain('sqlite_autoindex_movie_terms')
    // the built-in rows' genres, most titles first
    const genres = plan(
      `SELECT t.value, count(*) FROM movie_terms t
       JOIN media_items mi ON mi.type = 'movie' AND mi.tmdb_id = t.movie_id
       WHERE t.kind = 'genre' AND mi.parent_id IS NULL GROUP BY t.value ORDER BY count(*) DESC LIMIT 8`,
    )
    noScan(genres)
    expect(genres).toContain('movie_terms_value')
    expect(
      plan(`SELECT mi.id FROM media_items mi WHERE mi.type = 'movie' AND mi.added_at >= 0
       ORDER BY mi.added_at DESC, mi.id LIMIT 20`),
    ).toContain('media_items_added')
  })

  test('an import list of 5,000 matched against the library', async () => {
    // all but one already here; Sintel, recorded from TMDB, is the one it adds
    lists.generic.set(GENERIC_URL, {
      body: [
        ...Array.from({ length: LIST_SIZE - 1 }, (_, i) => ({
          title: `Movie ${i * 20}`,
          tmdb_id: 10_000_000 + i * 20,
        })),
        { title: 'Sintel', tmdb_id: SINTEL },
      ],
    })
    const list = runtime.lists.add({
      name: 'Everything',
      enabled: false,
      settings: { kind: 'generic', url: GENERIC_URL },
      rootFolder: root,
      qualityProfileId: 'qp-hd',
      languageProfileId: null,
      monitored: true,
      minimumAvailability: 'released',
      searchOnAdd: false,
    })
    const { ms, result } = await timed(() => runtime.lists.sync(list.id))
    expect(result).toMatchObject({
      found: LIST_SIZE,
      added: 1,
      skipped: LIST_SIZE - 1,
      error: null,
    })
    expect(ms).toBeLessThan(LIST_BUDGET_MS)
    // checked again: everything is here now
    expect((await runtime.lists.sync(list.id)).added).toBe(0)
  }, 60_000)

  test('a backup of the whole database, read back as a restore would', async () => {
    const count = (sql: string) => (client().query(sql).get() as { n: number } | null)?.n
    const movies = count(`SELECT count(*) AS n FROM media_items WHERE type = 'movie'`)
    expect(movies).toBeGreaterThanOrEqual(ROWS)
    const { ms, result } = await timed(() => runtime.operations.backups.backUp())
    expect(result.problem).toBeNull()
    expect(ms).toBeLessThan(BACKUP_BUDGET_MS)
    // a restore's first half, on a folder of its own: the manifest, the SHA-256, then in place
    const config = join(runtime.config.configDir, 'restore-check')
    mkdirSync(config, { recursive: true })
    await Bun.write(
      join(config, RESTORE_MARKER),
      JSON.stringify({ id: result.id, file: runtime.operations.backups.path(result.id) }),
    )
    const restored = await timed(async () => beginRestore(config, silentLogger))
    expect(restored.result?.id).toBe(result.id)
    restored.result?.finish()
    expect(restored.ms).toBeLessThan(BACKUP_BUDGET_MS)
    const { raw } = openDatabase(join(config, DATABASE_NAME))
    try {
      expect(raw.all('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }])
      expect(raw.all(`SELECT count(*) AS n FROM media_items WHERE type = 'movie'`)[0]?.n).toBe(
        movies,
      )
      expect(raw.all('SELECT count(*) AS n FROM versions')[0]?.n).toBe(
        count('SELECT count(*) AS n FROM versions'),
      )
    } finally {
      raw.close()
      rmSync(config, { recursive: true, force: true })
    }
  }, 120_000)
})

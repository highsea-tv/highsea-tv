// SPDX-License-Identifier: AGPL-3.0-only
// Smart collections' SQL (checkpoint 8d, ADR 0049) against rows written straight into SQLite:
// every field and comparison, groups, Always and Never include, another collection named in a
// rule (and a loop back), each sort with titles lacking a value last, the limit, the day's shuffle,
// the watch rules for whoever reads it (4.1a),
// the editor's choices and people by role. The service's own behaviour is tested in
// packages/curation against a fake library.
import { beforeAll, describe, expect, test } from 'bun:test'
import type { RuleCondition, RuleGroup } from '@highsea-tv/api-contract'
import { createFakeClock } from '@highsea-tv/core'
import type { CollectionDef, CollectionLibrary } from '@highsea-tv/curation/collections'
import { migrate, openDatabase } from '@highsea-tv/db'
import type { Movies } from '@highsea-tv/media/movies'
import { createCollectionLibrary } from '../src/collection-library.ts'

const DAY = 86_400_000
const NOW = Date.parse('2026-10-22T12:00:00Z')

// TMDB ids
const SINTEL = 1
const METROPOLIS = 2
const TEARS = 3
const NOSFERATU = 4
const SPRING = 5

/** Regions' certifications, mildest first, as `@highsea-tv/metadata` gives them from TMDB's list. */
const US = ['NR', 'G', 'PG', 'PG-13', 'R', 'NC-17']
const GB = ['U', 'PG', '12A', '12', '15', '18', 'R18']
const DE = ['0', '6', '12', '16', '18']
let ratings: string[] | null = US

let library: CollectionLibrary
let raw: ReturnType<typeof openDatabase>['raw']

beforeAll(() => {
  const opened = openDatabase(':memory:')
  raw = opened.raw
  migrate(raw)
  const clock = createFakeClock(NOW)
  const movies = { client: { byIds: () => [] } } as unknown as Movies
  library = createCollectionLibrary({
    db: opened.db,
    clock,
    movies,
    certifications: () => ratings,
  })

  const movie = (m: {
    tmdb: number
    title: string
    year: number | null
    rating: number
    votes: number
    popularity: number
    status: string
    added: number
    language: string | null
    runtime: number | null
    certification: string | null
    collection?: number
    profile?: string
    root?: string
  }) => {
    raw.run(
      `INSERT INTO media_items (id, type, tmdb_id, title, sort_title, year, rating, release_date,
        status, monitored, minimum_availability, quality_profile_id, root_folder, path, added_at,
        updated_at)
       VALUES (?, 'movie', ?, ?, ?, ?, ?, ?, ?, 1, 'released', ?, ?, ?, ?, ?)`,
      `itm_${m.tmdb}`,
      m.tmdb,
      m.title,
      m.title.toLowerCase(),
      m.year,
      m.rating,
      m.year === null ? null : `${m.year}-06-01`,
      m.status,
      m.profile ?? 'qp-hd',
      m.root ?? '/movies',
      `/movies/${m.title}`,
      m.added,
      m.added,
    )
    const collection = m.collection
      ? { id: m.collection, name: 'Blender Open Movies', poster_path: '/c.jpg' }
      : null
    raw.run(
      `INSERT INTO movie_metadata (tmdb_id, title, original_title, year, release_date, vote_average,
        vote_count, popularity, collection_id, original_language, runtime, certification, language,
        data, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en-US', ?, 0)`,
      m.tmdb,
      m.title,
      m.title,
      m.year,
      m.year === null ? null : `${m.year}-06-01`,
      m.rating,
      m.votes,
      m.popularity,
      m.collection ?? null,
      m.language,
      m.runtime,
      m.certification,
      JSON.stringify({
        belongs_to_collection: collection,
        credits: { cast: castOf(m.tmdb), crew: crewOf(m.tmdb) },
      }),
    )
  }
  const people: Record<number, { id: number; name: string }> = {
    100: { id: 100, name: 'Halina Reijn' },
    200: { id: 200, name: 'Colin Levy' },
    300: { id: 300, name: 'Jan Morgenstern' },
    400: { id: 400, name: 'Fritz Lang' },
    500: { id: 500, name: 'Brigitte Helm' },
  }
  const cast: Record<number, number[]> = { [SINTEL]: [100], [TEARS]: [100], [METROPOLIS]: [500] }
  const crew: Record<number, [number, string, string][]> = {
    [SINTEL]: [
      [200, 'Directing', 'Director'],
      [300, 'Sound', 'Original Music Composer'],
    ],
    [TEARS]: [[300, 'Sound', 'Original Music Composer']],
    [METROPOLIS]: [
      [400, 'Directing', 'Director'],
      [400, 'Writing', 'Screenplay'],
    ],
  }
  function castOf(tmdb: number) {
    return (cast[tmdb] ?? []).map((id) => ({ ...people[id], profile_path: null, character: 'x' }))
  }
  function crewOf(tmdb: number) {
    return (crew[tmdb] ?? []).map(([id, , job]) => ({ ...people[id], profile_path: null, job }))
  }

  raw.exec('BEGIN')
  movie({
    tmdb: SINTEL,
    title: 'Sintel',
    year: 2010,
    rating: 7.2,
    votes: 900,
    popularity: 20,
    status: 'available',
    added: NOW - 5 * DAY,
    language: 'en',
    runtime: 15,
    certification: 'PG-13',
    collection: 9,
  })
  movie({
    tmdb: METROPOLIS,
    title: 'Metropolis',
    year: 1927,
    rating: 8.2,
    votes: 3000,
    popularity: 30,
    status: 'available',
    added: NOW - 400 * DAY,
    language: 'de',
    runtime: 153,
    certification: null,
    profile: 'qp-uhd',
    root: '/classics',
  })
  movie({
    tmdb: TEARS,
    title: 'Tears of Steel',
    year: 2012,
    rating: 9,
    votes: 400,
    popularity: 10,
    status: 'wanted',
    added: NOW - 20 * DAY,
    language: 'en',
    runtime: 12,
    certification: 'PG-13',
    collection: 9,
  })
  movie({
    tmdb: NOSFERATU,
    title: 'Nosferatu',
    year: 1922,
    rating: 0,
    votes: 0,
    popularity: 5,
    status: 'not-released',
    added: NOW - 2 * DAY,
    language: 'de',
    runtime: 94,
    certification: 'R',
  })
  movie({
    tmdb: SPRING,
    title: 'Spring',
    year: null,
    rating: 6,
    votes: 50,
    popularity: 1,
    status: 'available',
    added: NOW - 1 * DAY,
    language: 'zxx',
    runtime: null,
    certification: 'G',
  })

  const term = (tmdb: number, kind: string, value: string, label: string) =>
    raw.run(
      'INSERT INTO movie_terms (movie_id, kind, value, label) VALUES (?, ?, ?, ?)',
      tmdb,
      kind,
      value,
      label,
    )
  term(SINTEL, 'genre', '16', 'Animation')
  term(SINTEL, 'genre', '14', 'Fantasy')
  term(TEARS, 'genre', '878', 'Science Fiction')
  term(METROPOLIS, 'genre', '878', 'Science Fiction')
  term(METROPOLIS, 'genre', '18', 'Drama')
  term(NOSFERATU, 'genre', '27', 'Horror')
  term(SINTEL, 'keyword', '1', 'dragon')
  term(TEARS, 'keyword', '2', 'robot')
  term(METROPOLIS, 'keyword', '2', 'robot')
  term(SINTEL, 'studio', '7', 'Blender Studio')
  term(TEARS, 'studio', '7', 'Blender Studio')
  term(METROPOLIS, 'studio', '8', 'UFA')
  term(SINTEL, 'country', 'NL', 'Netherlands')
  term(TEARS, 'country', 'NL', 'Netherlands')
  term(METROPOLIS, 'country', 'DE', 'Germany')

  let n = 0
  for (const [tmdb, list] of Object.entries(crew))
    for (const [person, department, job] of list)
      raw.run(
        `INSERT INTO credits (id, movie_id, person_id, kind, department, role, "order")
         VALUES (?, ?, ?, 'crew', ?, ?, 0)`,
        `cr${n++}`,
        Number(tmdb),
        person,
        department,
        job,
      )
  for (const [tmdb, list] of Object.entries(cast))
    for (const person of list)
      raw.run(
        `INSERT INTO credits (id, movie_id, person_id, kind, department, role, "order")
         VALUES (?, ?, ?, 'cast', 'Acting', 'x', 0)`,
        `cr${n++}`,
        Number(tmdb),
        person,
      )

  const file = (
    tmdb: number,
    f: { resolution: number; hdr: string; codec: string; size: number; edition?: string },
    audio: string[],
    subtitles: string[],
  ) => {
    raw.run(
      `INSERT INTO media_files (id, item_id, path, size, edition, resolution, hdr, video_codec,
        added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      `file_${tmdb}`,
      `itm_${tmdb}`,
      `/movies/${tmdb}.mkv`,
      f.size,
      f.edition ?? null,
      f.resolution,
      f.hdr,
      f.codec,
    )
    raw.run(
      `INSERT INTO versions (id, item_id, label, quality_profile_id, file_id, position, created_at)
       VALUES (?, ?, 'Main', (SELECT quality_profile_id FROM media_items WHERE id = ?), ?, 0, 0)`,
      `ver_${tmdb}`,
      `itm_${tmdb}`,
      `itm_${tmdb}`,
      `file_${tmdb}`,
    )
    for (const l of audio)
      raw.run(
        `INSERT INTO media_file_languages (file_id, kind, language) VALUES (?, 'audio', ?)`,
        `file_${tmdb}`,
        l,
      )
    for (const l of subtitles)
      raw.run(
        `INSERT INTO media_file_languages (file_id, kind, language) VALUES (?, 'subtitle', ?)`,
        `file_${tmdb}`,
        l,
      )
  }
  file(SINTEL, { resolution: 1080, hdr: 'none', codec: 'h264', size: 2e9 }, ['en'], ['de'])
  file(
    METROPOLIS,
    { resolution: 2160, hdr: 'dolby-vision', codec: 'hevc', size: 30e9, edition: 'Restored' },
    ['de'],
    [],
  )
  file(SPRING, { resolution: 720, hdr: 'hdr10', codec: 'av1', size: 1e9 }, ['en', 'fr'], [])
  // a sidecar British English subtitle on Metropolis: `en` matches it
  raw.run(
    `INSERT INTO subtitle_files (id, media_file_id, item_id, language, forced, hi, format, kind,
      path, provider, score, sync_status, created_at, updated_at)
     VALUES ('sub1', 'file_${METROPOLIS}', 'itm_${METROPOLIS}', 'en-GB', 0, 0, 'srt', 'external',
      '/movies/2.en-GB.srt', 'opensubtitles', 90, 'synced', 0, 0)`,
  )
  // versions without files for the wanted titles, so the profile rule has something to read
  raw.run(
    `INSERT INTO versions (id, item_id, label, quality_profile_id, position, created_at)
     VALUES ('ver_${TEARS}', 'itm_${TEARS}', 'Main', 'qp-hd', 0, 0)`,
  )
  raw.run(`INSERT INTO tags (id, label, created_at) VALUES ('tag-kids', 'kids', 0)`)
  raw.run(`INSERT INTO tags (id, label, created_at) VALUES ('tag-restored', 'restored', 0)`)
  raw.run(`INSERT INTO media_item_tags (item_id, tag_id) VALUES ('itm_${SINTEL}', 'tag-kids')`)
  raw.run(`INSERT INTO media_item_tags (item_id, tag_id) VALUES ('itm_${SPRING}', 'tag-kids')`)
  raw.run(
    `INSERT INTO media_item_tags (item_id, tag_id) VALUES ('itm_${METROPOLIS}', 'tag-restored')`,
  )
  raw.run(`INSERT INTO media_item_tags (item_id, tag_id) VALUES ('itm_${METROPOLIS}', 'tag-kids')`)
  raw.exec('COMMIT')
})

let rid = 0
const cond = (
  field: RuleCondition['field'],
  op: RuleCondition['op'],
  value: RuleCondition['value'],
): RuleCondition => ({ kind: 'condition', id: `r${rid++}`, field, op, value })

const group = (match: 'all' | 'any', ...rules: (RuleCondition | RuleGroup)[]): RuleGroup =>
  ({ kind: 'group', id: `g${rid++}`, match, rules }) as RuleGroup

const def = (over: Partial<CollectionDef> = {}): CollectionDef => ({
  id: 'sc-test',
  rules: null,
  include: [],
  exclude: [],
  sort: 'title',
  descending: false,
  limit: null,
  ...over,
})

const saved = new Map<string, CollectionDef>()
const run = (d: CollectionDef, userId: string | null = null) =>
  library.evaluate(d, (id) => saved.get(id) ?? null, userId)
/** The TMDB ids a condition matches for the reader, in title order. */
const match = (c: RuleCondition, userId: string | null = null) =>
  run(def({ rules: group('all', c) }), userId)
    .map((m) => m.tmdbId)
    .sort((a, b) => a - b)

describe('every field and comparison', () => {
  test('title, year, release date and decade', () => {
    expect(match(cond('title', 'contains', 'tel'))).toEqual([SINTEL])
    expect(match(cond('title', 'contains', 'STEEL'))).toEqual([TEARS])
    expect(match(cond('title', 'contains', '%'))).toEqual([])
    expect(match(cond('year', 'is', 2010))).toEqual([SINTEL])
    expect(match(cond('year', 'between', [2012, 2000]))).toEqual([SINTEL, TEARS])
    expect(match(cond('year', 'before', 1927))).toEqual([NOSFERATU])
    expect(match(cond('year', 'after', 2010))).toEqual([TEARS])
    expect(match(cond('year', 'inLast', 16))).toEqual([SINTEL, TEARS])
    expect(match(cond('releaseDate', 'before', '1927-06-01'))).toEqual([NOSFERATU])
    expect(match(cond('releaseDate', 'after', '2010-06-01'))).toEqual([TEARS])
    expect(match(cond('releaseDate', 'inLast', 365 * 20))).toEqual([SINTEL, TEARS])
    expect(match(cond('decade', 'is', '1920'))).toEqual([METROPOLIS, NOSFERATU])
    // no year: not from the 1920s
    expect(match(cond('decade', 'isNot', '1920'))).toEqual([SINTEL, TEARS, SPRING])
  })

  test('ratings, votes and certification', () => {
    // out of 5: 3.6, 4.1, 4.5, unrated, 3.0
    expect(match(cond('rating', 'atLeast', 4.1))).toEqual([METROPOLIS, TEARS])
    expect(match(cond('rating', 'atMost', 3.6))).toEqual([SINTEL, SPRING])
    expect(match(cond('rating', 'between', [3, 3.6]))).toEqual([SINTEL, SPRING])
    expect(match(cond('votes', 'atLeast', 900))).toEqual([SINTEL, METROPOLIS])
    expect(match(cond('certification', 'is', 'PG-13'))).toEqual([SINTEL, TEARS])
    expect(match(cond('certification', 'is', 'NR'))).toEqual([METROPOLIS])
    expect(match(cond('certification', 'isNot', ['PG-13', 'NR']))).toEqual([NOSFERATU, SPRING])
    expect(match(cond('certification', 'atMost', 'PG'))).toEqual([SPRING])
    expect(match(cond('certification', 'atMost', 'R'))).toEqual([SINTEL, TEARS, NOSFERATU, SPRING])
  })

  test('certifications in another region, and without the region’s order', () => {
    // the stored certification follows the server's region (fork A's facts)
    const store = (certs: Record<number, string | null>) => {
      for (const [tmdb, cert] of Object.entries(certs))
        raw.run('UPDATE movie_metadata SET certification = ? WHERE tmdb_id = ?', cert, Number(tmdb))
    }
    try {
      ratings = GB
      store({ [SINTEL]: '12A', [TEARS]: '12', [NOSFERATU]: '18', [SPRING]: 'U' })
      expect(match(cond('certification', 'is', '12A'))).toEqual([SINTEL])
      expect(match(cond('certification', 'isNot', ['12A', 'NR']))).toEqual([
        TEARS,
        NOSFERATU,
        SPRING,
      ])
      // in GB's order 12A comes before 12
      expect(match(cond('certification', 'atMost', '12A'))).toEqual([SINTEL, SPRING])
      expect(match(cond('certification', 'atMost', '12'))).toEqual([SINTEL, TEARS, SPRING])

      ratings = DE
      store({ [SINTEL]: '12', [TEARS]: '6', [NOSFERATU]: '16', [SPRING]: '0' })
      expect(match(cond('certification', 'is', ['0', '6']))).toEqual([TEARS, SPRING])
      expect(match(cond('certification', 'isNot', '16'))).toEqual([
        SINTEL,
        METROPOLIS,
        TEARS,
        SPRING,
      ])
      // ordered by TMDB's order, not as text ('16' < '6')
      expect(match(cond('certification', 'atMost', '12'))).toEqual([SINTEL, TEARS, SPRING])
      expect(match(cond('certification', 'atMost', 'PG'))).toEqual([])

      // not asked yet: "or milder" has no order, so it's the rating itself
      ratings = null
      expect(match(cond('certification', 'atMost', '12'))).toEqual([SINTEL])
      expect(match(cond('certification', 'is', 'NR'))).toEqual([METROPOLIS])
    } finally {
      ratings = US
      store({ [SINTEL]: 'PG-13', [TEARS]: 'PG-13', [NOSFERATU]: 'R', [SPRING]: 'G' })
    }
  })

  test('languages: original, audio (only), subtitles from the file and sidecars', () => {
    expect(match(cond('originalLanguage', 'is', 'de'))).toEqual([METROPOLIS, NOSFERATU])
    expect(match(cond('originalLanguage', 'oneOf', ['de', 'zxx']))).toEqual([
      METROPOLIS,
      NOSFERATU,
      SPRING,
    ])
    expect(match(cond('originalLanguage', 'isNot', 'en'))).toEqual([METROPOLIS, NOSFERATU, SPRING])
    expect(match(cond('audioLanguage', 'includes', ['en']))).toEqual([SINTEL, SPRING])
    expect(match(cond('audioLanguage', 'only', ['en']))).toEqual([SINTEL])
    expect(match(cond('audioLanguage', 'excludes', ['en']))).toEqual([METROPOLIS, TEARS, NOSFERATU])
    expect(match(cond('subtitleLanguage', 'includes', ['en']))).toEqual([METROPOLIS])
    expect(match(cond('subtitleLanguage', 'includes', ['de']))).toEqual([SINTEL])
    expect(match(cond('subtitleLanguage', 'excludes', ['de', 'en']))).toEqual([
      TEARS,
      NOSFERATU,
      SPRING,
    ])
  })

  test('genres, keywords, studios and countries', () => {
    expect(match(cond('genre', 'anyOf', ['878', '27']))).toEqual([METROPOLIS, TEARS, NOSFERATU])
    expect(match(cond('genre', 'allOf', ['878', '18']))).toEqual([METROPOLIS])
    expect(match(cond('genre', 'noneOf', ['878']))).toEqual([SINTEL, NOSFERATU, SPRING])
    expect(match(cond('keyword', 'anyOf', ['2']))).toEqual([METROPOLIS, TEARS])
    expect(match(cond('keyword', 'noneOf', ['2']))).toEqual([SINTEL, NOSFERATU, SPRING])
    expect(match(cond('studio', 'oneOf', ['7']))).toEqual([SINTEL, TEARS])
    expect(match(cond('studio', 'notOneOf', ['7']))).toEqual([METROPOLIS, NOSFERATU, SPRING])
    expect(match(cond('country', 'oneOf', ['DE']))).toEqual([METROPOLIS])
    expect(match(cond('country', 'notOneOf', ['NL']))).toEqual([METROPOLIS, NOSFERATU, SPRING])
  })

  test('runtime and size', () => {
    expect(match(cond('runtime', 'atLeast', 94))).toEqual([METROPOLIS, NOSFERATU])
    expect(match(cond('runtime', 'atMost', 15))).toEqual([SINTEL, TEARS])
    expect(match(cond('runtime', 'between', [10, 14]))).toEqual([TEARS])
    expect(match(cond('size', 'atLeast', 2))).toEqual([SINTEL, METROPOLIS])
    expect(match(cond('size', 'atMost', 2))).toEqual([SINTEL, SPRING])
  })

  test('people, each role on its own', () => {
    expect(match(cond('actor', 'includes', ['100']))).toEqual([SINTEL, TEARS])
    expect(match(cond('actor', 'excludes', ['100']))).toEqual([METROPOLIS, NOSFERATU, SPRING])
    expect(match(cond('director', 'includes', ['400']))).toEqual([METROPOLIS])
    expect(match(cond('writer', 'includes', ['400']))).toEqual([METROPOLIS])
    expect(match(cond('composer', 'includes', ['300']))).toEqual([SINTEL, TEARS])
    // the composer didn't direct anything
    expect(match(cond('director', 'includes', ['300']))).toEqual([])
    expect(match(cond('producer', 'includes', ['300']))).toEqual([])
    expect(match(cond('cinematographer', 'includes', ['200']))).toEqual([])
    expect(match(cond('editor', 'includes', ['200']))).toEqual([])
    expect(match(cond('person', 'includes', ['500', '200']))).toEqual([SINTEL, METROPOLIS])
    expect(match(cond('person', 'excludes', ['100']))).toEqual([METROPOLIS, NOSFERATU, SPRING])
  })

  test('the library: added, status, tags, folder, profile', () => {
    expect(match(cond('added', 'inLast', 7))).toEqual([SINTEL, NOSFERATU, SPRING])
    expect(match(cond('added', 'before', '2025-12-01'))).toEqual([METROPOLIS])
    // after the 16th: from the 17th on
    expect(match(cond('added', 'after', '2026-10-16'))).toEqual([SINTEL, NOSFERATU, SPRING])
    expect(match(cond('status', 'is', 'available'))).toEqual([SINTEL, METROPOLIS, SPRING])
    expect(match(cond('status', 'isNot', ['available', 'wanted']))).toEqual([NOSFERATU])
    expect(match(cond('tag', 'anyOf', ['tag-kids']))).toEqual([SINTEL, METROPOLIS, SPRING])
    expect(match(cond('tag', 'allOf', ['tag-kids', 'tag-restored']))).toEqual([METROPOLIS])
    expect(match(cond('tag', 'noneOf', ['tag-kids']))).toEqual([TEARS, NOSFERATU])
    expect(match(cond('rootFolder', 'is', '/classics'))).toEqual([METROPOLIS])
    expect(match(cond('rootFolder', 'isNot', '/classics'))).toEqual([
      SINTEL,
      TEARS,
      NOSFERATU,
      SPRING,
    ])
    expect(match(cond('qualityProfile', 'is', 'qp-uhd'))).toEqual([METROPOLIS])
    expect(match(cond('qualityProfile', 'isNot', 'qp-uhd'))).toEqual([
      SINTEL,
      TEARS,
      NOSFERATU,
      SPRING,
    ])
  })

  test('the file: resolution, HDR, codec and edition', () => {
    expect(match(cond('resolution', 'is', '1080'))).toEqual([SINTEL])
    expect(match(cond('resolution', 'is', '1080p'))).toEqual([SINTEL])
    expect(match(cond('resolution', 'atLeast', '1080'))).toEqual([SINTEL, METROPOLIS])
    expect(match(cond('hdr', 'is', 'any'))).toEqual([METROPOLIS, SPRING])
    expect(match(cond('hdr', 'is', 'dolby-vision'))).toEqual([METROPOLIS])
    expect(match(cond('hdr', 'is', 'hdr10'))).toEqual([SPRING])
    expect(match(cond('hdr', 'is', 'none'))).toEqual([SINTEL])
    expect(match(cond('videoCodec', 'is', 'HEVC'))).toEqual([METROPOLIS])
    expect(match(cond('videoCodec', 'isNot', 'hevc'))).toEqual([SINTEL, TEARS, NOSFERATU, SPRING])
    expect(match(cond('edition', 'is', 'Restored'))).toEqual([METROPOLIS])
    expect(match(cond('edition', 'isNot', 'Restored'))).toEqual([SINTEL, TEARS, NOSFERATU, SPRING])
  })

  test('TMDB’s collections', () => {
    expect(match(cond('collection', 'oneOf', ['9']))).toEqual([SINTEL, TEARS])
    expect(match(cond('collection', 'notOneOf', ['9']))).toEqual([METROPOLIS, NOSFERATU, SPRING])
  })

  test('watch state is the reader’s: watched, not watched and played lately', () => {
    for (const id of ['ruth', 'sam'])
      raw.run(
        `INSERT INTO users (id, username, display_name, role, webauthn_id, created_at, updated_at)
         VALUES (?, ?, ?, 'user', ?, 0, 0)`,
        id,
        id,
        id,
        `w-${id}`,
      )
    const watched = (user: string, tmdb: number, played: boolean, at: number | null) =>
      raw.run(
        `INSERT INTO watch_history (user_id, item_id, played, play_count, last_played_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        user,
        `itm_${tmdb}`,
        played ? 1 : 0,
        played ? 1 : 0,
        at,
        NOW,
      )
    watched('ruth', SINTEL, true, NOW - 2 * DAY)
    watched('ruth', METROPOLIS, true, NOW - 90 * DAY)
    // marked unwatched again after a viewing: not watched, but the date stays
    watched('ruth', TEARS, false, null)
    watched('sam', SPRING, true, NOW - DAY)
    expect(match(cond('watched', 'is', 'yes'), 'ruth')).toEqual([SINTEL, METROPOLIS])
    expect(match(cond('watched', 'is', 'no'), 'ruth')).toEqual([TEARS, NOSFERATU, SPRING])
    expect(match(cond('watched', 'is', 'yes'), 'sam')).toEqual([SPRING])
    expect(match(cond('lastPlayed', 'inLast', 30), 'ruth')).toEqual([SINTEL])
    expect(match(cond('lastPlayed', 'inLast', 100), 'ruth')).toEqual([SINTEL, METROPOLIS])
    // answered for no one (the admin's counts): nothing has been watched
    expect(match(cond('watched', 'is', 'yes'))).toEqual([])
    expect(match(cond('watched', 'is', 'no'))).toEqual([
      SINTEL,
      METROPOLIS,
      TEARS,
      NOSFERATU,
      SPRING,
    ])
    expect(match(cond('lastPlayed', 'inLast', 30))).toEqual([])
    // a collection named in a rule is answered for the same reader
    saved.set(
      'sc-ruth-seen',
      def({ id: 'sc-ruth-seen', rules: group('all', cond('watched', 'is', 'yes')) }),
    )
    expect(match(cond('collection', 'oneOf', ['sc-ruth-seen']), 'ruth')).toEqual([
      SINTEL,
      METROPOLIS,
    ])
    saved.delete('sc-ruth-seen')
  })
})

describe('putting a collection together', () => {
  test('all, any and a group one level down', () => {
    // released 2010–2020, rated 4.5 or more, in English: the owner's example
    const example = group(
      'all',
      cond('year', 'between', [2010, 2020]),
      cond('rating', 'atLeast', 4.5),
      cond('originalLanguage', 'is', 'en'),
    )
    expect(run(def({ rules: example })).map((m) => m.tmdbId)).toEqual([TEARS])
    const either = group(
      'any',
      cond('genre', 'anyOf', ['27']),
      group('all', cond('originalLanguage', 'is', 'en'), cond('runtime', 'atMost', 12)),
    )
    expect(run(def({ rules: either })).map((m) => m.tmdbId)).toEqual([NOSFERATU, TEARS])
    // an empty group asks nothing
    expect(run(def({ rules: group('all') }))).toHaveLength(5)
  })

  test('Always include joins, Never include wins over both', () => {
    const rules = group('all', cond('originalLanguage', 'is', 'en'))
    const got = run(
      def({ rules, include: [`itm_${METROPOLIS}`, `itm_${SINTEL}`], exclude: [`itm_${SINTEL}`] }),
    )
    expect(got.map((m) => m.tmdbId)).toEqual([METROPOLIS, TEARS])
    expect(got.map((m) => m.playable)).toEqual([true, false])
  })

  test('picked by hand, in the picked order', () => {
    const got = run(
      def({ include: [`itm_${TEARS}`, `itm_${SPRING}`, `itm_${SINTEL}`], sort: 'manual' }),
    )
    expect(got.map((m) => m.tmdbId)).toEqual([TEARS, SPRING, SINTEL])
  })

  test('another collection in a rule, with its own limit; a loop matches nothing', () => {
    saved.set(
      'sc-top',
      def({
        id: 'sc-top',
        rules: group('all', cond('rating', 'atLeast', 3)),
        sort: 'rating',
        descending: true,
        limit: 2,
      }),
    )
    expect(match(cond('collection', 'oneOf', ['sc-top']))).toEqual([METROPOLIS, TEARS])
    expect(match(cond('collection', 'notOneOf', ['sc-top']))).toEqual([SINTEL, NOSFERATU, SPRING])
    expect(match(cond('collection', 'oneOf', ['sc-top', '9']))).toEqual([SINTEL, METROPOLIS, TEARS])
    // a and b name each other: each is answered once, the loop back matches nothing
    saved.set(
      'sc-a',
      def({
        id: 'sc-a',
        rules: group('any', cond('collection', 'oneOf', ['sc-b']), cond('year', 'is', 2010)),
      }),
    )
    saved.set(
      'sc-b',
      def({
        id: 'sc-b',
        rules: group('any', cond('collection', 'oneOf', ['sc-a']), cond('year', 'is', 2012)),
      }),
    )
    expect(run(saved.get('sc-a') as CollectionDef).map((m) => m.tmdbId)).toEqual([SINTEL, TEARS])
    expect(match(cond('collection', 'oneOf', ['sc-gone']))).toEqual([])
  })

  test('every sort both ways, titles without a value last, then the limit', () => {
    const all = (sort: CollectionDef['sort'], descending: boolean, limit: number | null = null) =>
      run(def({ rules: group('all'), sort, descending, limit })).map((m) => m.tmdbId)
    expect(all('title', false)).toEqual([METROPOLIS, NOSFERATU, SINTEL, SPRING, TEARS])
    expect(all('title', true)).toEqual([TEARS, SPRING, SINTEL, NOSFERATU, METROPOLIS])
    // Nosferatu has no rating: last both ways
    expect(all('rating', true)).toEqual([TEARS, METROPOLIS, SINTEL, SPRING, NOSFERATU])
    expect(all('rating', false)).toEqual([SPRING, SINTEL, METROPOLIS, TEARS, NOSFERATU])
    expect(all('year', false)).toEqual([NOSFERATU, METROPOLIS, SINTEL, TEARS, SPRING])
    expect(all('year', true)).toEqual([TEARS, SINTEL, METROPOLIS, NOSFERATU, SPRING])
    expect(all('release', true)).toEqual([TEARS, SINTEL, METROPOLIS, NOSFERATU, SPRING])
    expect(all('added', true)).toEqual([SPRING, NOSFERATU, SINTEL, TEARS, METROPOLIS])
    expect(all('runtime', false)).toEqual([TEARS, SINTEL, NOSFERATU, METROPOLIS, SPRING])
    expect(all('popularity', true)).toEqual([METROPOLIS, SINTEL, TEARS, NOSFERATU, SPRING])
    expect(all('rating', true, 2)).toEqual([TEARS, METROPOLIS])
  })

  test('shuffled: the same all day, every title once', () => {
    const once = run(def({ rules: group('all'), sort: 'random' })).map((m) => m.tmdbId)
    const again = run(def({ rules: group('all'), sort: 'random' })).map((m) => m.tmdbId)
    expect(again).toEqual(once)
    expect([...once].sort()).toEqual([SINTEL, METROPOLIS, TEARS, NOSFERATU, SPRING])
    // another collection shuffles its own way (the seed is the day and the collection)
    const orders = new Set(
      Array.from({ length: 8 }, (_, i) =>
        run(def({ id: `sc-${i}`, rules: group('all'), sort: 'random' }))
          .map((m) => m.tmdbId)
          .join(),
      ),
    )
    expect(orders.size).toBeGreaterThan(1)
  })
})

describe('the editor’s choices', () => {
  test('from what the library holds', () => {
    expect(library.options('decade').map((o) => o.label)).toEqual(['1920s', '2010s'])
    expect(library.options('genre').map((o) => o.label)).toEqual([
      'Animation',
      'Drama',
      'Fantasy',
      'Horror',
      'Science Fiction',
    ])
    expect(library.options('originalLanguage').find((o) => o.value === 'de')?.label).toBe('German')
    expect(library.options('audioLanguage').map((o) => o.value)).toEqual(['en', 'fr', 'de'])
    expect(library.options('subtitleLanguage').map((o) => o.value)).toEqual(['en', 'de'])
    expect(library.options('collection')).toEqual([{ value: '9', label: 'Blender Open Movies' }])
    expect(library.options('tag').map((o) => o.label)).toEqual(['kids', 'restored'])
    expect(library.options('rootFolder').map((o) => o.value)).toEqual(['/classics', '/movies'])
    expect(library.options('videoCodec').map((o) => o.label)).toEqual(['AV1', 'H.264', 'HEVC'])
    expect(library.options('edition').map((o) => o.value)).toEqual(['Restored'])
  })

  test('people by name, by role, and their names back', () => {
    expect(library.people('morgen', 'composer', 20).map((p) => [p.id, p.titles])).toEqual([
      [300, 2],
    ])
    expect(library.people('morgen', 'director', 20)).toEqual([])
    expect(library.people('lang', 'writer', 20).map((p) => p.name)).toEqual(['Fritz Lang'])
    expect(library.people('l', undefined, 20).map((p) => p.name)).toContain('Halina Reijn')
    expect(library.people('reijn', 'actor', 20).map((p) => p.titles)).toEqual([2])
    expect([...library.personNames([300, 500, 999])]).toEqual([
      [300, 'Jan Morgenstern'],
      [500, 'Brigitte Helm'],
    ])
  })

  test('TMDB’s collections, with only what can be played', () => {
    expect(library.tmdbCollections().map((c) => [c.id, c.tmdbIds])).toEqual([[9, [SINTEL]]])
  })
})

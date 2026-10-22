// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '@highsea/core'
import { readSetting, schema, writeSetting } from '@highsea/db'
import { eq } from 'drizzle-orm'
import {
  CHANGES_STATE_KEY,
  credentialOf,
  isNoKeyError,
  JOB_TYPES,
  leaksCredential,
  METADATA_SETTINGS_KEY,
  parseImageUrl,
  type Recording,
  recordingName,
  TMDB_ATTRIBUTION,
} from '../src/index.ts'
import { certificationFor } from '../src/map.ts'
import { RECORDINGS_DIR, ReplayMissError } from '../src/replay.ts'
import type { TmdbMovie } from '../src/tmdb/types.ts'
import { DAY, setup, TEST_KEY } from './helpers.ts'

let cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})
const open = async (options?: Parameters<typeof setup>[0]) => {
  const t = await setup(options)
  cleanups.push(t.cleanup)
  return t
}

const rejects = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e
  }
  throw new Error('expected a rejection')
}

describe('the adapter, against the recordings', () => {
  test('a movie maps to the domain types, with art served by the server', async () => {
    const { metadata, db } = await open()
    const m = await metadata.movie(19)
    expect(m.id).toBe(19)
    expect(m.title).toBe('Metropolis')
    expect(m.year).toBe(1927)
    expect(m.runtimeMinutes).toBe(148)
    expect(m.genres).toEqual(['Drama', 'Science Fiction'])
    expect(m.rating).toBeGreaterThan(7)
    expect(m.voteCount).toBeGreaterThan(1000)
    expect(m.imdbId).toBe('tt0017136')
    expect(m.wikidataId).toBe('Q151599')
    expect(m.cast[0]?.name).toBe('Gustav Fröhlich')
    expect(m.crew.find((c) => c.job === 'Director')).toMatchObject({
      personId: 68,
      name: 'Fritz Lang',
      department: 'Directing',
    })
    expect(m.art.poster).toBe('/api/v1/images/movie/19/poster/w342/kr9wXRN23zLuWJIelahas1mtnYj.jpg')
    expect(m.videos[0]?.still).toBe(m.art.still)
    expect(m.videos[0]?.kind).toBe('Trailer')
    expect(m.collection).toBeNull()
    // opening a movie caches it and writes nothing to the library
    expect(
      db
        .select()
        .from(schema.movieMetadata)
        .all()
        .map((r) => r.tmdbId),
    ).toEqual([19])
    expect(db.select().from(schema.credits).all().length).toBe(m.cast.length + m.crew.length)
    expect(db.select().from(schema.mediaItems).all()).toEqual([])
  })

  test('a second read comes from the cache', async () => {
    const { metadata, fetch } = await open()
    await metadata.movie(19)
    await metadata.movie(19)
    expect(fetch.requests.filter((r) => r.startsWith('GET /3/movie/19'))).toHaveLength(1)
  })

  test('a region change needs no refetch', async () => {
    const { metadata, fetch } = await open()
    await metadata.settings.update({ region: 'US' })
    expect((await metadata.movie(19)).certification).toBe('NR')
    await metadata.settings.update({ region: 'GB' })
    expect((await metadata.movie(19)).certification).toBe('PG')
    expect(fetch.requests).toHaveLength(1)
  })

  test('collections, people, search and the four lists', async () => {
    const { metadata } = await open()
    expect((await metadata.movie(253777)).collection).toEqual({
      id: 339473,
      name: 'Caminandes Collection',
    })
    const c = await metadata.collection(339473)
    expect(c.parts.map((p) => p.id)).toEqual([253777, 253774, 406956])
    expect(c.art.poster).toStartWith('/api/v1/images/collection/339473/poster/w342/')

    const lang = await metadata.person(68)
    expect(lang.name).toBe('Fritz Lang')
    expect(lang.knownFor).toBe('Directing')
    expect(lang.born).toEqual({ date: '1890-12-05', place: 'Vienna, Austria' })
    expect(lang.died).toEqual({ date: '1976-08-02' })
    expect(lang.imdbId).toBe('nm0000485')
    const metropolis = lang.credits.filter((c) => c.id === 19)
    expect(metropolis.map((c) => [c.department, c.role]).sort()).toEqual([
      ['Directing', 'Director'],
      ['Editing', 'Editor'],
      ['Writing', 'Screenplay'],
    ])
    const dated = lang.credits.filter((c) => c.releaseDate).map((c) => c.releaseDate as string)
    expect(dated).toEqual([...dated].sort().reverse())

    const found = await metadata.discover.search('sintel')
    expect(found.results[0]?.id).toBe(45745)
    expect(found.page).toBe(1)
    expect(found.totalResults).toBeGreaterThan(found.results.length)
    for (const list of ['trending', 'popular', 'now-playing', 'upcoming'] as const)
      expect((await metadata.discover.list(list)).results.length).toBeGreaterThan(10)
  })

  test('a movie not released yet', async () => {
    const { metadata } = await open()
    await metadata.settings.update({ region: 'US' })
    const m = await metadata.movie(1117898)
    expect(m.status).toBe('Post Production')
    expect(m.releases.theatrical).toBe('2026-11-06')
    expect(m.certification).toBe('PG')
  })

  test('a request with no recording fails, and isn’t retried', async () => {
    const { metadata, fetch } = await open()
    expect(await rejects(metadata.movie(603))).toBeInstanceOf(ReplayMissError)
    expect(fetch.requests).toHaveLength(1)
  })
})

describe('the key', () => {
  test('a good key is validated and stored sealed, and never returned', async () => {
    const { metadata, db } = await open({ key: false })
    expect(metadata.settings.get().key).toEqual({ set: false, last4: null })
    const view = await metadata.settings.setKey(TEST_KEY)
    expect(view.key).toEqual({ set: true, last4: '0001' })
    expect(view.language).toBe('en-US')
    const row = db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, METADATA_SETTINGS_KEY))
      .get()
    expect(JSON.stringify(row?.value)).not.toContain(TEST_KEY)
    expect(JSON.stringify(view)).not.toContain(TEST_KEY)
  })

  test('with the key, each region’s certifications from mildest; none known before', async () => {
    const { metadata } = await open({ key: false })
    expect(metadata.certifications('US')).toBeNull()
    await metadata.settings.setKey(TEST_KEY)
    expect(metadata.certifications('US')?.map((c) => c.certification)).toEqual([
      'NR',
      'G',
      'PG',
      'PG-13',
      'R',
      'NC-17',
    ])
    expect(metadata.certifications('GB')?.map((c) => c.certification)).toEqual([
      'U',
      'PG',
      '12A',
      '12',
      '15',
      '18',
      'R18',
    ])
    expect(metadata.certifications('DE')?.[0]).toEqual({ certification: '0', order: 1 })
    // a country TMDB lists nothing for
    expect(metadata.certifications('AQ')).toEqual([])
    metadata.settings.update({ region: 'DE' })
    expect(metadata.certifications()?.map((c) => c.certification)).toEqual([
      '0',
      '6',
      '12',
      '16',
      '18',
    ])
  })

  test('a key TMDB refuses is the owner’s to fix', async () => {
    const { metadata } = await open({ key: false })
    const e = (await rejects(metadata.settings.setKey('invalid-key-0000'))) as AppError
    expect(e).toBeInstanceOf(AppError)
    expect(e.code).toBe('invalid')
    expect(e.message).toBe('TMDB didn’t accept that key. Copy it again from your TMDB account.')
    expect(metadata.settings.get().key.set).toBe(false)
  })

  test('without a key, TMDB is out of reach but the cache still reads', async () => {
    const { metadata } = await open()
    await metadata.movie(19)
    metadata.settings.clearKey()
    const e = await rejects(metadata.discover.search('metropolis'))
    expect(isNoKeyError(e)).toBe(true)
    expect((e as AppError).message).toBe('Add a TMDB key to find movies.')
    expect((e as AppError).code).toBe('unavailable')
    expect(isNoKeyError(await rejects(metadata.movie(653)))).toBe(true)
    expect((await metadata.movie(19)).title).toBe('Metropolis')
  })

  test('credentials are told apart by shape', () => {
    expect(credentialOf('0123456789abcdef0123456789abcdef').kind).toBe('api-key')
    expect(credentialOf('eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.c2lnbmF0dXJl').kind).toBe('token')
  })

  test('the token goes in a bearer header, the key in the query', async () => {
    const seen: { auth: string | null; url: string }[] = []
    const { metadata } = await open({
      key: false,
      onRequest: (url, init) => {
        seen.push({ auth: new Headers(init?.headers).get('authorization'), url: url.search })
        return undefined
      },
    })
    await metadata.settings.setKey('eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.c2lnbmF0dXJl')
    expect(seen[0]?.auth).toBe('Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.c2lnbmF0dXJl')
    expect(seen[0]?.url).toBe('')
    seen.length = 0
    await metadata.settings.setKey(TEST_KEY)
    expect(seen[0]?.auth).toBeNull()
    expect(seen[0]?.url).toBe(`?api_key=${TEST_KEY}`)
  })
})

describe('rate limits', () => {
  const limited = (times: number, headers: Record<string, string> = {}, status = 429) => {
    let left = times
    return (url: URL) => {
      if (!url.pathname.startsWith('/3/movie/19') || left-- <= 0) return undefined
      return Response.json(
        { status_code: 25, status_message: 'Your request count is over the allowed limit.' },
        { status, headers },
      )
    }
  }

  test('429 waits as long as Retry-After asks, on the injected clock', async () => {
    const { metadata, waits, clock } = await open({ onRequest: limited(2, { 'retry-after': '3' }) })
    const before = clock.now()
    expect((await metadata.movie(19)).title).toBe('Metropolis')
    expect(waits).toEqual([3000, 3000])
    expect(clock.now() - before).toBe(6000)
  })

  test('without Retry-After, the waits double; 5xx is retried too', async () => {
    const t = await open({ onRequest: limited(3, {}, 503) })
    expect((await t.metadata.movie(19)).title).toBe('Metropolis')
    expect(t.waits).toEqual([1000, 2000, 4000])
  })

  test('still limited after every try: rate-limited', async () => {
    const { metadata, waits } = await open({ onRequest: limited(10) })
    const e = (await rejects(metadata.movie(19))) as AppError
    expect(e.code).toBe('rate-limited')
    expect(waits).toHaveLength(3)
  })
})

describe('certification by region', () => {
  const movie = (us: { type: number; certification: string; date: string }[]): TmdbMovie => ({
    id: 1,
    title: 'T',
    original_title: 'T',
    original_language: 'en',
    release_dates: {
      results: [
        {
          iso_3166_1: 'US',
          release_dates: us.map((r) => ({
            type: r.type,
            certification: r.certification,
            release_date: `${r.date}T00:00:00.000Z`,
          })),
        },
        {
          iso_3166_1: 'DE',
          release_dates: [{ type: 3, certification: '12', release_date: '2020-01-01' }],
        },
      ],
    },
  })

  test('theatrical first, then limited, then digital, then any', () => {
    const all = [
      { type: 1, certification: 'P', date: '2019-01-01' },
      { type: 5, certification: 'V', date: '2019-02-01' },
      { type: 4, certification: 'D', date: '2019-03-01' },
      { type: 2, certification: 'L', date: '2019-04-01' },
      { type: 3, certification: 'R', date: '2019-05-01' },
    ]
    expect(certificationFor(movie(all), 'US')).toBe('R')
    expect(certificationFor(movie(all.slice(0, 4)), 'US')).toBe('L')
    expect(certificationFor(movie(all.slice(0, 3)), 'US')).toBe('D')
    expect(certificationFor(movie(all.slice(0, 2)), 'US')).toBe('P')
    expect(certificationFor(movie(all), 'DE')).toBe('12')
    expect(certificationFor(movie(all), 'FR')).toBeNull()
  })

  test('a release without a certification is passed over', () => {
    const m = movie([
      { type: 3, certification: '', date: '2019-01-01' },
      { type: 4, certification: 'PG', date: '2019-02-01' },
    ])
    expect(certificationFor(m, 'US')).toBe('PG')
  })
})

describe('recommendations', () => {
  test('TMDB’s recommendations when it has them', async () => {
    const { metadata, fetch } = await open()
    const recs = await metadata.recommendations(19)
    expect(recs.length).toBeGreaterThan(0)
    expect(fetch.requests.some((r) => r.includes('/similar'))).toBe(false)
  })

  test('its "similar" list when there are none, kept with the movie', async () => {
    const { metadata, fetch } = await open()
    const recs = await metadata.recommendations(406956)
    expect(recs.map((r) => r.id)).toContain(253777)
    await metadata.recommendations(406956)
    expect(fetch.requests.filter((r) => r.includes('/similar'))).toHaveLength(1)
  })
})

describe('when TMDB has no such id', () => {
  test('an id it never had is not found', async () => {
    const { metadata, db } = await open()
    const e = (await rejects(metadata.movie(999999999))) as AppError
    expect(e.code).toBe('not-found')
    expect(e.message).toBe('TMDB has no movie with that id.')
    expect(db.select().from(schema.movieMetadata).all()).toEqual([])
  })

  test('a library movie TMDB removed keeps its rows, marked gone', async () => {
    let gone = false
    const t = await open({
      onRequest: (url) =>
        gone && url.pathname === '/3/movie/19'
          ? Response.json(
              { success: false, status_code: 34, status_message: 'Not found.' },
              { status: 404 },
            )
          : undefined,
    })
    await t.metadata.movie(19)
    t.addToLibrary(19)
    gone = true
    t.metadata.refresh(19)
    await t.drain()
    const m = await t.metadata.movie(19)
    expect(m.title).toBe('Metropolis')
    expect(m.goneAt).toBe(t.clock.now())
    expect(t.seen.filter((e) => e.topic === 'metadata.updated').at(-1)?.ids).toEqual(['movie:19'])
  })
})

describe('refresh', () => {
  test('the job writes the latest and fetched_at, and running it twice changes nothing', async () => {
    const t = await open()
    await t.metadata.movie(19)
    t.clock.advance(DAY)
    t.metadata.refresh(19)
    t.metadata.refresh(19)
    expect(t.jobs.list({ type: JOB_TYPES.refresh, status: ['queued'] })).toHaveLength(1)
    await t.drain()
    const row = () =>
      t.db.select().from(schema.movieMetadata).where(eq(schema.movieMetadata.tmdbId, 19)).get()
    expect(row()?.fetchedAt).toBe(t.clock.now())
    const credits = t.db.select().from(schema.credits).all().length
    await t.metadata.refreshNow('movie', 19)
    expect(t.db.select().from(schema.credits).all().length).toBe(credits)
    expect(t.seen.filter((e) => e.topic === 'metadata.updated').length).toBe(2)
  })
})

describe('the changes job', () => {
  const state = (t: Awaited<ReturnType<typeof setup>>) =>
    readSetting(t.db, CHANGES_STATE_KEY, { lastRunAt: null as number | null })

  test('inside the window: refreshes the cached movies and people TMDB lists', async () => {
    const t = await open()
    await t.metadata.movie(19)
    await t.metadata.movie(653)
    await t.metadata.movie(234)
    await t.metadata.person(68)
    writeSetting(t.db, CHANGES_STATE_KEY, { lastRunAt: t.clock.now() - DAY }, t.clock.now())
    t.fetch.requests.length = 0
    expect(await t.metadata.jobs.runChanges()).toEqual({ mode: 'changes', queued: 3 })
    expect(t.fetch.requests).toEqual([
      'GET /3/movie/changes?start_date=2026-10-16&end_date=2026-10-17&page=1',
      'GET /3/person/changes?start_date=2026-10-16&end_date=2026-10-17&page=1',
    ])
    const queued = t.jobs.list({ type: JOB_TYPES.refresh }).map((j) => j.payload)
    expect(queued).toContainEqual({ kind: 'movie', id: 19 })
    expect(queued).toContainEqual({ kind: 'movie', id: 653 })
    expect(queued).toContainEqual({ kind: 'person', id: 68 })
    expect(state(t).lastRunAt).toBe(t.clock.now())
    await t.drain()
    const ids = t.seen.filter((e) => e.topic === 'metadata.updated').flatMap((e) => e.ids ?? [])
    expect(ids.sort()).toEqual(['movie:19', 'movie:653', 'person:68'])
  })

  test('past 14 days: everything older than a week is refreshed instead', async () => {
    const t = await open()
    await t.metadata.movie(19)
    await t.metadata.movie(653)
    t.db
      .update(schema.movieMetadata)
      .set({ fetchedAt: t.clock.now() - 8 * DAY })
      .where(eq(schema.movieMetadata.tmdbId, 19))
      .run()
    writeSetting(t.db, CHANGES_STATE_KEY, { lastRunAt: t.clock.now() - 15 * DAY }, t.clock.now())
    t.fetch.requests.length = 0
    expect(await t.metadata.jobs.runChanges()).toEqual({ mode: 'fallback', queued: 1 })
    expect(t.fetch.requests.some((r) => r.includes('/changes'))).toBe(false)
    expect(t.jobs.list({ type: JOB_TYPES.refresh }).map((j) => j.payload)).toEqual([
      { kind: 'movie', id: 19 },
    ])
  })

  test('exactly 14 days is still inside the window; the first run falls back', async () => {
    const t = await open()
    writeSetting(t.db, CHANGES_STATE_KEY, { lastRunAt: t.clock.now() - 14 * DAY }, t.clock.now())
    const onDay = await rejects(t.metadata.jobs.runChanges())
    // inside the window it asks TMDB for the changes (here: a day with no recording)
    expect(onDay).toBeInstanceOf(ReplayMissError)
    const fresh = await open()
    expect((await fresh.metadata.jobs.runChanges()).mode).toBe('fallback')
  })

  test('without a key it does nothing', async () => {
    const t = await open({ key: false })
    expect(await t.metadata.jobs.runChanges()).toEqual({ mode: 'skipped', queued: 0 })
  })
})

describe('the spread full refresh', () => {
  test('the oldest 1/25th each day, and anything near 30 days', async () => {
    const t = await open()
    const ids = [19, 653, 234, 832, 669, 5998, 775]
    for (const [i, id] of ids.entries()) {
      await t.metadata.movie(id)
      t.addToLibrary(id)
      t.db
        .update(schema.movieMetadata)
        .set({ fetchedAt: t.clock.now() - i * 5 * DAY })
        .where(eq(schema.movieMetadata.tmdbId, id))
        .run()
    }
    t.addToLibrary(45745) // in the library, not cached yet
    t.db.delete(schema.movieMetadata).where(eq(schema.movieMetadata.tmdbId, 45745)).run()
    const { queued } = t.metadata.jobs.runSweep()
    const payloads = t.jobs.list({ type: JOB_TYPES.refresh }).map((j) => j.payload)
    // 45745 isn't cached; 775 is the oldest (a share of ceil(7/25) = 1) and 30 days old
    expect(payloads).toContainEqual({ kind: 'movie', id: 45745 })
    expect(payloads).toContainEqual({ kind: 'movie', id: 775 })
    expect(payloads).not.toContainEqual({ kind: 'movie', id: 19 })
    expect(queued).toBe(2)
  })
})

describe('the six-month purge', () => {
  test('removes what’s too old, unless the library refers to it, with its images', async () => {
    const t = await open()
    await t.metadata.movie(253777) // in the library, in the Caminandes Collection
    await t.metadata.collection(339473)
    await t.metadata.movie(19) // not in the library
    await t.metadata.movie(653) // not in the library, but recent
    await t.metadata.person(68) // credited in Metropolis only
    await t.metadata.person(10092) // Robert Flaherty: credited in nothing cached
    t.addToLibrary(253777)
    const poster = parseImageUrl((await t.metadata.movie(19)).art.poster as string)
    const kept = parseImageUrl((await t.metadata.movie(253777)).art.poster as string)
    if (!poster || !kept) throw new Error('no art')
    const old = await t.metadata.images.get({ ...poster, ownerId: poster.ownerId })
    await t.metadata.images.get({ ...kept, ownerId: kept.ownerId })
    expect(existsSync(old.path)).toBe(true)

    t.clock.advance(170 * DAY)
    await t.metadata.movie(653) // older than 30 days: fetched again, now recent
    t.clock.advance(11 * DAY)
    const purged = t.metadata.jobs.runPurge()
    expect(purged).toEqual({ movies: 1, people: 2, collections: 0, images: 2 })
    const movies = t.db
      .select()
      .from(schema.movieMetadata)
      .all()
      .map((r) => r.tmdbId)
    expect(movies.sort()).toEqual([253777, 653])
    expect(
      t.db
        .select()
        .from(schema.collections)
        .all()
        .map((r) => r.tmdbId),
    ).toEqual([339473])
    expect(
      t.db
        .select()
        .from(schema.credits)
        .all()
        .every((c) => c.movieId !== 19),
    ).toBe(true)
    // the library's own images are past six months too: removed, and fetched again when shown
    expect(existsSync(old.path)).toBe(false)
    expect(t.db.select().from(schema.images).all()).toEqual([])
  })

  test('a person the library credits is kept', async () => {
    const t = await open()
    await t.metadata.movie(19)
    await t.metadata.person(68)
    t.addToLibrary(19)
    t.clock.advance(181 * DAY)
    expect(t.metadata.jobs.runPurge()).toEqual({
      movies: 0,
      people: 0,
      collections: 0,
      images: 0,
    })
  })
})

describe('images', () => {
  test('fetched once, kept on disk, then served from it', async () => {
    const t = await open()
    const m = await t.metadata.movie(19)
    const ref = parseImageUrl(m.art.poster as string)
    if (!ref) throw new Error('no poster')
    t.fetch.requests.length = 0
    const first = await t.metadata.images.get(ref)
    expect(first.contentType).toBe('image/jpeg')
    expect(first.path).toBe(join(t.imagesDir, 'w342', 'kr9wXRN23zLuWJIelahas1mtnYj.jpg'))
    expect(readFileSync(first.path).length).toBe(first.bytes)
    await t.metadata.images.get(ref)
    expect(t.fetch.requests).toEqual(['GET /t/p/w342/kr9wXRN23zLuWJIelahas1mtnYj.jpg'])
    const row = t.db.select().from(schema.images).get()
    expect(row).toMatchObject({ ownerType: 'movie', ownerId: 19, kind: 'poster', size: 'w342' })
  })

  test('only known sizes and TMDB’s file names; nothing escapes the folder', async () => {
    const t = await open()
    const base = { owner: 'movie', ownerId: 19, kind: 'poster', file: 'abc.jpg' }
    for (const parts of [
      { ...base, size: 'original' },
      { ...base, size: 'w342', file: '../../etc/passwd' },
      { ...base, size: 'w342', file: 'logo.svg' },
      { ...base, size: 'w342', kind: 'banner' },
      { ...base, size: 'w342', owner: 'show' },
      { ...base, size: 'w342', ownerId: -1 },
      { ...base, size: '..' },
    ]) {
      const e = (await rejects(t.metadata.images.get(parts))) as AppError
      expect(e.code).toBe('not-found')
    }
    expect(t.fetch.requests).toEqual([])
    expect(readdirSync(t.imagesDir)).toEqual([])
  })
})

describe('the recordings', () => {
  const files = readdirSync(RECORDINGS_DIR).filter((f) => f.endsWith('.json'))

  test('none holds a key or a token', () => {
    for (const f of files)
      expect({ f, leaks: leaksCredential(readFileSync(join(RECORDINGS_DIR, f), 'utf8')) }).toEqual({
        f,
        leaks: false,
      })
  })

  test('the leak check catches keys, tokens and headers', () => {
    expect(leaksCredential('{"url":"https://x/3/movie/1?api_key=abc"}')).toBe(true)
    expect(leaksCredential('"0123456789abcdef0123456789abcdef"')).toBe(true)
    expect(leaksCredential('eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.c2lnbmF0dXJl')).toBe(true)
    expect(leaksCredential('{"Authorization":"Bearer x"}')).toBe(true)
    expect(leaksCredential('{"note":"my-own-secret-value"}', ['my-own-secret-value'])).toBe(true)
    expect(leaksCredential('{"credit_id":"52fe420fc3a36847f8000c83"}')).toBe(false)
  })

  test('each is named for its request', () => {
    for (const f of files) {
      const r = JSON.parse(readFileSync(join(RECORDINGS_DIR, f), 'utf8')) as Recording
      expect(recordingName(r.request.method, r.request.url, r.request.credential)).toBe(f)
    }
  })

  test('the attribution is TMDB’s wording', () => {
    expect(TMDB_ATTRIBUTION).toBe(
      'This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.',
    )
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
// fanart.tv as the second artwork source (HT-74, ADR 0070): off without a key, the logo when TMDB has
// none, more choices in the artwork dialog, its images served through highsea, and never in a film's
// way when it's down. fanart.tv's answers are hand-written in its documented shape
// (test/fixtures/fanart/README.md); TMDB's are the recordings. No network.
import { afterEach, describe, expect, test } from 'bun:test'
import { type AppError, silentLogger } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'
import { createFanart, FANART_NONE_FRESH_MS } from '../src/fanart/source.ts'
import { JOB_TYPES, parseImageUrl } from '../src/index.ts'
import { DAY, setup } from './helpers.ts'

let cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})
/**
 * TMDB's `/3/movie/{id}/images` for Big Buck Bunny, which has no recording: written here in the
 * shape TMDB's API reference gives ("Images", movie), with no images, so the dialog's TMDB side is
 * empty and its fanart.tv side is what's tested.
 */
const noTmdbImages = (url: URL) =>
  url.hostname === 'api.themoviedb.org' && url.pathname === '/3/movie/10378/images'
    ? Response.json({ id: 10378, backdrops: [], logos: [], posters: [] })
    : undefined

const open = async (options: Parameters<typeof setup>[0] = {}) => {
  const t = await setup({
    ...options,
    onRequest: (url, init) => options.onRequest?.(url, init) ?? noTmdbImages(url),
  })
  cleanups.push(t.cleanup)
  return t
}
const rejects = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as AppError
  }
  throw new Error('expected a rejection')
}

/** Not a real key: the replay takes anything that doesn't start with `invalid`. */
const PROJECT = 'projectkeyforreplay01'
const fanartRequests = (t: { fetch: { requests: string[] } }) =>
  t.fetch.requests.filter((r) => r.includes('/v3.2/'))

// Big Buck Bunny (10378): TMDB has no logo for it; fanart.tv has three HD logos, two in English
const BUNNY = 10378
const BUNNY_LOGO = '/api/v1/images/movie/10378/logo/w500/ftv_big-buck-bunny-5b2a1d3c4e5f6.png'

describe('without a key', () => {
  test('fanart.tv is off: never asked, no options, no logo, nothing queued', async () => {
    const t = await open()
    expect(t.metadata.settings.get().fanart).toEqual({ set: false, last4: null, project: false })
    expect((await t.metadata.movie(BUNNY)).art.logo).toBeNull()
    const { kinds } = await t.metadata.artwork.view('movie', BUNNY)
    expect(kinds.flatMap((k) => k.options).every((o) => o.source === 'tmdb')).toBe(true)
    expect(t.jobs.list({}).some((j) => j.type === JOB_TYPES.fanart)).toBe(false)
    expect(fanartRequests(t)).toEqual([])
  })
})

describe('the logo when TMDB has none', () => {
  test('a film without one queues fanart.tv, and its English HD logo, the most liked, follows', async () => {
    const t = await open({ fanartKey: PROJECT })
    expect(t.metadata.settings.get().fanart.project).toBe(true)
    // the film's page doesn't wait on fanart.tv
    expect((await t.metadata.movie(BUNNY)).art.logo).toBeNull()
    expect(fanartRequests(t)).toEqual([])
    t.seen.length = 0
    await t.drain()
    expect(fanartRequests(t)).toEqual(['GET /v3.2/movies/10378'])
    // `de` has more likes, `en` comes before it; the SD `movielogo` isn't used
    expect((await t.metadata.movie(BUNNY)).art.logo).toBe(BUNNY_LOGO)
    expect((await t.metadata.cachedMovie(BUNNY))?.art.logo).toBe(BUNNY_LOGO)
    expect(t.seen.some((e) => e.topic === 'metadata.updated')).toBe(true)
  })

  test('the metadata language comes first, then English, then any, the most liked in each', async () => {
    const t = await open()
    const fanart = createFanart({
      db: t.db,
      clock: t.clock,
      logger: silentLogger,
      fetch: t.fetch,
      keys: () => ({ project: PROJECT, personal: null }),
    })
    expect(await fanart.refresh('movie', BUNNY)).toEqual({ found: true })
    expect(fanart.logo('movie', BUNNY, 'de-DE')).toBe('/ftv_big-buck-bunny-5c3b2e4d5f6a7.png')
    expect(fanart.logo('movie', BUNNY, 'en-US')).toBe('/ftv_big-buck-bunny-5b2a1d3c4e5f6.png')
    expect(fanart.logo('movie', BUNNY, 'fr-FR')).toBe('/ftv_big-buck-bunny-5b2a1d3c4e5f6.png')
  })

  test('TMDB’s logo stays first: fanart.tv isn’t asked for a film that has one', async () => {
    const t = await open({ fanartKey: PROJECT })
    expect((await t.metadata.movie(45745)).art.logo).toBe(
      '/api/v1/images/movie/45745/logo/w500/hsSintelLogoEn.png',
    )
    await t.drain()
    expect(fanartRequests(t)).toEqual([])
  })

  test('nothing on fanart.tv is kept as nothing, and asked again after a week', async () => {
    const t = await open({ fanartKey: PROJECT })
    await t.metadata.movie(15)
    await t.drain()
    expect(fanartRequests(t)).toEqual(['GET /v3.2/movies/15'])
    const row = t.db
      .select()
      .from(schema.fanartImages)
      .where(eq(schema.fanartImages.externalId, '15'))
      .get()
    expect(row?.data).toBeNull()
    t.fetch.requests.length = 0
    await t.metadata.refreshNow('movie', 15)
    await t.drain()
    expect(fanartRequests(t)).toEqual([])
    t.clock.advance(FANART_NONE_FRESH_MS)
    await t.metadata.refreshNow('movie', 15)
    await t.drain()
    expect(fanartRequests(t)).toEqual(['GET /v3.2/movies/15'])
  })
})

describe('fanart.tv down', () => {
  test('a film still loads at once, nothing is kept, and fanart.tv is left alone for a while', async () => {
    let asked = 0
    const t = await open({
      fanartKey: PROJECT,
      onRequest: (url) => {
        if (url.hostname !== 'webservice.fanart.tv') return undefined
        asked++
        return new Response('busy', { status: 503 })
      },
    })
    const film = await t.metadata.movie(BUNNY)
    expect(film.title).toBe('Big Buck Bunny')
    await t.drain()
    // tried twice, then resting: the dialog doesn't ask again
    expect(asked).toBe(2)
    expect(t.db.select().from(schema.fanartImages).all()).toEqual([])
    const { kinds } = await t.metadata.artwork.view('movie', BUNNY)
    expect(asked).toBe(2)
    expect(kinds.flatMap((k) => k.options).some((o) => o.source === 'fanart')).toBe(false)
    // nothing failed: the job ended quietly, so it can be asked again later
    expect(t.jobs.list({ status: ['failed'] })).toEqual([])
  })

  test('a network error is the same', async () => {
    const t = await open({
      fanartKey: PROJECT,
      onRequest: (url) => {
        if (url.hostname === 'webservice.fanart.tv') throw new TypeError('fetch failed')
        return undefined
      },
    })
    await t.metadata.movie(BUNNY)
    await t.drain()
    expect(t.jobs.list({ status: ['failed'] })).toEqual([])
    expect((await t.metadata.movie(BUNNY)).art.logo).toBeNull()
  })
})

describe('the artwork dialog', () => {
  test('lists fanart.tv’s posters, backgrounds and logos after TMDB’s, each with its source', async () => {
    const t = await open({ fanartKey: PROJECT })
    const { kinds } = await t.metadata.artwork.view('movie', BUNNY)
    const of = (kind: string) => kinds.find((k) => k.kind === kind)?.options ?? []
    const fanart = (kind: string) => of(kind).filter((o) => o.source === 'fanart')
    // asked once, by the dialog, as nothing was kept yet
    expect(fanartRequests(t)).toEqual(['GET /v3.2/movies/10378'])
    expect(fanart('poster').map((o) => [o.file, o.language, o.likes])).toEqual([
      ['/ftv_big-buck-bunny-5e5d4a6f7b8c9.jpg', null, 6],
      ['/ftv_big-buck-bunny-5d4c3f5e6a7b8.jpg', 'en', 4],
    ])
    expect(fanart('backdrop')).toHaveLength(1)
    expect(fanart('backdrop')[0]).toMatchObject({ width: 1920, height: 1080, voteAverage: null })
    expect(fanart('logo').map((o) => o.likes)).toEqual([9, 7, 3])
    // TMDB's first, then fanart.tv's
    const sources = of('poster').map((o) => o.source)
    expect(sources.indexOf('fanart')).toBeGreaterThan(sources.lastIndexOf('tmdb'))
    // the automatic logo is fanart.tv's, as TMDB has none
    expect(kinds.find((k) => k.kind === 'logo')?.automatic).toBe(
      '/ftv_big-buck-bunny-5b2a1d3c4e5f6.png',
    )
  })

  test('choosing one of fanart.tv’s keeps it, as fanart.tv’s; one it doesn’t list is refused', async () => {
    const t = await open({ fanartKey: PROJECT })
    await t.metadata.artwork.view('movie', BUNNY)
    const file = '/ftv_big-buck-bunny-5e5d4a6f7b8c9.jpg'
    await t.metadata.artwork.choose('movie', BUNNY, 'poster', file, null)
    expect((await t.metadata.movie(BUNNY)).art.poster).toBe(
      `/api/v1/images/movie/10378/poster/w342${file}`,
    )
    const row = t.db.select().from(schema.artwork).get()
    expect(row).toMatchObject({ source: 'fanart', file, width: 1000, height: 1426 })
    const e = await rejects(
      t.metadata.artwork.choose('movie', BUNNY, 'poster', '/ftv_made-up-0000.jpg', null),
    )
    expect(e.code).toBe('invalid')
    expect(e.message).toBe('fanart.tv has no such image for this title.')
  })

  test('a fanart.tv image is served from its preview at the grid’s size, the full file larger', async () => {
    const t = await open({ fanartKey: PROJECT })
    await t.metadata.artwork.view('movie', BUNNY)
    t.fetch.requests.length = 0
    const grid = parseImageUrl(
      '/api/v1/images/movie/10378/poster/w185/ftv_big-buck-bunny-5e5d4a6f7b8c9.jpg',
    )
    const big = parseImageUrl(
      '/api/v1/images/movie/10378/poster/w780/ftv_big-buck-bunny-5e5d4a6f7b8c9.jpg',
    )
    if (!grid || !big) throw new Error('not an image address')
    expect((await t.metadata.images.get(grid)).contentType).toBe('image/jpeg')
    await t.metadata.images.get(big)
    expect(t.fetch.requests).toEqual([
      'GET /bigpreview/movies/10378/movieposter/big-buck-bunny-5e5d4a6f7b8c9.jpg',
      'GET /fanart/movies/10378/movieposter/big-buck-bunny-5e5d4a6f7b8c9.jpg',
    ])
    // only files fanart.tv listed for the title are fetched
    const other = parseImageUrl('/api/v1/images/movie/10378/poster/w185/ftv_somebody-else.jpg')
    if (!other) throw new Error('not an image address')
    expect((await rejects(t.metadata.images.get(other))).code).toBe('not-found')
    expect(t.fetch.requests).toHaveLength(2)
  })
})

describe('the personal key', () => {
  test('is checked with fanart.tv, kept sealed, sent as `client-key`, and removed', async () => {
    const headers: Headers[] = []
    const t = await open({
      onRequest: (url, init) => {
        if (url.hostname === 'webservice.fanart.tv') headers.push(new Headers(init?.headers))
        return undefined
      },
    })
    const refused = await rejects(t.metadata.settings.setFanartKey('invalidpersonalkey'))
    expect((refused.details as { reason: string }).reason).toBe('fanart-key-rejected')
    expect(t.metadata.settings.get().fanart.set).toBe(false)
    const view = await t.metadata.settings.setFanartKey('personalkeyforreplay9')
    expect(view.fanart).toEqual({ set: true, last4: 'lay9', project: false })
    const stored = JSON.stringify(t.db.select().from(schema.settings).all())
    expect(stored).not.toContain('personalkeyforreplay9')
    headers.length = 0
    await t.metadata.artwork.view('movie', BUNNY)
    expect(headers[0]?.get('client-key')).toBe('personalkeyforreplay9')
    expect(headers[0]?.has('api-key')).toBe(false)
    expect(t.metadata.settings.clearFanartKey().fanart.set).toBe(false)
  })

  test('the check alone stores nothing', async () => {
    const t = await open()
    await t.metadata.settings.checkFanartKey('personalkeyforreplay9')
    expect(t.metadata.settings.get().fanart.set).toBe(false)
  })
})

describe('the catch-up after an update (HT-74)', () => {
  // 0.4.4's database: its last migration was 0018_profiles, and its films were fetched before
  // `images` was asked for (#73), so `data` has no `images`
  const OLD = '0018_profiles'
  const NOW = Date.UTC(2026, 10, 19, 8)
  const oldFilm = (id: number, title: string) =>
    JSON.stringify({ id, title, original_title: title, release_date: '2008-05-30' })

  test('a boot that leaves films needing a refetch starts it within minutes, once', async () => {
    const t = await open({
      fanartKey: PROJECT,
      before: {
        tag: OLD,
        fill: (raw) => {
          for (const [id, title] of [
            [BUNNY, 'Big Buck Bunny'],
            [45745, 'Sintel'],
          ] as const)
            raw.run(
              'INSERT INTO movie_metadata (tmdb_id, title, original_title, language, data, fetched_at) VALUES (?, ?, ?, ?, ?, ?)',
              id,
              title,
              title,
              'en-US',
              oldFilm(id, title),
              NOW - 2 * DAY,
            )
          // the sweep's schedule as 0.4.4 left it: its next run 16 hours away
          raw.run(
            'INSERT INTO job_schedules (type, every_ms, next_run_at, enabled) VALUES (?, ?, ?, 1)',
            JOB_TYPES.sweep,
            DAY,
            NOW + 16 * 60 * 60_000,
          )
        },
      },
    })
    t.clock.set(NOW)
    t.addToLibrary(BUNNY)
    t.addToLibrary(45745)
    t.fetch.requests.length = 0

    t.metadata.jobs.schedule(t.clock.now())
    const catchUp = () => t.jobs.list({}).filter((j) => j.type === JOB_TYPES.catchUp)
    expect(catchUp()).toHaveLength(1)
    expect(catchUp()[0]?.runAt).toBe(NOW + 3 * 60_000)
    // a second boot (or call) adds nothing
    t.metadata.jobs.schedule(t.clock.now())
    expect(catchUp()).toHaveLength(1)
    // the sweep's time is still the database's
    const sweep = t.db
      .select()
      .from(schema.jobSchedules)
      .where(eq(schema.jobSchedules.type, JOB_TYPES.sweep))
      .get()
    expect(sweep?.nextRunAt).toBe(NOW + 16 * 60 * 60_000)

    await t.drain()
    expect(t.fetch.requests).toEqual([])
    t.clock.advance(3 * 60_000)
    await t.drain()
    const refetched = t.fetch.requests.filter((r) => r.startsWith('GET /3/movie/'))
    expect(refetched.map((r) => r.split('?')[0]).sort()).toEqual([
      'GET /3/movie/10378',
      'GET /3/movie/45745',
    ])
    // and fanart.tv for the one TMDB has no logo for
    expect(fanartRequests(t)).toEqual(['GET /v3.2/movies/10378'])
    expect((await t.metadata.cachedMovie(BUNNY))?.art.logo).toBe(BUNNY_LOGO)
    expect((await t.metadata.cachedMovie(45745))?.art.logo).toContain('hsSintelLogoEn.png')

    // done: the next boot finds nothing to catch up
    t.fetch.requests.length = 0
    const before = catchUp().length
    t.metadata.jobs.schedule(t.clock.now())
    expect(catchUp()).toHaveLength(before)
    expect(t.metadata.jobs.runCatchUp()).toEqual({ refetch: 0, fanart: 0 })
  })

  test('a boot with nothing missing queues nothing', async () => {
    const t = await open()
    t.addToLibrary(45745)
    await t.metadata.movie(45745)
    t.metadata.jobs.schedule(t.clock.now())
    expect(t.jobs.list({}).some((j) => j.type === JOB_TYPES.catchUp)).toBe(false)
  })

  test('a film TMDB answered 404 for is asked again after a week, not before', async () => {
    let gone = true
    const t = await open({
      onRequest: (url) =>
        gone && url.pathname === '/3/movie/45745'
          ? Response.json({ status_code: 34, success: false }, { status: 404 })
          : undefined,
    })
    t.addToLibrary(45745)
    t.db
      .insert(schema.movieMetadata)
      .values({
        tmdbId: 45745,
        title: 'Sintel',
        originalTitle: 'Sintel',
        language: 'en-US',
        data: { id: 45745, title: 'Sintel' },
        fetchedAt: t.clock.now(),
      })
      .run()
    expect(await t.metadata.refreshNow('movie', 45745)).toBe('gone')
    expect(t.metadata.jobs.runCatchUp().refetch).toBe(0)
    t.clock.advance(7 * DAY + 1)
    gone = false
    expect(t.metadata.jobs.runCatchUp().refetch).toBe(1)
    await t.drain()
    const row = t.db
      .select()
      .from(schema.movieMetadata)
      .where(eq(schema.movieMetadata.tmdbId, 45745))
      .get()
    expect(row?.goneAt).toBeNull()
    expect((row?.data as { images?: unknown } | undefined)?.images).toBeDefined()
  })
})

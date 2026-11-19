// SPDX-License-Identifier: AGPL-3.0-only
// TMDB's TV metadata (ADR 0064), against the recordings: Chernobyl (87108), a short finished show of
// five episodes, and The Office (2996), two series and eighteen specials.
import { afterEach, describe, expect, test } from 'bun:test'
import { schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'
import { JOB_TYPES, parseImageUrl } from '../src/index.ts'
import { DAY, setup } from './helpers.ts'

const CHERNOBYL = 87108
const THE_OFFICE = 2996

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

/** A library show, as @highsea-tv/media/shows adds it. */
function addShow(t: Awaited<ReturnType<typeof open>>, tmdbId: number) {
  const now = t.clock.now()
  t.db
    .insert(schema.mediaItems)
    .values({
      id: `itm_show_${tmdbId}`,
      type: 'show',
      tmdbId,
      title: `Show ${tmdbId}`,
      sortTitle: `show ${tmdbId}`,
      status: 'wanted',
      monitored: true,
      minimumAvailability: 'released',
      qualityProfileId: 'qp_hd',
      rootFolder: '/data/shows',
      path: `/data/shows/${tmdbId}`,
      addedAt: now,
      updatedAt: now,
    })
    .run()
}

describe('a show', () => {
  test('one request for the show and one a season, mapped to the drafted shapes', async () => {
    const t = await open()
    const show = await t.metadata.show(CHERNOBYL)
    expect(t.fetch.requests).toEqual([
      'GET /3/tv/87108?append_to_response=aggregate_credits%2Ccontent_ratings%2Cexternal_ids%2Cvideos%2Crecommendations%2Ckeywords%2Cimages&include_image_language=en%2Cnull&language=en-US',
      'GET /3/tv/87108/season/1?append_to_response=external_ids&language=en-US',
    ])
    expect(show).toMatchObject({
      id: CHERNOBYL,
      title: 'Chernobyl',
      year: 2019,
      firstAired: '2019-05-06',
      lastAired: '2019-06-03',
      status: 'Ended',
      airing: false,
      endYear: 2019,
      network: 'HBO',
      genres: ['Drama'],
      tvdbId: 360893,
      imdbId: 'tt7366338',
      certification: 'TV-MA',
    })
    expect(show.creators.map((c) => c.name)).toEqual(['Craig Mazin'])
    expect(show.cast[0]?.name).toBe('Jared Harris')
    expect(show.recommendations.length).toBe(20)
    // TMDB leaves `episode_run_time` empty: the episodes' middle one (61, 64, 66, 67, 73)
    expect(show.runtimeMinutes).toBe(66)
    expect(show.seasons).toHaveLength(1)
    const [season] = show.seasons
    expect(season).toMatchObject({ id: 119454, number: 1, tvdbId: 801960, aired: '2019-05-06' })
    expect(
      season?.episodes.map((e) => [e.id, e.number, e.title, e.aired, e.runtimeMinutes]),
    ).toEqual([
      [1725580, 1, '1:23:45', '2019-05-06', 61],
      [1747124, 2, 'Please Remain Calm', '2019-05-13', 66],
      [1747125, 3, 'Open Wide, O Earth', '2019-05-20', 64],
      [1747126, 4, 'The Happiness of All Mankind', '2019-05-27', 67],
      [1747127, 5, 'Vichnaya Pamyat', '2019-06-03', 73],
    ])
  })

  test('the automatic logo, the show’s art and its episodes’ stills are the show’s images', async () => {
    const t = await open()
    const show = await t.metadata.show(CHERNOBYL)
    // TMDB's best-voted English logo (HT-66's automaticLogo)
    expect(show.art.logo).toBe(
      '/api/v1/images/show/87108/logo/w500/aqK5Oop8piDnrszRsrwxWXLDYbT.png',
    )
    for (const url of [show.art.poster, show.art.backdrop, show.seasons[0]?.poster])
      expect(parseImageUrl(url as string)).toMatchObject({ owner: 'show', ownerId: CHERNOBYL })
    const still = parseImageUrl(show.seasons[0]?.episodes[0]?.still as string)
    expect(still).toMatchObject({ owner: 'show', ownerId: CHERNOBYL, kind: 'still', size: 'w300' })
    // the image route serves them, kept as the show's so they're purged with it
    await t.metadata.images.get(still as NonNullable<typeof still>)
    expect(
      t.db
        .select()
        .from(schema.images)
        .all()
        .map((r) => [r.ownerType, r.ownerId]),
    ).toEqual([['show', CHERNOBYL]])
  })

  test('specials are season 0, placed last; the region picks the certification', async () => {
    const t = await open()
    const show = await t.metadata.show(THE_OFFICE)
    expect(show.seasons.map((s) => [s.number, s.title, s.episodes.length])).toEqual([
      [1, 'Series 1', 6],
      [2, 'Series 2', 6],
      [0, 'Specials', 18],
    ])
    expect(show.seasons[2]?.episodes[0]).toMatchObject({
      season: 0,
      number: 1,
      title: 'Christmas Special (1)',
      aired: '2003-12-26',
    })
    expect(show.certification).toBe('TV-MA')
    await t.metadata.settings.update({ region: 'GB' })
    expect(t.metadata.cachedShow(THE_OFFICE)?.certification).toBe('15')
  })

  test('cached: read again without asking TMDB, and offline from the cache', async () => {
    const t = await open()
    await t.metadata.show(CHERNOBYL)
    t.fetch.requests.length = 0
    await t.metadata.show(CHERNOBYL)
    expect(t.fetch.requests).toEqual([])
    expect(t.metadata.cachedShow(CHERNOBYL)?.seasons[0]?.episodes).toHaveLength(5)
    expect(t.metadata.cachedShow(THE_OFFICE)).toBeNull()
    const rows = t.db.select().from(schema.seasonMetadata).all()
    expect(rows.map((r) => [r.showId, r.seasonNumber, r.tmdbId])).toEqual([[CHERNOBYL, 1, 119454]])
  })

  test('a season TMDB no longer lists is removed from the cache with the next refresh', async () => {
    const t = await open()
    await t.metadata.show(THE_OFFICE)
    expect(
      t.db
        .select()
        .from(schema.seasonMetadata)
        .where(eq(schema.seasonMetadata.showId, THE_OFFICE))
        .all(),
    ).toHaveLength(3)
    // TMDB's answer without the specials
    const answer = t.db
      .select()
      .from(schema.showMetadata)
      .where(eq(schema.showMetadata.tmdbId, THE_OFFICE))
      .get()?.data as { seasons: { season_number: number }[] }
    const withoutSpecials = {
      ...answer,
      seasons: answer.seasons.filter((s) => s.season_number !== 0),
    }
    const t2 = await open({
      onRequest: (url) =>
        url.pathname === '/3/tv/2996' ? Response.json(withoutSpecials) : undefined,
    })
    await t2.metadata.show(THE_OFFICE)
    await t2.metadata.show(THE_OFFICE)
    t2.clock.advance(31 * DAY)
    await t2.metadata.show(THE_OFFICE)
    const numbers = t2.db
      .select({ n: schema.seasonMetadata.seasonNumber })
      .from(schema.seasonMetadata)
      .all()
      .map((r) => r.n)
    expect(numbers).toEqual([1, 2])
    expect(t2.metadata.cachedShow(THE_OFFICE)?.seasons.map((s) => s.number)).toEqual([1, 2])
  })

  test('an unknown show is not found', async () => {
    const t = await open({
      onRequest: (url) =>
        url.pathname === '/3/tv/999999999'
          ? Response.json(
              { success: false, status_code: 34, status_message: 'Not found' },
              { status: 404 },
            )
          : undefined,
    })
    const e = await t.metadata.show(999999999).catch((e) => e)
    expect(e.code).toBe('not-found')
  })
})

describe('TheTVDB’s ids through find', () => {
  test('a show’s, a season’s, and the kind the caller holds', async () => {
    const t = await open()
    expect(await t.metadata.discover.findByTvdb(360893)).toEqual({ kind: 'show', show: CHERNOBYL })
    expect(await t.metadata.discover.findByTvdb(78107)).toEqual({ kind: 'show', show: THE_OFFICE })
    expect(await t.metadata.discover.findByTvdb(801960, 'season')).toEqual({
      kind: 'season',
      show: CHERNOBYL,
      season: 1,
    })
    expect(await t.metadata.discover.findByTvdb(25564, 'season')).toEqual({
      kind: 'season',
      show: THE_OFFICE,
      season: 0,
    })
    // TheTVDB numbers shows, seasons and episodes apart: 78107 is also some episode, and
    // 801960 is no show
    expect((await t.metadata.discover.findByTvdb(78107, 'episode'))?.kind).toBe('episode')
    expect(await t.metadata.discover.findByTvdb(801960)).toBeNull()
    expect(await t.metadata.discover.findByTvdb(-1)).toBeNull()
  })
})

describe('TV search', () => {
  test('TMDB’s TV search, mapped as lists are', async () => {
    const t = await open()
    const page = await t.metadata.discover.searchShows('Chernobyl')
    expect(page.totalResults).toBe(18)
    expect(page.results[0]).toMatchObject({ id: CHERNOBYL, title: 'Chernobyl', year: 2019 })
    expect(page.results[0]?.genres).toContain('Drama')
    expect(page.results[0]?.art.logo).toBeNull()
    expect(await t.metadata.discover.searchShows('  ')).toMatchObject({ totalResults: 0 })
  })
})

describe('refresh, the sweep, the changes and the purge', () => {
  test('a show’s refresh writes the latest, announces show:{id}, and twice changes nothing', async () => {
    const t = await open()
    await t.metadata.show(CHERNOBYL)
    t.clock.advance(DAY)
    t.metadata.refresh(CHERNOBYL, 'show')
    t.metadata.refresh(CHERNOBYL, 'show')
    expect(t.jobs.list({ type: JOB_TYPES.refresh, status: ['queued'] })).toHaveLength(1)
    await t.drain()
    const row = () =>
      t.db.select().from(schema.showMetadata).where(eq(schema.showMetadata.tmdbId, CHERNOBYL)).get()
    expect(row()?.fetchedAt).toBe(t.clock.now())
    const before = t.db.select().from(schema.seasonMetadata).all()
    await t.metadata.refreshNow('show', CHERNOBYL)
    expect(t.db.select().from(schema.seasonMetadata).all()).toEqual(before)
    const ids = t.seen.filter((e) => e.topic === 'metadata.updated').flatMap((e) => e.ids ?? [])
    expect(ids).toContain('show:87108')
  })

  test('the sweep fetches a library show that isn’t cached', async () => {
    const t = await open()
    addShow(t, CHERNOBYL)
    await t.metadata.jobs.runSweep()
    expect(t.jobs.list({ type: JOB_TYPES.refresh }).map((j) => j.payload)).toContainEqual({
      kind: 'show',
      id: CHERNOBYL,
    })
    await t.drain()
    expect(t.metadata.cachedShow(CHERNOBYL)?.title).toBe('Chernobyl')
  })

  test('TV’s changes are asked for only once a show is cached', async () => {
    const t = await open({
      // TMDB's TV changes in its documented shape (https://developer.themoviedb.org/reference/changes-tv-list)
      onRequest: (url) =>
        url.pathname === '/3/tv/changes'
          ? Response.json({
              results: [{ id: CHERNOBYL, adult: false }],
              page: 1,
              total_pages: 1,
              total_results: 1,
            })
          : undefined,
    })
    await t.metadata.movie(19)
    await t.metadata.show(CHERNOBYL)
    const { CHANGES_STATE_KEY } = await import('../src/index.ts')
    const { writeSetting } = await import('@highsea-tv/db')
    writeSetting(t.db, CHANGES_STATE_KEY, { lastRunAt: t.clock.now() - DAY }, t.clock.now())
    t.fetch.requests.length = 0
    await t.metadata.jobs.runChanges()
    expect(t.fetch.requests).toContain(
      'GET /3/tv/changes?start_date=2026-10-16&end_date=2026-10-17&page=1',
    )
    expect(t.jobs.list({ type: JOB_TYPES.refresh }).map((j) => j.payload)).toContainEqual({
      kind: 'show',
      id: CHERNOBYL,
    })
  })

  test('the purge keeps a library show and removes one that isn’t, with its seasons', async () => {
    const t = await open()
    await t.metadata.show(CHERNOBYL)
    await t.metadata.show(THE_OFFICE)
    addShow(t, CHERNOBYL)
    t.clock.advance(181 * DAY)
    expect(t.metadata.jobs.runPurge()).toMatchObject({ shows: 1 })
    expect(
      t.db
        .select()
        .from(schema.showMetadata)
        .all()
        .map((r) => r.tmdbId),
    ).toEqual([CHERNOBYL])
    expect(
      new Set(
        t.db
          .select()
          .from(schema.seasonMetadata)
          .all()
          .map((r) => r.showId),
      ),
    ).toEqual(new Set([CHERNOBYL]))
  })
})

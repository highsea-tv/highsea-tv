// SPDX-License-Identifier: AGPL-3.0-only
// The catalog's public sites (HT-77): YTS, Knaben, BitSearch and Torrents-CSV, and the TV and anime
// sites (HT-110): EZTV, Nyaa, SubsPlease and showRSS, each run by the engine against saved answers
// in its API's documented shape (test/fake/sites/). Nothing leaves the process.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFakeClock } from '@highsea-tv/core'
import { parse } from '@highsea-tv/parser'
import { type Definition, validateDefinition } from '@highsea-tv/schemas/indexers'
import { type RunContext, runSearch, type SearchQuery } from '../src/engine.ts'
import type { IndexerError } from '../src/http.ts'
import { createRateLimiter, MAX_RATE_WAIT_MS } from '../src/rate-limit.ts'
import { scrapeJson } from '../src/scrape.ts'
import { onlyAnime, searchable, servesFilms } from '../src/search.ts'
import { FAKE_CREDENTIALS, FAKE_NOW, FAKE_ORIGIN, fakeJson, MOVIES } from './fake/index.ts'
import { catalogDefinition, setup } from './helpers.ts'

const SITES = join(import.meta.dir, 'fake/sites')
const saved = (file: string) => readFileSync(join(SITES, file), 'utf8')

const sintel: SearchQuery = {
  title: MOVIES.sintel.title,
  year: MOVIES.sintel.year,
  imdbId: MOVIES.sintel.imdbId,
  tmdbId: MOVIES.sintel.tmdbId,
}

/** Answers each request from `route`, which picks a saved answer by the address. */
function context(definition: Definition, route: (url: URL) => string | null) {
  const requests: URL[] = []
  const fetch = async (input: Request | string | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    requests.push(url)
    const body = route(url)
    return body === null
      ? new Response('bad request', { status: 400 })
      : new Response(body, { headers: { 'content-type': 'application/json' } })
  }
  const ctx: RunContext = {
    definition,
    settings: {},
    session: null,
    caps: null,
    fetch: fetch as RunContext['fetch'],
    timeoutMs: 2000,
    now: createFakeClock(FAKE_NOW).now,
    beforeRequest: async () => {},
  }
  return { ctx, requests }
}

describe('YTS', () => {
  const yts = catalogDefinition('yts')
  const route = (url: URL) => {
    if (url.hostname !== 'movies-api.accel.li' || url.pathname !== '/api/v2/list_movies.json')
      return null
    const term = url.searchParams.get('query_term')
    if (term === null) return saved('yts-latest.json')
    return term === 'tt1727587' ? saved('yts-imdb.json') : saved('yts-none.json')
  }

  test('finds a film by its IMDb id, one release per torrent, named for the parser', async () => {
    const { ctx, requests } = context(yts, route)
    const result = await runSearch(ctx, sintel)
    expect(result.by).toBe('imdbid')
    expect(requests.map((u) => u.searchParams.get('query_term'))).toEqual(['tt1727587'])
    expect(requests[0]?.searchParams.get('limit')).toBe('50')
    expect(result.releases).toEqual([
      expect.objectContaining({
        title: 'Sintel 2010 720p BluRay x264 2.0-YTS',
        guid: 'yts:A779FA758F2229586EEBC2E5960EB32FE5659596',
        infohash: 'a779fa758f2229586eebc2e5960eb32fe5659596',
        download: null,
        details: 'https://yts.pw/movies/sintel-2010',
        imdbId: 'tt1727587',
        categories: [2040],
        size: 143_151_596,
        seeders: 36,
        leechers: 39,
        published: '2024-06-15T08:48:29.000Z',
      }),
      expect.objectContaining({
        title: 'Sintel 2010 2160p WEBRip x265 10bit 5.1 REPACK-YTS',
        categories: [2045],
      }),
    ])
    const magnet = new URL(result.releases[0]?.magnet as string)
    expect(magnet.protocol).toBe('magnet:')
    expect(magnet.searchParams.get('xt')).toBe('urn:btih:A779FA758F2229586EEBC2E5960EB32FE5659596')
    expect(magnet.searchParams.get('dn')).toBe('Sintel')
    expect(magnet.searchParams.getAll('tr')).toContain('udp://tracker.opentrackr.org:1337/announce')

    const [hd, uhd] = result.releases.map((r) => parse(r.title))
    expect(hd?.quality).toMatchObject({ source: 'bluray', resolution: 720 })
    expect(uhd?.quality).toMatchObject({
      source: 'webrip',
      resolution: 2160,
      revision: { repack: true },
    })
    expect(uhd?.releaseGroup).toBe('YTS')
  })

  test('without an IMDb id it searches the title and year, and no match is no results', async () => {
    const { ctx, requests } = context(yts, route)
    const result = await runSearch(ctx, { title: 'Sintel', year: 2010 })
    expect(requests.map((u) => u.searchParams.get('query_term'))).toEqual(['Sintel 2010'])
    // YTS leaves "movies" out of an answer with nothing in it
    expect(result.releases).toEqual([])
  })

  test('its test lists the newest films, falling back to the original title', async () => {
    const { ctx, requests } = context(yts, route)
    const result = await runSearch(ctx, { keywords: yts.test.keywords })
    expect(requests[0]?.searchParams.has('query_term')).toBe(false)
    // a film whose list of torrents is empty gives none
    expect(result.releases.map((r) => [r.title, r.categories])).toEqual([
      ['Tears of Steel 2012 1080p WEBRip x265 2.0-YTS', [2040]],
    ])
    expect(result.releases[0]?.published).toBe('2026-11-18T19:01:07.000Z')
  })
})

describe('Knaben', () => {
  const knaben = catalogDefinition('knaben')
  const route = (url: URL) =>
    url.hostname !== 'api.knaben.org'
      ? null
      : url.pathname === '/v2/search' && url.searchParams.get('q')
        ? saved('knaben-search.json')
        : url.pathname === '/v2/browse' && !url.searchParams.has('q')
          ? saved('knaben-browse.json')
          : null

  test('searches films by title and year, taking the magnet over the .torrent', async () => {
    const { ctx, requests } = context(knaben, route)
    const result = await runSearch(ctx, sintel)
    expect(result.by).toBe('title')
    expect(requests[0]?.pathname).toBe('/v2/search')
    expect(requests[0]?.searchParams.get('q')).toBe('Sintel 2010')
    expect(requests[0]?.searchParams.get('c')?.split(',')).toContain('3000000')
    expect(requests[0]?.searchParams.get('s')).toBe('100')
    expect(result.releases).toEqual([
      expect.objectContaining({
        title: 'Sintel (2010) 720p BRRip x264 -YTS',
        guid: 'knaben:91dc135f18e6001e30111601e25991df769332d3',
        magnet: expect.stringMatching(/^magnet:\?xt=urn:btih:A779FA/),
        // with a magnet, no .torrent: a grab would take the .torrent first
        download: null,
        infohash: 'a779fa758f2229586eebc2e5960eb32fe5659596',
        details: 'https://yts.gg/movies/sintel-2010',
        categories: [2040],
        size: 143_151_596,
        seeders: 23,
        leechers: 4,
        grabs: 197,
        published: '2024-06-15T08:48:29.000Z',
      }),
      expect.objectContaining({
        title: 'Sintel.2010.1080p.WEB.H264-CLASSiCALHD',
        magnet: null,
        download: 'https://knaben.org/live/dl/other/?path=def',
        details: null,
      }),
    ])
  })

  test('its test browses the newest films', async () => {
    const { ctx, requests } = context(knaben, route)
    const result = await runSearch(ctx, { keywords: knaben.test.keywords })
    expect(requests[0]?.pathname).toBe('/v2/browse')
    expect(result.releases.map((r) => [r.title, r.categories])).toEqual([
      ['Tears of Steel (2012) (2160p UHD BluRay x265 HDR10 5.1) [QxR]', [2045]],
      // its first category is anime, which isn't mapped: kept, and matched by title
      ['[Group] An Open Short - 07 [1080p]', []],
    ])
  })
})

describe('BitSearch', () => {
  const bitsearch = catalogDefinition('bitsearch')
  const route = (url: URL) =>
    url.hostname === 'bitsearch.eu' &&
    url.pathname === '/api/v1/search' &&
    url.searchParams.get('q') &&
    url.searchParams.get('category') === '2'
      ? saved('bitsearch-search.json')
      : null

  test('searches films, building each magnet from the info hash', async () => {
    const { ctx, requests } = context(bitsearch, route)
    const result = await runSearch(ctx, sintel)
    expect(requests.map((u) => u.searchParams.get('q'))).toEqual(['Sintel 2010'])
    expect(requests[0]?.searchParams.get('limit')).toBe('100')
    expect(result.releases).toEqual([
      expect.objectContaining({
        title: 'Sintel (2010) [720p] [BluRay] [YTS.MX]',
        guid: 'bitsearch:666da89bcf6b5b0715b6f41f',
        magnet:
          'magnet:?xt=urn:btih:A779FA758F2229586EEBC2E5960EB32FE5659596&dn=Sintel%20(2010)%20%5B720p%5D%20%5BBluRay%5D%20%5BYTS.MX%5D',
        infohash: 'a779fa758f2229586eebc2e5960eb32fe5659596',
        categories: [2000],
        size: 143_156_284,
        seeders: 751,
        leechers: 495,
        published: null,
      }),
      expect.objectContaining({
        title: 'Sintel.2010.Theora.Ogv-VODO',
        published: '2016-12-16T00:54:31.000Z',
      }),
    ])
  })

  test('it can’t list its newest releases, so it tests with keywords and RSS passes it by', () => {
    expect(bitsearch.latest).toBe(false)
    expect(bitsearch.test.keywords).not.toBe('')
    // 200 a day from one address (bitsearch.eu/api), with a margin
    expect(bitsearch.rateLimit).toEqual({ requests: 180, seconds: 86_400, minGapMs: 2000 })
  })
})

describe('Torrents-CSV', () => {
  const csv = catalogDefinition('torrents-csv')
  const route = (url: URL) =>
    url.hostname === 'torrents-csv.com' &&
    url.pathname === '/service/search' &&
    url.searchParams.get('q')
      ? saved('torrents-csv-search.json')
      : null

  test('searches by title and year, building each magnet from the info hash', async () => {
    const { ctx, requests } = context(csv, route)
    const result = await runSearch(ctx, sintel)
    expect(requests[0]?.searchParams.get('q')).toBe('Sintel 2010')
    expect(requests[0]?.searchParams.get('size')).toBe('100')
    expect(result.releases).toEqual([
      expect.objectContaining({
        title: 'Sintel (2010) [720p] [BluRay] [YTS.MX]',
        guid: 'torrents-csv:a779fa758f2229586eebc2e5960eb32fe5659596',
        magnet: expect.stringMatching(
          /^magnet:\?xt=urn:btih:a779fa758f2229586eebc2e5960eb32fe5659596&dn=Sintel/,
        ),
        categories: [],
        size: 143_156_284,
        seeders: 25,
        leechers: 16,
        grabs: 705,
        published: '2024-06-20T05:10:00.000Z',
      }),
    ])
  })

  test('an empty query is a bad request there, so it can’t list its newest', async () => {
    expect(csv.latest).toBe(false)
    const { ctx } = context(csv, route)
    const err = (await runSearch(ctx, { keywords: '' }).catch((e) => e)) as IndexerError
    expect(err.kind).toBe('unavailable')
    expect((await runSearch(ctx, { keywords: csv.test.keywords })).releases).toHaveLength(1)
  })
})

describe('the engine’s additions for them', () => {
  const base = catalogDefinition('yts') as Extract<Definition, { kind: 'json' }>
  const scrape = (def: Definition, body: unknown) =>
    scrapeJson(
      {
        definition: def as typeof base,
        config: {},
        pageUrl: 'https://example.org/api',
        mapCategory: () => null,
        now: FAKE_NOW,
      },
      JSON.stringify(body),
    )

  test('rows inside rows, down a dotted path, sharing the outer row', () => {
    const def = {
      ...base,
      search: {
        ...base.search,
        rows: { path: 'list', each: 'media.files', optional: false },
        fields: {
          title: { path: 'name', filters: [], optional: false },
          infohash: { path: 'media.files.hash', filters: [], optional: false },
          size: { path: 'media.kind', filters: [], optional: true },
        },
      },
    } satisfies Definition
    const releases = scrape(def, {
      list: [
        { name: 'A', media: { kind: 'film', files: [{ hash: 'aa' }, { hash: 'bb' }] } },
        { name: 'B', media: { kind: 'film' } },
      ],
    })
    expect(releases.map((r) => [r.title, r.infohash])).toEqual([
      ['A', 'aa'],
      ['A', 'bb'],
    ])
  })

  test('a missing list is no results only when the definition says so', () => {
    const strict = {
      ...base,
      search: { ...base.search, rows: { path: 'data.movies', optional: false } },
    }
    expect(scrape(base, { data: {} })).toEqual([])
    expect(() => scrape(strict, { data: {} })).toThrow('no results list')
  })

  test('a site that can’t list its newest needs test keywords', () => {
    const raw = Bun.YAML.parse(
      readFileSync(
        join(import.meta.dir, '../../../catalog/indexers/definitions/bitsearch.yml'),
        'utf8',
      ),
    ) as Record<string, unknown>
    const result = validateDefinition({ ...raw, test: { keywords: '' } })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.map((e) => e.path)).toEqual(['test.keywords'])
  })

  test('a limit used up for longer than a minute fails at once, with when it frees up', async () => {
    const clock = createFakeClock(FAKE_NOW)
    const sleeps: number[] = []
    const limiter = createRateLimiter(clock, async (ms) => {
      sleeps.push(ms)
      clock.advance(ms)
    })
    const daily = { requests: 2, seconds: 86_400, minGapMs: 0 }
    await limiter.acquire('ix', daily)
    clock.advance(60 * 60 * 1000)
    await limiter.acquire('ix', daily)
    const err = (await limiter.acquire('ix', daily).catch((e) => e)) as IndexerError
    expect(err.kind).toBe('rate-limited')
    expect(err.retryAfterMs).toBe(23 * 60 * 60 * 1000)
    expect(err.message).toBe(
      'highsea has sent this indexer the 2 requests its site allows in 24 hours. It tries again in 23 hours.',
    )
    expect(sleeps).toEqual([])
    // a short wait is still waited out, and the queue goes on after a refusal
    const minute = { requests: 1, seconds: MAX_RATE_WAIT_MS / 1000, minGapMs: 0 }
    await limiter.acquire('other', minute)
    await limiter.acquire('other', minute)
    expect(sleeps).toEqual([MAX_RATE_WAIT_MS])
  })

  test('RSS passes by an indexer that can’t list its newest releases', async () => {
    const definition = { ...fakeJson(FAKE_ORIGIN), latest: false, test: { keywords: 'Sintel' } }
    const t = setup({ definitions: [definition] })
    await t.indexers.add('fake-json', { settings: { passkey: FAKE_CREDENTIALS.jsonPasskey } })
    const before = t.fake.requests.length
    const result = await t.indexers.rss([], () => null)
    expect(result.read).toBe(0)
    expect(t.fake.requests.length).toBe(before)
  })
})

/** A show's search as the episode search asks it. */
const harbourLights: SearchQuery = {
  title: 'Harbour Lights',
  imdbId: 'tt9900001',
  tv: { season: 3, episode: 7 },
}

describe('EZTV', () => {
  const eztv = catalogDefinition('eztv')
  const route = (url: URL) => {
    if (url.hostname !== 'eztvx.to' || url.pathname !== '/api/get-torrents') return null
    const id = url.searchParams.get('imdb_id')
    return id === '9900001' ? saved('eztv-show.json') : saved('eztv-none.json')
  }

  test('a show is looked up by its IMDb id alone, and its releases read in full', async () => {
    const { ctx, requests } = context(eztv, route)
    const result = await runSearch(ctx, harbourLights)
    expect(result.by).toBe('imdbid')
    // the id without its "tt", the API's most a page; no title, season or episode
    expect(requests.map((u) => u.search)).toEqual(['?imdb_id=9900001&limit=100&page=1'])
    expect(result.releases).toHaveLength(3)
    expect(result.releases[0]).toMatchObject({
      // the site's name after the group's is dropped
      title: 'Harbour Lights S03E07 1080p HEVC x265-GROUP',
      guid: 'eztv:4100003',
      magnet: expect.stringMatching(/^magnet:\?xt=urn:btih:3a5f0c1e/),
      download: null,
      infohash: '3a5f0c1e9b7d2a4c6e8f0a1b3c5d7e9f1a2b3c4d',
      imdbId: 'tt9900001',
      size: 812345678,
      seeders: 214,
      leechers: 31,
      published: new Date(1795500000 * 1000).toISOString(),
    })
    // every title numbers its episode
    const parsed = result.releases.map((r) => parse(r.title))
    expect(parsed.every((p) => p.title === 'Harbour Lights')).toBe(true)
  })

  test('a show without an IMDb id isn’t asked: the API takes no title', async () => {
    const { ctx, requests } = context(eztv, route)
    const result = await runSearch(ctx, { ...harbourLights, imdbId: null })
    expect(requests).toHaveLength(0)
    expect(result).toMatchObject({ releases: [], by: 'none' })
  })

  test('an id EZTV doesn’t know answers without torrents: nothing found', async () => {
    const { ctx } = context(eztv, route)
    const result = await runSearch(ctx, { ...harbourLights, imdbId: 'tt9900002' })
    expect(result.releases).toEqual([])
  })

  test('its test lists the newest releases of every show', async () => {
    const { ctx, requests } = context(eztv, () => saved('eztv-show.json'))
    const result = await runSearch(ctx, { keywords: eztv.test.keywords })
    expect(requests[0]?.searchParams.has('imdb_id')).toBe(false)
    expect(result.releases).toHaveLength(3)
  })

  test('a film’s search passes it by', () => {
    expect(servesFilms(eztv)).toBe(false)
    expect(onlyAnime(eztv)).toBe(false)
  })
})

describe('Nyaa', () => {
  const nyaa = catalogDefinition('nyaa')
  const route = (url: URL) =>
    url.hostname === 'nyaa.si' && url.searchParams.get('page') === 'rss'
      ? saved('nyaa-search.xml')
      : null

  test('a show is searched by its words, in Anime, and the feed’s own elements read', async () => {
    const { ctx, requests } = context(nyaa, route)
    const result = await runSearch(ctx, { title: 'Kumo no Michi', tv: { season: 2, episode: 7 } })
    expect(Object.fromEntries(requests[0]?.searchParams ?? [])).toEqual({
      page: 'rss',
      q: 'Kumo no Michi S02E07',
      c: '1_0',
      f: '0',
    })
    // the music video isn't a show's
    expect(result.releases.map((r) => r.guid)).toEqual([
      'https://nyaa.si/view/9000003',
      'https://nyaa.si/view/9000002',
    ])
    expect(result.releases[0]).toMatchObject({
      title: '[SubsPlease] Kumo no Michi S2 - 07 (1080p) [0A1B2C3D].mkv',
      download: 'https://nyaa.si/download/9000003.torrent',
      details: 'https://nyaa.si/view/9000003',
      infohash: '0a1b2c3d4e5f60718293a4b5c6d7e8f901234567',
      size: Math.round(1.4 * 1024 ** 3),
      seeders: 812,
      leechers: 37,
      grabs: 5120,
      categories: [5070],
      published: '2026-11-18T17:31:00.000Z',
    })
  })

  test('its test keeps every kind, though none is a film’s', async () => {
    const { ctx, requests } = context(nyaa, route)
    const result = await runSearch(ctx, { keywords: '' })
    expect(requests[0]?.searchParams.get('q')).toBeNull()
    expect(result.releases).toHaveLength(3)
  })

  test('it lists only anime: the automatic search and a film’s pass it by', () => {
    expect(onlyAnime(nyaa)).toBe(true)
    expect(servesFilms(nyaa)).toBe(false)
    expect(searchable(nyaa)).toBe(true)
  })
})

describe('the feeds of newest releases: SubsPlease and showRSS', () => {
  const subsplease = catalogDefinition('subsplease')
  const showrss = catalogDefinition('showrss')

  test('SubsPlease: its feed read, magnets and sizes', async () => {
    const { ctx, requests } = context(subsplease, (url) =>
      url.hostname === 'subsplease.org' && url.pathname === '/rss/'
        ? saved('subsplease-rss.xml')
        : null,
    )
    const result = await runSearch(ctx, { keywords: subsplease.test.keywords })
    expect(requests.map((u) => u.href)).toEqual(['https://subsplease.org/rss/'])
    expect(result.releases).toHaveLength(2)
    expect(result.releases[0]).toMatchObject({
      title: '[SubsPlease] Kumo no Michi S2 - 07 (1080p) [0A1B2C3D].mkv',
      guid: 'BIFSYPKOL5QHDEUTUS24NVXI7EASGRLH',
      magnet: expect.stringMatching(/^magnet:\?xt=urn:btih:BIFSYPKOL5QHDEUTUS24NVXI7EASGRLH/),
      download: null,
      size: Math.round(1.39 * 1024 ** 3),
      published: '2026-11-18T17:30:12.000Z',
    })
  })

  test('showRSS: the release’s own name, its hash, and no size from a magnet’s enclosure', async () => {
    const { ctx, requests } = context(showrss, (url) =>
      url.hostname === 'showrss.info' && url.pathname === '/other/all.rss'
        ? saved('showrss-all.xml')
        : null,
    )
    const result = await runSearch(ctx, { keywords: showrss.test.keywords })
    expect(requests).toHaveLength(1)
    expect(result.releases.map((r) => r.title)).toEqual([
      'Harbour Lights S03E07 720p HDTV H264 GROUP',
      'Harbour Lights S03E07 1080p HDTV H264 OTHER',
    ])
    expect(result.releases[0]).toMatchObject({
      infohash: '4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f',
      magnet: expect.stringMatching(/^magnet:\?xt=urn:btih:4D6F8A0C/),
      size: null,
    })
  })

  test('neither can be searched: a show’s search asks nothing of them', async () => {
    for (const def of [subsplease, showrss]) {
      expect(searchable(def)).toBe(false)
      const { ctx, requests } = context(def, () => '')
      const result = await runSearch(ctx, harbourLights)
      expect(requests).toHaveLength(0)
      expect(result.releases).toEqual([])
    }
  })
})

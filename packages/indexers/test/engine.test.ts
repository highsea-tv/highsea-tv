// SPDX-License-Identifier: AGPL-3.0-only
// Each kind against the fake indexer, through caps, search and the field mappings.
import { describe, expect, test } from 'bun:test'
import { createFakeClock } from '@highsea/core'
import type { Definition } from '@highsea/schemas/indexers'
import { type RunContext, runSearch, type SearchQuery } from '../src/engine.ts'
import { readCaps } from '../src/feed.ts'
import { type IndexerError, joinUrl, redact } from '../src/http.ts'
import { parseDate, parseSize } from '../src/values.ts'
import {
  createFakeIndexer,
  FAKE_CREDENTIALS,
  FAKE_NOW,
  FAKE_ORIGIN,
  fakeHtml,
  fakeJson,
  fakeNewznab,
  MOVIES,
} from './fake/index.ts'
import { catalogDefinition } from './helpers.ts'

const sintel: SearchQuery = {
  title: MOVIES.sintel.title,
  year: MOVIES.sintel.year,
  imdbId: MOVIES.sintel.imdbId,
  tmdbId: MOVIES.sintel.tmdbId,
}

function context(
  definition: Definition,
  settings: RunContext['settings'],
  session: string | null = null,
) {
  const fake = createFakeIndexer()
  const clock = createFakeClock(FAKE_NOW)
  const ctx: RunContext = {
    definition,
    settings,
    session,
    caps: null,
    fetch: fake.fetch,
    timeoutMs: 2000,
    now: clock.now,
    beforeRequest: async () => {},
  }
  return { ctx, fake }
}

const torznab = () =>
  context(catalogDefinition('generic-torznab'), {
    baseUrl: `${FAKE_ORIGIN}/torznab`,
    apiKey: FAKE_CREDENTIALS.torznabKey,
  })

describe('Torznab', () => {
  test('reads the caps, then searches by the strongest id they list', async () => {
    const { ctx, fake } = torznab()
    const result = await runSearch(ctx, sintel)
    expect(result.by).toBe('tmdbid')
    expect(result.caps?.movie.params).toEqual(['q', 'imdbid', 'tmdbid'])
    const [caps, search] = fake.requests
    expect(caps?.url.searchParams.get('t')).toBe('caps')
    expect(search?.url.pathname).toBe('/torznab/api')
    expect(Object.fromEntries(search?.url.searchParams ?? [])).toEqual({
      t: 'movie',
      cat: '2000,2030,2040,2045',
      tmdbid: '45745',
      apikey: FAKE_CREDENTIALS.torznabKey,
    })
    // the TV result is left out
    expect(result.releases.map((r) => r.title)).toEqual([
      'Sintel.2010.1080p.BluRay.x264-GRP',
      'Sintel.2010.2160p.UHD.BluRay.x265-GRP',
      'Sintel.2010.720p.WEB-DL.DDP5.1.H.264-GRP',
      'Sintel.2010.DVDRip.XviD-OLD',
    ])
  })

  test('maps the item and its attributes', async () => {
    const { ctx } = torznab()
    const [first] = (await runSearch(ctx, sintel)).releases
    expect(first).toEqual({
      title: 'Sintel.2010.1080p.BluRay.x264-GRP',
      guid: 'fake-101',
      download: `${FAKE_ORIGIN}/dl/101.torrent`,
      magnet: null,
      infohash: null,
      details: `${FAKE_ORIGIN}/details/101`,
      size: 8 * 1024 ** 3,
      seeders: 120,
      leechers: 10,
      grabs: 900,
      files: null,
      published: new Date(FAKE_NOW - 30 * 24 * 60 * 60_000).toISOString(),
      imdbId: 'tt1727587',
      tmdbId: 45745,
      categories: [2040, 2000],
      downloadVolumeFactor: 0,
      uploadVolumeFactor: 1,
      minimumRatio: null,
      minimumSeedTime: null,
    })
  })

  test('keeps the base URL’s own path', async () => {
    expect(joinUrl('https://host/prowlarr/1/', '/api', { t: 'caps' }).href).toBe(
      'https://host/prowlarr/1/api?t=caps',
    )
    expect(joinUrl('https://host/feed?x=1', '').href).toBe('https://host/feed')
    // a path is always appended after a slash, so it can't name another host
    expect(joinUrl('https://host/', '//evil.test/api').host).toBe('host')
    expect(joinUrl('https://host', '@evil.test/api').host).toBe('host')
    expect(() => joinUrl('ftp://host/', '/api')).toThrow('http:// or https://')
  })

  test('falls back to the title and year when the id finds nothing', async () => {
    const { ctx, fake } = torznab()
    const result = await runSearch(ctx, { title: 'Sintel', year: 2010, tmdbId: 1, imdbId: null })
    expect(result.by).toBe('title')
    expect(fake.requests.at(-1)?.url.searchParams.get('q')).toBe('Sintel 2010')
    expect(result.releases).toHaveLength(4)
  })

  test('uses the cached caps instead of asking again', async () => {
    const { ctx, fake } = torznab()
    const first = await runSearch(ctx, sintel)
    fake.requests.length = 0
    await runSearch({ ...ctx, caps: first.caps }, sintel)
    expect(fake.requests.map((r) => r.url.searchParams.get('t'))).toEqual(['movie'])
  })

  test('a wrong key is an auth failure', async () => {
    const { ctx } = context(catalogDefinition('generic-torznab'), {
      baseUrl: `${FAKE_ORIGIN}/torznab`,
      apiKey: 'wrong',
    })
    const err = (await runSearch(ctx, sintel).catch((e) => e)) as IndexerError
    expect(err.kind).toBe('auth')
    expect(err.message).toBe(
      'The indexer refused the credentials: Incorrect user credentials (100).',
    )
  })

  test('a test searches with t=search and no query', async () => {
    const { ctx, fake } = torznab()
    const result = await runSearch(ctx, { keywords: '' })
    expect(Object.fromEntries(fake.requests.at(-1)?.url.searchParams ?? [])).toEqual({
      t: 'search',
      cat: '2000,2030,2040,2045',
      apikey: FAKE_CREDENTIALS.torznabKey,
    })
    expect(result.by).toBe('keywords')
    expect(result.releases.length).toBeGreaterThan(0)
  })

  test('reads caps without a <search> element, and refuses a document without <caps>', () => {
    expect(readCaps('<caps><searching /></caps>').search).toEqual({
      available: true,
      params: ['q'],
    })
    expect(() => readCaps('<rss />')).toThrow('no <caps>')
  })
})

describe('Newznab', () => {
  test('searches by IMDb id without its tt, and marks nothing as torrents', async () => {
    const { ctx, fake } = context(fakeNewznab(FAKE_ORIGIN), { apiKey: FAKE_CREDENTIALS.newznabKey })
    const result = await runSearch(ctx, sintel)
    expect(result.by).toBe('imdbid')
    expect(fake.requests.at(-1)?.url.searchParams.get('imdbid')).toBe('1727587')
    expect(result.releases[0]?.download).toBe(`${FAKE_ORIGIN}/newznab/get/101.nzb`)
    expect(result.releases[0]?.seeders).toBeNull()
  })

  test('rate-limit error codes', async () => {
    const { ctx, fake } = context(fakeNewznab(FAKE_ORIGIN), { apiKey: FAKE_CREDENTIALS.newznabKey })
    fake.misbehave({ kind: 'error-code', code: 500, description: 'Request limit reached' })
    const err = (await runSearch(ctx, sintel).catch((e) => e)) as IndexerError
    expect(err.kind).toBe('rate-limited')
  })
})

describe('JSON', () => {
  const json = () => context(fakeJson(FAKE_ORIGIN), { passkey: FAKE_CREDENTIALS.jsonPasskey })

  test('maps rows, filters and categories', async () => {
    const { ctx, fake } = json()
    const result = await runSearch(ctx, sintel)
    expect(result.by).toBe('imdbid')
    const sent = fake.requests[0]?.url.searchParams
    expect(sent?.get('imdb')).toBe('1727587')
    expect(sent?.get('cat')).toBe('11,12,13')
    expect(sent?.has('q')).toBe(false)
    const first = result.releases[0]
    expect(first).toMatchObject({
      title: 'Sintel.2010.1080p.BluRay.x264-GRP',
      guid: 'fake-json:101',
      download: `${FAKE_ORIGIN}/json/download/101?passkey=${FAKE_CREDENTIALS.jsonPasskey}`,
      size: 8 * 1024 ** 3,
      seeders: 120,
      categories: [2040],
      downloadVolumeFactor: 0,
      published: new Date(FAKE_NOW - 30 * 24 * 60 * 60_000).toISOString(),
    })
    expect(result.releases[1]?.downloadVolumeFactor).toBe(1)
  })

  test('an error in the answer is the rule’s kind', async () => {
    const { ctx } = context(fakeJson(FAKE_ORIGIN), { passkey: 'wrong' })
    const err = (await runSearch(ctx, sintel).catch((e) => e)) as IndexerError
    expect(err.kind).toBe('auth')
    expect(err.message).toBe('The indexer answered with an error: Invalid passkey')
  })

  test('a moved results list says the layout changed', async () => {
    const { ctx, fake } = json()
    fake.misbehave({ kind: 'layout' })
    const err = (await runSearch(ctx, sintel).catch((e) => e)) as IndexerError
    expect(err.kind).toBe('parse')
    expect(err.message).toContain('layout may have changed')
  })
})

describe('HTML', () => {
  const settings = { username: FAKE_CREDENTIALS.username, password: FAKE_CREDENTIALS.password }

  test('signs in with the form, keeps the cookie, and reads the table', async () => {
    const { ctx, fake } = context(fakeHtml(FAKE_ORIGIN), settings)
    const result = await runSearch(ctx, sintel)
    expect(fake.logins).toBe(1)
    expect(result.session).toBe('sid=sid-1; theme=dark')
    const browse = fake.requests.at(-1)
    expect(browse?.url.searchParams.get('search')).toBe('Sintel 2010')
    expect(browse?.headers.get('cookie')).toBe('sid=sid-1; theme=dark')
    expect(result.releases[0]).toMatchObject({
      title: 'Sintel.2010.1080p.BluRay.x264-GRP',
      details: `${FAKE_ORIGIN}/html/details.php?id=101`,
      download: `${FAKE_ORIGIN}/html/download.php?id=101`,
      size: 8 * 1024 ** 3,
      seeders: 120,
      categories: [2040],
      downloadVolumeFactor: 0,
      published: new Date(FAKE_NOW - 30 * 24 * 60 * 60_000).toISOString(),
    })
    expect(result.releases[1]?.downloadVolumeFactor).toBeNull()
  })

  test('an earlier session is used, and signs in again when it ran out', async () => {
    const { ctx, fake } = context(fakeHtml(FAKE_ORIGIN), settings, 'sid=sid-1')
    await runSearch(ctx, sintel)
    expect(fake.logins).toBe(0)
    fake.expireSessions()
    const result = await runSearch(ctx, sintel)
    expect(fake.logins).toBe(1)
    expect(result.session).toBe('sid=sid-2; theme=dark')
    expect(result.releases.length).toBeGreaterThan(0)
  })

  test('a refused sign-in is an auth failure with the site’s words', async () => {
    const { ctx } = context(fakeHtml(FAKE_ORIGIN), { ...settings, password: 'nope' })
    const err = (await runSearch(ctx, sintel).catch((e) => e)) as IndexerError
    expect(err.kind).toBe('auth')
    expect(err.message).toBe('The site refused the sign-in: Wrong username or password.')
  })

  test('a changed table finds nothing rather than nonsense', async () => {
    const { ctx, fake } = context(fakeHtml(FAKE_ORIGIN), settings)
    fake.misbehave({ kind: 'layout' }, '/html/browse')
    expect((await runSearch(ctx, sintel)).releases).toEqual([])
  })
})

describe('RSS', () => {
  test('reads the feed in the secret address, mapping its category text', async () => {
    const { ctx } = context(catalogDefinition('generic-rss'), {
      url: `${FAKE_ORIGIN}/rss/feed/${FAKE_CREDENTIALS.rssPasskey}`,
    })
    const result = await runSearch(ctx, sintel)
    expect(result.by).toBe('title')
    // the whole feed: an item whose category doesn't map is kept, and search matches the movie
    expect(result.releases.map((r) => r.guid)).toEqual([
      'fake-101',
      'fake-102',
      'fake-103',
      'fake-104',
      'fake-105',
      'fake-106',
    ])
    expect(result.releases[5]?.categories).toEqual([])
    expect(result.releases[0]?.categories).toEqual([2000])
    expect(result.releases[0]?.seeders).toBeNull()
  })
})

describe('Internet Archive', () => {
  test('the catalog definition searches by title and year', async () => {
    const { ctx, fake } = context(catalogDefinition('internet-archive'), {})
    const result = await runSearch(ctx, sintel)
    const sent = fake.requests[0]?.url
    expect(sent?.hostname).toBe('archive.org')
    expect(sent?.searchParams.get('q')).toBe(
      'collection:feature_films AND format:"Archive BitTorrent" AND title:(Sintel) AND year:2010',
    )
    expect(result.releases).toEqual([
      expect.objectContaining({
        title: 'Sintel 2010',
        guid: 'archive.org:Sintel_2010',
        download: 'https://archive.org/download/Sintel_2010/Sintel_2010_archive.torrent',
        size: 1_400_000_000,
        grabs: 120_000,
        published: '2010-10-01T00:00:00.000Z',
      }),
    ])
  })

  test('its test asks for the latest films, and a film with no year still reads', async () => {
    const { ctx } = context(catalogDefinition('internet-archive'), {})
    const result = await runSearch(ctx, { keywords: '' })
    expect(result.releases.map((r) => r.title)).toEqual([
      'Sintel 2010',
      'Tears of Steel 2012',
      'Night of the Living Dead',
    ])
  })
})

describe('failures', () => {
  test('HTTP statuses are classified', async () => {
    const cases: [number, string, string][] = [
      [401, 'auth', 'refused the credentials (HTTP 401)'],
      [429, 'rate-limited', 'slow down'],
      [503, 'unavailable', 'HTTP 503'],
      [403, 'unavailable', 'turned the request down (HTTP 403)'],
    ]
    for (const [status, kind, text] of cases) {
      const { ctx, fake } = torznab()
      fake.misbehave({ kind: 'status', status, retryAfter: '120' })
      const err = (await runSearch(ctx, sintel).catch((e) => e)) as IndexerError
      expect(err.kind).toBe(kind as IndexerError['kind'])
      expect(err.message).toContain(text)
      if (status === 429) expect(err.retryAfterMs).toBe(120_000)
    }
  })

  test('malformed XML and a slow answer', async () => {
    const malformed = torznab()
    malformed.fake.misbehave({ kind: 'malformed' })
    expect(((await runSearch(malformed.ctx, sintel).catch((e) => e)) as IndexerError).kind).toBe(
      'parse',
    )

    const slow = torznab()
    slow.fake.misbehave({ kind: 'slow', ms: 500 })
    const err = (await runSearch({ ...slow.ctx, timeoutMs: 50 }, sintel).catch(
      (e) => e,
    )) as IndexerError
    expect(err.kind).toBe('timeout')
    expect(err.message).toBe('The indexer didn’t answer within 0 seconds.')
  })

  test('secrets are redacted from messages', () => {
    expect(redact('GET https://x/api?apikey=abc123&t=caps failed', [])).toBe(
      'GET https://x/api?apikey=••••&t=caps failed',
    )
    expect(redact('feed fake-rss-passkey-0004 is gone', ['fake-rss-passkey-0004'])).toBe(
      'feed •••• is gone',
    )
  })
})

describe('values', () => {
  test('sizes', () => {
    expect(parseSize('1.5 GB')).toBe(1.5 * 1024 ** 3)
    expect(parseSize('700 MiB')).toBe(700 * 1024 ** 2)
    expect(parseSize('4,2 GB')).toBe(Math.round(4.2 * 1024 ** 3))
    expect(parseSize('1,234,567')).toBe(1_234_567)
    expect(parseSize('2 TB')).toBe(2 * 1024 ** 4)
    expect(parseSize('big')).toBeNull()
  })

  test('dates', () => {
    expect(parseDate('Tue, 20 Oct 2026 10:00:00 GMT', 'text', FAKE_NOW)).toBe(
      '2026-10-20T10:00:00.000Z',
    )
    expect(parseDate('1792490400', 'unix', FAKE_NOW)).toBe('2026-10-20T10:00:00.000Z')
    expect(parseDate('2 hours ago', 'relative', FAKE_NOW)).toBe('2026-10-20T10:00:00.000Z')
    expect(parseDate('1 day, 2 hours ago', 'text', FAKE_NOW)).toBe('2026-10-19T10:00:00.000Z')
    expect(parseDate('yesterday', 'relative', FAKE_NOW)).toBe('2026-10-19T12:00:00.000Z')
    expect(parseDate('whenever', 'text', FAKE_NOW)).toBeNull()
  })
})

describe('network failures', () => {
  test('keep the error code and drop the message, which can carry the address', async () => {
    const { ctx } = torznab()
    const failing = async () => {
      throw Object.assign(
        new Error(`connect ECONNREFUSED ${FAKE_ORIGIN}/torznab/api?apikey=secret`),
        {
          code: 'ECONNREFUSED',
        },
      )
    }
    const err = (await runSearch({ ...ctx, fetch: failing }, sintel).catch(
      (e) => e,
    )) as IndexerError
    expect(err.kind).toBe('unavailable')
    expect(err.message).toBe('Couldn’t reach the indexer (ECONNREFUSED).')
  })
})

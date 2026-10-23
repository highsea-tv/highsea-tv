// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { createOpenSubtitles } from '../../src/providers/opensubtitles.ts'
import { ProviderError, type SubtitleQuery } from '../../src/shared/types.ts'
import { FAKE_OPENSUBTITLES_KEY } from '../fake/index.ts'
import { setup } from './store.ts'

const HOUR = 3_600_000

const query: SubtitleQuery = {
  tmdbId: 45745,
  imdbId: 'tt1727587',
  title: 'Sintel',
  year: 2010,
  moviehash: '8E245D9679D31E12',
  languages: ['pt-BR', 'en'],
}

function make(
  options: Parameters<typeof setup>[1] = {},
  apiKey: string | null = FAKE_OPENSUBTITLES_KEY,
) {
  const s = setup('opensubtitles', options)
  return { ...s, provider: createOpenSubtitles({ ...s.deps, apiKey }) }
}

async function failure(promise: Promise<unknown>): Promise<ProviderError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof ProviderError) return error
    throw error
  }
  throw new Error('expected a ProviderError')
}

describe('OpenSubtitles.com', () => {
  test('signs in, keeps the token and uses the base_url it was given', async () => {
    const { provider, fake, store } = make({ vip: true })
    const account = await provider.account()
    expect(account).toEqual({
      account: 'highsea',
      remaining: 20,
      limit: 1000,
      resetsAt: Date.UTC(2026, 9, 18),
    })
    expect(fake.logins).toBe(1)
    expect(store.saved?.baseUrl).toBe('https://vip-api.opensubtitles.com/api/v1')
    const login = fake.requests[0]
    expect(login?.url.toString()).toBe('https://api.opensubtitles.com/api/v1/login')
    expect(login?.headers.get('api-key')).toBe(FAKE_OPENSUBTITLES_KEY)
    expect(login?.headers.get('user-agent')).toBe('highsea v0.0.0')
    expect(login?.headers.get('content-type')).toBe('application/json')
    const info = fake.requests[1]
    expect(info?.url.host).toBe('vip-api.opensubtitles.com')
    expect(info?.headers.get('authorization')).toBe(`Bearer ${store.saved?.value}`)
    expect(store.quota).toEqual({ remaining: 20, limit: 1000, resetsAt: Date.UTC(2026, 9, 18) })
  })

  test('reuses the token for 12 hours, then signs in again', async () => {
    const { provider, fake, clock } = make()
    await provider.search(query)
    clock.advance(11 * HOUR)
    await provider.search(query)
    expect(fake.logins).toBe(1)
    clock.advance(1 * HOUR)
    await provider.search(query)
    expect(fake.logins).toBe(2)
  })

  test('a refused sign-in is never retried', async () => {
    const { provider, fake, store } = make()
    store.creds = { username: 'highsea', password: 'wrong' }
    const error = await failure(provider.search(query))
    expect(error.kind).toBe('auth')
    expect(fake.logins).toBe(1)
    expect(fake.requests.filter((r) => r.url.pathname.endsWith('/login'))).toHaveLength(1)
    expect(fake.requests.filter((r) => r.url.pathname.endsWith('/subtitles'))).toHaveLength(0)
  })

  test('a 401 on search signs in again once and retries', async () => {
    const { provider, fake } = make()
    await provider.search(query)
    fake.expireTokens()
    const results = await provider.search(query)
    expect(results.length).toBeGreaterThan(0)
    expect(fake.logins).toBe(2)

    fake.misbehave('opensubtitles', { kind: 'status', status: 401 }, { path: '/api/v1/subtitles' })
    const error = await failure(provider.search(query))
    expect(error.kind).toBe('auth')
    expect(fake.logins).toBe(3)
  })

  test('searches with sorted, lowercase parameters', async () => {
    const { provider, fake } = make()
    await provider.search(query)
    const search = fake.requests.find((r) => r.url.pathname === '/api/v1/subtitles')
    expect(search?.url.search).toBe(
      '?ai_translated=exclude&foreign_parts_only=include&hearing_impaired=include' +
        '&languages=en,pt-br&machine_translated=exclude&moviehash=8e245d9679d31e12' +
        '&tmdb_id=45745&type=movie&year=2010',
    )
    expect(
      fake.requests.some((r) => r.url.pathname === '/api/v1/subtitles' && r.method !== 'GET'),
    ).toBe(false)
  })

  test('maps results: languages, the hash match, the id match; translations left out by the API', async () => {
    const { provider, fake } = make({ generate: false })
    fake.add({
      provider: 'opensubtitles',
      tmdbId: 45745,
      language: 'pt-BR',
      releaseName: 'Sintel.2010.1080p.BluRay.x264-GROUP',
      moviehash: '8e245d9679d31e12',
      hi: true,
      downloads: 321,
    })
    fake.add({
      provider: 'opensubtitles',
      tmdbId: 45745,
      language: 'en',
      releaseName: 'Sintel.2010.720p.WEB-DL-OTHER',
      forced: true,
      format: 'vtt',
    })
    fake.add({
      provider: 'opensubtitles',
      tmdbId: 45745,
      language: 'en',
      releaseName: 'Sintel.2010.AI',
      translated: true,
    })
    const results = await provider.search(query)
    expect(results).toHaveLength(2)
    const [br, en] = results
    expect(br).toMatchObject({
      provider: 'opensubtitles',
      language: 'pt-BR',
      releaseName: 'Sintel.2010.1080p.BluRay.x264-GROUP',
      releases: ['Sintel.2010.1080p.BluRay.x264-GROUP'],
      hi: true,
      forced: false,
      hashMatch: true,
      idMatch: true,
      format: 'srt',
      downloads: 321,
      translated: false,
    })
    expect(en).toMatchObject({ language: 'en', forced: true, hashMatch: false, format: 'vtt' })
    expect(Number(br?.ref)).toBeGreaterThan(0)
  })

  test('folds Chinese scripts into a plain zh query', async () => {
    const { provider, fake } = make({ generate: false })
    fake.add({ provider: 'opensubtitles', tmdbId: 1, language: 'zh-Hant', releaseName: 'A' })
    const results = await provider.search({
      ...query,
      tmdbId: 1,
      moviehash: null,
      languages: ['zh'],
    })
    expect(results.map((r) => r.language)).toEqual(['zh'])
    const search = fake.requests.find((r) => r.url.pathname === '/api/v1/subtitles')
    expect(search?.url.searchParams.get('languages')).toBe('zh-cn,zh-tw')
  })

  test('downloads, storing the link before fetching it', async () => {
    const { provider, fake, store } = make()
    const [result] = await provider.search(query)
    if (!result) throw new Error('no result')
    const file = await provider.download(result)
    expect(new TextDecoder().decode(file.bytes)).toContain('subtitles from OpenSubtitles.com')
    expect(file.name).toBe(`${result.releaseName}.srt`)
    const key = `opensubtitles:${result.ref}`
    expect(store.log.filter((l) => l.includes('Link'))).toEqual([
      `saveLink ${key}`,
      `dropLink ${key}`,
    ])
    expect(store.quota).toEqual({ remaining: 19, limit: null, resetsAt: Date.UTC(2026, 9, 18) })
    expect(fake.downloads).toBe(1)
  })

  test('a crash between asking for the link and fetching it asks only once', async () => {
    const { provider, fake, store } = make()
    const [result] = await provider.search(query)
    if (!result) throw new Error('no result')
    fake.misbehave('opensubtitles', { kind: 'network' }, { path: '/download/', times: 1 })
    const error = await failure(provider.download(result))
    expect(error.kind).toBe('unavailable')
    expect(store.links.has(`opensubtitles:${result.ref}`)).toBe(true)
    const file = await provider.download(result)
    expect(file.bytes.length).toBeGreaterThan(0)
    expect(fake.downloads).toBe(1)
    expect(fake.requests.filter((r) => r.url.pathname === '/api/v1/download')).toHaveLength(1)
    expect(store.links.size).toBe(0)
  })

  test('a 406 means the quota is spent until reset_time_utc', async () => {
    const { provider, fake, store } = make({ remainingDownloads: 0 })
    const [result] = await provider.search(query)
    if (!result) throw new Error('no result')
    const error = await failure(provider.download(result))
    expect(error.kind).toBe('quota')
    expect(error.resetsAt).toBe(Date.UTC(2026, 9, 18))
    expect(store.quota?.remaining).toBe(0)
    expect(store.links.size).toBe(0)
    fake.setRemaining(5)
    await provider.download(result)
  })

  test('a 429 is rate-limited, with Retry-After', async () => {
    const { provider, fake } = make()
    fake.misbehave(
      'opensubtitles',
      { kind: 'status', status: 429, retryAfter: '60' },
      { path: '/api/v1/subtitles' },
    )
    const error = await failure(provider.search(query))
    expect(error.kind).toBe('rate-limited')
    expect(error.retryAfterMs).toBe(60_000)
  })

  test('server errors, network errors, timeouts and unreadable answers', async () => {
    const { provider, fake } = make()
    fake.misbehave(
      'opensubtitles',
      { kind: 'status', status: 503 },
      { path: '/api/v1/subtitles', times: 1 },
    )
    expect((await failure(provider.search(query))).kind).toBe('unavailable')
    fake.misbehave('opensubtitles', { kind: 'network' }, { path: '/api/v1/subtitles', times: 1 })
    expect((await failure(provider.search(query))).kind).toBe('unavailable')
    fake.misbehave('opensubtitles', { kind: 'malformed' }, { path: '/api/v1/subtitles', times: 1 })
    expect((await failure(provider.search(query))).kind).toBe('invalid')
    fake.misbehave(
      'opensubtitles',
      { kind: 'slow', ms: 5_000 },
      { path: '/api/v1/subtitles', times: 1 },
    )
    expect((await failure(provider.search(query, AbortSignal.timeout(20)))).kind).toBe(
      'unavailable',
    )
  })

  test('without highsea’s key or an account there is nothing to do', async () => {
    const noKey = make({}, null)
    expect((await failure(noKey.provider.search(query))).kind).toBe('no-account')
    expect((await failure(noKey.provider.account())).kind).toBe('no-account')
    expect(noKey.fake.requests).toHaveLength(0)

    const noAccount = make()
    noAccount.store.creds = null
    expect((await failure(noAccount.provider.search(query))).kind).toBe('no-account')
    expect(noAccount.fake.requests).toHaveLength(0)
  })

  test('the fake refuses a wrong application key, as the API does', async () => {
    const { provider } = make({}, 'not-the-key')
    expect((await failure(provider.account())).kind).toBe('auth')
  })
})

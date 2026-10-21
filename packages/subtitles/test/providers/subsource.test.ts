// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { createSubSource } from '../../src/providers/subsource.ts'
import { ProviderError, type SubtitleQuery } from '../../src/shared/types.ts'
import { FAKE_SUBSOURCE_LIMIT } from '../fake/index.ts'
import { setup } from './store.ts'

const query: SubtitleQuery = {
  tmdbId: 45745,
  imdbId: 'tt1727587',
  title: 'Sintel',
  year: 2010,
  moviehash: null,
  languages: ['en', 'pt-BR'],
}

function make(options: Parameters<typeof setup>[1] = {}) {
  const s = setup('subsource', options)
  return { ...s, provider: createSubSource(s.deps) }
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

describe('SubSource', () => {
  test('finds the movie by IMDb id, then asks for each language', async () => {
    const { provider, fake } = make({ generate: false })
    fake.add({
      provider: 'subsource',
      tmdbId: 45745,
      imdbId: 'tt1727587',
      language: 'pt-BR',
      releaseName: 'Sintel.2010.1080p.BluRay.x264-GROUP',
      releases: ['Sintel.2010.1080p.BluRay.x264-GROUP', 'Sintel.2010.720p.WEB-DL-OTHER'],
      hi: true,
      forced: true,
    })
    const results = await provider.search(query)
    expect(results).toEqual([
      {
        provider: 'subsource',
        ref: expect.stringMatching(/^\d+$/),
        language: 'pt-BR',
        releaseName: 'Sintel.2010.1080p.BluRay.x264-GROUP',
        releases: ['Sintel.2010.1080p.BluRay.x264-GROUP', 'Sintel.2010.720p.WEB-DL-OTHER'],
        forced: true,
        hi: true,
        hashMatch: false,
        idMatch: true,
        format: null,
        downloads: 0,
        rating: 0,
        translated: false,
      },
    ])
    const urls = fake.requests.map((r) => r.url)
    expect(urls[0]?.pathname).toBe('/api/v1/movies/search')
    expect(urls[0]?.searchParams.get('searchType')).toBe('imdb')
    expect(urls[0]?.searchParams.get('imdb')).toBe('tt1727587')
    expect(urls.slice(1).map((u) => u.searchParams.get('language'))).toEqual([
      'english',
      'brazilian_portuguese',
    ])
    expect(fake.requests.every((r) => r.headers.get('x-api-key') === 'fake-subsource-key')).toBe(
      true,
    )
  })

  test('without an IMDb id there is nothing to search', async () => {
    const { provider, fake } = make()
    expect(await provider.search({ ...query, imdbId: null })).toEqual([])
    expect(fake.requests).toHaveLength(0)
  })

  test('downloads the zip', async () => {
    const { provider } = make()
    const [result] = await provider.search(query)
    if (!result) throw new Error('no result')
    const file = await provider.download(result)
    expect(file.name).toBe(`${result.releaseName}.srt`)
    expect(new TextDecoder().decode(file.bytes)).toContain('subtitles from SubSource')
  })

  test('its rate limit: past 60 a minute, a 429 with when to come back', async () => {
    const { provider, clock } = make()
    clock.set(Date.UTC(2026, 9, 17, 20, 15, 0))
    for (let i = 0; i < FAKE_SUBSOURCE_LIMIT / 3; i++) await provider.search(query)
    clock.advance(15_000)
    const error = await failure(provider.search(query))
    expect(error.kind).toBe('rate-limited')
    expect(error.retryAfterMs).toBe(45_000)
    clock.advance(45_000)
    expect((await provider.search(query)).length).toBeGreaterThan(0)
  })

  test('without Retry-After, the body’s retryAfter is read', async () => {
    const { provider, fake } = make()
    fake.misbehave(
      'subsource',
      { kind: 'status', status: 429, body: { retryAfter: 30 } },
      { times: 1 },
    )
    const error = await failure(provider.search(query))
    expect(error.kind).toBe('rate-limited')
    expect(error.retryAfterMs).toBe(30_000)
  })

  test('a bad key is auth; none is no-account', async () => {
    const { provider, store } = make()
    store.creds = { apiKey: 'wrong' }
    expect((await failure(provider.search(query))).kind).toBe('auth')
    expect((await failure(provider.account())).kind).toBe('auth')
    store.creds = {}
    expect((await failure(provider.search(query))).kind).toBe('no-account')
  })

  test('the account is the masked key', async () => {
    const { provider } = make()
    expect(await provider.account()).toEqual({
      account: '••••-key',
      remaining: null,
      limit: 7200,
      resetsAt: null,
    })
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { createSubdl } from '../../src/providers/subdl.ts'
import { ProviderError, type SubtitleQuery } from '../../src/shared/types.ts'
import { makeZip } from '../fake/index.ts'
import { setup } from './store.ts'

const query: SubtitleQuery = {
  tmdbId: 45745,
  imdbId: 'tt1727587',
  title: 'Sintel',
  year: 2010,
  moviehash: null,
  languages: ['en', 'pt-BR', 'zh-Hant'],
}

function make(options: Parameters<typeof setup>[1] = {}) {
  const s = setup('subdl', options)
  return { ...s, provider: createSubdl(s.deps) }
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

const enc = new TextEncoder()
const SRT = '1\n00:00:01,000 --> 00:00:02,000\nHello\n'

describe('Subdl', () => {
  test('searches by TMDB id with the documented parameters', async () => {
    const { provider, fake } = make()
    await provider.search(query)
    const url = fake.requests[0]?.url
    expect(url?.origin + (url?.pathname ?? '')).toBe('https://api.subdl.com/api/v1/subtitles')
    expect(Object.fromEntries(url?.searchParams ?? [])).toEqual({
      api_key: 'fake-subdl-key',
      tmdb_id: '45745',
      type: 'movie',
      year: '2010',
      languages: 'EN,BR_PT,ZH_BG',
      subs_per_page: '30',
      releases: '1',
      hi: '1',
      client: 'custom_integration',
    })
  })

  test('maps results', async () => {
    const { provider, fake } = make({ generate: false })
    fake.add({
      provider: 'subdl',
      tmdbId: 45745,
      language: 'pt-BR',
      releaseName: 'Sintel.2010.1080p.BluRay.x264-GROUP',
      releases: ['Sintel.2010.1080p.BluRay.x264-GROUP', 'Sintel.2010.720p.BluRay.x264-GROUP'],
      hi: true,
    })
    fake.add({ provider: 'subdl', tmdbId: 45745, language: 'zh-Hant', releaseName: 'Sintel.2010' })
    const results = await provider.search(query)
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      provider: 'subdl',
      language: 'pt-BR',
      releaseName: 'Sintel.2010.1080p.BluRay.x264-GROUP',
      releases: ['Sintel.2010.1080p.BluRay.x264-GROUP', 'Sintel.2010.720p.BluRay.x264-GROUP'],
      hi: true,
      forced: false,
      idMatch: true,
      hashMatch: false,
      translated: false,
    })
    expect(results[0]?.ref).toMatch(/^\/subtitle\/\d+-\d+\.zip$/)
    expect(results[1]?.language).toBe('zh-Hant')
  })

  test('nothing found is an empty list', async () => {
    const { provider } = make({ generate: false })
    expect(await provider.search(query)).toEqual([])
  })

  test('downloads the zip and reads the subtitle in it', async () => {
    const { provider } = make()
    const [result] = await provider.search(query)
    if (!result) throw new Error('no result')
    const file = await provider.download(result)
    expect(file.name).toBe(`${result.releaseName}.srt`)
    expect(new TextDecoder().decode(file.bytes)).toContain('subtitles from Subdl')
  })

  test('a zip with a path outside is refused', async () => {
    const { provider, fake } = make()
    const [result] = await provider.search(query)
    if (!result) throw new Error('no result')
    fake.serve(
      `https://dl.subdl.com${result.ref}`,
      makeZip([{ name: '../evil.srt', bytes: enc.encode(SRT) }]),
    )
    const error = await failure(provider.download(result))
    expect(error.kind).toBe('invalid')
  })

  test('stored and deflated entries are read; one over 2 MB is refused', async () => {
    const { provider, fake } = make()
    const [result] = await provider.search(query)
    if (!result) throw new Error('no result')
    const url = `https://dl.subdl.com${result.ref}`
    fake.serve(url, makeZip([{ name: 'folder/stored.srt', bytes: enc.encode(SRT), method: 0 }]))
    expect(await provider.download(result)).toEqual({ name: 'stored.srt', bytes: enc.encode(SRT) })
    fake.serve(url, makeZip([{ name: 'deflated.srt', bytes: enc.encode(SRT), method: 8 }]))
    expect(await provider.download(result)).toEqual({
      name: 'deflated.srt',
      bytes: enc.encode(SRT),
    })
    fake.serve(url, makeZip([{ name: 'big.srt', bytes: enc.encode(SRT.repeat(60_000)) }]))
    expect((await failure(provider.download(result))).kind).toBe('invalid')
  })

  test('a bad key is refused as auth; none is no-account', async () => {
    const { provider, store, fake } = make()
    store.creds = { apiKey: 'wrong-key' }
    expect((await failure(provider.search(query))).kind).toBe('auth')
    expect((await failure(provider.account())).kind).toBe('auth')
    store.creds = null
    const before = fake.requests.length
    expect((await failure(provider.search(query))).kind).toBe('no-account')
    expect(fake.requests).toHaveLength(before)
  })

  test('the account is the masked key, against the documented daily limit', async () => {
    const { provider, fake } = make()
    expect(await provider.account()).toEqual({
      account: '••••-key',
      remaining: null,
      limit: 2000,
      resetsAt: null,
    })
    expect(fake.requests[0]?.url.pathname).toBe('/api/v1/me')
  })

  test('a 429 is rate-limited', async () => {
    const { provider, fake } = make()
    fake.misbehave('subdl', { kind: 'status', status: 429, retryAfter: '120' })
    const error = await failure(provider.search(query))
    expect(error.kind).toBe('rate-limited')
    expect(error.retryAfterMs).toBe(120_000)
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { createFakeClock } from '@highsea/core'
import { createProvider, PROVIDER_INFO, PROVIDER_ORDER } from '../../src/providers/index.ts'
import { createFakeSubtitles, FAKE_OPENSUBTITLES_KEY } from '../fake/index.ts'
import { memoryStore } from './store.ts'

describe('providers', () => {
  test('one adapter per id, in the order ties go', () => {
    const clock = createFakeClock()
    const fake = createFakeSubtitles({ clock })
    const deps = {
      fetch: fake.fetch,
      clock,
      userAgent: 'highsea v0.0.0',
      store: memoryStore(clock, null),
      openSubtitlesKey: null,
    }
    expect(PROVIDER_ORDER.map((id) => createProvider(id, deps).id)).toEqual(PROVIDER_ORDER)
    expect(Object.keys(PROVIDER_INFO).sort()).toEqual([...PROVIDER_ORDER].sort())
    expect(PROVIDER_INFO.opensubtitles.attribution).toBe('Subtitles provided by OpenSubtitles.com')
    expect(PROVIDER_INFO.subdl.dailyLimit).toBe(2000)
    expect(PROVIDER_INFO.subsource.dailyLimit).toBe(7200)
  })
})

describe('the fake', () => {
  test('redirects a search whose parameters are not sorted and lowercase, as the API does', async () => {
    const fake = createFakeSubtitles()
    const response = await fake.fetch(
      'https://api.opensubtitles.com/api/v1/subtitles?type=movie&tmdb_id=45745&languages=EN',
      { headers: { 'Api-Key': FAKE_OPENSUBTITLES_KEY, 'User-Agent': 'highsea v0.0.0' } },
    )
    expect(response.status).toBe(301)
    expect(response.headers.get('location')).toBe(
      'https://api.opensubtitles.com/api/v1/subtitles?languages=en&tmdb_id=45745&type=movie',
    )
  })

  test('any other host is unreachable', async () => {
    const fake = createFakeSubtitles()
    await expect(fake.fetch('https://example.com/')).rejects.toThrow('fake: unknown host')
  })

  test('makes up the same results for the same query', async () => {
    const run = async () => {
      const fake = createFakeSubtitles()
      const r = await fake.fetch(
        'https://api.subdl.com/api/v1/subtitles?api_key=fake-subdl-key&tmdb_id=603&languages=EN,FR',
      )
      return r.json()
    }
    const [a, b] = await Promise.all([run(), run()])
    expect(a).toEqual(b)
    expect((a as { subtitles: unknown[] }).subtitles.length).toBe(6)
  })
})

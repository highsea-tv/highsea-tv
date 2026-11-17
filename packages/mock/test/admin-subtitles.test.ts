// SPDX-License-Identifier: AGPL-3.0-only
// The admin's subtitles routes through the mock's transport (one-client-platform-d.md › D2): the
// answers in the contract's shapes, the writes showing on the next read, and the server's refusals.
import { describe, expect, test } from 'bun:test'
import { routes } from '@highsea-tv/api-contract'
import { createMockFetch, memoryStorage } from '@highsea-tv/mock/transport'
import { type ApiError, createClient } from '@highsea-tv/sdk'

const LAN = 'http://192.168.1.20:3000'
const device = { name: 'Ruth’s Mac', client: 'web' as const, appVersion: '0.4.0' }

const setup = async (role: 'owner' | 'admin' | 'user' = 'admin') => {
  const fetch = createMockFetch({ latency: 0, storage: memoryStorage() })
  const r = await createClient({ baseUrl: LAN, fetch }).auth.signIn({
    body: { username: 'ruth', password: 'x', device },
  })
  if (r.status !== 'signed-in' || !r.token) throw new Error('not signed in')
  fetch.setState({ role })
  return { fetch, c: createClient({ baseUrl: LAN, fetch, token: r.token }) }
}

const caught = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as ApiError
  }
  throw new Error('it answered')
}

type Schema = { parse(value: unknown): unknown }
const parse = (route: { responses: Record<number, unknown> }, value: unknown) =>
  (
    route.responses as Record<number, { content?: { 'application/json'?: { schema: Schema } } }>
  )[200]?.content?.['application/json']?.schema?.parse(value)

const r = routes.subtitles

describe('subtitles', () => {
  test('stats, the wanted list in pages, and searching for all of it', async () => {
    const { c } = await setup()
    parse(r.stats, await c.subtitles.stats())
    const first = await c.subtitles.wanted({ query: { limit: 1 } })
    parse(r.wanted, first)
    expect(first.total).toBeGreaterThan(1)
    expect(first.items).toHaveLength(1)
    const second = await c.subtitles.wanted({ query: { limit: 1, cursor: first.next ?? '' } })
    expect(second.items[0]?.movie.id).not.toBe(first.items[0]?.movie.id)
    const all = await c.subtitles.wanted({ query: {} })
    expect(all.items).toHaveLength(Math.min(50, first.total))

    const { queued } = await c.subtitles.searchAllMissing()
    expect(queued).toBe(first.total)
    expect((await c.subtitles.wanted({ query: {} })).total).toBe(0)

    const bad = await caught(c.subtitles.wanted({ query: { cursor: 'nonsense' } }))
    expect(bad.status).toBe(400)
  })

  test('a movie’s tracks: search, Use, re-sync, the offset and delete', async () => {
    const { c } = await setup()
    const { items } = await c.subtitles.wanted({ query: {} })
    const want = items[0]
    if (!want) throw new Error('nothing wanted')
    const id = want.movie.id
    const language = want.missingLanguages[0] ?? 'en'

    const found = await c.subtitles.search({ params: { id }, body: { language } })
    parse(r.search, found)
    expect(found.length).toBeGreaterThan(0)
    // SubSource is off in the seed, so none of its results come back
    expect(found.some((x) => x.provider === 'SubSource')).toBe(false)
    const best = found[0]
    if (!best) throw new Error('no results')

    const used = await c.subtitles.download({ params: { id }, body: { resultId: best.id } })
    parse(r.download, used)
    expect(used).toMatchObject({
      itemId: id,
      language,
      chosen: true,
      releaseName: best.releaseName,
    })
    const tracks = await c.subtitles.forItem({ params: { id } })
    parse(r.forItem, tracks)
    expect(tracks.map((x) => x.id)).toContain(used.id)

    const syncing = await c.subtitles.sync({ params: { id: used.id } })
    expect(syncing.sync.status).toBe('syncing')
    const moved = await c.subtitles.setOffset({ params: { id: used.id }, body: { ms: 250 } })
    expect(moved.sync.offsetMs).toBe(250)

    await c.subtitles.delete({ params: { id: used.id } })
    const after = await c.subtitles.forItem({ params: { id } })
    expect(after.map((x) => x.id)).not.toContain(used.id)
    expect((await caught(c.subtitles.delete({ params: { id: used.id } }))).status).toBe(404)

    const expired = await caught(
      c.subtitles.download({ params: { id }, body: { resultId: 'sub-res-gone' } }),
    )
    expect(expired.status).toBe(404)
    expect(expired.details).toMatchObject({ reason: 'result-expired' })
    expect((await caught(c.subtitles.forItem({ params: { id: 999_999_999 } }))).status).toBe(404)
  })

  test('providers: the list, turning one on, an account and its test', async () => {
    const { c, fetch } = await setup('owner')
    const list = await c.subtitles.providers()
    parse(r.providers, list)
    const subsource = list.find((p) => p.id === 'subsource')
    expect(subsource).toMatchObject({ enabled: false, account: null })

    const noAccount = await caught(
      c.subtitles.toggleProvider({ params: { id: 'subsource' }, body: { enabled: true } }),
    )
    expect(noAccount.status).toBe(409)
    expect(noAccount.details).toMatchObject({ reason: 'no-account' })

    const failed = await c.subtitles.testProvider({ params: { id: 'subsource' }, body: {} })
    expect(failed.ok).toBe(false)
    const tested = await c.subtitles.testProvider({
      params: { id: 'subsource' },
      body: { apiKey: 'abcd1234' },
    })
    expect(tested).toEqual({ ok: true, message: 'Signed in to SubSource.', account: '••••1234' })

    const saved = await c.subtitles.saveProvider({
      params: { id: 'subsource' },
      body: { apiKey: 'abcd1234' },
    })
    parse(r.saveProvider, saved)
    expect(saved.account).toBe('••••1234')
    expect(saved.fields).toEqual([{ key: 'apiKey', secret: true, set: true, value: null }])
    const on = await c.subtitles.toggleProvider({
      params: { id: 'subsource' },
      body: { enabled: true },
    })
    expect(on.enabled).toBe(true)

    // an account is the owner's alone
    fetch.setState({ role: 'admin' })
    const forbidden = await caught(
      c.subtitles.saveProvider({ params: { id: 'subdl' }, body: { apiKey: 'x' } }),
    )
    expect(forbidden.status).toBe(403)
  })

  test('none on: a search is refused', async () => {
    const { c } = await setup()
    for (const p of await c.subtitles.providers())
      if (p.enabled)
        await c.subtitles.toggleProvider({ params: { id: p.id }, body: { enabled: false } })
    const [want] = (await c.subtitles.wanted({ query: {} })).items
    const refused = await caught(
      c.subtitles.search({ params: { id: want?.movie.id ?? 0 }, body: { language: 'en' } }),
    )
    expect(refused.status).toBe(409)
    expect(refused.details).toMatchObject({ reason: 'no-providers' })
  })

  test('languages and language profiles', async () => {
    const { c } = await setup()
    parse(r.languages, await c.subtitles.languages())
    const profiles = await c.subtitles.languageProfiles()
    parse(r.languageProfiles, profiles)

    const made = await c.subtitles.createLanguageProfile({
      body: {
        name: 'French',
        languages: [{ code: 'fr', forced: 'no', hi: 'no' }],
        cutoff: 'fr',
        minScore: 80,
      },
    })
    parse(r.createLanguageProfile, made)
    expect((await c.subtitles.languageProfiles()).map((p) => p.name)).toContain('French')

    const renamed = await c.subtitles.saveLanguageProfile({
      params: { id: made.id },
      body: { ...made, name: 'French only' },
    })
    expect(renamed.name).toBe('French only')

    const twice = await caught(
      c.subtitles.createLanguageProfile({ body: { ...made, name: 'French only' } }),
    )
    expect(twice.status).toBe(409)
    const cutoff = await caught(
      c.subtitles.saveLanguageProfile({ params: { id: made.id }, body: { ...made, cutoff: 'en' } }),
    )
    expect(cutoff.status).toBe(400)

    await c.subtitles.deleteLanguageProfile({ params: { id: made.id } })
    expect((await c.subtitles.languageProfiles()).map((p) => p.id)).not.toContain(made.id)
    expect(
      (await caught(c.subtitles.deleteLanguageProfile({ params: { id: made.id } }))).status,
    ).toBe(404)
  })

  test('settings, and a user is refused', async () => {
    const { c, fetch } = await setup()
    parse(r.settings, await c.subtitles.settings())
    const saved = await c.subtitles.saveSettings({ body: { minScore: 85 } })
    expect(saved.minScore).toBe(85)
    expect((await c.subtitles.settings()).minScore).toBe(85)

    fetch.setState({ role: 'user' })
    expect((await caught(c.subtitles.settings())).status).toBe(403)
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
// The admin's shows routes through the mock transport (one-client-platform-d.md › D3, answer 5):
// drafted in the contract (`series`), answered from the mock's shows in the contract's shapes, and
// refused as the server would refuse them.
import { describe, expect, test } from 'bun:test'
import { isDraft, routes } from '@highsea-tv/api-contract'
import { createMockFetch, memoryStorage } from '@highsea-tv/mock/transport'
import { type ApiError, createClient } from '@highsea-tv/sdk'

const LAN = 'http://192.168.1.20:3000'
const device = { name: 'Theo’s Mac', client: 'web' as const, appVersion: '0.4.0' }

const setup = async (as = 'theo') => {
  const role = as === 'theo' ? 'admin' : 'user'
  const fetch = createMockFetch({ latency: 0, storage: memoryStorage(), state: { role } })
  const anon = createClient({ baseUrl: LAN, fetch })
  const r = await anon.auth.signIn({ body: { username: as, password: 'x', device } })
  if (r.status !== 'signed-in' || !r.token) throw new Error('not signed in')
  return createClient({ baseUrl: LAN, fetch, token: r.token })
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
const shaped = (route: { responses: Record<number, unknown> }, value: unknown) => {
  const ok = route.responses[200] as { content: { 'application/json': { schema: Schema } } }
  return ok.content['application/json'].schema.parse(value)
}

describe('the admin’s shows', () => {
  test('every route is a draft', () => {
    for (const r of Object.values(routes.series)) expect(isDraft(r)).toBe(true)
  })

  test('lists the library and opens a show with its seasons', async () => {
    const c = await setup()
    const list = await c.series.list()
    shaped(routes.series.list, list)
    expect(list.length).toBeGreaterThan(0)
    const keepers = list.find((s) => s.id === 'the-lantern-keepers')
    if (!keepers) throw new Error('no Lantern Keepers')
    const show = await c.series.get({ params: { id: keepers.id } })
    shaped(routes.series.get, show)
    expect(show.seasonList.length).toBeGreaterThan(0)
    const missing = await caught(c.series.get({ params: { id: 'nowhere' } }))
    expect(missing.status).toBe(404)
  })

  test('edits a show, monitors a season and an episode, and searches', async () => {
    const c = await setup()
    const id = 'the-lantern-keepers'
    const edited = await c.series.update({ params: { id }, body: { seasonFolders: false } })
    expect(edited.seasonFolders).toBe(false)
    const show = await c.series.get({ params: { id } })
    const season = show.seasonList.find((s) => s.episodes.length > 0)
    if (!season) throw new Error('no season')
    await c.series.monitorSeason({
      params: { id, season: season.number },
      body: { monitored: false },
    })
    const off = (await c.series.get({ params: { id } })).seasonList.find(
      (s) => s.number === season.number,
    )
    expect(off?.monitored).toBe(false)
    expect(off?.episodes.every((e) => !e.monitored)).toBe(true)
    const first = season.episodes[0]
    if (!first) throw new Error('no episode')
    await c.series.monitorEpisode({
      params: { id, episodeId: first.id },
      body: { monitored: true },
    })
    const again = (await c.series.get({ params: { id } })).seasonList.find(
      (s) => s.number === season.number,
    )
    expect(again?.episodes.find((e) => e.id === first.id)?.monitored).toBe(true)
    const r = await c.series.search({ params: { id }, body: {} })
    expect(r.found).toBeGreaterThanOrEqual(0)
  })

  test('finds shows to add, adds one and removes it', async () => {
    const c = await setup()
    const found = await c.series.discover({ query: {} })
    shaped(routes.series.discover, found)
    const there = found.find((s) => !s.inLibrary)
    if (!there) throw new Error('nothing to add')
    const [folder] = await c.series.rootFolders()
    if (!folder) throw new Error('no folder')
    const added = await c.series.add({
      body: {
        tmdbId: there.tmdbId,
        title: there.title,
        year: there.year,
        qualityProfileId: 'qp-hd',
        languageProfileId: 'lp-en',
        rootFolder: folder,
        monitor: 'all',
        seasonFolders: true,
        search: false,
      },
    })
    shaped(routes.series.add, added)
    expect((await c.series.discover({ query: { query: there.title } }))[0]?.inLibrary).toBe(true)
    await c.series.remove({ params: { id: added.id }, query: {} })
    expect((await c.series.list()).some((s) => s.id === added.id)).toBe(false)
  })

  test('a user is refused', async () => {
    const c = await setup('ruth')
    const e = await caught(c.series.list())
    expect(e.status).toBe(403)
  })
})

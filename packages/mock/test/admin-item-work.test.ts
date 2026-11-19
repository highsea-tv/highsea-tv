// SPDX-License-Identifier: AGPL-3.0-only
// What's in hand on a library item through the mock transport (HT-106): Refresh on a film or a
// show queues a job the item's read and the library's read both show, which runs on the mock's
// clock, says how far it is, and ends, staying in the item's read as finished.
import { describe, expect, test } from 'bun:test'
import { routes } from '@highsea-tv/api-contract'
import { createMock } from '@highsea-tv/mock/mock'
import { createMockFetch, memoryStorage } from '@highsea-tv/mock/transport'
import { createClient } from '@highsea-tv/sdk'

const LAN = 'http://192.168.1.20:3000'
const device = { name: 'Theo’s Mac', client: 'web' as const, appVersion: '0.4.0' }

const setup = async () => {
  const storage = memoryStorage()
  const mock = createMock(storage)
  const fetch = createMockFetch({ latency: 0, storage, mock, state: { role: 'admin' } })
  const anon = createClient({ baseUrl: LAN, fetch })
  const r = await anon.auth.signIn({ body: { username: 'theo', password: 'x', device } })
  if (r.status !== 'signed-in' || !r.token) throw new Error('not signed in')
  return { c: createClient({ baseUrl: LAN, fetch, token: r.token }), mock }
}

type Schema = { parse(value: unknown): unknown }
const shaped = (route: { responses: Record<number, unknown> }, value: unknown) => {
  const ok = route.responses[200] as { content: { 'application/json': { schema: Schema } } }
  return ok.content['application/json'].schema.parse(value)
}

describe('an item’s work in the mock', () => {
  test('a film’s refresh is queued, runs, says how far it is, and ends', async () => {
    const { c, mock } = await setup()
    const film = (await c.movies.list({ query: { limit: 1 } })).items[0]
    if (!film) throw new Error('no films')
    const id = String(film.id)
    expect(await c.system.work()).toEqual([])

    await c.movies.refresh({ params: { id: film.id } })
    // a second press while it waits queues nothing more
    await c.movies.refresh({ params: { id: film.id } })
    const work = await c.system.work()
    shaped(routes.system.work, work)
    expect(work).toMatchObject([
      { kind: 'movie', id, jobs: [{ type: 'metadata.refresh', state: 'queued', progress: null }] },
    ])

    mock.clock.advance(3)
    const running = await c.system.itemWork({ params: { kind: 'movie', id } })
    shaped(routes.system.itemWork, running)
    expect(running.active).toMatchObject([{ state: 'running' }])
    expect(running.active[0]?.progress).toBeGreaterThan(0)

    mock.clock.advance(10)
    expect(await c.system.work()).toEqual([])
    const done = await c.system.itemWork({ params: { kind: 'movie', id } })
    expect(done.active).toEqual([])
    expect(done.finished).toMatchObject([{ type: 'metadata.refresh', state: 'succeeded' }])
  })

  test('a show’s refresh is the show’s work', async () => {
    const { c } = await setup()
    const show = (await c.series.list())[0]
    if (!show) throw new Error('no shows')
    await c.series.refresh({ params: { id: show.id } })
    expect(await c.system.work()).toMatchObject([
      { kind: 'show', id: show.id, jobs: [{ type: 'metadata.refresh' }] },
    ])
  })
})

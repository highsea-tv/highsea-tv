// SPDX-License-Identifier: AGPL-3.0-only
// The importers' routes through the SDK (6b; ADR 0041): Radarr and qBittorrent's test, preview,
// run and status, and qBittorrent's resume, against the fakes on loopback. The owner's only: an
// admin and a user are refused every route. Starting an import is in the audit log, and the key
// isn't. The importers' own behaviour is tested in packages/importers.
import { afterEach, describe, expect, test } from 'bun:test'
import { accessOf, routes } from '@highsea/api-contract'
import {
  FAKE_QBT_PASSWORD,
  FAKE_QBT_USER,
  FAKE_RADARR_KEY,
  qbtState,
  radarrLibrary,
  startFakeQbittorrent,
  startFakeRadarr,
} from '@highsea/importers/fake'
import { createReplayFetch } from '@highsea/metadata/replay'
import { createApi } from '../src/api/app.ts'
import { addMember, bootRuntime, cleanup, clientFor, failure, withOwner } from './helpers.ts'

const closers: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const c of closers.splice(0)) await c()
  await cleanup()
})

/** The fakes are on loopback; TMDB is answered from the recordings. Nothing leaves the machine. */
function loopbackOr(replay: ReturnType<typeof createReplayFetch>) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    return url.hostname === '127.0.0.1' ? globalThis.fetch(input, init) : replay(input, init)
  }) as typeof globalThis.fetch
}

async function started() {
  const runtime = await bootRuntime({ fetch: loopbackOr(createReplayFetch()) })
  const app = createApi(runtime)
  const { owner, token } = await withOwner(runtime)
  const admin = await addMember(runtime, owner.id, 'Ruth', 'admin')
  const user = await addMember(runtime, owner.id, 'Sam', 'user')
  const radarr = await startFakeRadarr(radarrLibrary('/movies', '/movies-4k'))
  const qbt = await startFakeQbittorrent(qbtState())
  closers.push(radarr.close, qbt.close)
  return {
    runtime,
    radarr: { url: radarr.url, apiKey: FAKE_RADARR_KEY },
    qbt: { url: qbt.url, username: FAKE_QBT_USER, password: FAKE_QBT_PASSWORD },
    ownerApi: clientFor(app, { token }),
    adminApi: clientFor(app, { token: admin.token }),
    userApi: clientFor(app, { token: user.token }),
  }
}

describe('the importers over the API', () => {
  test('every route is the owner’s', () => {
    for (const r of Object.values(routes.importers)) expect(accessOf(r)).toBe('owner')
  })

  test('Radarr: test, preview, run and status as the owner, in the audit log', async () => {
    const { runtime, radarr, ownerApi } = await started()
    expect(await ownerApi.importers.radarrTest({ body: radarr })).toEqual({
      version: '5.14.0.9383',
      movies: 3,
    })
    expect(
      await failure(ownerApi.importers.radarrTest({ body: { ...radarr, apiKey: 'wrong' } })),
    ).toEqual({ code: 'invalid', reason: 'bad-credentials' })

    const preview = await ownerApi.importers.radarrPreview({
      body: { ...radarr, pathMappings: [] },
    })
    expect(preview.movies.total).toBe(3)
    expect(preview.kept).toEqual({ indexers: ['Nyaa'], downloadClients: ['qBittorrent'] })
    expect(preview.profiles.map((p) => p.options[0])).toEqual(['qp-any', 'qp-hd', 'qp-uhd'])

    expect(await ownerApi.importers.radarrStatus()).toMatchObject({ state: 'idle' })
    const begun = await ownerApi.importers.radarrRun({
      body: { ...radarr, pathMappings: [], settings: false },
    })
    expect(begun).toMatchObject({ state: 'running', done: 0 })
    expect(begun.startedAt).toEqual(expect.any(String))
    expect(
      await failure(ownerApi.importers.radarrRun({ body: { ...radarr, pathMappings: [] } })),
    ).toEqual({ code: 'conflict', reason: 'running' })

    await runtime.jobs.tick()
    await runtime.jobs.idle()
    // nothing mapped: every movie is outside the folders highsea may use
    expect(await ownerApi.importers.radarrStatus()).toMatchObject({
      state: 'done',
      total: 3,
      imported: 0,
    })

    const log = await ownerApi.audit.list({ query: {} })
    const entry = log.items.find((e) => e.action === 'import.radarr')
    expect(entry).toBeDefined()
    expect(JSON.stringify(log)).not.toContain(FAKE_RADARR_KEY)
  })

  test('qBittorrent: test, preview, run, status and resume as the owner', async () => {
    const { runtime, qbt, ownerApi } = await started()
    expect(await ownerApi.importers.qbittorrentTest({ body: qbt })).toEqual({
      version: '5.0.2',
      webApi: '2.11.2',
      torrents: 0,
    })
    expect(
      await failure(ownerApi.importers.qbittorrentTest({ body: { ...qbt, password: 'nope' } })),
    ).toEqual({ code: 'invalid', reason: 'bad-credentials' })
    const preview = await ownerApi.importers.qbittorrentPreview({
      body: { ...qbt, pathMappings: [] },
    })
    expect(preview.torrents.total).toBe(0)
    expect(preview.categories.map((c) => c.name)).toEqual(['linux-isos', 'radarr'])

    await ownerApi.importers.qbittorrentRun({ body: { ...qbt, pathMappings: [] } })
    await runtime.jobs.tick()
    await runtime.jobs.idle()
    expect(await ownerApi.importers.qbittorrentStatus()).toMatchObject({
      state: 'done',
      paused: 0,
      checking: 0,
    })
    const resumed = await ownerApi.importers.qbittorrentResume()
    expect(resumed.resumedAt).toEqual(expect.any(String))
    const actions = (await ownerApi.audit.list({ query: {} })).items.map((e) => e.action)
    expect(actions).toContain('import.qbittorrent')
    expect(actions).toContain('import.qbittorrent.resume')
  })

  test('an admin and a user are refused every route', async () => {
    const { radarr, qbt, adminApi, userApi } = await started()
    for (const api of [adminApi, userApi]) {
      const calls = [
        api.importers.radarrTest({ body: radarr }),
        api.importers.radarrPreview({ body: { ...radarr, pathMappings: [] } }),
        api.importers.radarrRun({ body: { ...radarr, pathMappings: [] } }),
        api.importers.radarrStatus(),
        api.importers.qbittorrentTest({ body: qbt }),
        api.importers.qbittorrentPreview({ body: { ...qbt, pathMappings: [] } }),
        api.importers.qbittorrentRun({ body: { ...qbt, pathMappings: [] } }),
        api.importers.qbittorrentStatus(),
        api.importers.qbittorrentResume(),
      ]
      for (const call of calls) expect((await failure(call)).code).toBe('forbidden')
    }
  })
})

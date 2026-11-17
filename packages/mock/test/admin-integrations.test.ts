// SPDX-License-Identifier: AGPL-3.0-only
// The admin's integration routes through the mock's transport (one-client-platform-d.md › D3):
// Settings › Connections and notifications, Import lists and Migration, in the contract's shapes,
// the writes showing on the next read, and the server's refusals.
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
  const ok = (route.responses[200] ?? route.responses[201]) as {
    content: { 'application/json': { schema: Schema } }
  }
  return ok.content['application/json'].schema.parse(value)
}

describe('connections', () => {
  test('lists them masked, adds, edits keeping a masked secret, tests and removes', async () => {
    const c = await setup()
    const list = await c.connections.list()
    shaped(routes.connections.list, list)
    expect(list.length).toBeGreaterThan(0)

    const added = await c.connections.add({
      body: {
        kind: 'discord',
        name: 'Family',
        enabled: true,
        events: ['imported'],
        settings: { webhookUrl: 'https://discord.com/api/webhooks/1/abcwxyz' },
      },
    })
    shaped(routes.connections.add, added)
    expect(added.settings.webhookUrl).toBe('••••wxyz')

    const edited = await c.connections.update({
      params: { id: added.id },
      body: { ...added, name: 'Family room', events: ['imported', 'health'] },
    })
    expect(edited.name).toBe('Family room')
    expect(edited.events).toEqual(['imported', 'health'])
    // the masked secret went back as it came and kept its value: a test still reads it
    expect(
      (
        await c.connections.test({
          body: { id: added.id, kind: 'discord', settings: edited.settings },
        })
      ).ok,
    ).toBe(true)
    expect((await c.connections.testSaved({ params: { id: added.id } })).ok).toBe(true)
    const sent = (await c.connections.list()).find((x) => x.id === added.id)
    expect(sent?.lastSentAt).not.toBeNull()

    await c.connections.remove({ params: { id: added.id } })
    expect((await c.connections.list()).some((x) => x.id === added.id)).toBe(false)
  })

  test('a connection keeps the events the contract doesn’t carry', async () => {
    const c = await setup()
    const added = await c.connections.add({
      body: { kind: 'ntfy', name: 'Phone', enabled: true, events: [], settings: { topic: 'x' } },
    })
    const saved = await c.connections.update({
      params: { id: added.id },
      body: { ...added, events: ['grabbed'] },
    })
    shaped(routes.connections.update, saved)
    expect(saved.events).toEqual(['grabbed'])
  })

  test('refuses a connection without a name, and is staff’s', async () => {
    const c = await setup()
    const e = await caught(
      c.connections.add({
        body: { kind: 'slack', name: ' ', enabled: true, events: [], settings: {} },
      }),
    )
    expect(e.status).toBe(400)
    const user = await setup('user')
    expect((await caught(user.connections.list())).status).toBe(403)
  })

  test('the push key and a connection’s log aren’t drawn by the mock', async () => {
    const c = await setup()
    expect((await caught(c.connections.pushKey())).status).toBe(501)
  })

  test('this person’s browsers: added by name, listed and removed', async () => {
    const c = await setup()
    const sub = await c.pushSubscriptions.add({
      body: {
        endpoint: 'https://push.example/1',
        keys: { p256dh: 'p', auth: 'a' },
        label: 'Firefox on Linux',
      },
    })
    shaped(routes.pushSubscriptions.add, sub)
    const listed = await c.pushSubscriptions.list()
    shaped(routes.pushSubscriptions.list, listed)
    expect(listed.some((p) => p.id === sub.id)).toBe(true)
    await c.pushSubscriptions.remove({ params: { id: sub.id } })
    expect((await c.pushSubscriptions.list()).some((p) => p.id === sub.id)).toBe(false)
  })
})

describe('import lists', () => {
  test('lists movie lists with their source as kind; adds, checks, edits and removes one', async () => {
    const c = await setup()
    const lists = await c.importLists.list()
    shaped(routes.importLists.list, lists)
    for (const l of lists) expect(l.kind).toBe(l.settings.kind)

    const folder = (await c.rootFolders.list())[0]?.path ?? ''
    const profile = (await c.quality.profiles())[0]?.id ?? ''
    const added = await c.importLists.add({
      body: {
        name: 'Popular',
        enabled: true,
        settings: { kind: 'tmdb', source: 'popular' },
        rootFolder: folder,
        qualityProfileId: profile,
        languageProfileId: null,
        monitored: true,
        minimumAvailability: 'released',
        searchOnAdd: false,
      },
    })
    shaped(routes.importLists.add, added)
    // added lists are checked at once
    expect(added.lastSync).not.toBeNull()
    expect(added.lastResult?.found).toBe(20)

    await c.importLists.sync({ params: { id: added.id } })
    const renamed = await c.importLists.update({
      params: { id: added.id },
      body: { ...added, name: 'TMDB popular' },
    })
    expect(renamed.name).toBe('TMDB popular')
    await c.importLists.remove({ params: { id: added.id } })
    expect((await c.importLists.list()).some((l) => l.id === added.id)).toBe(false)
  })

  test('tests a source, and refuses a list in no root folder', async () => {
    const c = await setup()
    const ok = await c.importLists.test({ body: { settings: { kind: 'tmdb', source: 'popular' } } })
    shaped(routes.importLists.test, ok)
    expect(ok.ok).toBe(true)
    const bad = await c.importLists.test({
      body: { settings: { kind: 'generic', url: 'https://example.org/wrong.json' } },
    })
    expect(bad.ok).toBe(false)
    const e = await caught(
      c.importLists.add({
        body: {
          name: 'Nowhere',
          enabled: true,
          settings: { kind: 'tmdb', source: 'popular' },
          rootFolder: '/nowhere',
          qualityProfileId: 'qp-hd',
          languageProfileId: null,
          monitored: true,
          minimumAvailability: 'released',
          searchOnAdd: false,
        },
      }),
    )
    expect(e.status).toBe(400)
  })

  test('Trakt’s device flow connects on the second poll, and disconnects', async () => {
    const c = await setup()
    await c.importLists.traktDisconnect()
    expect((await c.importLists.trakt()).account).toBeNull()
    const code = await c.importLists.traktConnect()
    shaped(routes.importLists.traktConnect, code)
    expect((await c.importLists.traktPoll()).state).toBe('pending')
    expect((await c.importLists.traktPoll()).state).toBe('connected')
    expect((await c.importLists.trakt()).account).not.toBeNull()
  })

  test('the exclusions, newest first, and one removed', async () => {
    const c = await setup()
    const xs = await c.importLists.exclusions()
    shaped(routes.importLists.exclusions, xs)
    const first = xs[0]
    if (!first) throw new Error('no exclusions seeded')
    await c.importLists.removeExclusion({ params: { tmdbId: first.tmdbId } })
    expect((await c.importLists.exclusions()).some((e) => e.tmdbId === first.tmdbId)).toBe(false)
  })
})

describe('migration', () => {
  test('Radarr: tested, previewed and run, its status in the contract’s shape', async () => {
    const c = await setup('owner')
    const conn = { url: 'http://radarr:7878', apiKey: 'secret' }
    shaped(routes.importers.radarrTest, await c.importers.radarrTest({ body: conn }))
    const preview = await c.importers.radarrPreview({
      body: { ...conn, pathMappings: [{ from: '/movies', to: '/data/media/movies' }] },
    })
    shaped(routes.importers.radarrPreview, preview)
    expect(preview.profiles.length).toBeGreaterThan(0)
    const idle = await c.importers.radarrStatus()
    expect(idle.state).toBe('idle')
    const run = await c.importers.radarrRun({ body: { ...conn, pathMappings: [] } })
    shaped(routes.importers.radarrRun, run)
    expect(['running', 'done']).toContain(run.state)
  })

  test('Radarr refuses a wrong key on its field', async () => {
    const c = await setup('owner')
    const e = await caught(
      c.importers.radarrTest({ body: { url: 'http://radarr:7878', apiKey: 'wrong' } }),
    )
    expect(e.status).toBe(400)
    expect((e.details as { field?: string }).field).toBe('apiKey')
  })

  test('qBittorrent: previewed with its list, run, and its status', async () => {
    const c = await setup('owner')
    const conn = { url: 'http://qbittorrent:8080', username: 'admin', password: 'x' }
    const preview = await c.importers.qbittorrentPreview({ body: { ...conn, pathMappings: [] } })
    shaped(routes.importers.qbittorrentPreview, preview)
    const run = await c.importers.qbittorrentRun({ body: { ...conn, pathMappings: [] } })
    shaped(routes.importers.qbittorrentRun, run)
    shaped(routes.importers.qbittorrentStatus, await c.importers.qbittorrentStatus())
  })

  test('is the owner’s', async () => {
    const c = await setup('admin')
    expect((await caught(c.importers.radarrStatus())).status).toBe(403)
  })
})

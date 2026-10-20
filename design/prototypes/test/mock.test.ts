// SPDX-License-Identifier: AGPL-3.0-only
// The mock server's simulation and API semantics: what the screens rely on to show live states.
import { describe, expect, test } from 'bun:test'
import { ownerDefault } from '@highsea/personalization/widgets'
import { ApiError, createClient, createMock, type Mock } from '../src/mock/client.ts'
import type { MockServer } from '../src/mock/server.ts'
import type { WidgetPlacement } from '../src/mock/types.ts'

// Media ids in the populated seed (database ids, ADR 0014): 1 Sintel, 8 Charge, 19 Nosferatu.

/** Advances in 10-second steps until `done` holds, up to `limit` simulated seconds. */
function until(mock: Mock, done: () => boolean, limit = 6 * 3600): number {
  let elapsed = 0
  while (!done() && elapsed < limit) {
    mock.clock.advance(10)
    elapsed += 10
  }
  if (!done()) throw new Error(`not reached within ${limit}s`)
  return elapsed
}

const torrent = (srv: MockServer, id: string) => {
  const t = srv.state.torrents.find((x) => x.id === id)
  if (!t) throw new Error(`no torrent ${id}`)
  return t
}

describe('simulation', () => {
  test('a download imports, gets subtitles, and they sync', () => {
    const mock = createMock()
    const srv = mock.servers.populated
    const t = torrent(srv, 't-sintel')
    expect(t.state).toBe('downloading')
    const events: string[] = []
    srv.events.subscribe((e) => events.push(e.type))

    until(mock, () => t.state === 'importing')
    expect(t.progress).toBe(1)
    expect(events).toContain('queue.changed')

    until(mock, () => t.state === 'seeding')
    const sintel = srv.state.items.find((m) => m.id === '1')
    expect(sintel?.status).toBe('available')
    expect(sintel?.versions.every((v) => v.fileId)).toBe(true)
    expect(srv.state.history[0]).toMatchObject({ type: 'imported', itemId: '1' })

    const track = () =>
      srv.state.subtitles.find(
        (s) => s.itemId === '1' && s.provider === 'OpenSubtitles' && s.kind === 'external',
      )
    until(mock, () => track()?.sync.status === 'syncing')
    until(mock, () => track()?.sync.status === 'synced')
    expect(track()?.sync).toEqual({ status: 'synced', confidence: 0.93, offsetMs: -1840 })
    expect(events).toContain('subtitles.updated')
  })

  test('never more than three downloads at once; queued ones start as slots free', () => {
    const mock = createMock()
    const srv = mock.servers.populated
    const active = () => srv.state.torrents.filter((t) => t.state === 'downloading').length
    const charge = torrent(srv, 't-charge')
    expect(charge.state).toBe('queued')
    for (let i = 0; i < 400 && charge.state === 'queued'; i++) {
      mock.clock.advance(10)
      expect(active()).toBeLessThanOrEqual(3)
    }
    expect(charge.state).not.toBe('queued')
  })

  test('a release with an executable stays blocked and out of the library', () => {
    const mock = createMock()
    const srv = mock.servers.populated
    const t = torrent(srv, 't-nosferatu')
    expect(t.state).toBe('import-blocked')
    mock.clock.advance(600)
    expect(t.state).toBe('import-blocked')
    expect(srv.state.items.find((m) => m.id === '19')?.status).not.toBe('available')
  })

  test('indexer backoff ends on time, and Driftnet backs off later', () => {
    const mock = createMock()
    const srv = mock.servers.populated
    const keel = srv.state.indexers.find((x) => x.definitionId === 'keel')
    expect(keel?.health).toBe('backoff')
    const ended = until(mock, () => keel?.health === 'healthy')
    expect(ended).toBeGreaterThanOrEqual(230)
    expect(ended).toBeLessThanOrEqual(250)
    const driftnet = srv.state.indexers.find((x) => x.definitionId === 'driftnet')
    until(mock, () => driftnet?.health === 'backoff')
    expect(srv.state.health.some((h) => h.id === 'h-driftnet')).toBe(true)
  })

  test('the RSS sync runs on schedule and reschedules itself', () => {
    const mock = createMock()
    const rss = mock.servers.populated.state.jobs.find((j) => j.id === 'j-rss')
    const first = rss?.nextRun
    until(mock, () => rss?.state === 'running')
    until(mock, () => rss?.state === 'idle')
    expect(rss?.nextRun).not.toBe(first)
    expect(rss?.lastRun).toBeTruthy()
  })

  test('speed samples keep ten minutes', () => {
    const mock = createMock()
    mock.clock.advance(1)
    for (let i = 0; i < 100; i++) mock.clock.advance(10)
    expect(mock.servers.populated.state.speeds.length).toBe(60)
  })
})

describe('client', () => {
  test('Loading never resolves', async () => {
    const client = createClient(createMock(), { data: 'loading', role: 'owner', latency: 0 })
    const result = await Promise.race([
      client.movies.list().then(() => 'resolved'),
      new Promise((r) => setTimeout(() => r('pending'), 20)),
    ])
    expect(result).toBe('pending')
  })

  test('Error rejects as an unreachable server', async () => {
    const client = createClient(createMock(), { data: 'error', role: 'owner', latency: 0 })
    const error = await client.movies.list().catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 503, code: 'unreachable' })
    expect(error.message).toBe('Harbor isn’t responding. It may be restarting.')
  })

  test('Empty talks to a fresh server', async () => {
    const client = createClient(createMock(), { data: 'empty', role: 'owner', latency: 0 })
    expect(await client.movies.list()).toEqual([])
    expect(await client.queue.list()).toEqual([])
  })

  test('results are copies', async () => {
    const mock = createMock()
    const client = createClient(mock, { data: 'populated', role: 'owner', latency: 0 })
    const [first] = await client.movies.list()
    if (first) first.title = 'Changed'
    expect(mock.servers.populated.state.items[0]?.title).not.toBe('Changed')
  })

  test('users are kept out of the admin’s calls', async () => {
    const client = createClient(createMock(), { data: 'populated', role: 'user', latency: 0 })
    expect(await client.downloads.list().catch((e) => e.status)).toBe(403)
    expect(await client.indexers.list().catch((e) => e.status)).toBe(403)
    expect(await client.dashboard.layout().catch((e) => e.status)).toBe(403)
  })

  test('admins run the server; people, security and backups stay the owner’s', async () => {
    const mock = createMock()
    const admin = createClient(mock, { data: 'populated', role: 'admin', latency: 0 })
    expect((await admin.indexers.list()).length).toBeGreaterThan(0)
    // people and devices read-only
    expect((await admin.users.list()).length).toBeGreaterThan(0)
    expect((await admin.devices.list()).length).toBeGreaterThan(0)
    const forbidden = (p: Promise<unknown>) => p.then(() => 200).catch((e) => e.status)
    const owner = () => createClient(mock, { data: 'populated', role: 'owner', latency: 0 })
    expect(
      await forbidden(
        admin.users.invite({ displayName: 'Mara', email: null, role: 'user', libraries: 'all' }),
      ),
    ).toBe(403)
    expect(await forbidden(admin.users.update('u-ruth', { permissions: [] }))).toBe(403)
    expect(await forbidden(admin.users.remove('u-ruth'))).toBe(403)
    expect(await forbidden(admin.users.resetPassword('u-ruth'))).toBe(403)
    const ruths = mock.servers.populated.state.devices.find((d) => d.userId === 'u-ruth')
    expect(await forbidden(admin.devices.revoke(ruths?.id ?? ''))).toBe(403)
    expect(await forbidden(admin.system.backupNow())).toBe(403)
    expect(await forbidden(admin.system.backups())).toBe(403)
    // security and backups are left out for admins, reads included
    for (const section of ['security', 'backups'] as const) {
      expect(await forbidden(admin.settings.get(section))).toBe(403)
      const value = await owner().settings.get(section)
      expect(await forbidden(admin.settings.save(section, value))).toBe(403)
    }
    // an admin's API keys are their own; the owner sees everyone's
    const all = await owner().apiKeys.list()
    const theirs = await admin.apiKeys.list()
    expect(theirs.every((k) => k.userId === 'u-theo')).toBe(true)
    expect(all.length).toBeGreaterThan(theirs.length)
    const ines = all.find((k) => k.userId === 'u-ines')
    expect(await forbidden(admin.apiKeys.revoke(ines?.id ?? ''))).toBe(403)
  })

  test('demoting an admin ends their admin sessions and API keys', async () => {
    const mock = createMock()
    const owner = createClient(mock, { data: 'populated', role: 'owner', latency: 0 })
    const state = mock.servers.populated.state
    expect(state.apiKeys.some((k) => k.userId === 'u-theo')).toBe(true)
    const theo = await owner.users.update('u-theo', { role: 'user' })
    expect(theo.permissions).toEqual(['request'])
    expect(state.apiKeys.some((k) => k.userId === 'u-theo')).toBe(false)
    expect(state.devices.some((d) => d.userId === 'u-theo' && d.client === 'admin')).toBe(false)
  })

  test('sign-in: wrong password, rate limit, two-factor', async () => {
    const client = createClient(createMock(), { data: 'populated', role: 'owner', latency: 0 })
    const wrong = await client.auth.signIn({ username: 'ines', password: 'wrong' }).catch((e) => e)
    expect(wrong).toMatchObject({ status: 401, code: 'invalid-credentials' })
    const locked = await client.auth
      .signIn({ username: 'ines', password: 'locked' })
      .catch((e) => e)
    expect(locked).toMatchObject({ status: 429 })
    const step = await client.auth.signIn({ username: 'ines', password: 'correct horse' })
    expect(step.status).toBe('two-factor')
    if (step.status !== 'two-factor') return
    const bad = await client.auth
      .verifyTwoFactor({ challenge: step.challenge, code: '000000' })
      .catch((e) => e)
    expect(bad).toMatchObject({ status: 401 })
    const ok = await client.auth.verifyTwoFactor({ challenge: step.challenge, code: '482913' })
    expect(ok.status).toBe('signed-in')
  })
})

describe('dashboard layouts', () => {
  const kinds = (ws: { kind: string }[]) => ws.map((w) => w.kind)

  test('each role starts from its default', async () => {
    const mock = createMock()
    const owner = createClient(mock, { data: 'populated', role: 'owner', latency: 0 })
    const admin = createClient(mock, { data: 'populated', role: 'admin', latency: 0 })
    const o = await owner.dashboard.layout()
    expect(o.inherited).toBe(true)
    expect(kinds(o.widgets)).toEqual(kinds(ownerDefault))
    expect(kinds((await admin.dashboard.layout()).widgets)).toEqual(kinds(ownerDefault))
  })

  test('a saved layout is the user’s own until reset', async () => {
    const mock = createMock()
    const owner = createClient(mock, { data: 'populated', role: 'owner', latency: 0 })
    const activity = { id: 'w-activity', kind: 'activity' as const, span: 2 as const, rows: 3 }
    await owner.dashboard.saveLayout([activity])
    const saved = await owner.dashboard.layout()
    expect(saved.inherited).toBe(false)
    // the mock fills each widget's settings from the registry, as the server does
    expect(saved.widgets).toEqual([{ ...activity, settings: { filter: 'all' } }])
    await owner.dashboard.resetLayout()
    expect((await owner.dashboard.layout()).inherited).toBe(true)
  })

  test('layouts saved before heights get the default height; sizes stay in range', async () => {
    const mock = createMock()
    const owner = createClient(mock, { data: 'populated', role: 'owner', latency: 0 })
    await owner.dashboard.saveLayout([
      { id: 'w-storage', kind: 'storage', span: 1 } as WidgetPlacement,
      { id: 'w-network', kind: 'network', span: 4, rows: 12 },
    ])
    expect((await owner.dashboard.layout()).widgets).toEqual([
      { id: 'w-storage', kind: 'storage', span: 1, rows: 2, settings: {} },
      { id: 'w-network', kind: 'network', span: 2, rows: 4, settings: { minutes: 10 } },
    ])
  })

  test('only the owner sets the admins’ default; users have no dashboard', async () => {
    const mock = createMock()
    const owner = createClient(mock, { data: 'populated', role: 'owner', latency: 0 })
    const admin = createClient(mock, { data: 'populated', role: 'admin', latency: 0 })
    const user = createClient(mock, { data: 'populated', role: 'user', latency: 0 })
    const widget = { id: 'w-network', kind: 'network' as const, span: 2 as const, rows: 3 }
    const network = [widget]
    expect(await user.dashboard.saveLayout(network).catch((e) => e.status)).toBe(403)
    expect(await admin.dashboard.saveRoleDefault('admin', []).catch((e) => e.status)).toBe(403)

    await owner.dashboard.saveRoleDefault('admin', network)
    expect((await admin.dashboard.layout()).widgets).toEqual([
      { ...widget, settings: { minutes: 10 } },
    ])
  })
})

describe('movie pipeline', () => {
  const owner = (mock = createMock()) =>
    createClient(mock, { data: 'populated', role: 'owner', latency: 0 })

  test('discover lists each movie once, and adding keeps its metadata', async () => {
    const c = owner()
    const all = await c.movies.discover()
    const titles = all.map((m) => m.title)
    expect(new Set(titles).size).toBe(titles.length)
    const nanook = all.find((m) => m.title === 'Nanook of the North')
    expect(nanook?.inLibrary).toBe(false)
    if (!nanook) return
    const item = await c.movies.add({
      tmdbId: nanook.tmdbId,
      title: nanook.title,
      year: nanook.year,
      rootFolder: '/data/media/movies',
      qualityProfileId: 'qp-hd',
      languageProfileId: 'lp-en',
      monitored: true,
      minimumAvailability: 'released',
    })
    expect(item).toMatchObject({ runtimeMinutes: 79, genres: ['Documentary'], status: 'missing' })
    expect((await c.movies.discover('nanook')).map((m) => m.inLibrary)).toEqual([true])
  })

  test('the wanted list follows each movie’s language profile', async () => {
    const c = owner()
    const wanted = await c.subtitles.wanted()
    // everything starts on the English profile, so only English can be missing
    expect(wanted.every((w) => w.missingLanguages.join() === 'en')).toBe(true)
    const [first] = (await c.movies.list()).filter((m) => m.status === 'available')
    if (!first) throw new Error('no available movie')
    await c.movies.update(first.id, { languageProfileId: 'lp-en-es' })
    const after = (await c.subtitles.wanted()).find((w) => w.movie.id === first.id)
    expect(after?.missingLanguages).toContain('es')
    await c.subtitles.searchAllMissing()
    expect(await c.subtitles.wanted()).toEqual([])
  })

  test('bulk quality profile moves the first version only', async () => {
    const c = owner()
    await c.movies.bulkSetQualityProfile(['1', '8'], 'qp-any')
    const sintel = await c.movies.get('1')
    expect(sintel.versions.map((v) => v.qualityProfileId)).toEqual(['qp-any', 'qp-uhd'])
    expect(await c.movies.bulkSetQualityProfile(['1'], 'qp-nope').catch((e) => e.status)).toBe(404)
  })

  test('a private indexer’s test fails on a rejected key', async () => {
    const c = owner()
    expect((await c.indexers.test('bosun', { apiKey: 'wrong' })).ok).toBe(false)
    expect((await c.indexers.test('bosun', { apiKey: 'k-1' })).ok).toBe(true)
  })
})

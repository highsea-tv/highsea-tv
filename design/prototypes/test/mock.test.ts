// SPDX-License-Identifier: AGPL-3.0-only
// The mock server's simulation and API semantics: what the screens rely on to show live states.
import { describe, expect, test } from 'bun:test'
import { ApiError, createClient, createMock, type Mock } from '../src/mock/client.ts'
import type { MockServer } from '../src/mock/server.ts'
import type { WidgetPlacement } from '../src/mock/types.ts'
import { memberDefault, ownerDefault } from '../src/mock/widgets.ts'

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
    const sintel = srv.state.items.find((m) => m.id === 'sintel')
    expect(sintel?.status).toBe('available')
    expect(sintel?.versions.every((v) => v.fileId)).toBe(true)
    expect(srv.state.history[0]).toMatchObject({ type: 'imported', itemId: 'sintel' })

    const track = () =>
      srv.state.subtitles.find(
        (s) => s.itemId === 'sintel' && s.provider === 'OpenSubtitles' && s.kind === 'external',
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
    expect(srv.state.items.find((m) => m.id === 'nosferatu')?.status).not.toBe('available')
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

  test('members are kept out of staff-only calls', async () => {
    const client = createClient(createMock(), { data: 'populated', role: 'member', latency: 0 })
    expect(await client.downloads.list().catch((e) => e.status)).toBe(403)
    expect(await client.indexers.list().catch((e) => e.status)).toBe(403)
    expect((await client.queue.list()).length).toBeGreaterThan(0)
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
    const member = createClient(mock, { data: 'populated', role: 'member', latency: 0 })
    const o = await owner.dashboard.layout()
    expect(o.inherited).toBe(true)
    expect(kinds(o.widgets)).toEqual(kinds(ownerDefault))
    expect(kinds((await member.dashboard.layout()).widgets)).toEqual(kinds(memberDefault))
  })

  test('a saved layout is the user’s own until reset', async () => {
    const mock = createMock()
    const owner = createClient(mock, { data: 'populated', role: 'owner', latency: 0 })
    const mine = [{ id: 'w-activity', kind: 'activity' as const, span: 2 as const, rows: 3 }]
    await owner.dashboard.saveLayout(mine)
    const saved = await owner.dashboard.layout()
    expect(saved.inherited).toBe(false)
    expect(saved.widgets).toEqual(mine)
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
      { id: 'w-storage', kind: 'storage', span: 1, rows: 2 },
      { id: 'w-network', kind: 'network', span: 2, rows: 4 },
    ])
  })

  test('members can’t add staff widgets; only owners set role defaults', async () => {
    const mock = createMock()
    const owner = createClient(mock, { data: 'populated', role: 'owner', latency: 0 })
    const member = createClient(mock, { data: 'populated', role: 'member', latency: 0 })
    const network = [{ id: 'w-network', kind: 'network' as const, span: 2 as const, rows: 3 }]
    expect(await member.dashboard.saveLayout(network).catch((e) => e.status)).toBe(403)
    expect(await member.dashboard.saveRoleDefault('member', []).catch((e) => e.status)).toBe(403)

    const calendar = [{ id: 'w-calendar', kind: 'calendar' as const, span: 4 as const, rows: 3 }]
    await owner.dashboard.saveRoleDefault('member', [...calendar, ...network])
    // staff-only widgets are dropped from a member default
    expect((await member.dashboard.layout()).widgets).toEqual(calendar)
  })
})

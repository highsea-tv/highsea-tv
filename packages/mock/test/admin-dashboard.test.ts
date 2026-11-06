// SPDX-License-Identifier: AGPL-3.0-only
// The dashboard's routes through the transport (one-client-platform-d.md › D2): the layouts and
// role defaults with the server's refusals, and what the widgets read, each in its response schema.
import { describe, expect, test } from 'bun:test'
import { routes } from '@highsea-tv/api-contract'
import { createMockFetch, memoryStorage } from '@highsea-tv/mock/transport'
import { type ApiError, createClient } from '@highsea-tv/sdk'

const LAN = 'http://192.168.1.20:3000'
const device = { name: 'Ines’s Mac', client: 'desktop' as const, appVersion: '0.3.0' }

const setup = () => {
  const fetch = createMockFetch({ latency: 0, storage: memoryStorage() })
  const anon = createClient({ baseUrl: LAN, fetch })
  const as = async (username: string) => {
    let r = await anon.auth.signIn({ body: { username, password: 'x', device } })
    if (r.status === 'two-factor')
      r = await anon.auth.twoFactor({ body: { challenge: r.challenge, code: '123456' } })
    if (r.status !== 'signed-in' || !r.token) throw new Error('not signed in')
    return createClient({ baseUrl: LAN, fetch, token: r.token })
  }
  return { fetch, as }
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
    route.responses as Record<number, { content: { 'application/json': { schema: Schema } } }>
  )[200]?.content['application/json'].schema.parse(value)

describe('the dashboard', () => {
  test('a layout is the role’s default until saved, and reset forgets it', async () => {
    const { as } = setup()
    const c = await as('theo')
    const first = await c.dashboard.layout()
    parse(routes.dashboard.layout, first)
    expect(first.inherited).toBe(true)
    expect(first.scope).toEqual({ kind: 'role', role: 'admin' })
    expect(first.updatedAt).toBeNull()
    expect(first.widgets[0]?.kind).toBe('now-playing')

    const mine = first.widgets.slice(0, 2).reverse()
    const saved = await c.dashboard.saveLayout({ body: { widgets: mine } })
    parse(routes.dashboard.saveLayout, saved)
    expect(saved.inherited).toBe(false)
    expect(saved.scope).toEqual({ kind: 'user', userId: 'u-theo' })
    expect(saved.widgets.map((w) => w.kind)).toEqual(mine.map((w) => w.kind))
    expect(typeof saved.updatedAt).toBe('number')
    expect((await c.dashboard.layout()).widgets).toHaveLength(2)

    const reset = await c.dashboard.resetLayout()
    expect(reset.inherited).toBe(true)
    expect(reset.widgets.length).toBe(first.widgets.length)
  })

  test('the same widget twice is refused in the server’s words', async () => {
    const { as } = setup()
    const c = await as('theo')
    const [w] = (await c.dashboard.layout()).widgets
    if (!w) throw new Error('no widgets')
    const e = await caught(
      c.dashboard.saveLayout({ body: { widgets: [w, { ...w, id: 'w-again' }] } }),
    )
    expect(e.status).toBe(400)
    expect(e.message).toBe('Each widget can be on the dashboard once.')
    expect(e.details).toEqual({ reason: 'duplicate', kind: w.kind })
  })

  test('the owner saves a role’s default; an admin may only read it', async () => {
    const { as } = setup()
    const owner = await as('ines')
    const before = await owner.dashboard.roleDefault({ params: { role: 'admin' } })
    parse(routes.dashboard.roleDefault, before)
    const widgets = before.widgets.slice(0, 3)
    const saved = await owner.dashboard.saveRoleDefault({
      params: { role: 'admin' },
      body: { widgets },
    })
    parse(routes.dashboard.saveRoleDefault, saved)
    expect(saved.dropped).toEqual([])
    expect(saved.widgets).toHaveLength(3)
    expect(typeof saved.updatedAt).toBe('number')

    const admin = await as('theo')
    expect((await admin.dashboard.layout()).widgets).toHaveLength(3)
    const e = await caught(
      admin.dashboard.saveRoleDefault({ params: { role: 'admin' }, body: { widgets } }),
    )
    expect(e.status).toBe(403)
  })

  test('a user is turned away', async () => {
    const { as } = setup()
    const e = await caught((await as('ruth')).dashboard.layout())
    expect(e.status).toBe(403)
  })
})

describe('what the widgets read', () => {
  test('speeds, people, the VPN, tags, root folders and profiles', async () => {
    const { as } = setup()
    const c = await as('theo')
    const speeds = await c.system.speeds()
    parse(routes.system.speeds, speeds)
    for (let i = 1; i < speeds.length; i++)
      expect(Date.parse(speeds[i]?.at ?? '')).toBeGreaterThan(Date.parse(speeds[i - 1]?.at ?? ''))

    const users = await c.users.list()
    parse(routes.users.list, users)
    expect(users.some((u) => u.username === 'ines' && u.role === 'owner')).toBe(true)

    parse(routes.vpn.status, await c.vpn.status())
    parse(routes.tags.list, await c.tags.list())

    const folders = await c.rootFolders.list()
    parse(routes.rootFolders.list, folders)
    expect(folders.length).toBeGreaterThan(0)
    expect(folders.every((f) => f.path.startsWith('/data/media/movies'))).toBe(true)

    const profiles = await c.quality.profiles()
    parse(routes.quality.profiles, profiles)
    expect(profiles.length).toBeGreaterThan(0)
    expect(profiles.every((p) => p.builtIn)).toBe(true)
  })
})

describe('Now playing', () => {
  test('the live sessions and the history, in the contract’s shapes', async () => {
    const { as } = setup()
    const c = await as('theo')
    const now = await c.sessions.list()
    parse(routes.sessions.list, now)
    expect(now.sessions.length).toBeGreaterThan(0)
    const history = await c.sessions.history({ query: {} })
    parse(routes.sessions.history, history)
    expect(history.length).toBeGreaterThan(0)
    const ines = await c.sessions.history({ query: { userId: 'u-ines' } })
    expect(ines.every((w) => w.user.id === 'u-ines')).toBe(true)
  })

  test('Stop says who and why, and a stream that has ended is not found', async () => {
    const { as } = setup()
    const c = await as('theo')
    const live = (await c.sessions.list()).sessions.find((s) => !s.stopped)
    if (!live) throw new Error('nothing playing')
    const after = await c.sessions.stop({
      params: { id: live.id },
      body: { message: 'Back to work' },
    })
    parse(routes.sessions.stop, after)
    const stopped = after.sessions.find((s) => s.id === live.id)?.stopped
    expect(stopped?.message).toBe('Back to work')
    expect(stopped?.by).toBe('Theo')

    const e = await caught(c.sessions.stop({ params: { id: live.id }, body: { message: '' } }))
    expect(e.status).toBe(404)
    expect(e.message).toBe('That stream has already ended.')
  })
})

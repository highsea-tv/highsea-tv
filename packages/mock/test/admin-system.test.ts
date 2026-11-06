// SPDX-License-Identifier: AGPL-3.0-only
// System's Tasks, Logs, Crash reports, Backups and Updates, and Settings › Backups, through the
// mock's transport (one-client-platform-d.md › D3): in the contract's shapes, the writes showing on
// the next read, the server's refusals, and the files the mock doesn't keep left at 501.
import { describe, expect, test } from 'bun:test'
import { routes } from '@highsea-tv/api-contract'
import { createMockFetch, memoryStorage } from '@highsea-tv/mock/transport'
import { type ApiError, createClient } from '@highsea-tv/sdk'

const LAN = 'http://192.168.1.20:3000'
const device = { name: 'Ruth’s Mac', client: 'web' as const, appVersion: '0.4.0' }

const setup = async (role: 'owner' | 'admin' | 'user' = 'owner') => {
  const fetch = createMockFetch({ latency: 0, storage: memoryStorage() })
  const r = await createClient({ baseUrl: LAN, fetch }).auth.signIn({
    body: { username: 'ruth', password: 'x', device },
  })
  if (r.status !== 'signed-in' || !r.token) throw new Error('not signed in')
  fetch.setState({ role })
  return { c: createClient({ baseUrl: LAN, fetch, token: r.token }), fetch, token: r.token }
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

describe('System › Tasks', () => {
  test('the scheduled jobs under the server’s job types, and Run now', async () => {
    const { c } = await setup()
    const tasks = await c.system.tasks()
    shaped(routes.system.tasks, tasks)
    expect(tasks.map((x) => x.id)).toContain('indexers.rss')
    // the one-off import isn't scheduled, so it isn't a task
    expect(tasks.every((x) => x.interval > 0)).toBe(true)
    await c.system.runTask({ params: { id: 'indexers.rss' } })
    const missing = await caught(c.system.runTask({ params: { id: 'nothing.here' } }))
    expect(missing.status).toBe(404)
  })
})

describe('System › Logs', () => {
  test('newest first, filtered by level and search, with no files on disk', async () => {
    const { c } = await setup()
    const all = await c.system.logs({ query: {} })
    shaped(routes.system.logs, all)
    expect(all.files).toEqual([])
    expect(all.entries.some((l) => l.level === 'debug')).toBe(true)
    const times = all.entries.map((l) => Date.parse(l.at))
    expect(times).toEqual([...times].sort((a, b) => b - a))

    const errors = await c.system.logs({ query: { level: 'warn' } })
    expect(errors.entries.every((l) => l.level === 'warn' || l.level === 'error')).toBe(true)
    const found = await c.system.logs({ query: { search: 'DISCOVERY' } })
    expect(found.entries.length).toBeGreaterThan(0)
    expect(
      found.entries.every((l) => l.source === 'discovery' || /discovery/i.test(l.message)),
    ).toBe(true)

    const crashes = await c.system.crashes()
    shaped(routes.system.crashes, crashes)
    expect(crashes).toEqual([])
  })

  test('a person who isn’t staff can’t read them', async () => {
    const { c } = await setup('user')
    expect((await caught(c.system.logs({ query: {} }))).status).toBe(403)
  })
})

describe('System › Backups', () => {
  test('made, listed newest first, restored and deleted; the owner’s alone', async () => {
    const { c } = await setup()
    const before = await c.system.backups()
    shaped(routes.system.backups, before)
    expect(before.nextRun).not.toBeNull()

    const made = await c.system.backupNow()
    expect(made.kind).toBe('manual')
    const after = await c.system.backups()
    expect(after.backups[0]?.id).toBe(made.id)

    await c.system.restore({ params: { id: made.id } })
    await c.system.deleteBackup({ params: { id: made.id } })
    expect((await c.system.backups()).backups.some((b) => b.id === made.id)).toBe(false)
    const gone = await caught(c.system.deleteBackup({ params: { id: made.id } }))
    expect(gone.status).toBe(404)
    expect((await caught(c.system.restore({ params: { id: made.id } }))).status).toBe(404)

    const admin = await setup('admin')
    expect((await caught(admin.c.system.backups())).status).toBe(403)
  })

  test('the schedule saves, its folder is checked, and off has no next run', async () => {
    const { c } = await setup()
    const schedule = await c.settings.backups()
    shaped(routes.settings.backups, schedule)
    const saved = await c.settings.saveBackups({
      body: { ...schedule, schedule: 'weekly', weekday: 3, keep: 4, folder: '/backups' },
    })
    expect(saved).toEqual({
      ...schedule,
      schedule: 'weekly',
      weekday: 3,
      keep: 4,
      folder: '/backups',
    })
    expect(await c.settings.backups()).toEqual(saved)

    const relative = await caught(c.settings.saveBackups({ body: { ...saved, folder: 'backups' } }))
    expect(relative.status).toBe(400)

    await c.settings.saveBackups({ body: { ...saved, schedule: 'off' } })
    expect((await c.system.backups()).nextRun).toBeNull()

    const admin = await setup('admin')
    expect((await caught(admin.c.settings.backups())).status).toBe(403)
  })

  test('downloading a backup, the logs or a crash report is left at 501', async () => {
    const { fetch, token } = await setup()
    const headers = { authorization: `Bearer ${token}` }
    for (const path of [
      '/api/v1/system/backups/b-1/download',
      '/api/v1/system/logs/download',
      '/api/v1/system/crashes/c-1',
    ])
      expect((await fetch(`${LAN}${path}`, { headers })).status).toBe(501)
  })
})

describe('System › Updates', () => {
  test('the newest release on the channel, and whether it’s newer', async () => {
    const { c } = await setup()
    const u = await c.system.updates()
    shaped(routes.system.updates, u)
    expect(u.latest?.version).toBe('1.0.1')
    expect(u.available).toBe(true)
  })
})

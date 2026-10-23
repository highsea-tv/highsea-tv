// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 8b's owner's tools through the SDK and HTTP (ADR 0047): backups for the owner alone,
// with downloads that are zips and a restore that asks for a restart; the log and its download;
// crash reports from an API failure; updates; /metrics behind its switch and an API key; the three
// settings rows; and the log's topic held back from people who aren't staff.
import { afterEach, describe, expect, test } from 'bun:test'
import { STAFF_TOPICS } from '@highsea-tv/api-contract'
import { createApi } from '../src/api/app.ts'
import { routeFor } from '../src/api/guard.ts'
import {
  addMember,
  bootRuntime,
  cleanup,
  clientFor,
  failure,
  ORIGIN,
  withOwner,
} from './helpers.ts'

afterEach(cleanup)

async function started() {
  const restarts: number[] = []
  const runtime = await bootRuntime({ restart: () => restarts.push(1) })
  const { owner, token } = await withOwner(runtime)
  const admin = await addMember(runtime, owner.id, 'Ana', 'admin')
  const user = await addMember(runtime, owner.id, 'Rui')
  const app = createApi(runtime)
  return {
    runtime,
    app,
    restarts,
    owner: clientFor(app, { token }),
    ownerToken: token,
    admin: clientFor(app, { token: admin.token }),
    user: clientFor(app, { token: user.token }),
    userToken: user.token,
  }
}

const get = (app: ReturnType<typeof createApi>, path: string, token?: string) =>
  app.request(`${ORIGIN}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })

describe('backups', () => {
  test('the owner backs up, downloads, restores and deletes; nobody else may', async () => {
    const { app, owner, admin, ownerToken, restarts } = await started()
    expect((await owner.system.backups()).backups).toEqual([])
    const made = await owner.system.backupNow()
    expect(made).toMatchObject({ kind: 'manual', version: '0.1.0', problem: null })
    expect((await owner.system.backups()).backups.map((b) => b.id)).toEqual([made.id])
    expect(await failure(admin.system.backups())).toMatchObject({ code: 'forbidden' })
    expect(await failure(admin.system.backupNow())).toMatchObject({ code: 'forbidden' })

    const res = await get(app, `/api/v1/system/backups/${made.id}/download`, ownerToken)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toBe(`attachment; filename="${made.id}.zip"`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    // a local file header's signature (APPNOTE 4.3.7)
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(bytes.length).toBe(made.size)

    expect(await failure(owner.system.restore({ params: { id: 'nothing' } }))).toMatchObject({
      code: 'not-found',
    })
    await owner.system.restore({ params: { id: made.id } })
    await new Promise((r) => setTimeout(r, 300))
    expect(restarts).toEqual([1])

    await owner.system.deleteBackup({ params: { id: made.id } })
    expect((await owner.system.backups()).backups.map((b) => b.kind)).toEqual(['before-restore'])
  })

  test('the settings are the owner’s, and the folder is checked', async () => {
    const { owner, admin } = await started()
    const settings = await owner.settings.backups()
    expect(settings).toMatchObject({ schedule: 'daily', time: '03:30', keep: 14 })
    expect(await failure(admin.settings.backups())).toMatchObject({ code: 'forbidden' })
    expect(
      await failure(owner.settings.saveBackups({ body: { ...settings, folder: 'backups' } })),
    ).toMatchObject({ code: 'invalid' })
    const saved = await owner.settings.saveBackups({ body: { ...settings, schedule: 'off' } })
    expect(saved.schedule).toBe('off')
    expect((await owner.system.backups()).nextRun).toBeNull()
  })
})

describe('the log and crash reports', () => {
  test('staff read the log by level and search, and download its files', async () => {
    const { runtime, app, owner, admin, user, ownerToken } = await started()
    runtime.logger.child('test').warn('a warning about Sintel', { error: new Error('inside') })
    const logs = await admin.system.logs({ query: { level: 'warn', search: 'sintel' } })
    expect(logs.entries.map((e) => e.message)).toEqual(['a warning about Sintel'])
    expect(logs.entries[0]?.fields).toMatchObject({ error: { message: 'inside' } })
    expect(logs.files.length).toBe(1)
    expect(await failure(user.system.logs())).toMatchObject({ code: 'forbidden' })

    const res = await get(app, '/api/v1/system/logs/download', ownerToken)
    expect(res.headers.get('content-type')).toBe('application/x-ndjson')
    const lines = (await res.text()).trim().split('\n')
    expect(lines.some((l) => JSON.parse(l).message === 'a warning about Sintel')).toBe(true)

    // General's level changes the log at once
    const general = await owner.settings.general()
    await owner.settings.saveGeneral({ body: { ...general, logLevel: 'debug' } })
    runtime.logger.child('test').debug('now visible')
    expect((await owner.system.logs({ query: { search: 'now visible' } })).entries.length).toBe(1)
  })

  test('an API failure writes a crash report when the switch is on', async () => {
    const { runtime, app, owner, ownerToken } = await started()
    app.get('/api/v1/test/crash', () => {
      throw new Error('the test’s failure')
    })
    expect((await get(app, '/api/v1/test/crash', ownerToken)).status).toBe(500)
    expect(await owner.system.crashes()).toEqual([])

    const general = await owner.settings.general()
    await owner.settings.saveGeneral({ body: { ...general, crashReports: true } })
    await get(app, '/api/v1/test/crash', ownerToken)
    const [report] = await owner.system.crashes()
    expect(report).toMatchObject({ origin: 'api', message: 'Error: the test’s failure' })
    const res = await get(app, `/api/v1/system/crashes/${report?.id}`, ownerToken)
    expect(JSON.parse(await res.text())).toMatchObject({ version: runtime.version })
  })
})

describe('updates and settings', () => {
  test('updates read the catalog; General is staff’s to read and the owner’s to change', async () => {
    const { owner, admin } = await started()
    expect(await admin.system.updates()).toMatchObject({
      current: '0.1.0',
      channel: 'stable',
      // the seed's releases.json lists the version being released, so it's the latest and no update
      latest: { version: '0.1.0' },
      available: false,
    })
    const general = await admin.settings.general()
    expect(general).toMatchObject({ language: 'en', updateChannel: 'stable', crashReports: false })
    expect(
      await failure(admin.settings.saveGeneral({ body: { ...general, updateChannel: 'beta' } })),
    ).toMatchObject({ code: 'forbidden' })
    expect(
      await failure(owner.settings.saveGeneral({ body: { ...general, timeZone: 'Mars/Olympus' } })),
    ).toMatchObject({ code: 'invalid' })
    const saved = await owner.settings.saveGeneral({
      body: { ...general, timeZone: 'Europe/Lisbon', updateChannel: 'beta' },
    })
    expect(saved).toMatchObject({ timeZone: 'Europe/Lisbon', updateChannel: 'beta' })
    expect((await admin.system.updates()).channel).toBe('beta')
  })
})

describe('/metrics', () => {
  test('answers only when on, and only to staff’s API keys', async () => {
    const { app, owner, ownerToken, userToken } = await started()
    expect((await get(app, '/metrics', ownerToken)).status).toBe(404)
    await owner.settings.saveMetrics({ body: { enabled: true } })
    expect(await owner.settings.metrics()).toEqual({ enabled: true })

    // a device token isn't an API key
    expect((await get(app, '/metrics', ownerToken)).status).toBe(401)
    expect((await get(app, '/metrics')).status).toBe(401)
    const key = await owner.apiKeys.create({ body: { name: 'Prometheus', scope: 'read' } })
    const res = await get(app, '/metrics', key.secret)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/plain; version=0.0.4; charset=utf-8')
    const text = await res.text()
    expect(text).toContain('highsea_info{version="0.1.0"} 1')
    expect(text).toContain(
      'highsea_http_requests_total{method="GET",route="/api/v1/settings/metrics",status="200"} 1',
    )
    // keys may be read-only: /metrics is a GET
    expect((await get(app, '/metrics', userToken)).status).toBe(401)
  })

  test('requests are labelled by the contract’s route, never an id', () => {
    expect(routeFor('GET', '/api/v1/system/backups/highsea-x-manual/download')).toBe(
      '/api/v1/system/backups/{id}/download',
    )
    expect(routeFor('GET', '/nowhere')).toBe('other')
  })
})

describe('the event stream', () => {
  test('the log’s topic is staff’s alone', async () => {
    expect(STAFF_TOPICS).toContain('logs.appended')
    const { runtime, app, ownerToken, userToken } = await started()
    const read = async (token: string) => {
      const controller = new AbortController()
      const res = await app.request(`${ORIGIN}/api/v1/events?topics=logs.appended,movies.updated`, {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      })
      const reader = (res.body as ReadableStream<Uint8Array>).getReader()
      return {
        async next() {
          const { value } = await reader.read()
          return new TextDecoder().decode(value)
        },
        close: () => controller.abort(),
      }
    }
    const owner = await read(ownerToken)
    const user = await read(userToken)
    runtime.events.emit({ topic: 'logs.appended' })
    runtime.events.emit({ topic: 'movies.updated' })
    expect(await owner.next()).toContain('logs.appended')
    const first = await user.next()
    expect(first).toContain('movies.updated')
    expect(first).not.toContain('logs.appended')
    owner.close()
    user.close()
  })
})

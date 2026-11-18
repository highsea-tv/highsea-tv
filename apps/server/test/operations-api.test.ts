// SPDX-License-Identifier: AGPL-3.0-only
// Checkpoint 8b's owner's tools through the SDK and HTTP (ADR 0047): backups for the owner alone,
// with downloads that are zips and a restore that asks for a restart; the log and its download;
// crash reports from an API failure; updates; /metrics behind its switch and an API key; the three
// settings rows; and the log's topic held back from people who aren't staff.

import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { CLIENT_REPORT_MAX, STAFF_TOPICS } from '@highsea-tv/api-contract'
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

/** The newest stable release the seed lists (catalog/indexers/releases.json, newest first). */
const newestStable = (
  JSON.parse(
    readFileSync(new URL('../../../catalog/indexers/releases.json', import.meta.url), 'utf8'),
  ) as { version: string; channel: string }[]
).find((r) => r.channel === 'stable')?.version

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

describe('client reports', () => {
  const report = {
    kind: 'error' as const,
    app: 'tvos' as const,
    version: '0.4.2',
    device: 'Apple TV 4K · tvOS 26.1',
    screen: '/movies/603',
    error: { name: 'TypeError', message: 'undefined is not a function', stack: 'at Poster' },
  }
  const send = (app: ReturnType<typeof createApi>, body: unknown, token?: string) =>
    app.request(`${ORIGIN}/api/v1/system/client-reports`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  test('anyone signed in sends one; staff read them; nobody signed out does', async () => {
    const { app, owner, admin, user, userToken, ownerToken } = await started()
    expect((await send(app, report)).status).toBe(401)
    // kept with General › Diagnostics' crash reports off, as they are by default (HT-56)
    expect((await owner.settings.general()).crashReports).toBe(false)
    expect((await send(app, report, userToken)).status).toBe(204)
    const [kept] = await admin.system.clientReports()
    expect(kept).toMatchObject({
      kind: 'error',
      app: 'tvos',
      version: '0.4.2',
      device: 'Apple TV 4K · tvOS 26.1',
      screen: '/movies/603',
      message: 'TypeError: undefined is not a function',
    })
    expect(await failure(user.system.clientReports())).toMatchObject({ code: 'forbidden' })
    const path = `/api/v1/system/client-reports/${kept?.id}`
    expect((await get(app, path, userToken)).status).toBe(403)
    expect((await get(app, '/api/v1/system/client-reports/client-none', ownerToken)).status).toBe(
      404,
    )
    expect((await get(app, path, ownerToken)).headers.get('content-disposition')).toBe(
      `attachment; filename="${kept?.id}.json"`,
    )
  })

  test('what’s kept: the report, the sender’s id, and nothing it didn’t ask for', async () => {
    const { runtime, app, owner, userToken, ownerToken } = await started()
    const sent = {
      ...report,
      username: 'rui',
      email: 'rui@example.test',
      error: { ...report.error, extra: 1 },
    }
    expect((await send(app, sent, userToken)).status).toBe(204)
    const [kept] = await owner.system.clientReports()
    const file = JSON.parse(
      await (await get(app, `/api/v1/system/client-reports/${kept?.id}`, ownerToken)).text(),
    )
    const rui = runtime.auth.users.list().find((u) => u.username === 'rui')
    expect(file).toEqual({
      id: kept?.id,
      at: kept?.at,
      server: runtime.version,
      userId: rui?.id,
      ...report,
    })
    expect(JSON.stringify(file)).not.toContain('example.test')

    // Download logs ends with the reports, a line each
    const lines = (await (await get(app, '/api/v1/system/logs/download', ownerToken)).text())
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    expect(lines.at(-1)).toMatchObject({
      level: 'error',
      source: 'client',
      message: 'TypeError: undefined is not a function',
      fields: { report: { id: kept?.id, screen: '/movies/603' } },
    })
  })

  test('a failed play is kept with the decision and the device’s profile', async () => {
    const { app, owner, userToken, ownerToken } = await started()
    const play = {
      type: 'movie' as const,
      id: 603,
      versionId: 'v1',
      audioId: null,
      subtitleId: null,
      profile: 'tvos',
      sessionId: 's1',
      decision: {
        method: 'transcode' as const,
        container: 'mkv',
        video: { action: 'copy' as const },
        audio: null,
        subtitle: null,
        bitrate: null,
        reasons: [],
      },
      position: 12.5,
    }
    const sent = { ...report, kind: 'play', screen: '/play/603', play }
    const res = await send(app, sent, userToken)
    expect(res.status).toBe(204)
    const [kept] = await owner.system.clientReports()
    expect(kept).toMatchObject({ kind: 'play', screen: '/play/603' })
    const file = JSON.parse(
      await (await get(app, `/api/v1/system/client-reports/${kept?.id}`, ownerToken)).text(),
    )
    expect(file.play).toMatchObject({ id: 603, profile: 'tvos', decision: { method: 'transcode' } })
    expect(file.deviceProfile).toMatchObject({ id: 'tvos' })
  })

  test('its size limit: 64 KB, and each field its own', async () => {
    const { app, owner, userToken } = await started()
    const large = { ...report, error: { ...report.error, stack: 'x'.repeat(CLIENT_REPORT_MAX) } }
    const res = await send(app, large, userToken)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({
      error: { code: 'invalid', details: { reason: 'size' } },
    })
    // under the limit, a field over its own length is refused too
    const long = { ...report, screen: 'x'.repeat(201) }
    expect((await send(app, long, userToken)).status).toBe(400)
    expect(await owner.system.clientReports()).toEqual([])
  })
})

describe('updates and settings', () => {
  test('updates read the catalog; General is staff’s to read and the owner’s to change', async () => {
    const { owner, admin } = await started()
    expect(await admin.system.updates()).toMatchObject({
      current: '0.1.0',
      channel: 'stable',
      // the helpers' server is at 0.1.0, so a newer stable release in the seed is an update
      latest: { version: newestStable },
      available: newestStable !== '0.1.0',
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

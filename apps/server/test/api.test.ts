// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { ERROR_CODES, routes } from '@highsea-tv/api-contract'
import { AppError, ERROR_CODES as CORE_CODES } from '@highsea-tv/core'
import { createApi } from '../src/api/app.ts'
import { bootRuntime, cleanup } from './helpers.ts'

afterEach(cleanup)

async function api() {
  const runtime = await bootRuntime()
  return { runtime, app: createApi(runtime) }
}

describe('API', () => {
  test('health and public info', async () => {
    const { app, runtime } = await api()
    const health = await app.request('/api/health')
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ status: 'ok', checks: [{ name: 'database', ok: true }] })
    const info = await (await app.request('/api/v1/system/info/public')).json()
    expect(info).toMatchObject({ id: runtime.identity().id, name: 'highsea', version: '0.1.0' })
  })

  test('errors share one body: unknown routes, AppErrors and crashes', async () => {
    const { app } = await api()
    // routes go in before the first request
    app.get('/api/test/forbidden', () => {
      throw new AppError('forbidden', 'Only the owner can do that.')
    })
    app.get('/api/test/crash', () => {
      throw new Error('kaboom')
    })
    const missing = await app.request('/api/v1/nope')
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({
      error: { code: 'not-found', message: 'There’s no API route at that address.' },
    })
    const forbidden = await app.request('/api/test/forbidden')
    expect(forbidden.status).toBe(403)
    expect((await forbidden.json()).error.code).toBe('forbidden')
    const crash = await app.request('/api/test/crash')
    expect(crash.status).toBe(500)
    // the cause goes to the log, not to the caller
    expect(JSON.stringify(await crash.json())).not.toContain('kaboom')
  })

  test('the OpenAPI document lists every contract route', async () => {
    const { app } = await api()
    const doc = (await (await app.request('/api/v1/openapi.json')).json()) as {
      paths: Record<string, Record<string, unknown>>
    }
    for (const [group, rs] of Object.entries(routes))
      for (const [name, r] of Object.entries(rs))
        expect(doc.paths[r.path]?.[r.method], `${group}.${name}`).toBeTruthy()
    expect((await app.request('/api/docs')).headers.get('content-type')).toContain('text/html')
  })

  test('the contract and core agree on error codes', () => {
    expect([...ERROR_CODES].sort() as string[]).toEqual(Object.keys(CORE_CODES).sort())
  })

  test('the checked-in openapi.json is current', async () => {
    const run = Bun.spawnSync(['bun', 'scripts/openapi.ts', '--check'], {
      cwd: join(import.meta.dir, '..'),
    })
    expect(run.stdout.toString() + run.stderr.toString()).toContain('openapi.json is up to date')
  })
})

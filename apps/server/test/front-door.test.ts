// SPDX-License-Identifier: AGPL-3.0-only
// The front door on the real HTTP server (HT-53): HTTPS only behind a proxy, and System › Health's
// offer when a proxy highsea isn't set for is seen. Requests go out with node:http, so the Host and
// forwarded headers are exactly the ones a proxy on this machine would send.
import { afterEach, describe, expect, test } from 'bun:test'
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readSetting } from '@highsea-tv/db'
import { defaultNetworkSettings, HSTS, PRIVATE_RANGES } from '@highsea-tv/network'
import { PROXY_NOTICE_KEY } from '@highsea-tv/runtime'
import { createApi } from '../src/api/app.ts'
import { createHttpServer } from '../src/http.ts'
import { bootRuntime, cleanup, withOwner } from './helpers.ts'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c()
  await cleanup()
})

async function serve() {
  const runtime = await bootRuntime()
  const { token } = await withOwner(runtime)
  const server = createHttpServer({ api: createApi(runtime), network: runtime.network })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  cleanups.push(
    () =>
      new Promise<void>((r) => {
        server.closeAllConnections()
        server.close(() => r())
      }),
  )
  const port = (server.address() as AddressInfo).port
  const send = (
    path: string,
    headers: Record<string, string> = {},
    method = 'GET',
  ): Promise<{ status: number; headers: Record<string, unknown>; body: string }> =>
    new Promise((done, fail) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path,
          method,
          headers: { host: `127.0.0.1:${port}`, ...headers },
        },
        (res) => {
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (c) => {
            body += c
          })
          res.on('end', () => done({ status: res.statusCode ?? 0, headers: res.headers, body }))
        },
      )
      req.on('error', fail)
      req.end()
    })
  const auth = { authorization: `Bearer ${token}` }
  const checks = async () =>
    JSON.parse((await send('/api/v1/system/health', auth)).body) as {
      id: string
      level: string
      message: string
      action?: { kind: string; path: string }
      dismissible?: boolean
    }[]
  return { runtime, send, auth, checks }
}

const PROXY = {
  ...defaultNetworkSettings,
  externalUrl: 'https://watch.example.net',
  trustedProxies: PRIVATE_RANGES.join(', '),
  proxyHeaders: true,
  tls: 'proxy' as const,
}

describe('HTTPS only', () => {
  test('behind a proxy: plain HTTP it carried goes to the External URL, HTTPS gets HSTS', async () => {
    const { runtime, send } = await serve()
    runtime.network.save(PROXY)
    const plain = await send('/api/v1/system/info/public?x=1', {
      host: 'watch.example.net',
      'x-forwarded-proto': 'http',
    })
    expect(plain.status).toBe(308)
    expect(plain.headers.location).toBe('https://watch.example.net/api/v1/system/info/public?x=1')
    // RFC 6797 § 7.2: never over plain HTTP
    expect(plain.headers['strict-transport-security']).toBeUndefined()

    const secure = await send('/api/v1/system/info/public', {
      host: 'watch.example.net',
      'x-forwarded-proto': 'https',
    })
    expect(secure.status).toBe(200)
    expect(secure.headers['strict-transport-security']).toBe(HSTS)
    // on any answer, the 404 the server writes itself included
    const missing = await send('/elsewhere', {
      host: 'watch.example.net',
      'x-forwarded-proto': 'https',
    })
    expect(missing.status).toBe(404)
    expect(missing.headers['strict-transport-security']).toBe(HSTS)
  })

  test('the LAN’s plain HTTP address keeps working, with no HSTS', async () => {
    const { runtime, send } = await serve()
    runtime.network.save(PROXY)
    const lan = await send('/api/v1/system/info/public')
    expect(lan.status).toBe(200)
    expect(lan.headers['strict-transport-security']).toBeUndefined()
  })

  test('not set for a proxy: the forwarded scheme changes nothing', async () => {
    const { send } = await serve()
    const plain = await send('/api/v1/system/info/public', {
      host: 'watch.example.net',
      'x-forwarded-proto': 'http',
    })
    expect(plain.status).toBe(200)
    expect(plain.headers['strict-transport-security']).toBeUndefined()
  })
})

describe('noticing a reverse proxy', () => {
  test('a proxy’s headers on a name: a notice offering Settings › Network, nothing changed', async () => {
    const { runtime, send, checks } = await serve()
    expect((await checks()).find((c) => c.id === 'reverse-proxy')).toBeUndefined()
    await send('/', { host: 'watch.example.net', 'x-forwarded-proto': 'https' })
    const notice = (await checks()).find((c) => c.id === 'reverse-proxy')
    expect(notice).toMatchObject({ level: 'notice', dismissible: true })
    expect(notice?.message).toContain('watch.example.net')
    const path = new URL(notice?.action?.path ?? '', 'http://x')
    expect(path.pathname).toBe('/settings/network')
    expect(Object.fromEntries(path.searchParams)).toEqual({
      proxy: '1',
      externalUrl: 'https://watch.example.net',
      trustedProxies: '127.0.0.1',
    })
    // only an offer: the headers aren't believed and the settings are as they were
    expect(runtime.network.settings()).toEqual(defaultNetworkSettings)
  })

  test('no forwarded headers, or an address for a host: no notice', async () => {
    const { send, checks } = await serve()
    await send('/', { host: 'watch.example.net' })
    await send('/', { 'x-forwarded-proto': 'https' })
    expect((await checks()).find((c) => c.id === 'reverse-proxy')).toBeUndefined()
  })

  test('set for a proxy: no notice', async () => {
    const { runtime, send, checks } = await serve()
    await send('/', { host: 'watch.example.net', 'x-forwarded-proto': 'https' })
    expect((await checks()).some((c) => c.id === 'reverse-proxy')).toBe(true)
    runtime.network.save(PROXY)
    await send('/', { host: 'watch.example.net', 'x-forwarded-proto': 'https' })
    expect((await checks()).some((c) => c.id === 'reverse-proxy')).toBe(false)
  })

  test('dismissed, it stays dismissed', async () => {
    const { runtime, send, auth, checks } = await serve()
    await send('/', { host: 'watch.example.net', 'x-forwarded-proto': 'https' })
    const dismissed = await send('/api/v1/system/health/reverse-proxy/dismiss', auth, 'POST')
    expect(dismissed.status).toBe(204)
    await send('/', { host: 'other.example.net', 'x-forwarded-proto': 'https' })
    expect((await checks()).some((c) => c.id === 'reverse-proxy')).toBe(false)
    // kept in the database, so a restart doesn't bring it back
    expect(readSetting(runtime.db, PROXY_NOTICE_KEY, { dismissed: false }).dismissed).toBe(true)
    // nothing else can be dismissed
    expect((await send('/api/v1/system/health/tmdb-key/dismiss', auth, 'POST')).status).toBe(404)
  })
})

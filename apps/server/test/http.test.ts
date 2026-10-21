// SPDX-License-Identifier: AGPL-3.0-only
// The real HTTP server (without Next), driven through the SDK as a client would.
import { afterEach, describe, expect, test } from 'bun:test'
import type { AddressInfo } from 'node:net'
import type { ServerEvent } from '@highsea/api-contract'
import { createClient } from '@highsea/sdk'
import { selfSigned } from '../../../packages/network/test/self-signed.ts'
import { createApi } from '../src/api/app.ts'
import { createHttpServer, createTlsServer } from '../src/http.ts'
import { bootRuntime, cleanup, withOwner } from './helpers.ts'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c()
  await cleanup()
})

async function serve() {
  const runtime = await bootRuntime()
  const { token } = await withOwner(runtime)
  const server = createHttpServer({ api: createApi(runtime) })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  cleanups.push(
    () =>
      new Promise<void>((r) => {
        server.closeAllConnections()
        server.close(() => r())
      }),
  )
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const auth = { authorization: `Bearer ${token}` }
  return { runtime, url, auth, client: createClient({ baseUrl: url, token }) }
}

const until = async (check: () => boolean, ms = 2000) => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await Bun.sleep(10)
  }
}

describe('HTTP server', () => {
  test('the SDK reads the public info', async () => {
    const { client, runtime } = await serve()
    expect((await client.system.publicInfo()).id).toBe(runtime.identity().id)
  })

  test('the event stream needs someone signed in', async () => {
    const { url, runtime } = await serve()
    const res = await fetch(`${url}/api/v1/events`)
    expect(res.status).toBe(401)
    expect(runtime.network.clientsConnected()).toBe(0)
  })

  test('built-in TLS serves the same routes over HTTPS, with the secure cookie name', async () => {
    const runtime = await bootRuntime()
    const { cert, key } = selfSigned()
    const server = createTlsServer(
      { api: createApi(runtime) },
      { cert: Buffer.from(cert), key: Buffer.from(key) },
    )
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    cleanups.push(
      () =>
        new Promise<void>((r) => {
          server.closeAllConnections()
          server.close(() => r())
        }),
    )
    const url = `https://127.0.0.1:${(server.address() as AddressInfo).port}`
    // a self-signed test certificate: Bun's fetch takes `tls` options (Bun docs, fetch § TLS)
    const tls = { rejectUnauthorized: false }
    expect((await fetch(`${url}/api/health`, { tls })).status).toBe(200)
    const setup = await fetch(`${url}/api/v1/setup`, {
      tls,
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({
        serverName: 'Harbor',
        owner: { username: 'ines', displayName: 'Ines', password: 'correct horse battery' },
        folders: (await (await fetch(`${url}/api/v1/setup/defaults`, { tls })).json()).folders,
        remoteAccess: { kind: 'local-only' },
        cloudLink: false,
      }),
    })
    expect(setup.status).toBe(200)
    // the plain-HTTP name is cleared, so an old cookie can't shadow this one
    const [cleared, cookie = ''] = setup.headers.getSetCookie()
    expect(cleared).toStartWith('highsea_session=; Max-Age=0')
    expect(cookie).toStartWith('__Host-highsea_session=hss_')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('Path=/')
  })

  test('playback paths are reserved; other paths go to Next', async () => {
    const { url } = await serve()
    expect((await fetch(`${url}/stream/1`)).status).toBe(501)
    // without Next mounted, the admin's paths 404
    expect((await fetch(`${url}/movies`)).status).toBe(404)
  })

  test('events reach SSE subscribers, filtered by topic', async () => {
    const { client, runtime, auth } = await serve()
    const got: ServerEvent[] = []
    const off = client.events.subscribe((e) => got.push(e))
    await until(() => client.events.connected())
    runtime.events.emit({ topic: 'jobs.updated', ids: ['job_1'] })
    runtime.events.emit({ topic: 'movies.updated' })
    // a bare movies.updated also queues the subtitles' wanted refresh, whose job announces itself
    await until(() => got.length >= 2)
    expect(got.slice(0, 2).map((e) => [e.topic, e.ids])).toEqual([
      ['jobs.updated', ['job_1']],
      ['movies.updated', undefined],
    ])
    off()

    const res = await fetch(`${client.baseUrl}/api/v1/events?topics=movies.updated`, {
      headers: auth,
    })
    const reader = res.body?.getReader() as ReadableStreamDefaultReader<Uint8Array>
    runtime.events.emit({ topic: 'jobs.updated' })
    runtime.events.emit({ topic: 'movies.updated', ids: ['mov_1'] })
    const { value } = await reader.read()
    const text = new TextDecoder().decode(value)
    expect(text).toContain('"topic":"movies.updated"')
    expect(text).not.toContain('jobs.updated')
    await reader.cancel()
  })

  test('Last-Event-ID replays what was missed, or resets when it’s too old', async () => {
    const { url, runtime, auth } = await serve()
    const first = runtime.events.emit({ topic: 'a' })
    runtime.events.emit({ topic: 'b' })
    runtime.events.emit({ topic: 'c' })
    const read = async (lastId: string) => {
      const res = await fetch(`${url}/api/v1/events`, {
        headers: { ...auth, 'last-event-id': lastId },
      })
      const reader = res.body?.getReader() as ReadableStreamDefaultReader<Uint8Array>
      let text = ''
      while (!text.includes('"topic":"c"') && !text.includes('"topic":"reset"'))
        text += new TextDecoder().decode((await reader.read()).value)
      await reader.cancel()
      return text
    }
    const replay = await read(String(first.id))
    expect(replay).toContain('"topic":"b"')
    expect(replay).not.toContain('"topic":"a"')
    for (let i = 0; i < 600; i++) runtime.events.emit({ topic: 'noise' })
    expect(await read(String(first.id))).toContain('"topic":"reset"')
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import type { ServerEvent } from '@highsea/api-contract'
import {
  ApiError,
  createClient,
  createEventStream,
  createServerConnection,
  fillPath,
  read,
} from '../src/index.ts'

const info = (id: string) => ({
  id,
  name: 'Harbor',
  version: '0.1.0',
  localAddresses: [],
  publicUrl: null,
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** A stream of SSE blocks, held open until the test closes it. */
function sse(events: ServerEvent[]) {
  let close = () => {}
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const e of events)
        c.enqueue(new TextEncoder().encode(`id: ${e.id}\ndata: ${JSON.stringify(e)}\n\n`))
      close = () => c.close()
    },
  })
  return { body, close: () => close() }
}

describe('client', () => {
  test('calls a contract route and returns its typed body', async () => {
    const seen: string[] = []
    const client = createClient({
      baseUrl: 'http://harbor.local:3000/',
      token: 'dev_123',
      fetch: async (url, init) => {
        seen.push(`${init?.method} ${url} ${new Headers(init?.headers).get('authorization')}`)
        return json(info('srv_1'))
      },
    })
    const result = await client.system.publicInfo()
    expect(result.name).toBe('Harbor')
    expect(seen).toEqual(['GET http://harbor.local:3000/api/v1/system/info/public Bearer dev_123'])
  })

  test('turns the error body into an ApiError, and a dead network into unavailable', async () => {
    const failing = createClient({
      fetch: async () =>
        json({ error: { code: 'forbidden', message: 'Only the owner can do that.' } }, 403),
    })
    const e = await failing.system.health().catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toMatchObject({
      code: 'forbidden',
      status: 403,
      message: 'Only the owner can do that.',
    })

    const offline = createClient({
      fetch: async () => {
        throw new TypeError('fetch failed')
      },
    })
    expect(await offline.system.health().catch((x: ApiError) => x.code)).toBe('unavailable')
  })

  test('fills path parameters, encoded', () => {
    expect(fillPath('/api/v1/movies/{id}/files/{file}', { id: 'mov 1', file: 2 })).toBe(
      '/api/v1/movies/mov%201/files/2',
    )
    expect(() => fillPath('/api/v1/movies/{id}')).toThrow('id')
  })
})

describe('events', () => {
  test('parses SSE blocks into events', async () => {
    const got: ServerEvent[] = []
    const stream = sse([
      { id: 1, topic: 'jobs.updated', ids: ['job_1'], at: 5 },
      { id: 2, topic: 'movies.updated', at: 6 },
    ])
    stream.close()
    await read(stream.body, new AbortController().signal, (e) => got.push(e))
    expect(got.map((e) => e.topic)).toEqual(['jobs.updated', 'movies.updated'])
  })

  test('one shared connection; reconnects with Last-Event-ID; closes after the last listener', async () => {
    const requests: (string | undefined)[] = []
    const streams: ReturnType<typeof sse>[] = []
    const events = createEventStream({
      baseUrl: '',
      headers: () => ({}),
      retryMs: () => 1,
      fetch: async (_url, init) => {
        requests.push(new Headers(init?.headers).get('last-event-id') ?? undefined)
        const s = sse(
          requests.length === 1 ? [{ id: 7, topic: 'a', at: 0 }] : [{ id: 8, topic: 'b', at: 0 }],
        )
        streams.push(s)
        return new Response(s.body)
      },
    })
    const a: string[] = []
    const b: string[] = []
    const offA = events.subscribe((e) => a.push(e.topic))
    const offB = events.subscribe((e) => b.push(e.topic))
    await Bun.sleep(5)
    // the server drops the connection; the stream reconnects from event 7
    streams[0]?.close()
    await Bun.sleep(20)
    expect(requests).toEqual([undefined, '7'])
    expect(a).toEqual(['a', 'b'])
    expect(b).toEqual(['a', 'b'])
    offA()
    expect(events.connected()).toBe(true)
    offB()
    expect(events.connected()).toBe(false)
  })
})

describe('ServerConnection', () => {
  const server = {
    id: 'srv_harbor',
    name: 'Harbor',
    addresses: [
      { url: 'https://harbor.example.net', kind: 'remote' as const },
      { url: 'http://192.168.1.20:3000', kind: 'local' as const },
    ],
  }

  test('prefers a LAN address that answers, even when the remote one is faster', async () => {
    let t = 0
    const conn = createServerConnection({
      server,
      now: () => t,
      fetch: async (url) => {
        t += String(url).includes('192.168') ? 40 : 5
        return json(info('srv_harbor'))
      },
    })
    expect((await conn.probe())?.address.kind).toBe('local')
  })

  test('ignores a different server answering at an address', async () => {
    const conn = createServerConnection({
      server,
      fetch: async (url) =>
        json(info(String(url).includes('192.168') ? 'srv_other' : 'srv_harbor')),
    })
    expect((await conn.probe())?.address.kind).toBe('remote')
  })

  test('fails over to the remote address when the LAN one stops answering', async () => {
    let lanUp = true
    const calls: string[] = []
    const conn = createServerConnection({
      server: { ...server, token: 'dev_1' },
      fetch: async (url) => {
        const u = String(url)
        calls.push(u)
        if (u.includes('192.168') && !lanUp) throw new TypeError('fetch failed')
        return json(info('srv_harbor'))
      },
    })
    expect((await conn.client.system.publicInfo()).id).toBe('srv_harbor')
    expect(conn.current()?.kind).toBe('local')
    lanUp = false
    expect((await conn.client.system.publicInfo()).id).toBe('srv_harbor')
    expect(conn.current()?.kind).toBe('remote')
  })

  test('says so when no address answers', async () => {
    const conn = createServerConnection({
      server,
      fetch: async () => {
        throw new TypeError('fetch failed')
      },
    })
    expect(await conn.probe()).toBeNull()
    const e = await conn.client.system.health().catch((x: ApiError) => x)
    expect(e).toMatchObject({ code: 'unavailable' })
  })
})

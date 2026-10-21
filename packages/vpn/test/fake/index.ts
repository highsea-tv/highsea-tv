// SPDX-License-Identifier: AGPL-3.0-only
// A fake gluetun control server on 127.0.0.1, answering the routes `@highsea/vpn` reads as
// gluetun's wiki documents them (https://github.com/qdm12/gluetun-wiki/blob/main/setup/advanced/control-server.md):
// GET and PUT /v1/vpn/status, GET /v1/publicip/ip and GET /v1/portforward, each behind the
// `X-API-Key` header. Tests set its state; the sweeps can serve it for the admin. Also timers that
// run on a fake clock, so the checks' 5 minutes and the backoff pass in no time.
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FakeClock } from '@highsea/core'
import type { Timers } from '../../src/vpn.ts'

export type FakeGluetunState = {
  apiKey: string
  status: 'running' | 'stopped'
  publicIp: string
  country: string | null
  port: number
}

export async function startFakeGluetun(initial: Partial<FakeGluetunState> = {}) {
  const state: FakeGluetunState = {
    apiKey: 'fake-gluetun-key',
    status: 'running',
    publicIp: '198.51.100.23',
    country: 'Switzerland',
    port: 41822,
    ...initial,
  }
  const requests: { method: string; path: string; body: string }[] = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c: Buffer) => {
      body += c.toString('utf8')
    })
    req.on('end', () => {
      const path = (req.url ?? '').split('?')[0] ?? ''
      requests.push({ method: req.method ?? 'GET', path, body })
      const send = (status: number, json: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(json))
      }
      if (req.headers['x-api-key'] !== state.apiKey) return send(401, { error: 'unauthorized' })
      if (path === '/v1/vpn/status' && req.method === 'GET')
        return send(200, { status: state.status })
      if (path === '/v1/vpn/status' && req.method === 'PUT') {
        const next = (JSON.parse(body || '{}') as { status?: string }).status
        if (next !== 'running' && next !== 'stopped') return send(400, { error: 'bad status' })
        state.status = next
        return send(200, { outcome: next })
      }
      if (path === '/v1/publicip/ip')
        return send(200, {
          public_ip: state.status === 'running' ? state.publicIp : '',
          ...(state.country ? { country: state.country } : {}),
        })
      if (path === '/v1/portforward') return send(200, { port: state.port })
      send(404, { error: 'not found' })
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    state,
    requests,
    async close() {
      server.closeAllConnections()
      await new Promise<void>((r) => server.close(() => r()))
    },
  }
}

export type FakeTimers = Timers & {
  /** Moves the clock forward, running each timer that falls due, in order. */
  advance(ms: number): void
  pending(): number
}

export function createFakeTimers(clock: FakeClock): FakeTimers {
  type Timer = { id: number; at: number; every: number | null; fn: () => void }
  const timers = new Map<number, Timer>()
  let next = 1
  const add = (fn: () => void, ms: number, every: number | null) => {
    const id = next++
    timers.set(id, { id, at: clock.now() + ms, every, fn })
    return id
  }
  const clear = (h: unknown) => {
    timers.delete(h as number)
  }
  return {
    setTimeout: (fn, ms) => add(fn, ms, null),
    setInterval: (fn, ms) => add(fn, ms, ms),
    clearTimeout: clear,
    clearInterval: clear,
    pending: () => timers.size,
    advance(ms) {
      const end = clock.now() + ms
      for (;;) {
        const due = [...timers.values()]
          .filter((t) => t.at <= end)
          .sort((a, b) => a.at - b.at || a.id - b.id)[0]
        if (!due) break
        clock.set(due.at)
        if (due.every === null) timers.delete(due.id)
        else due.at += due.every
        due.fn()
      }
      clock.set(end)
    },
  }
}

export * from './wireguard.ts'

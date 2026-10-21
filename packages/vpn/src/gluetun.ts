// SPDX-License-Identifier: AGPL-3.0-only
// gluetun's control server (https://github.com/qdm12/gluetun-wiki/blob/main/setup/advanced/control-server.md):
// it listens on port 8000, every route needs authentication, and an API key role sends the key in
// the `X-API-Key` header (`HTTP_CONTROL_SERVER_AUTH_DEFAULT_ROLE='{"auth":"apikey","apikey":"…"}'`).
// The routes highsea reads:
//
//   GET /v1/vpn/status      {"status":"running"}
//   PUT /v1/vpn/status      {"status":"running"} or {"status":"stopped"}
//   GET /v1/publicip/ip     {"public_ip":"58.98.64.104"}  (the wiki documents only this field)
//   GET /v1/portforward     {"port":5914}                 (0 when nothing is forwarded)
import type { Fetch } from '@highsea/core'

export class GluetunError extends Error {
  readonly kind: 'refused' | 'unreachable'
  constructor(kind: 'refused' | 'unreachable', message: string) {
    super(message)
    this.name = 'GluetunError'
    this.kind = kind
  }
}

export type Gluetun = {
  /** The tunnel's state as gluetun reports it: `running`, `stopped`, or another word in between. */
  status(): Promise<string>
  setStatus(status: 'running' | 'stopped'): Promise<void>
  /** The exit address, and its country when gluetun includes one. */
  publicIp(): Promise<{ ip: string | null; country: string | null }>
  /** The forwarded port, or null when there isn't one. */
  forwardedPort(): Promise<number | null>
}

export function createGluetun(options: {
  url: string
  apiKey: string
  fetch: Fetch
  timeoutMs?: number
}): Gluetun {
  const base = options.url.replace(/\/+$/, '')
  async function call(path: string, init?: { method: 'PUT'; body: unknown }) {
    let res: Response
    try {
      res = await options.fetch(`${base}${path}`, {
        method: init?.method ?? 'GET',
        headers: {
          'X-API-Key': options.apiKey,
          ...(init ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      })
    } catch (e) {
      throw new GluetunError('unreachable', (e as Error).message)
    }
    if (res.status === 401 || res.status === 403)
      throw new GluetunError('refused', `HTTP ${res.status}`)
    if (!res.ok) throw new GluetunError('unreachable', `HTTP ${res.status}`)
    try {
      return (await res.json()) as Record<string, unknown>
    } catch {
      throw new GluetunError('unreachable', 'The answer isn’t JSON.')
    }
  }
  const text = (v: unknown) => (typeof v === 'string' && v ? v : null)
  return {
    async status() {
      return String((await call('/v1/vpn/status')).status ?? '')
    },
    async setStatus(status) {
      await call('/v1/vpn/status', { method: 'PUT', body: { status } })
    },
    async publicIp() {
      const body = await call('/v1/publicip/ip')
      return { ip: text(body.public_ip), country: text(body.country) }
    },
    async forwardedPort() {
      const port = (await call('/v1/portforward')).port
      return typeof port === 'number' && port > 0 && port < 65536 ? port : null
    },
  }
}

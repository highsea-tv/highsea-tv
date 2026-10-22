// SPDX-License-Identifier: AGPL-3.0-only
// The one HTTP server (ADR 0003): `/api`, the calendar feed (`/feed/`) and Prometheus's `/metrics`
// (ADR 0047) to Hono, `/stream` and `/ws` reserved for playback, and
// everything else to Next's handler. The same handler serves HTTPS when built-in TLS is on.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import type { Certificate } from '@highsea-tv/network'
import { getRequestListener } from '@hono/node-server'
import type { Api } from './api/app.ts'
import { PATH_HEADER, PEER_HEADER } from './session-cookie.ts'

export type NextHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

type Handlers = { api: Api; next?: NextHandler }

function handler({ api, next }: Handlers) {
  const toApi = getRequestListener(api.fetch)
  return (req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/'
    if (
      path === '/api' ||
      path.startsWith('/api/') ||
      path.startsWith('/feed/') ||
      path === '/metrics'
    )
      return void toApi(req, res)
    if (path.startsWith('/stream/') || path === '/ws') {
      res.writeHead(501, { 'content-type': 'application/json' })
      return void res.end(
        JSON.stringify({
          error: { code: 'unavailable', message: 'Playback comes in a later release.' },
        }),
      )
    }
    if (next) {
      // the admin's server components check sessions without the socket (session-cookie.ts)
      req.headers[PEER_HEADER] = req.socket.remoteAddress ?? ''
      req.headers[PATH_HEADER] = req.url ?? '/'
      return void next(req, res)
    }
    res.writeHead(404).end()
  }
}

export const createHttpServer = (handlers: Handlers) => createServer(handler(handlers))

/** https.createServer takes the PEM chain and key as tls.createSecureContext does (Node docs). */
export const createTlsServer = (handlers: Handlers, certificate: Certificate) =>
  createHttpsServer({ cert: certificate.cert, key: certificate.key }, handler(handlers))

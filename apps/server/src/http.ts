// SPDX-License-Identifier: AGPL-3.0-only
// The one HTTP server (ADR 0003): `/api`, the calendar feed (`/feed/`) and Prometheus's `/metrics`
// (ADR 0047) to Hono, `/stream/` to playback's files (checkpoint 4.1a), `/web` to the web client's
// build (checkpoint 4.2a), `/ws` reserved, and everything else to Next's handler. The same handler serves HTTPS when built-in TLS is on.
// Before any of them, the front door (front-door.ts, HT-53): behind a proxy with an https://
// External URL, plain HTTP the proxy carried is sent there and HTTPS answers carry HSTS; and a
// proxy highsea isn't set for is noted, for System › Health to offer the setting.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import {
  type Certificate,
  httpsOnly,
  type NetworkSettings,
  type ProxySighting,
  sightProxy,
  type TrustedProxies,
} from '@highsea-tv/network'
import { getRequestListener } from '@hono/node-server'
import type { Api } from './api/app.ts'
import { PATH_HEADER, PEER_HEADER } from './session-cookie.ts'
import type { StreamHandler } from './stream/index.ts'
import { WEB, type WebHandler } from './web/index.ts'

export type NextHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

/** The part of the runtime's network service the front door reads. */
export type FrontDoor = {
  settings(): NetworkSettings
  trusted(): TrustedProxies
  sawProxy(sighting: ProxySighting): void
}

type Handlers = {
  api: Api
  next?: NextHandler
  stream?: StreamHandler
  web?: WebHandler
  /** The network settings, for HTTPS only and noticing a proxy; without it, neither runs. */
  network?: FrontDoor
}

/** Answers the request itself when HTTPS only redirects it; otherwise sets HSTS when it applies. */
function frontDoor(network: FrontDoor, req: IncomingMessage, res: ServerResponse): boolean {
  const settings = network.settings()
  const remoteAddress = req.socket.remoteAddress ?? ''
  const sighting = sightProxy({ settings, remoteAddress, headers: req.headers })
  if (sighting) network.sawProxy(sighting)
  const https = httpsOnly({
    settings,
    remoteAddress,
    headers: req.headers,
    trusted: network.trusted(),
    url: req.url ?? '/',
  })
  if (!https) return false
  if ('hsts' in https) {
    // kept by Hono's and Next's own writeHead, which merges headers already set (Node's docs)
    res.setHeader('strict-transport-security', https.hsts)
    return false
  }
  // 308 keeps the method and body (RFC 9110 § 15.4.9); RFC 6797 § 7.2 asks for a permanent one
  res.writeHead(308, { location: https.redirect, 'content-type': 'text/plain; charset=utf-8' })
  res.end(`Moved to ${https.redirect}\n`)
  return true
}

function handler({ api, next, stream, web, network }: Handlers) {
  const toApi = getRequestListener(api.fetch)
  return (req: IncomingMessage, res: ServerResponse) => {
    if (network && frontDoor(network, req, res)) return
    const path = (req.url ?? '/').split('?')[0] ?? '/'
    if (
      path === '/api' ||
      path.startsWith('/api/') ||
      path.startsWith('/feed/') ||
      path === '/metrics'
    )
      return void toApi(req, res)
    if (path.startsWith('/stream/') && stream) return void stream(req, res)
    if ((path === WEB || path.startsWith(`${WEB}/`)) && web) return void web(req, res)
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

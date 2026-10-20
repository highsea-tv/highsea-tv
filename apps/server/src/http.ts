// SPDX-License-Identifier: AGPL-3.0-only
// The one HTTP server (ADR 0003): `/api` to Hono, `/stream` and `/ws` reserved for playback, and
// everything else to Next's handler.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { getRequestListener } from '@hono/node-server'
import type { Api } from './api/app.ts'

export type NextHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

export function createHttpServer({ api, next }: { api: Api; next?: NextHandler }) {
  const toApi = getRequestListener(api.fetch)
  return createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/'
    if (path === '/api' || path.startsWith('/api/')) return void toApi(req, res)
    if (path.startsWith('/stream/') || path === '/ws') {
      res.writeHead(501, { 'content-type': 'application/json' })
      return void res.end(
        JSON.stringify({
          error: { code: 'unavailable', message: 'Playback comes in a later release.' },
        }),
      )
    }
    if (next) return void next(req, res)
    res.writeHead(404).end()
  })
}

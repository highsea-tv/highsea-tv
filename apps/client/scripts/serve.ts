// SPDX-License-Identifier: AGPL-3.0-only
// The web export (dist/, from `bun run export:web`) served as the server serves the web client:
// every file under /web, and any other address under it answered with index.html for the router,
// as a single-page app needs (https://docs.expo.dev/guides/publishing-websites/). /api and /stream
// go to `bun run server`, as apps/web's Vite config sends them, so the session cookie and every
// request stay on one origin: the Host header goes through unchanged (Vite's `changeOrigin: false`).
// The answer goes back as the server sent it: Bun's fetch would otherwise decompress the body but
// keep its Content-Encoding, which the browser would then try to decode again (`decompress: false`,
// https://bun.com/docs/runtime/networking/fetch).
// `bun run serve`, then http://localhost:3300/web/ (PORT and HIGHSEA_DEV_SERVER change them).
import { stat } from 'node:fs/promises'
import { join, normalize, sep } from 'node:path'

const BASE = '/web'
const dist = join(import.meta.dir, '..', 'dist')
const index = join(dist, 'index.html')
const server = process.env.HIGHSEA_DEV_SERVER ?? 'http://localhost:3000'
const port = Number(process.env.PORT ?? 3300)

const under = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`)

/** The file in dist/ an address under /web names, if there is one. */
async function fileFor(pathname: string): Promise<string | null> {
  let rest: string
  try {
    rest = decodeURIComponent(pathname.slice(BASE.length))
  } catch {
    return null
  }
  const file = normalize(join(dist, rest))
  if (!file.startsWith(dist + sep)) return null
  const found = await stat(file).catch(() => null)
  return found?.isFile() ? file : null
}

function proxy(req: Request, url: URL): Promise<Response> {
  return fetch(new URL(url.pathname + url.search, server), {
    method: req.method,
    headers: req.headers,
    body: req.body,
    redirect: 'manual',
    decompress: false,
  })
}

Bun.serve({
  hostname: 'localhost',
  port,
  async fetch(req) {
    const url = new URL(req.url)
    if (under(url.pathname, '/api') || under(url.pathname, '/stream')) return proxy(req, url)
    if (url.pathname === '/' || url.pathname === BASE)
      return new Response(null, { status: 302, headers: { location: `${BASE}/` } })
    if (!url.pathname.startsWith(`${BASE}/`)) return new Response(null, { status: 404 })
    const file = await fileFor(url.pathname)
    if (file) return new Response(Bun.file(file))
    // a missing script, font or image under the export's own folders is a 404, as the server's
    // /web answers a missing file (apps/server/src/web/index.ts), rather than a page the browser
    // would try to run; every other address is a route, so index.html
    const asset = ['_expo', 'assets'].some((dir) => under(url.pathname, `${BASE}/${dir}`))
    return asset ? new Response(null, { status: 404 }) : new Response(Bun.file(index))
  },
})

console.log(`The client's web export: http://localhost:${port}${BASE}/ (the API from ${server})`)

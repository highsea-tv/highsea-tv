// SPDX-License-Identifier: AGPL-3.0-only
// `/web` (ADR 0003's 4.2a section, ADR 0053): the web client's static build, served by the server
// that it talks to, so its session cookie and every call stay on one origin. `http.ts` hands
// `/web` here, as it hands `/stream/` to playback.
//
// - Files resolve under the build folder; a path that leaves it is refused. Only GET and HEAD.
// - Vite names what it builds under `assets/` by a hash of the content
//   (https://vite.dev/guide/build.html#public-base-path), so those are cached for a year and never
//   asked for again (`immutable`, RFC 8246); `index.html` and the icons are checked each time
//   (`no-cache` with an ETag, RFC 9111 § 5.2.2.4, RFC 9110 § 8.8.3).
// - An address without a file extension is a route of the app: it gets `index.html`, and the app's
//   router draws the page (the history API's fallback). A missing file with an extension is a 404.
// - Text is gzipped once and kept, for the browsers that ask (RFC 9110 § 8.4.1).
// - The Content Security Policy allows only this origin, plus what hls.js needs: Media Source
//   Extensions' `blob:` media and its worker (https://github.com/video-dev/hls.js/blob/master/docs/API.md#workerpath).
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { gzipSync } from 'node:zlib'

export const WEB = '/web'

export type WebHandler = (req: IncomingMessage, res: ServerResponse) => void

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
}

const COMPRESSIBLE = new Set([
  '.html',
  '.js',
  '.css',
  '.json',
  '.webmanifest',
  '.map',
  '.svg',
  '.txt',
])

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // React's style attributes, the theme's stylesheet built in the page, and index.html's first paint
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ')

const SECURITY = {
  'content-security-policy': CSP,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
} as const

const IMMUTABLE = 'public, max-age=31536000, immutable'
const REVALIDATE = 'no-cache'

type Loaded = { mtime: number; body: Buffer; gzip: Buffer | null; etag: string }

const MISSING = `<!doctype html><meta charset="utf-8"><title>highsea</title>
<p>The web app isn’t built. Run <code>bun run --filter @highsea-tv/web build</code>, then reload.</p>`

export function createWeb({ dir }: { dir: string }): WebHandler {
  const root = normalize(dir)
  const cache = new Map<string, Loaded>()

  async function load(file: string): Promise<Loaded | null> {
    const s = await stat(file).catch(() => null)
    if (!s?.isFile()) return null
    const hit = cache.get(file)
    if (hit && hit.mtime === s.mtimeMs) return hit
    const body = await readFile(file)
    const gzip = COMPRESSIBLE.has(extname(file)) && body.length > 1024 ? gzipSync(body) : null
    const etag = `"${createHash('sha1').update(body).digest('base64url')}"`
    const loaded = { mtime: s.mtimeMs, body, gzip, etag }
    cache.set(file, loaded)
    return loaded
  }

  async function serve(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD', ...SECURITY }).end()
      return
    }
    const raw = (req.url ?? '/').split('?')[0] ?? '/'
    // `/web` itself: the app's relative addresses need the trailing slash
    if (raw === WEB) {
      const query = req.url?.slice(raw.length) ?? ''
      res.writeHead(301, { location: `${WEB}/${query}` }).end()
      return
    }
    let path: string
    try {
      path = decodeURIComponent(raw.slice(WEB.length + 1))
    } catch {
      res.writeHead(400, SECURITY).end()
      return
    }
    const wanted = normalize(join(root, path))
    if (wanted !== root && !wanted.startsWith(root + sep)) {
      res.writeHead(404, SECURITY).end()
      return
    }
    const route = !extname(path)
    const file = route ? join(root, 'index.html') : wanted
    const loaded = await load(file)
    if (!loaded) {
      if (route) {
        res.writeHead(503, { 'content-type': TYPES['.html'], ...SECURITY }).end(MISSING)
        return
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...SECURITY }).end()
      return
    }
    const ext = extname(file)
    const headers: Record<string, string> = {
      ...SECURITY,
      'content-type': TYPES[ext] ?? 'application/octet-stream',
      'cache-control': path.startsWith('assets/') ? IMMUTABLE : REVALIDATE,
      etag: loaded.etag,
      vary: 'accept-encoding',
    }
    if (req.headers['if-none-match'] === loaded.etag) {
      res.writeHead(304, headers).end()
      return
    }
    const gzip = loaded.gzip && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))
    const body = gzip && loaded.gzip ? loaded.gzip : loaded.body
    if (gzip) headers['content-encoding'] = 'gzip'
    headers['content-length'] = String(body.length)
    res.writeHead(200, headers)
    res.end(req.method === 'HEAD' ? undefined : body)
  }

  return (req, res) =>
    void serve(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500, SECURITY)
      res.end()
    })
}

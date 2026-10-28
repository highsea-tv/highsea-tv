// SPDX-License-Identifier: AGPL-3.0-only
// `/stream` (ADR 0003's 4.1a section): files for direct play by byte ranges, and the review's test
// page. `http.ts` hands `/stream/` here, as it hands `/api` to Hono, so the file is piped straight
// into Node's response and never held in memory (`fs.createReadStream` with `start` and `end`,
// https://nodejs.org/api/fs.html#fscreatereadstreampath-options). The token in the path is the
// only credential, since a `<video>` element can't send headers; it's never logged, and the page
// tells the browser not to pass it on (`Referrer-Policy: no-referrer`).
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Runtime } from '@highsea-tv/runtime'
import { ifRangeAllows, parseRange } from './ranges.ts'
import { TRY_PAGE } from './try.ts'

const FILES = '/stream/files/'

const SECURITY = {
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'cache-control': 'private, no-store',
} as const

function fail(res: ServerResponse, status: number, message: string) {
  res.writeHead(status, { 'content-type': 'application/json', ...SECURITY })
  res.end(JSON.stringify({ error: { code: status === 404 ? 'not-found' : 'invalid', message } }))
}

export type StreamOptions = {
  /** Serve `/stream/try`, the review's test page (`HIGHSEA_PLAYBACK_TRY=1`). */
  tryPage?: boolean
}

export function createStream(
  runtime: Pick<Runtime, 'playback' | 'logger'>,
  options: StreamOptions = {},
) {
  const log = runtime.logger.child('stream')

  async function file(req: IncomingMessage, res: ServerResponse, token: string) {
    const target = runtime.playback.open(token)
    if (!target) return fail(res, 404, 'That stream has ended.')
    let info: Awaited<ReturnType<typeof stat>>
    try {
      info = await stat(target.path)
    } catch (e) {
      log.warn('a file to stream can’t be read', { error: (e as NodeJS.ErrnoException).code })
      return fail(res, 404, 'The file can’t be read.')
    }
    const size = info.size
    // size and change time, as Node's `send` makes its tags; the file is replaced, not edited
    const etag = `"${size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`
    const lastModified = info.mtime.toUTCString()
    const headers = {
      ...SECURITY,
      'content-type': target.type,
      'accept-ranges': 'bytes',
      etag,
      'last-modified': lastModified,
    }
    // a repeated If-Range can't be compared, so the whole file goes
    const ifRange = req.headers['if-range']
    const asked =
      !Array.isArray(ifRange) && ifRangeAllows(ifRange, { etag, lastModified })
        ? parseRange(req.headers.range, size)
        : null
    if (asked === 'unsatisfiable') {
      res.writeHead(416, { ...headers, 'content-range': `bytes */${size}` })
      return void res.end()
    }
    const { start, end } = asked ?? { start: 0, end: size - 1 }
    res.writeHead(asked ? 206 : 200, {
      ...headers,
      'content-length': String(size === 0 ? 0 : end - start + 1),
      ...(asked ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}),
    })
    if (req.method === 'HEAD' || size === 0) return void res.end()
    const body = createReadStream(target.path, { start, end })
    // a seek closes the connection mid-range: stop reading
    res.on('close', () => body.destroy())
    body.on('error', (e) => {
      log.warn('a stream stopped', { error: (e as NodeJS.ErrnoException).code })
      res.destroy()
    })
    body.pipe(res)
  }

  return (req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? '/').split('?')[0] ?? '/'
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD', ...SECURITY })
      return void res.end()
    }
    if (path.startsWith(FILES)) {
      const token = decodeURIComponent(path.slice(FILES.length))
      return void file(req, res, token).catch((e) => {
        log.error('streaming failed', { error: (e as Error).message })
        if (!res.headersSent) fail(res, 500, 'Something went wrong.')
        else res.destroy()
      })
    }
    if (options.tryPage && (path === '/stream/try' || path === '/stream/try/')) {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy':
          "default-src 'self'; script-src 'unsafe-inline' 'self'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'",
        ...SECURITY,
      })
      return void res.end(TRY_PAGE)
    }
    fail(res, 404, 'There’s nothing here.')
  }
}

export type StreamHandler = ReturnType<typeof createStream>

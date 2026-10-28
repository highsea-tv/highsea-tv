// SPDX-License-Identifier: AGPL-3.0-only
// `/stream` (ADR 0003's 4.1a section): files for direct play by byte ranges, and the review's test
// page. `http.ts` hands `/stream/` here, as it hands `/api` to Hono, so the file is piped straight
// into Node's response and never held in memory (`fs.createReadStream` with `start` and `end`,
// https://nodejs.org/api/fs.html#fscreatereadstreampath-options). The token in the path is the
// only credential, since a `<video>` element can't send headers; it's never logged, and the page
// tells the browser not to pass it on (`Referrer-Policy: no-referrer`).
//
// Since 4.1b it also serves HLS made on demand (ADR 0051) under `/stream/hls/{token}/`: the
// multivariant playlist `main.m3u8`, the media playlist `video.m3u8`, the initialization section
// `init.mp4`, the segments `{n}.m4s` (a segment's pieces, sent one after another), and each text
// subtitle's rendition `subs/{track}.m3u8` with its WebVTT. `/stream/subtitles/{token}/{track}.vtt`
// is a text track as WebVTT for any session, direct play's too.
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import type { Runtime } from '@highsea-tv/runtime'
import { TranscodeError } from '@highsea-tv/stream/hls'
import { ifRangeAllows, parseRange } from './ranges.ts'
import { TRY_PAGE } from './try.ts'

const FILES = '/stream/files/'
const HLS = '/stream/hls/'
const SUBTITLES = '/stream/subtitles/'

/** HLS's media types (RFC 8216 § 4) and fragmented MP4's (ISO/IEC 14496-12; RFC 6381). */
const PLAYLIST = 'application/vnd.apple.mpegurl'
const MP4 = 'video/mp4'
const VTT = 'text/vtt; charset=utf-8'

/** What the player is told when ffmpeg fails (the plan's "Errors"); the log has ffmpeg's lines. */
const DIDNT_START = 'This film didn’t start.'

const SECURITY = {
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'cache-control': 'private, no-store',
} as const

function fail(res: ServerResponse, status: number, message: string) {
  res.writeHead(status, { 'content-type': 'application/json', ...SECURITY })
  res.end(JSON.stringify({ error: { code: status === 404 ? 'not-found' : 'invalid', message } }))
}

/** Sends files one after another as one body: a segment's pieces, or one file. */
async function sendFiles(req: IncomingMessage, res: ServerResponse, files: string[], type: string) {
  const sizes = await Promise.all(files.map(async (f) => (await stat(f)).size))
  res.writeHead(200, {
    ...SECURITY,
    'content-type': type,
    'content-length': String(sizes.reduce((a, b) => a + b, 0)),
  })
  if (req.method === 'HEAD') return void res.end()
  for (const f of files) {
    if (res.destroyed) return
    await new Promise<void>((resolve, reject) => {
      const body = createReadStream(f)
      res.once('close', () => body.destroy())
      body.on('error', reject)
      body.on('end', resolve)
      body.pipe(res, { end: false })
    })
  }
  res.end()
}

function sendText(req: IncomingMessage, res: ServerResponse, text: string, type: string) {
  const body = Buffer.from(text)
  res.writeHead(200, { ...SECURITY, 'content-type': type, 'content-length': String(body.length) })
  res.end(req.method === 'HEAD' ? undefined : body)
}

/** hls.js's browser build for the test page, from the server's own dev dependencies. */
function hlsScript(): string | null {
  try {
    return createRequire(import.meta.url).resolve('hls.js/dist/hls.min.js')
  } catch {
    return null
  }
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

  /** `/stream/hls/{token}/…`: the playlists, the init, a segment or a subtitle rendition. */
  async function hls(req: IncomingMessage, res: ServerResponse, token: string, rest: string) {
    const { playback } = runtime
    const gone = () => fail(res, 404, 'That stream has ended.')
    if (rest === 'main.m3u8' || rest === 'video.m3u8') {
      const text = await playback.hls.playlist(token, rest === 'main.m3u8' ? 'main' : 'video')
      return text === null ? gone() : sendText(req, res, text, PLAYLIST)
    }
    if (rest === 'init.mp4') {
      const file = await playback.hls.init(token)
      return file === null ? gone() : sendFiles(req, res, [file], MP4)
    }
    const segment = /^(\d{1,6})\.m4s$/.exec(rest)
    if (segment) {
      const files = await playback.hls.segment(token, Number(segment[1]))
      return files === null ? gone() : sendFiles(req, res, files, MP4)
    }
    const sub = /^subs\/([^/]+)\.(m3u8|vtt)$/.exec(rest)
    if (sub) {
      const track = decodeURIComponent(sub[1] as string)
      if (sub[2] === 'm3u8') {
        const text = playback.hls.subtitleList(token, track)
        return text === null ? gone() : sendText(req, res, text, PLAYLIST)
      }
      const file = await playback.subtitle(token, track)
      return file === null ? gone() : sendFiles(req, res, [file], VTT)
    }
    fail(res, 404, 'There’s nothing here.')
  }

  /** A failed request: ffmpeg's failure is the player's "didn't start", logged by the runner. */
  const failed = (res: ServerResponse) => (e: unknown) => {
    if (res.headersSent) return void res.destroy()
    if (e instanceof TranscodeError) return fail(res, 500, DIDNT_START)
    log.error('streaming failed', { error: (e as Error).message })
    fail(res, 500, 'Something went wrong.')
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
    if (path.startsWith(HLS)) {
      const [token = '', ...rest] = path.slice(HLS.length).split('/')
      return void hls(req, res, decodeURIComponent(token), rest.join('/')).catch(failed(res))
    }
    const vtt = path.startsWith(SUBTITLES)
      ? /^([^/]+)\/([^/]+)\.vtt$/.exec(path.slice(SUBTITLES.length))
      : null
    if (vtt) {
      const token = decodeURIComponent(vtt[1] as string)
      return void runtime.playback
        .subtitle(token, decodeURIComponent(vtt[2] as string))
        .then((file) =>
          file === null
            ? fail(res, 404, 'That subtitle isn’t there.')
            : sendFiles(req, res, [file], VTT),
        )
        .catch(failed(res))
    }
    if (options.tryPage && path === '/stream/try/hls.js') {
      const script = hlsScript()
      if (!script) return fail(res, 404, 'hls.js isn’t installed: it’s a development dependency.')
      return void sendFiles(req, res, [script], 'text/javascript; charset=utf-8').catch(failed(res))
    }
    if (options.tryPage && (path === '/stream/try' || path === '/stream/try/')) {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        // hls.js feeds the video through Media Source Extensions' blob: URLs (and a data: placeholder
        // for its text tracks), and demuxes in a worker made from a blob
        // (https://github.com/video-dev/hls.js/blob/master/docs/API.md#enableworker)
        'content-security-policy':
          "default-src 'self'; script-src 'unsafe-inline' 'self'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob: data:; worker-src 'self' blob:",
        ...SECURITY,
      })
      return void res.end(TRY_PAGE)
    }
    fail(res, 404, 'There’s nothing here.')
  }
}

export type StreamHandler = ReturnType<typeof createStream>

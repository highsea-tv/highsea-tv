// SPDX-License-Identifier: AGPL-3.0-only
// The clip every film plays as in the client's mock export (@highsea-tv/mock/play, B2): Sintel's
// 52 s from the subtitle sync's fixtures (packages/subtitles/test/fixtures/sintel/, CC BY 3.0,
// © Blender Foundation), its sound over a moving gradient, as H.264 and AAC in an MP4 with its
// index first, which every browser and the desktop app's webviews play directly, and its English
// cues as WebVTT, the format a `<track>` takes (https://www.w3.org/TR/webvtt1/). Made with ffmpeg
// into node_modules/.cache, never committed: the fixtures are the repository's only copy. Without
// ffmpeg, nothing is made, and the player says the film didn't start.
// It's served at /web/mock-media/ beside the export, by byte ranges, as `<video>` asks for a file
// it seeks in (RFC 9110 § 14).
import { spawnSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { MOCK_CLIP } from '@highsea-tv/mock/play'
import type { Connect } from 'vite'
import { ROOT } from '../../apps/client/scripts/stamp.ts'

const SINTEL = join(ROOT, 'packages/subtitles/test/fixtures/sintel')
export const MOCK_MEDIA = join(ROOT, 'node_modules/.cache/highsea/mock-media')
const CLIP = join(MOCK_MEDIA, basename(MOCK_CLIP.clip))
const CUES = join(MOCK_MEDIA, basename(MOCK_CLIP.subtitles))
const FFMPEG = process.env.HIGHSEA_FFMPEG ?? 'ffmpeg'

/** Runs ffmpeg into a file beside `out` and renames it into place, so a failed run leaves nothing. */
function make(out: string, args: string[]): boolean {
  const part = `${out}.part${basename(out).slice(basename(out).lastIndexOf('.'))}`
  const run = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args, part], {
    stdio: 'inherit',
  })
  if (run.status !== 0) {
    rmSync(part, { force: true })
    return false
  }
  renameSync(part, out)
  return true
}

/** Makes the clip and its cues when they're missing. Never throws; returns whether both are there. */
export function ensureMockMedia(log: (message: string) => void = console.log): boolean {
  if (existsSync(CLIP) && existsSync(CUES)) return true
  mkdirSync(MOCK_MEDIA, { recursive: true })
  log('Making the mock’s Sintel clip for the player (a few seconds).')
  const seconds = String(MOCK_CLIP.duration)
  const made =
    (existsSync(CLIP) ||
      make(CLIP, [
        // a picture that moves, so playing, seeking and the trickplay-less scrubber show it
        '-f',
        'lavfi',
        '-i',
        `gradients=s=640x360:r=24:d=${seconds}:speed=0.02`,
        '-i',
        join(SINTEL, 'sintel.flac'),
        '-map',
        '0:v',
        '-map',
        '1:a',
        '-t',
        seconds,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '32',
        '-pix_fmt',
        'yuv420p',
        '-g',
        '48',
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        '-ac',
        '2',
        // the index first, so a browser starts before the whole file has come
        '-movflags',
        '+faststart',
      ])) &&
    (existsSync(CUES) || make(CUES, ['-i', join(SINTEL, 'sintel.en.srt'), '-c:s', 'webvtt']))
  if (!made)
    log('Couldn’t make the mock’s clip with ffmpeg: the player will say the film didn’t start.')
  return made
}

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt; charset=utf-8',
}

/** One `bytes=` range of a file `size` long, or null when there's none or it's unsatisfiable. */
export function rangeOf(header: string | undefined, size: number): [number, number] | null | 'bad' {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m || (m[1] === '' && m[2] === '')) return 'bad'
  if (m[1] === '') {
    const n = Math.min(Number(m[2]), size)
    return n > 0 ? [size - n, size - 1] : 'bad'
  }
  const start = Number(m[1])
  const end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  return start <= end && start < size ? [start, end] : 'bad'
}

/** Answers /web/mock-media/<file> from the cache, with byte ranges; anything else goes on. */
export const mockMediaMiddleware: Connect.NextHandleFunction = (req, res, next) => {
  const pathname = (req.url ?? '/').split('?')[0] ?? '/'
  const name = [MOCK_CLIP.clip, MOCK_CLIP.subtitles].find((f) => pathname === `/web/${f}`)
  if (!name) return next()
  const file = join(MOCK_MEDIA, basename(name))
  const stat = statSync(file, { throwIfNoEntry: false })
  if (!stat?.isFile()) {
    res.statusCode = 404
    return res.end()
  }
  res.setHeader(
    'Content-Type',
    TYPES[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream',
  )
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Cache-Control', 'no-cache')
  const range = rangeOf(req.headers.range, stat.size)
  if (range === 'bad') {
    res.statusCode = 416
    res.setHeader('Content-Range', `bytes */${stat.size}`)
    return res.end()
  }
  const [start, end] = range ?? [0, stat.size - 1]
  res.statusCode = range ? 206 : 200
  if (range) res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
  res.setHeader('Content-Length', String(end - start + 1))
  if (req.method === 'HEAD') return res.end()
  createReadStream(file, { start, end }).pipe(res)
}

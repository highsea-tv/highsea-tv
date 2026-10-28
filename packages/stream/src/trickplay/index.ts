// SPDX-License-Identifier: AGPL-3.0-only
// Trickplay (checkpoint 4.1b): the scrubber's previews, a frame every 10 s, 320 px wide, in sheets
// of 10 × 10 JPEGs, as Jellyfin's defaults are. Made by ffmpeg's `fps`, `scale` and `tile` filters
// (https://ffmpeg.org/ffmpeg-filters.html#tile) from the keyframes alone (`-skip_frame nokey`,
// https://ffmpeg.org/ffmpeg-codecs.html#Codec-Options), so a film is read at the speed of its
// keyframes rather than decoded whole: each preview is the last keyframe before its time.
//
// The runtime keeps them in the data folder, one folder per file, never beside the film.
import { spawn } from 'node:child_process'
import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import { setPriority } from 'node:os'
import { join } from 'node:path'

export const TRICKPLAY = { interval: 10, width: 320, columns: 10, rows: 10 } as const

export type TrickplayManifest = {
  /** Seconds between previews. */
  interval: number
  /** One preview's size. */
  width: number
  height: number
  columns: number
  rows: number
  /** Previews in all; the last sheet may be part full. */
  count: number
  sheets: number
}

/** A preview's height for a picture this size, even, as `scale=320:-2` makes it. */
export const tileHeight = (source: { width: number; height: number }, width = TRICKPLAY.width) =>
  Math.max(2, Math.round((source.height * width) / source.width / 2) * 2)

export function trickplayManifest(
  duration: number,
  source: { width: number; height: number },
): TrickplayManifest {
  const { interval, width, columns, rows } = TRICKPLAY
  const count = Math.max(1, Math.ceil(duration / interval))
  return {
    interval,
    width,
    height: tileHeight(source),
    columns,
    rows,
    count,
    sheets: Math.ceil(count / (columns * rows)),
  }
}

/** ffmpeg's command line: the picture's stream, its keyframes, into numbered sheets from 0. */
export function trickplayArgs(input: string, index: number, out: string): string[] {
  const { interval, width, columns, rows } = TRICKPLAY
  return [
    ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-y'],
    ...['-skip_frame', 'nokey', '-i', input],
    ...['-map', `0:${index}`, '-an', '-sn', '-dn'],
    ...['-vf', `fps=1/${interval},scale=${width}:-2,tile=${columns}x${rows}`],
    ...['-fps_mode', 'passthrough', '-q:v', '5'],
    ...['-f', 'image2', '-start_number', '0', join(out, '%d.jpg')],
  ]
}

/** The lowest priority a process can have (`nice` 19; https://nodejs.org/api/os.html#ossetprioritypid-priority). */
const LOW = 19

/**
 * Makes a film's sheets into `dir`, at the lowest priority. They're made in a folder beside it
 * and moved into place when whole, so a half-made set is never served. Aborting kills ffmpeg.
 */
export async function makeTrickplay(options: {
  ffmpeg: string
  input: string
  index: number
  dir: string
  signal?: AbortSignal
}): Promise<number> {
  const work = `${options.dir}.part`
  await rm(work, { recursive: true, force: true })
  await mkdir(work, { recursive: true })
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(options.ffmpeg, trickplayArgs(options.input, options.index, work), {
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
        signal: options.signal,
      })
      if (child.pid)
        try {
          setPriority(child.pid, LOW)
        } catch {
          // a platform without priorities still makes them
        }
      const lines: string[] = []
      child.stderr?.setEncoding('utf8')
      child.stderr?.on('data', (chunk: string) => {
        lines.push(...chunk.split('\n').filter((l) => l.trim()))
        lines.splice(0, Math.max(0, lines.length - 10))
      })
      child.on('error', reject)
      child.on('exit', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`ffmpeg stopped with code ${code}: ${lines.join(' / ')}`)),
      )
    })
    const sheets = (await readdir(work)).filter((f) => f.endsWith('.jpg')).length
    await rm(options.dir, { recursive: true, force: true })
    await rename(work, options.dir)
    return sheets
  } catch (e) {
    await rm(work, { recursive: true, force: true })
    throw e
  }
}

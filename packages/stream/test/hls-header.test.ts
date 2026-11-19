// SPDX-License-Identifier: AGPL-3.0-only
// The init a player is sent is whole (HT-64). libuv's copy, behind Node's fs.copyFile, opens the
// destination before it writes (uv__fs_copyfile in src/unix/fs.c), so on Linux a copy in place
// shows an empty file for a moment; here the copy is made to do that on every platform, slowly,
// and the header asked for while the run's first piece is still being made must still come whole.
import { afterAll, beforeAll, expect, mock, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import * as fsp from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hasFfmpeg, TOOL_LIMIT } from '@highsea-tv/media/testing'

const real = { ...fsp }
mock.module('node:fs/promises', () => ({
  ...real,
  // as libuv does on Linux: the destination first, empty, and its bytes a moment later
  copyFile: async (from: string, to: string) => {
    writeFileSync(to, '')
    await Bun.sleep(40)
    await real.copyFile(from, to)
  },
}))
const { createTranscodes, readKeyframes } = await import('../src/hls/index.ts')

const ffmpeg = process.env.HIGHSEA_FFMPEG || 'ffmpeg'
const ffprobe = process.env.HIGHSEA_FFPROBE || 'ffprobe'
let dir = ''
let clip = ''

beforeAll(() => {
  if (!hasFfmpeg) return
  dir = mkdtempSync(join(tmpdir(), 'highsea-header-'))
  clip = join(dir, 'clip.mkv')
  execFileSync(
    ffmpeg,
    [
      ...['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24:duration=20'],
      ...['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-g', '48', clip],
    ],
    TOOL_LIMIT,
  )
})
afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

test.skipIf(!hasFfmpeg)(
  'a header asked for before the first piece is out comes whole',
  async () => {
    const transcodes = createTranscodes({
      root: join(dir, 'transcodes'),
      ffmpeg,
      ffprobe,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    })
    try {
      for (const [k, start] of [0, 8, 12].entries()) {
        const t = transcodes.open(`resume-${k}`, {
          input: clip,
          duration: 20,
          decision: {
            method: 'direct-stream',
            container: 'mkv',
            video: { action: 'copy' },
            audio: null,
            subtitle: null,
            bitrate: 1_000_000,
            reasons: [],
          },
          video: { index: 0, codec: 'h264', width: 320, height: 180 },
          start,
          keyframes: () => readKeyframes(ffprobe, clip, 0),
        })
        // asked for at once, as a player does after the playlist: it waits for the first piece
        const header = await t.init()
        // what the server would stat and send, the moment it's handed the file
        const sent = statSync(header).size
        expect(sent).toBeGreaterThan(0)
        expect(sent).toBe(statSync(join(t.dir, 'init.mp4')).size)
        expect(readFileSync(header)).toEqual(readFileSync(join(t.dir, 'init.mp4')))
        await transcodes.end(`resume-${k}`)
      }
    } finally {
      await transcodes.close()
    }
  },
  60_000,
)

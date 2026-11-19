// SPDX-License-Identifier: AGPL-3.0-only
// Uploaded artwork's sizes (HT-66), made by ffmpeg: a PNG stays a PNG, a JPEG a JPEG, and an image
// is never made larger than it is. Skipped, and says so, without ffmpeg.
import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { hasFfmpeg } from '@highsea-tv/media/testing'
import { checkArtwork } from '@highsea-tv/metadata'
import { ffmpegBinary } from '@highsea-tv/subtitles/sync'
import { ffmpegResizer } from '../src/image-resize.ts'

/** A solid image of this size from ffmpeg's colour source, as PNG or JPEG bytes. */
const image = (width: number, height: number, codec: 'png' | 'mjpeg') =>
  new Uint8Array(
    execFileSync(ffmpegBinary(), [
      ...['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', `color=c=teal:s=${width}x${height}`],
      ...['-frames:v', '1', '-c:v', codec, '-f', 'image2pipe', 'pipe:1'],
    ]),
  )

describe.skipIf(!hasFfmpeg)('the ffmpeg resizer', () => {
  const resize = ffmpegResizer(ffmpegBinary())

  test('a PNG logo to a width, its shape kept', async () => {
    const out = await resize(image(800, 200, 'png'), { width: 300, type: 'image/png' })
    expect(checkArtwork('logo', out)).toEqual({ type: 'image/png', width: 300, height: 75 })
  })

  test('a JPEG poster to a width; a smaller one stays its size', async () => {
    const out = await resize(image(1000, 1500, 'mjpeg'), { width: 342, type: 'image/jpeg' })
    expect(checkArtwork('poster', image(1000, 1500, 'mjpeg')).type).toBe('image/jpeg')
    expect(out[0]).toBe(0xff)
    expect(out[1]).toBe(0xd8)
    const small = await resize(image(500, 750, 'mjpeg'), { width: 780, type: 'image/jpeg' })
    expect(checkArtwork('poster', small)).toMatchObject({ width: 500, height: 750 })
  })

  test('bytes that aren’t an image are refused', async () => {
    await expect(
      resize(new Uint8Array([1, 2, 3]), { width: 92, type: 'image/png' }),
    ).rejects.toThrow('ffmpeg stopped')
  })
})

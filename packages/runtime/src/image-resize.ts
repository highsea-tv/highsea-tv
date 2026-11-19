// SPDX-License-Identifier: AGPL-3.0-only
// Uploaded artwork's sizes (HT-66), made by ffmpeg, which highsea already needs for playback, so no
// image library joins the dependencies. The image goes in on stdin and comes out on stdout through
// the image2pipe muxer (https://ffmpeg.org/ffmpeg-formats.html#image2pipe), scaled by the scale
// filter (https://ffmpeg.org/ffmpeg-filters.html#scale-1) to the asked width or height, never
// larger than it is, the other side following (-1 keeps the aspect ratio). A PNG stays a PNG, so a
// logo keeps its transparency; a JPEG stays a JPEG at quality 2 (mjpeg's -q:v, 2 is near best).
import { spawn } from 'node:child_process'
import { endWithProcess } from '@highsea-tv/core/children'

export function ffmpegResizer(ffmpeg: string) {
  return (
    bytes: Uint8Array,
    to: { width?: number; height?: number; type: 'image/png' | 'image/jpeg' },
  ): Promise<Uint8Array> =>
    new Promise((resolve, reject) => {
      const scale = to.height
        ? `scale=w=-1:h='min(ih,${Math.trunc(to.height)})'`
        : `scale=w='min(iw,${Math.trunc(to.width ?? 0)})':h=-1`
      const codec = to.type === 'image/png' ? ['-c:v', 'png'] : ['-c:v', 'mjpeg', '-q:v', '2']
      const child = endWithProcess(
        spawn(
          ffmpeg,
          [
            ...['-v', 'error', '-f', 'image2pipe', '-i', 'pipe:0'],
            ...['-vf', scale, '-frames:v', '1', ...codec, '-f', 'image2pipe', 'pipe:1'],
          ],
          { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
        ),
      )
      const out: Buffer[] = []
      let err = ''
      child.stdout?.on('data', (c: Buffer) => out.push(c))
      child.stderr?.setEncoding('utf8')
      child.stderr?.on('data', (c: string) => {
        err = (err + c).slice(-2000)
      })
      child.on('error', reject)
      child.on('exit', (code: number | null) => {
        const result = Buffer.concat(out)
        if (code === 0 && result.length > 0) resolve(new Uint8Array(result))
        else reject(new Error(`ffmpeg stopped with code ${code}: ${err.trim()}`))
      })
      child.stdin?.on('error', () => {
        // ffmpeg closed its input early; its exit says why
      })
      child.stdin?.end(Buffer.from(bytes))
    })
}

// SPDX-License-Identifier: AGPL-3.0-only
// ffprobe through one child-process wrapper (checkpoint 6, The import pipeline, step 3): `execFile`
// with an argument array, never a shell, so a file name is only ever a file name (Node.js docs,
// child_process.execFile: https://nodejs.org/docs/latest-v24.x/api/child_process.html), and a
// timeout. The arguments are ffprobe's documented `-show_format -show_streams` in JSON
// (https://ffmpeg.org/ffprobe.html); probe.ts reads what comes back.
import { execFile } from 'node:child_process'
import { isAbsolute } from 'node:path'
import { type Probe, ProbeError, parseProbe } from './probe.ts'

/** ffprobe's binary: `HIGHSEA_FFPROBE` when set, else `ffprobe` on the PATH. */
export const ffprobeBinary = (env: NodeJS.ProcessEnv = process.env) =>
  env.HIGHSEA_FFPROBE?.trim() || 'ffprobe'

export const PROBE_ARGS = ['-v', 'error', '-show_format', '-show_streams', '-of', 'json'] as const

/**
 * A probe that runs ffprobe. The path must be absolute: ffprobe reads an argument starting with
 * `-` as an option and one with a `scheme:` prefix as a protocol, and an absolute path is neither.
 */
export function createProbe(
  options: { binary?: string; timeoutMs?: number; maxBytes?: number } = {},
): Probe {
  const binary = options.binary ?? ffprobeBinary()
  const timeout = options.timeoutMs ?? 60_000
  return (path) =>
    new Promise((resolve, reject) => {
      if (!isAbsolute(path)) {
        reject(new ProbeError('Only a full path can be probed.'))
        return
      }
      execFile(
        binary,
        [...PROBE_ARGS, path],
        { timeout, maxBuffer: options.maxBytes ?? 16 * 1024 * 1024, windowsHide: true },
        (error, stdout) => {
          if (error) {
            const e = error as NodeJS.ErrnoException & { killed?: boolean }
            if (e.code === 'ENOENT')
              reject(
                new ProbeError(
                  'ffprobe isn’t installed. Install FFmpeg, or set HIGHSEA_FFPROBE to ffprobe’s path.',
                ),
              )
            else if (e.killed) reject(new ProbeError('ffprobe took too long to read the file.'))
            else
              reject(
                new ProbeError('ffprobe couldn’t read the file. It may be damaged or not a video.'),
              )
            return
          }
          try {
            resolve(parseProbe(JSON.parse(stdout)))
          } catch {
            reject(new ProbeError('ffprobe’s answer couldn’t be read.'))
          }
        },
      )
    })
}

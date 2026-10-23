// SPDX-License-Identifier: AGPL-3.0-only
// The sync's child processes (ADR 0044): ffmpeg and ffprobe through `spawn` with an argument array,
// never a shell, and the job's signal, which kills the process when it fires (Node.js docs,
// child_process.spawn's `signal` option:
// https://nodejs.org/docs/latest-v24.x/api/child_process.html#child_processspawncommand-args-options).
import { spawn } from 'node:child_process'

/** ffmpeg's binary: `HIGHSEA_FFMPEG` when set, else `ffmpeg` on the PATH (as `HIGHSEA_FFPROBE`). */
export const ffmpegBinary = (env: NodeJS.ProcessEnv = process.env) =>
  env.HIGHSEA_FFMPEG?.trim() || 'ffmpeg'

export const ffprobeBinary = (env: NodeJS.ProcessEnv = process.env) =>
  env.HIGHSEA_FFPROBE?.trim() || 'ffprobe'

export class SyncError extends Error {}

const missing = (binary: string) =>
  binary.includes('ffprobe')
    ? 'ffprobe isn’t installed. Install FFmpeg, or set HIGHSEA_FFPROBE to ffprobe’s path.'
    : 'ffmpeg isn’t installed. Install FFmpeg, or set HIGHSEA_FFMPEG to ffmpeg’s path.'

/**
 * Runs a binary and hands its standard output to `onData` as it arrives; resolves when it exits
 * cleanly. `failed` is the message for any other exit.
 */
export function run(
  binary: string,
  args: readonly string[],
  options: { signal?: AbortSignal; onData: (chunk: Uint8Array) => void; failed: string },
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(options.signal.reason)
      return
    }
    const child = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'ignore'],
      signal: options.signal,
      windowsHide: true,
    })
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }
    child.stdout.on('data', (chunk: Uint8Array) => {
      try {
        options.onData(chunk)
      } catch (e) {
        child.kill()
        settle(() => reject(e))
      }
    })
    child.once('error', (e: NodeJS.ErrnoException) =>
      settle(() => {
        if (e.name === 'AbortError') reject(options.signal?.reason ?? e)
        else if (e.code === 'ENOENT') reject(new SyncError(missing(binary)))
        else reject(new SyncError(options.failed))
      }),
    )
    child.once('close', (code) =>
      settle(() => (code === 0 ? resolve() : reject(new SyncError(options.failed)))),
    )
  })
}

/** Runs a binary and collects its standard output, up to `maxBytes`. */
export async function collect(
  binary: string,
  args: readonly string[],
  options: { signal?: AbortSignal; failed: string; maxBytes?: number },
): Promise<Buffer> {
  const max = options.maxBytes ?? 64 * 1024 * 1024
  const chunks: Uint8Array[] = []
  let size = 0
  await run(binary, args, {
    ...options,
    onData: (chunk) => {
      size += chunk.byteLength
      if (size > max) throw new SyncError(options.failed)
      chunks.push(chunk)
    },
  })
  return Buffer.concat(chunks)
}

/** Whether a binary runs at all: missing is a health warning, not an error (as unar's check). */
export function binaryAvailable(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(binary, ['-version'], { stdio: 'ignore', windowsHide: true })
    child.once('error', (e: NodeJS.ErrnoException) => resolve(e.code !== 'ENOENT'))
    child.once('close', () => resolve(true))
  })
}

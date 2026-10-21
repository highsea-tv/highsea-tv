// SPDX-License-Identifier: AGPL-3.0-only
// The subtitle sync in the worker pool under Node, as production runs it (checkpoint 7, Tests):
// the VAD's WebAssembly loads in a pool worker, a clip's speech aligns, and a sync cancelled by its
// signal stops the ffmpeg it started. Prints what happened as JSON.
// Usage: node sync-under-node.ts <clip> <slow ffmpeg> <its pid file>
import { readFileSync } from 'node:fs'
import { SYNC_WORKER, type SyncOutcome } from '@highsea/subtitles/sync'
import { distort, sintel } from '@highsea/subtitles/testing'
import { createWorkerPool } from '../../src/workers.ts'

const [clip, slow, pidFile] = process.argv.slice(2) as [string, string, string]
const pool = createWorkerPool(2)

const synced = await pool.run<SyncOutcome>({
  module: SYNC_WORKER,
  fn: 'sync',
  input: {
    file: clip,
    reference: { kind: 'audio', index: 1 },
    cues: distort(sintel.cues(), { offsetMs: 2_500 }),
  },
})

// a "ffmpeg" that never finishes: cancelling must stop it
const controller = new AbortController()
const stuck = pool
  .run(
    {
      module: SYNC_WORKER,
      fn: 'sync',
      input: {
        file: clip,
        reference: { kind: 'audio', index: 1 },
        cues: sintel.cues(),
        binaries: { ffmpeg: slow },
      },
    },
    { signal: controller.signal },
  )
  .then(
    () => 'finished',
    (e: Error) => e.message,
  )
let pid = 0
for (let i = 0; i < 100 && !pid; i++) {
  await new Promise((r) => setTimeout(r, 50))
  try {
    pid = Number(readFileSync(pidFile, 'utf8'))
  } catch {}
}
controller.abort()
const cancelled = await stuck
await new Promise((r) => setTimeout(r, 200))
let running = true
try {
  process.kill(pid, 0)
} catch {
  running = false
}
await pool.close()
console.log(
  JSON.stringify({
    confidence: synced.confidence,
    offsetMs: synced.offsetMs,
    started: pid > 0,
    cancelled,
    running,
  }),
)

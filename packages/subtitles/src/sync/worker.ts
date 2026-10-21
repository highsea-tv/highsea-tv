// SPDX-License-Identifier: AGPL-3.0-only
// The sync as a worker-pool task (ADR 0044; checkpoint 7, Where it runs): `{ module: SYNC_WORKER,
// fn: 'sync' }`. The worker reads the reference, spawning ffmpeg or ffprobe itself, aligns the cues
// and posts back the result, a few kilobytes; the main thread never sees the audio. The pool's
// signal kills the child process when the job is cancelled or times out.
import { ALIGN_DEFAULTS, type Alignment, align, type CueSpan } from './align.ts'
import { speechFrames } from './audio.ts'
import { toFrames } from './grid.ts'
import { imageReference, type Reference, textReference } from './reference.ts'

export type SyncTask = {
  /** The video file, a full path. */
  file: string
  reference: Reference
  /** The track's cues as they'll be written, before any correction. */
  cues: CueSpan[]
  binaries?: { ffmpeg?: string; ffprobe?: string }
}

export type SyncOutcome = Alignment & { reference: Reference['kind'] }

export async function sync(
  task: SyncTask,
  context: { signal?: AbortSignal } = {},
): Promise<SyncOutcome> {
  const { file, reference } = task
  const signal = context.signal
  let frames: Uint8Array
  if (reference.kind === 'audio')
    frames = await speechFrames(file, reference.index, { signal, binary: task.binaries?.ffmpeg })
  else {
    const spans =
      reference.kind === 'text'
        ? await textReference(file, reference.index, { signal, binary: task.binaries?.ffmpeg })
        : await imageReference(file, reference.index, { signal, binary: task.binaries?.ffprobe })
    frames = toFrames(spans)
  }
  signal?.throwIfAborted()
  const alignment = align(frames, task.cues, {
    // a cue promises speech only while its line is spoken; against another track all of it counts
    speechCps: reference.kind === 'audio' ? ALIGN_DEFAULTS.speechCps : null,
  })
  return { ...alignment, reference: reference.kind }
}

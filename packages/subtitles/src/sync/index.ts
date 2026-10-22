// SPDX-License-Identifier: AGPL-3.0-only
// `@highsea-tv/subtitles/sync`: the sync engine (ADR 0044). The alignment is pure; the worker task
// reads the reference with ffmpeg or ffprobe and runs in the runtime's worker pool.
export {
  ALIGN_DEFAULTS,
  type Alignment,
  type AlignOptions,
  align,
  applyCorrection,
  CONFIDENCE_MARKS,
  type Correction,
  type CueSpan,
  FRAMERATE_RATIOS,
  IDENTITY,
  type Measures,
  orderCues,
  type RawMeasures,
  type Section,
  speechEnd,
} from './align.ts'
export { speechFrames } from './audio.ts'
export { binaryAvailable, ffmpegBinary, ffprobeBinary, SyncError } from './binaries.ts'
export { createCorrelator, peaks } from './correlate.ts'
export {
  CLOSE_GAPS_MS,
  closeGaps,
  density,
  FRAME_MS,
  type Span,
  toFrame,
  toFrames,
  toSpans,
} from './grid.ts'
export {
  chooseReference,
  imageCues,
  imageReference,
  type Reference,
  type SubtitleFrame,
  textReference,
} from './reference.ts'
export { createVad, SAMPLE_RATE, type Vad } from './vad.ts'
export type { SyncOutcome, SyncTask } from './worker.ts'

/** The sync's worker module, for the runtime's pool: `{ module: SYNC_WORKER, fn: 'sync' }`. */
export const SYNC_WORKER = new URL('./worker.ts', import.meta.url).href

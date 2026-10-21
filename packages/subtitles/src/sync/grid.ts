// SPDX-License-Identifier: AGPL-3.0-only
// The sync engine's 10 ms grid (ADR 0044): speech and subtitle cues as one byte per 10 ms frame,
// 1 where there's speech or a cue and 0 where there isn't, as ffsubsync samples both
// (https://github.com/smacke/ffsubsync/blob/master/README.md, "How it works"). A two-hour film is
// 720,000 bytes.

/** A span of time in milliseconds: a cue, or a stretch of speech. */
export type Span = { start: number; end: number }

/** One frame of the grid: WebRTC's VAD takes 10, 20 or 30 ms frames (libfvad's `fvad.h`). */
export const FRAME_MS = 10

/** Speech gaps shorter than this are closed, so a breath doesn't split a line (judgement call 15). */
export const CLOSE_GAPS_MS = 200

export const toFrame = (ms: number): number => Math.round(ms / FRAME_MS)

/** Spans on the grid: each covers the frames from its start's frame up to its end's. */
export function toFrames(spans: readonly Span[], length?: number): Uint8Array {
  const end = length ?? spans.reduce((n, s) => Math.max(n, toFrame(s.end)), 0)
  const frames = new Uint8Array(end)
  for (const s of spans) {
    const from = Math.max(0, toFrame(s.start))
    const to = Math.min(end, toFrame(s.end))
    if (to > from) frames.fill(1, from, to)
  }
  return frames
}

/** The grid back to spans, for tests and the history's detail. */
export function toSpans(frames: Uint8Array): Span[] {
  const spans: Span[] = []
  let from = -1
  for (let i = 0; i <= frames.length; i++) {
    const on = i < frames.length && frames[i] === 1
    if (on && from < 0) from = i
    else if (!on && from >= 0) {
      spans.push({ start: from * FRAME_MS, end: i * FRAME_MS })
      from = -1
    }
  }
  return spans
}

/** Closes gaps of silence shorter than `maxMs` between two runs of speech, in place. */
export function closeGaps(frames: Uint8Array, maxMs = CLOSE_GAPS_MS): Uint8Array {
  const max = toFrame(maxMs)
  let lastOn = -1
  for (let i = 0; i < frames.length; i++) {
    if (frames[i] !== 1) continue
    if (lastOn >= 0 && i - lastOn > 1 && i - lastOn - 1 < max) frames.fill(1, lastOn + 1, i)
    lastOn = i
  }
  return frames
}

/** The share of frames that are on. */
export function density(frames: Uint8Array): number {
  if (frames.length === 0) return 0
  let on = 0
  for (const f of frames) on += f
  return on / frames.length
}

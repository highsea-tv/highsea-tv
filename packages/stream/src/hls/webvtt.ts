// SPDX-License-Identifier: AGPL-3.0-only
// A text subtitle's WebVTT segments (HT-49): the cues ffmpeg writes as a session's run reads the
// film (`args.ts`, `runArgs`' subtitle outputs), cut into the segments the session's picture has.
// Pure, so the tests check them without ffmpeg.
//
// - RFC 8216 § 3.5: "Each WebVTT Segment MUST contain all subtitle cues that are intended to be
//   displayed during the period indicated by the segment EXTINF duration. The start time offset
//   and end time offset of each cue MUST indicate the total display time for that cue, even if
//   part of the cue time range is outside the Segment period." A cue across a boundary is in each
//   segment it shows in, with its own times; a player keeps one of each (hls.js and the app match
//   them by their times and text).
// - The same section: "an X-TIMESTAMP-MAP metadata header SHOULD be added to each WebVTT header"
//   (Apple's HLS authoring specification, 5.3, makes it a MUST). The picture's fragments carry the
//   film's own times (`-copyts`, `frag_discont`), and so do the cues, so cue time 0 is the media's
//   0: `LOCAL:00:00:00.000,MPEGTS:0`, which is also what a client assumes without it.
// - ffmpeg's WebVTT muxer writes each cue as a block of its own, its timing line then its text,
//   blocks apart by a blank line (libavformat/webvttenc.c, `webvtt_write_packet`), with no
//   identifiers; a cue's block is kept as written.

/** A cue as ffmpeg wrote it: its times in seconds, and its block, timing line and text. */
export type CueBlock = { start: number; end: number; block: string }

const TIME = /^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})$/

/** A WebVTT timestamp in seconds (https://www.w3.org/TR/webvtt1/#webvtt-timestamp), or NaN. */
function seconds(t: string): number {
  const m = TIME.exec(t)
  if (!m) return Number.NaN
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000
}

/**
 * The cues of a WebVTT file, each with its block: blocks are separated by blank lines, and a cue's
 * timing line holds `-->` (https://www.w3.org/TR/webvtt1/#webvtt-parser-algorithm). The header,
 * NOTE, STYLE and REGION blocks have none, so they fall away, and so does a cue whose times don't
 * parse, such as one cut short where ffmpeg was stopped.
 */
export function cueBlocks(text: string): CueBlock[] {
  const out: CueBlock[] = []
  for (const raw of text.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const block = raw.replace(/^\n+|\n+$/g, '')
    const lines = block.split('\n')
    const at = lines.findIndex((l) => l.includes('-->'))
    if (at < 0 || at > 1 || at === lines.length - 1) continue
    const [from = '', rest = ''] = (lines[at] as string).split('-->')
    const start = seconds(from.trim())
    const end = seconds(rest.trim().split(/\s+/)[0] ?? '')
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    out.push({ start, end, block })
  }
  return out
}

/** The header of every segment: WebVTT's, and the map from cue times to the media's. */
export const SEGMENT_HEADER = 'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0\n'

/**
 * A WebVTT segment from `start` to `end` seconds: every cue showing in that time, once each
 * (several runs may have read the same stretch), in the order they start.
 */
export function webvttSegment(cues: Iterable<CueBlock>, start: number, end: number): string {
  const seen = new Set<string>()
  const showing: CueBlock[] = []
  for (const c of cues) {
    if (c.start >= end || c.end <= start || seen.has(c.block)) continue
    seen.add(c.block)
    showing.push(c)
  }
  showing.sort((a, b) => a.start - b.start || a.end - b.end)
  return [SEGMENT_HEADER, ...showing.map((c) => `${c.block}\n`)].join('\n')
}

/** Time ranges, as `[from, to)` in seconds. */
export type Span = { from: number; to: number }

/** Whether the spans together cover `[from, to)`, to a microsecond. */
export function covers(spans: readonly Span[], from: number, to: number): boolean {
  if (to <= from) return true
  let at = from
  for (const s of [...spans].sort((a, b) => a.from - b.from)) {
    if (s.from > at + 1e-6) break
    at = Math.max(at, s.to)
    if (at >= to - 1e-6) return true
  }
  return false
}

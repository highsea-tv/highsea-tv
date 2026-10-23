// SPDX-License-Identifier: AGPL-3.0-only
// What a subtitle is aligned against (ADR 0044; checkpoint 7, The design, step 1), best first:
// 1. an embedded text subtitle that isn't forced, in any language, extracted as SRT with
//    `ffmpeg -map 0:{index} -f srt -`, as ffsubsync does;
// 2. an embedded image subtitle's display times from ffprobe. A PGS cue runs from a display set with
//    pictures to the next set, since ffmpeg's decoder gives PGS no end time
//    (https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/pgssubdec.c); VobSub carries its own
//    (https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/dvdsubdec.c);
// 3. the speech in the default audio stream (audio.ts).
import { parseSrt } from '../shared/processing/srt.ts'
import { collect, ffmpegBinary, ffprobeBinary } from './binaries.ts'
import type { Span } from './grid.ts'

export type Reference =
  | { kind: 'text'; index: number }
  | { kind: 'image'; index: number }
  | { kind: 'audio'; index: number }

/** ffprobe's codec names (ffmpeg's codec descriptors). */
const TEXT = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text'])
const IMAGE = new Set(['hdmv_pgs_subtitle', 'dvd_subtitle'])

type Streams = {
  audio: readonly { index: number; default: boolean }[]
  subtitles: readonly { index: number; codec: string; forced: boolean }[]
}

/** The best reference a file offers, or null when it has no audio and no usable subtitle. */
export function chooseReference(streams: Streams): Reference | null {
  const full = streams.subtitles.filter((s) => !s.forced)
  const text = full.find((s) => TEXT.has(s.codec))
  if (text) return { kind: 'text', index: text.index }
  const image = full.find((s) => IMAGE.has(s.codec))
  if (image) return { kind: 'image', index: image.index }
  const audio = streams.audio.find((a) => a.default) ?? streams.audio[0]
  return audio ? { kind: 'audio', index: audio.index } : null
}

/** An embedded text subtitle's cues. */
export async function textReference(
  file: string,
  index: number,
  options: { signal?: AbortSignal; binary?: string } = {},
): Promise<Span[]> {
  const out = await collect(
    options.binary ?? ffmpegBinary(),
    ['-nostdin', '-v', 'error', '-i', file, '-map', `0:${index}`, '-f', 'srt', '-'],
    { signal: options.signal, failed: 'ffmpeg couldn’t read the file’s subtitle track.' },
  )
  return parseSrt(out.toString('utf8')).map((c) => ({ start: c.start, end: c.end }))
}

/** One of ffprobe's subtitle frames, as `-show_frames` or `-show_entries subtitle=…` writes it. */
export type SubtitleFrame = {
  media_type?: string
  pts_time?: string
  start_display_time?: number
  end_display_time?: number
  num_rects?: number
}

/** ffprobe's "no end time": the decoder leaves `end_display_time` at UINT32_MAX. */
const NO_END = 4_294_967_295
/** A last picture with nothing after it to close it. */
const LAST_MS = 5_000

/** An image subtitle's display times from ffprobe's frames. */
export function imageCues(frames: readonly SubtitleFrame[]): Span[] {
  const at = frames
    .filter((f) => (f.media_type ?? 'subtitle') === 'subtitle' && f.pts_time !== undefined)
    .map((f) => ({ ...f, ms: Number(f.pts_time) * 1000 }))
    .filter((f) => Number.isFinite(f.ms))
    .sort((a, b) => a.ms - b.ms)
  const spans: Span[] = []
  for (let i = 0; i < at.length; i++) {
    const f = at[i] as (typeof at)[number]
    if (!f.num_rects) continue
    const start = f.ms + (f.start_display_time ?? 0)
    const own = f.end_display_time
    const end =
      own !== undefined && own !== NO_END && own > (f.start_display_time ?? 0)
        ? f.ms + own
        : (at[i + 1]?.ms ?? start + LAST_MS)
    if (end > start) spans.push({ start: Math.round(start), end: Math.round(end) })
  }
  return spans
}

/** An embedded image subtitle's display times. */
export async function imageReference(
  file: string,
  index: number,
  options: { signal?: AbortSignal; binary?: string } = {},
): Promise<Span[]> {
  const out = await collect(
    options.binary ?? ffprobeBinary(),
    [
      ...['-v', 'error', '-select_streams', String(index)],
      ...['-show_entries', 'subtitle=pts_time,start_display_time,end_display_time,num_rects'],
      ...['-of', 'json', file],
    ],
    { signal: options.signal, failed: 'ffprobe couldn’t read the file’s subtitle track.' },
  )
  const parsed = JSON.parse(out.toString('utf8')) as { frames?: SubtitleFrame[] }
  return imageCues(parsed.frames ?? [])
}

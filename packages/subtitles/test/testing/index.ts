// SPDX-License-Identifier: AGPL-3.0-only
// `@highsea/subtitles/testing`: the sync's test material. The Sintel fixture (its README has the
// credit and the licence), timelines of speech and cues made from a seed, and the distortions a
// release can put on a subtitle: an offset, a framerate, and sections moved apart.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseSrt } from '../../src/shared/processing/srt.ts'
import type { CueSpan } from '../../src/sync/align.ts'
import type { Span } from '../../src/sync/grid.ts'

const SINTEL = new URL('../fixtures/sintel/', import.meta.url)

/** 52 seconds of *Sintel* from 1:45, as 16 kHz mono FLAC, and its 12 official English cues. */
export const sintel = {
  /**
   * The confidence the clip earns: its 12 cues are less evidence than a film's thousand or more, so
   * its overlap stands about 5.4 deviations above chance, at the edge of the 0.7 a film's subtitle
   * needs (ADR 0044, judgement call 45). Tests that run a sync on it set the minimum to this.
   */
  minConfidence: 0.6,
  audio: new URL('sintel.flac', SINTEL).pathname,
  srtPath: new URL('sintel.en.srt', SINTEL).pathname,
  srt: () => readFileSync(new URL('sintel.en.srt', SINTEL), 'utf8'),
  cues: (): CueSpan[] => parseSrt(sintel.srt()),
}

/** A PGS stream's frames from ffprobe, timings only (fixtures/pgs/README.md). */
export const pgsFrames = () =>
  (
    JSON.parse(
      readFileSync(new URL('../fixtures/pgs/show-frames.json', import.meta.url), 'utf8'),
    ) as {
      frames: { media_type?: string; pts_time?: string; num_rects?: number }[]
    }
  ).frames

/** Mulberry32: a small seeded generator, so a timeline is the same on every run. */
export function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A film's speech: lines of 0.6 to 4 seconds with pauses of 0.3 to 3 seconds and, every so often, a
 * scene without dialogue. `longGapsAt` puts a 6-second pause before those lines, for a split.
 */
export function speechTimeline(
  seed: number,
  options: { minutes?: number; longGapsAt?: readonly number[] } = {},
): Span[] {
  const next = random(seed)
  const end = (options.minutes ?? 15) * 60_000
  const long = new Set(options.longGapsAt ?? [])
  const lines: Span[] = []
  let t = 5_000
  while (t < end) {
    const pause = long.has(lines.length)
      ? 6_000
      : next() < 0.05
        ? 10_000 + next() * 30_000
        : 300 + next() * 2_700
    const start = Math.round(t + pause)
    const length = Math.round(600 + next() * 3_400)
    lines.push({ start, end: start + length })
    t = start + length
  }
  return lines
}

/**
 * What a release can do to a subtitle's times: stretch them (a framerate), move them (an offset),
 * and move the cues from `from` on by a further `offsetMs` each (a scene cut in or out).
 */
export type Distortion = {
  ratio?: number
  offsetMs?: number
  splits?: readonly { from: number; offsetMs: number }[]
}

/** The cues, in order, as a release with this distortion would carry them. */
export function distort<T extends Span>(cues: readonly T[], d: Distortion): T[] {
  const ratio = d.ratio ?? 1
  return cues.map((c, i) => {
    let offset = d.offsetMs ?? 0
    for (const s of d.splits ?? []) if (i >= s.from) offset += s.offsetMs
    return { ...c, start: c.start * ratio + offset, end: c.end * ratio + offset }
  })
}

/**
 * A small Matroska clip for the sync: a still picture, then Sintel's speech or a sine tone (which
 * no VAD calls speech), and optionally an embedded text subtitle, from FFmpeg's lavfi sources
 * (https://ffmpeg.org/ffmpeg-filters.html, Video Sources). Needs ffmpeg on the PATH.
 */
export function makeSyncClip(
  path: string,
  options: { audio: 'sintel' | 'sine'; subtitle?: string; seconds?: number; size?: string },
): string {
  const seconds = options.seconds ?? 52
  const size = options.size ?? '64x64'
  const audio =
    options.audio === 'sintel'
      ? ['-i', sintel.audio]
      : ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}:sample_rate=16000`]
  const subtitle = options.subtitle ? ['-i', options.subtitle] : []
  execFileSync('ffmpeg', [
    ...['-v', 'error', '-y', '-nostdin'],
    ...['-f', 'lavfi', '-i', `color=c=black:s=${size}:r=1:d=${seconds}`],
    ...audio,
    ...subtitle,
    ...['-map', '0:v', '-map', '1:a', ...(options.subtitle ? ['-map', '2:s'] : [])],
    ...['-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'flac', '-c:s', 'srt'],
    ...['-t', String(seconds), path],
  ])
  return path
}

// SPDX-License-Identifier: AGPL-3.0-only
// Times in milliseconds, and the three ways the text formats write them: SRT's `HH:MM:SS,mmm`
// (Matroska: https://www.matroska.org/technical/subtitles.html), WebVTT's `HH:MM:SS.mmm`
// (https://www.w3.org/TR/webvtt1/#webvtt-timestamp) and ASS's `H:MM:SS.cc`, in centiseconds.

/** A cue's times in milliseconds and its text, lines joined with `\n`. */
export type Cue = { start: number; end: number; text: string }

const pad = (value: number, width: number): string => String(value).padStart(width, '0')

function parts(ms: number): { h: number; m: number; s: number; rest: number } {
  const total = Math.max(0, Math.round(ms))
  return {
    h: Math.floor(total / 3_600_000),
    m: Math.floor(total / 60_000) % 60,
    s: Math.floor(total / 1000) % 60,
    rest: total % 1000,
  }
}

/** `01:02:03,456` with `,` for SRT, `.` for WebVTT. */
export function formatClock(ms: number, separator: ',' | '.'): string {
  const { h, m, s, rest } = parts(ms)
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}${separator}${pad(rest, 3)}`
}

/** ASS's `1:02:03.45`, rounded to the centisecond. */
export function formatAssTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 10)) * 10
  const { h, m, s, rest } = parts(total)
  return `${h}:${pad(m, 2)}:${pad(s, 2)}.${pad(rest / 10, 2)}`
}

/** A fraction of a second as written (`5`, `50`, `500`) in milliseconds: `.5` is half a second. */
export function fractionMs(digits: string | undefined): number {
  if (!digits) return 0
  return Number(digits.slice(0, 3).padEnd(3, '0'))
}

export function toMs(h: number, m: number, s: number, ms: number): number {
  return ((h * 60 + m) * 60 + s) * 1000 + ms
}

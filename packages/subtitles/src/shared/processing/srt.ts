// SPDX-License-Identifier: AGPL-3.0-only
// SubRip. SRT has no formal specification; highsea reads it as Matroska documents its storage
// (https://www.matroska.org/technical/subtitles.html): an index, `HH:MM:SS,mmm --> HH:MM:SS,mmm`,
// the text, and a blank line. Files in the wild bend that, so the reader tolerates dots for the
// commas, one-digit hours, extra spaces, missing indexes, stray blank lines and the `X1: Y1:`
// position coordinates some writers put after the timing. The writer is strict.
import { SRT_TIMING } from './detect.ts'
import { type Cue, formatClock, fractionMs, toMs } from './time.ts'

function timing(line: string): { start: number; end: number } | null {
  const match = SRT_TIMING.exec(line)
  if (!match) return null
  const [, h1, m1, s1, f1, h2, m2, s2, f2] = match
  return {
    start: toMs(Number(h1), Number(m1), Number(s1), fractionMs(f1)),
    end: toMs(Number(h2), Number(m2), Number(s2), fractionMs(f2)),
  }
}

export function parseSrt(text: string): Cue[] {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  const cues: Cue[] = []
  let current: { start: number; end: number; lines: string[] } | null = null

  const finish = (): void => {
    if (!current) return
    const body = current.lines
    // Trailing blank lines, then the next cue's index: a number standing alone after a blank line.
    while (body.length > 0 && body[body.length - 1]?.trim() === '') body.pop()
    const last = body.length - 1
    if (last >= 1 && /^\s*\d+\s*$/.test(body[last] ?? '') && body[last - 1]?.trim() === '')
      body.pop()
    const kept = body.filter((line) => line.trim() !== '').map((line) => line.trimEnd())
    cues.push({ start: current.start, end: current.end, text: kept.join('\n') })
  }

  for (const line of lines) {
    const times = timing(line)
    if (times) {
      finish()
      current = { ...times, lines: [] }
      continue
    }
    current?.lines.push(line)
  }
  finish()
  return cues
}

export function writeSrt(cues: Cue[]): string {
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${formatClock(cue.start, ',')} --> ${formatClock(cue.end, ',')}\n${cue.text}\n`,
    )
    .join('\n')
}

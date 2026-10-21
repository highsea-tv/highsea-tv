// SPDX-License-Identifier: AGPL-3.0-only
// A downloaded or bundled text subtitle from bytes to the sidecar's text (checkpoint 7,
// Processing): size and type, encoding, parsing, cleanup. `processSubtitle` takes the bytes and
// returns the decoded original (kept in the database) and the cleaned text; `renderSubtitle`
// writes a sidecar again from that original, with the cleanup and a time shift (the sync's
// correction, the manual offset), always in the original's own format.
import type { TextFormat } from '../types.ts'
import { parseAss, writeAss } from './ass.ts'
import { cleanCues, cleanText } from './cleanup.ts'
import { detectFormat } from './detect.ts'
import { decodeSubtitle } from './encoding.ts'
import { parseSrt, writeSrt } from './srt.ts'
import type { Cue } from './time.ts'
import { parseVtt, type VttCue, type VttOther, writeVtt } from './vtt.ts'

export { type AssDocument, assCues, parseAss, writeAss } from './ass.ts'
export { cleanCues, cleanText, isAdCue, removeHearingImpaired } from './cleanup.ts'
export { detectFormat } from './detect.ts'
export { decodeSubtitle } from './encoding.ts'
export { parseSrt, writeSrt } from './srt.ts'
export type { Cue } from './time.ts'
export { parseVtt, type VttCue, type VttDocument, type VttOther, writeVtt } from './vtt.ts'

export const MAX_SUBTITLE_BYTES = 2 * 1024 * 1024

export type Processed =
  | { ok: true; format: TextFormat; encoding: string; original: string; text: string; cues: number }
  | { ok: false; reason: 'too-large' | 'not-subtitle' | 'empty'; message: string }

export type RenderOptions = { removeHi: boolean; shift?: (ms: number) => number }

const NOT_SUBTITLE = "This file isn't a subtitle highsea can read: SRT, WebVTT or ASS."

function shifter(shift: ((ms: number) => number) | undefined): (cue: Cue) => Cue {
  return (cue) => {
    if (!shift) return cue
    const start = Math.max(0, Math.round(shift(cue.start)))
    const end = Math.max(start, Math.round(shift(cue.end)))
    return { ...cue, start, end }
  }
}

export function renderSubtitle(
  original: string,
  options: RenderOptions,
): { format: TextFormat; text: string; cues: number } {
  const format = detectFormat(original)
  if (format === null) throw new Error(NOT_SUBTITLE)
  const move = shifter(options.shift)

  if (format === 'srt') {
    const cues = cleanCues(parseSrt(original), options).map(move)
    return { format, text: writeSrt(cues), cues: cues.length }
  }

  if (format === 'vtt') {
    const doc = parseVtt(original)
    const cleaned = doc.blocks.map((block) => {
      if (block.kind !== 'cue') return block
      const text = cleanText(block.text, options)
      return text === null ? null : { ...block, ...move({ ...block, text }) }
    })
    // WebVTT wants cues in start order: the kept cues, sorted, fill the kept cues' places, and
    // NOTE, STYLE and REGION blocks keep theirs.
    const kept = cleaned.filter((block): block is VttCue => block?.kind === 'cue')
    const sorted = [...kept].sort((a, b) => a.start - b.start)
    let next = 0
    const blocks: (VttCue | VttOther)[] = []
    for (const block of cleaned) {
      if (block === null) continue
      if (block.kind === 'other') blocks.push(block)
      else blocks.push(sorted[next++] ?? block)
    }
    return { format, text: writeVtt({ header: doc.header, blocks }), cues: kept.length }
  }

  // ASS and SSA: events keep their order (it's their drawing order); only times and drops change.
  const doc = parseAss(original)
  let count = 0
  const text = writeAss(doc, (cue) => {
    if (cue.text === '') {
      // A line with only override tags or a drawing: not text to clean, but it still moves.
      count += 1
      return move(cue)
    }
    const cleaned = cleanText(cue.text, options)
    if (cleaned === null) return null
    count += 1
    return move({ ...cue, text: cleaned })
  })
  return { format, text: text.endsWith('\n') ? text : `${text}\n`, cues: count }
}

export function processSubtitle(bytes: Uint8Array, options: { removeHi: boolean }): Processed {
  if (bytes.byteLength > MAX_SUBTITLE_BYTES) {
    return { ok: false, reason: 'too-large', message: 'The subtitle is larger than 2 MB.' }
  }
  const { text: original, encoding } = decodeSubtitle(bytes)
  const format = detectFormat(original)
  if (format === null) return { ok: false, reason: 'not-subtitle', message: NOT_SUBTITLE }
  let rendered: { format: TextFormat; text: string; cues: number }
  try {
    rendered = renderSubtitle(original, options)
  } catch {
    return { ok: false, reason: 'not-subtitle', message: NOT_SUBTITLE }
  }
  if (rendered.cues === 0)
    return { ok: false, reason: 'empty', message: 'The subtitle has no lines.' }
  return {
    ok: true,
    format: rendered.format,
    encoding,
    original,
    text: rendered.text,
    cues: rendered.cues,
  }
}

// SPDX-License-Identifier: AGPL-3.0-only
// WebVTT, read by the W3C's parsing algorithm (https://www.w3.org/TR/webvtt1/#webvtt-parser-algorithm):
// the `WEBVTT` line and its header, then blocks separated by blank lines. A block whose first or
// second line holds `-->` is a cue (the first line then is its identifier); a later `-->` line ends
// the cue and starts the next one. A cue whose timings don't parse is dropped, as the algorithm
// says. STYLE and REGION blocks before the first cue and NOTE blocks anywhere are kept verbatim, as
// are each cue's settings, so a rewritten file differs from the original only in its times.
import { formatClock } from './time.ts'

export type VttCue = {
  kind: 'cue'
  id: string | null
  start: number
  end: number
  /** The cue settings after the end time (`line:0 align:start`), as written; `''` for none. */
  settings: string
  text: string
}
export type VttOther = { kind: 'other'; text: string }
export type VttDocument = { header: string; blocks: (VttCue | VttOther)[] }

const TIMESTAMP = /^(\d+):(\d{2})(?::(\d{2}))?\.(\d{3})/

/** One timestamp at the start of `input`: its milliseconds and the length it took, or null. */
function timestamp(input: string): { ms: number; length: number } | null {
  const match = TIMESTAMP.exec(input)
  if (!match) return null
  const [whole, first = '', second = '', third, fraction = ''] = match
  let hours = 0
  let minutes: number
  let seconds: number
  if (third === undefined) {
    // Two components: minutes and seconds, so minutes must be two digits up to 59.
    if (first.length !== 2 || Number(first) > 59) return null
    minutes = Number(first)
    seconds = Number(second)
  } else {
    hours = Number(first)
    minutes = Number(second)
    seconds = Number(third)
  }
  if (minutes > 59 || seconds > 59) return null
  return {
    ms: ((hours * 60 + minutes) * 60 + seconds) * 1000 + Number(fraction),
    length: whole.length,
  }
}

/** The algorithm's "collect WebVTT cue timings and settings". */
function timings(line: string): { start: number; end: number; settings: string } | null {
  let rest = line.replace(/^[ \t]+/, '')
  const start = timestamp(rest)
  if (!start) return null
  rest = rest.slice(start.length).replace(/^[ \t]+/, '')
  if (!rest.startsWith('-->')) return null
  rest = rest.slice(3).replace(/^[ \t]+/, '')
  const end = timestamp(rest)
  if (!end) return null
  rest = rest.slice(end.length)
  if (rest !== '' && !/^[ \t]/.test(rest)) return null
  return { start: start.ms, end: end.ms, settings: rest.trim() }
}

const startsWithWord = (text: string, word: string): boolean =>
  text.startsWith(word) && (text.length === word.length || /[ \t\n]/.test(text[word.length] ?? ''))

export function parseVtt(text: string): VttDocument {
  const lines = text.replace(/^﻿/, '').replace(/\0/g, '�').replace(/\r\n?/g, '\n').split('\n')
  const signature = lines[0] ?? ''
  if (!startsWithWord(signature, 'WEBVTT')) throw new Error('Not a WebVTT file: no WEBVTT line.')

  // The header: the signature line and everything up to the first blank line.
  let position = 1
  while (position < lines.length && lines[position] !== '') position += 1
  const header = lines.slice(0, position).join('\n')

  const blocks: (VttCue | VttOther)[] = []
  let seenCue = false
  while (position < lines.length) {
    while (position < lines.length && lines[position] === '') position += 1
    if (position >= lines.length) break

    // Collect one block.
    const buffer: string[] = []
    let cue: VttCue | null = null
    let count = 0
    while (position < lines.length && lines[position] !== '') {
      const line = lines[position] ?? ''
      count += 1
      if (line.includes('-->')) {
        if (cue === null && (count === 1 || count === 2)) {
          const parsed = timings(line)
          const id = buffer.length > 0 ? buffer.join('\n') : null
          buffer.length = 0
          position += 1
          if (!parsed) {
            // Failed timings drop the cue: skip the rest of the block.
            while (position < lines.length && lines[position] !== '') position += 1
            cue = null
            count = -1
            break
          }
          cue = { kind: 'cue', id, ...parsed, text: '' }
          continue
        }
        // An arrow inside a cue's text starts the next block on this same line.
        break
      }
      buffer.push(line)
      position += 1
    }
    if (count === -1) continue

    if (cue) {
      cue.text = buffer.join('\n')
      blocks.push(cue)
      seenCue = true
      continue
    }
    const body = buffer.join('\n')
    if (startsWithWord(body, 'NOTE')) blocks.push({ kind: 'other', text: body })
    else if (!seenCue && (startsWithWord(body, 'STYLE') || startsWithWord(body, 'REGION'))) {
      blocks.push({ kind: 'other', text: body })
    }
    // Anything else is ignored, as the algorithm ignores it.
  }
  return { header, blocks }
}

export function writeVtt(doc: VttDocument): string {
  const parts = [doc.header]
  for (const block of doc.blocks) {
    if (block.kind === 'other') {
      parts.push(block.text)
      continue
    }
    const times = `${formatClock(block.start, '.')} --> ${formatClock(block.end, '.')}`
    const timing = block.settings ? `${times} ${block.settings}` : times
    parts.push(
      [block.id, timing, block.text].filter((part) => part !== null && part !== '').join('\n'),
    )
  }
  return `${parts.join('\n\n')}\n`
}

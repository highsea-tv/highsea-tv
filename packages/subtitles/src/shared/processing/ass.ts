// SPDX-License-Identifier: AGPL-3.0-only
// ASS and SSA, kept as they are, styles and all (checkpoint 7, Processing, step 3). Only the
// `Start` and `End` of `Dialogue` lines are read and rewritten, found by the columns of the
// `[Events]` section's `Format:` line, the format's own description of its fields
// (http://www.tcax.org/docs/ass-specs.htm, section 5; Aegisub: https://aegisub.org/docs/latest/ass_tags/).
// `Text` is the last column and may hold commas. Override tags (`{\i1}`, `{\pos(…)}`) are left
// alone; they're stripped only from the text cleanup reads, with `\N` read as a line break.
import { type Cue, formatAssTime, fractionMs, toMs } from './time.ts'

/** A `Dialogue` line: where it is, its fields, and which of them are Start, End and Text. */
type AssEvent = {
  line: number
  prefix: string
  fields: string[]
  start: number
  end: number
  text: string
}

export type AssDocument = {
  lines: string[]
  events: AssEvent[]
  columns: { start: number; end: number; text: number; count: number }
}

/** ASS's default event format, for a file without a Format line (SSA's has Marked first). */
const DEFAULT_FORMAT = [
  'layer',
  'start',
  'end',
  'style',
  'name',
  'marginl',
  'marginr',
  'marginv',
  'effect',
  'text',
]

const ASS_TIME = /^\s*(\d+):(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\s*$/

function parseTime(value: string): number | null {
  const match = ASS_TIME.exec(value)
  if (!match) return null
  const [, h, m, s, fraction] = match
  return toMs(Number(h), Number(m), Number(s), fractionMs(fraction))
}

/** Split an event's value into `count` fields, the last taking the rest, commas and all. */
function split(value: string, count: number): string[] {
  const fields: string[] = []
  let rest = value
  for (let i = 0; i < count - 1; i += 1) {
    const comma = rest.indexOf(',')
    if (comma === -1) break
    fields.push(rest.slice(0, comma))
    rest = rest.slice(comma + 1)
  }
  fields.push(rest)
  return fields
}

/** The text cleanup reads: override tags out, `\N` a line break, `\n` and `\h` spaces. */
function plain(text: string): string {
  return text
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\N/g, '\n')
    .replace(/\\[nh]/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
}

export function parseAss(text: string): AssDocument {
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n')
  let section = ''
  let format = DEFAULT_FORMAT
  const events: AssEvent[] = []
  const columnsOf = (names: string[]) => ({
    start: names.indexOf('start'),
    end: names.indexOf('end'),
    text: names.indexOf('text') === -1 ? names.length - 1 : names.indexOf('text'),
    count: names.length,
  })
  let columns = columnsOf(format)

  lines.forEach((line, index) => {
    const heading = /^\s*\[([^\]]+)\]\s*$/.exec(line)
    if (heading) {
      section = (heading[1] ?? '').trim().toLowerCase()
      return
    }
    if (section !== 'events') return
    const entry = /^(\s*([A-Za-z]+)\s*:\s?)(.*)$/.exec(line)
    if (!entry) return
    const [, prefix = '', kind = '', value = ''] = entry
    if (kind.toLowerCase() === 'format') {
      format = value.split(',').map((name) => name.trim().toLowerCase())
      columns = columnsOf(format)
      return
    }
    if (kind.toLowerCase() !== 'dialogue' || columns.start === -1 || columns.end === -1) return
    const fields = split(value, columns.count)
    const start = parseTime(fields[columns.start] ?? '')
    const end = parseTime(fields[columns.end] ?? '')
    if (start === null || end === null) return
    events.push({
      line: index,
      prefix,
      fields,
      start,
      end,
      text: plain(fields[columns.text] ?? ''),
    })
  })
  return { lines, events, columns }
}

export function assCues(doc: AssDocument): Cue[] {
  return doc.events.map((event) => ({ start: event.start, end: event.end, text: event.text }))
}

/**
 * Writes the document back with each Dialogue line's times from `transform`; null drops the line.
 * The Text column is kept as written, unless the transform changed the text of a line that has no
 * override tags: then the new text is written, `\n` as `\N` (the SDH cleanup's partial removals).
 */
export function writeAss(
  doc: AssDocument,
  transform: (cue: Cue, index: number) => Cue | null,
): string {
  const replaced = new Map<number, string | null>()
  doc.events.forEach((event, index) => {
    const cue = { start: event.start, end: event.end, text: event.text }
    const next = transform(cue, index)
    if (next === null) {
      replaced.set(event.line, null)
      return
    }
    const fields = [...event.fields]
    fields[doc.columns.start] = formatAssTime(next.start)
    fields[doc.columns.end] = formatAssTime(Math.max(next.end, next.start))
    const original = fields[doc.columns.text] ?? ''
    if (next.text !== event.text && !/\{[^}]*\}/.test(original)) {
      fields[doc.columns.text] = next.text.replace(/\n/g, '\\N')
    }
    replaced.set(event.line, `${event.prefix}${fields.join(',')}`)
  })
  const out: string[] = []
  doc.lines.forEach((line, index) => {
    if (!replaced.has(index)) out.push(line)
    else {
      const next = replaced.get(index)
      if (next !== null && next !== undefined) out.push(next)
    }
  })
  return out.join('\n')
}

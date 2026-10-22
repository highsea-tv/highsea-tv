// SPDX-License-Identifier: AGPL-3.0-only
// The calendar's iCal feed (RFC 5545, https://www.rfc-editor.org/rfc/rfc5545): one VCALENDAR with
// an all-day VEVENT per date. Only what calendar apps need:
// - VERSION and PRODID (required, § 3.6), with X-WR-CALNAME, the name Apple Calendar and Google
//   Calendar show for a subscription;
// - each event's UID (stable, so a changed date moves the event rather than adding one), DTSTAMP,
//   DTSTART as a DATE (its duration is then one day, § 3.6.1, so no DTEND), SUMMARY and DESCRIPTION;
// - TEXT escaped (§ 3.3.11), lines ending CRLF and folded at 75 octets (§ 3.1).
import type { CalendarEntry, CalendarKind } from '@highsea-tv/api-contract'
import { createT, defineMessages } from '@highsea-tv/i18n'

export const icsMessages = defineMessages({
  'ics.name': '{server}: movies',
  'ics.cinema': '{title} in cinemas',
  'ics.digital': '{title} digital release',
  'ics.physical': '{title} on disc',
})

const t = createT(icsMessages)

/** § 3.3.11: backslash, semicolon and comma escaped, newlines as `\n`. */
export const escapeText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** § 3.1: lines longer than 75 octets go on as continuation lines that start with a space. */
export function fold(line: string): string {
  const bytes = new TextEncoder()
  if (bytes.encode(line).length <= 75) return line
  const parts: string[] = []
  let current = ''
  let size = 0
  for (const ch of line) {
    const n = bytes.encode(ch).length
    // the first line holds 75 octets; continuations 74 after their leading space
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(current)
      current = ''
      size = 0
    }
    current += ch
    size += n
  }
  parts.push(current)
  return parts.join('\r\n ')
}

/** `20261021T101500Z`: a UTC DATE-TIME (§ 3.3.5, form 2). */
const stamp = (ms: number) =>
  new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')

const SUMMARY: Record<CalendarKind, 'ics.cinema' | 'ics.digital' | 'ics.physical'> = {
  cinema: 'ics.cinema',
  digital: 'ics.digital',
  physical: 'ics.physical',
}

export function calendarIcs(input: {
  serverId: string
  serverName: string
  version: string
  now: number
  entries: CalendarEntry[]
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//highsea//highsea ${escapeText(input.version)}//EN`,
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(t('ics.name', { server: input.serverName }))}`,
  ]
  const dtstamp = stamp(input.now)
  for (const e of input.entries) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.movie.id}-${e.kind}@${input.serverId}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`,
      `SUMMARY:${escapeText(t(SUMMARY[e.kind], { title: e.movie.title }))}`,
      ...(e.movie.synopsis ? [`DESCRIPTION:${escapeText(e.movie.synopsis)}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(fold).join('\r\n')}\r\n`
}

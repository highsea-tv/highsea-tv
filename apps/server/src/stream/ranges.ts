// SPDX-License-Identifier: AGPL-3.0-only
// Byte ranges (RFC 9110 § 14): the one range a player asks for, read from a `Range` header. A
// player asks for one range at a time; a request for several is answered with the whole file,
// which § 14.2 allows ("a server MAY ignore the Range header field"), as is a header it can't read.

export type ByteRange = { start: number; end: number }

/**
 * The range asked for, inclusive; `null` to send the whole file; `'unsatisfiable'` for a range
 * that starts past the end (§ 14.1.2: answered with 416).
 */
export function parseRange(
  header: string | undefined,
  size: number,
): ByteRange | null | 'unsatisfiable' {
  if (!header) return null
  const m = /^bytes=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header.trim())
  if (!m) return null
  const [, first = '', last = ''] = m
  if (!first && !last) return null
  if (!first) {
    // a suffix: the last N bytes (§ 14.1.2), the whole file when N is larger
    const n = Number(last)
    if (n === 0) return 'unsatisfiable'
    return { start: Math.max(0, size - n), end: size - 1 }
  }
  const start = Number(first)
  // a first position at or past the end can't be satisfied, whatever the last (§ 14.1.1)
  if (start >= size) return 'unsatisfiable'
  if (last && Number(last) < start) return null
  return { start, end: last ? Math.min(Number(last), size - 1) : size - 1 }
}

/**
 * Whether `If-Range` lets the range through (§ 13.1.5): the entity tag compared strongly, or the
 * date exactly equal to Last-Modified. Absent, it does.
 */
export function ifRangeAllows(
  ifRange: string | undefined,
  { etag, lastModified }: { etag: string; lastModified: string },
): boolean {
  if (!ifRange) return true
  const value = ifRange.trim()
  if (value.startsWith('W/')) return false
  if (value.startsWith('"')) return value === etag
  return value === lastModified
}

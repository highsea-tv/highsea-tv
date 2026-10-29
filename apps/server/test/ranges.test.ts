// SPDX-License-Identifier: AGPL-3.0-only
// `Range` and `If-Range` as RFC 9110 § 14 and § 13.1.5 read them (checkpoint 4.1a). The responses
// they lead to are tested over HTTP in playback-api.test.ts.
import { describe, expect, test } from 'bun:test'
import { ifRangeAllows, parseRange } from '../src/stream/ranges.ts'

describe('Range', () => {
  test('one range, an open end, a suffix, and the whole file for anything else', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=-5000', 1000)).toEqual({ start: 0, end: 999 })
    expect(parseRange(undefined, 1000)).toBeNull()
    expect(parseRange('bytes=5-2', 1000)).toBeNull()
    expect(parseRange('bytes=0-1,5-6', 1000)).toBeNull()
    expect(parseRange('items=0-1', 1000)).toBeNull()
    expect(parseRange('bytes=-', 1000)).toBeNull()
  })

  test('past the end, or an empty suffix, can’t be satisfied', () => {
    expect(parseRange('bytes=1000-', 1000)).toBe('unsatisfiable')
    expect(parseRange('bytes=1000-10', 1000)).toBe('unsatisfiable')
    expect(parseRange('bytes=-0', 1000)).toBe('unsatisfiable')
    expect(parseRange('bytes=0-', 0)).toBe('unsatisfiable')
  })
})

describe('If-Range', () => {
  const validators = { etag: '"3e8-1"', lastModified: 'Tue, 27 Oct 2026 10:00:00 GMT' }
  test('a strong tag or the exact date lets the range through; a weak tag never does', () => {
    expect(ifRangeAllows(undefined, validators)).toBe(true)
    expect(ifRangeAllows('"3e8-1"', validators)).toBe(true)
    expect(ifRangeAllows(validators.lastModified, validators)).toBe(true)
    expect(ifRangeAllows('W/"3e8-1"', validators)).toBe(false)
    expect(ifRangeAllows('"3e8-2"', validators)).toBe(false)
    expect(ifRangeAllows('Mon, 26 Oct 2026 10:00:00 GMT', validators)).toBe(false)
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
// The fixtures are small SRT files written for these tests, each in a legacy encoding beside the
// same text in UTF-8 (LF line endings; the legacy files use CRLF).
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodeSubtitle } from '../../src/shared/processing/index.ts'

const fixture = (name: string): Uint8Array =>
  readFileSync(join(import.meta.dir, 'fixtures', 'processing', name))
const expected = (name: string): string =>
  readFileSync(join(import.meta.dir, 'fixtures', 'processing', name), 'utf8')

describe('decodeSubtitle', () => {
  const cases: [file: string, utf8: string, encodings: string[]][] = [
    ['cs.cp1250.srt', 'cs.utf8.srt', ['windows-1250']],
    ['pl.cp1250.srt', 'pl.utf8.srt', ['windows-1250']],
    ['ru.cp1251.srt', 'ru.utf8.srt', ['windows-1251']],
    // windows-1253 decodes this Greek text the same; either label is right.
    ['el.iso8859-7.srt', 'el.utf8.srt', ['iso-8859-7', 'windows-1253']],
    ['zh-hant.big5.srt', 'zh-hant.utf8.srt', ['big5']],
    ['ja.shift-jis.srt', 'ja.utf8.srt', ['shift_jis']],
  ]
  for (const [file, utf8, encodings] of cases) {
    test(`${file} decodes to the same UTF-8`, () => {
      const result = decodeSubtitle(fixture(file))
      expect(result.text).toBe(expected(utf8))
      expect(encodings).toContain(result.encoding)
    })
  }

  test('valid UTF-8 is UTF-8, with CRLF and CR made LF', () => {
    const bytes = new TextEncoder().encode(
      '1\r\n00:00:01,000 --> 00:00:02,000\r\nČeská věta\rdruhá\r\n',
    )
    expect(decodeSubtitle(bytes)).toEqual({
      text: '1\n00:00:01,000 --> 00:00:02,000\nČeská věta\ndruhá\n',
      encoding: 'utf-8',
    })
  })

  test('a UTF-8 BOM wins over the guess, and is dropped', () => {
    const body = expected('ru.utf8.srt')
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(body)])
    expect(decodeSubtitle(bytes)).toEqual({ text: body, encoding: 'utf-8' })
  })

  test('a UTF-8 BOM in front of bytes that aren’t valid UTF-8 still means UTF-8', () => {
    // "café" in windows-1252 would be guessed as such without the mark.
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x63, 0x61, 0x66, 0xe9])
    expect(decodeSubtitle(bytes)).toEqual({ text: 'caf�', encoding: 'utf-8' })
  })

  test('UTF-16LE and UTF-16BE with a BOM', () => {
    const body = expected('ja.utf8.srt')
    const le = new Uint8Array(2 + body.length * 2)
    const be = new Uint8Array(2 + body.length * 2)
    le.set([0xff, 0xfe])
    be.set([0xfe, 0xff])
    for (let i = 0; i < body.length; i += 1) {
      const code = body.charCodeAt(i)
      le[2 + i * 2] = code & 0xff
      le[3 + i * 2] = code >> 8
      be[2 + i * 2] = code >> 8
      be[3 + i * 2] = code & 0xff
    }
    expect(decodeSubtitle(le)).toEqual({ text: body, encoding: 'utf-16le' })
    expect(decodeSubtitle(be)).toEqual({ text: body, encoding: 'utf-16be' })
  })
})

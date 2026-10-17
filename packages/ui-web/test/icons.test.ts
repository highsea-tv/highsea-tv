// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { glyphsTs, OUTPUT, parseGlyph } from '../scripts/icons.ts'

const svg = (body: string, stroke = '1.75') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

describe('custom glyphs', () => {
  test('generated glyphs are up to date', () => {
    expect(readFileSync(OUTPUT, 'utf8')).toBe(glyphsTs())
  })

  test('sources follow the Lucide drawing rules', () => {
    expect(parseGlyph('ok', svg('<path d="M3 3h18"/><circle cx="12" cy="12" r="4"/>'))).toEqual([
      ['path', { d: 'M3 3h18' }],
      ['circle', { cx: '12', cy: '12', r: '4' }],
    ])
    expect(() => parseGlyph('stroke', svg('<path d="M3 3h18"/>', '2'))).toThrow('stroke-width')
    expect(() => parseGlyph('fill', svg('<path d="M3 3h18" fill="red"/>'))).toThrow('fill')
    expect(() => parseGlyph('g', svg('<g><path d="M3 3h18"/></g>'))).toThrow('<g>')
    expect(() => parseGlyph('empty', svg(''))).toThrow('empty')
  })
})

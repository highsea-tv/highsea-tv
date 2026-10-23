// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { ISO_639_1, iso6391Of, streamLanguage } from '../src/index.ts'

describe('ISO 639', () => {
  test('639-2 bibliographic and terminology codes both map to 639-1', () => {
    expect(['eng', 'fre', 'fra', 'ger', 'deu', 'chi', 'zho'].map(iso6391Of)).toEqual([
      'en',
      'fr',
      'fr',
      'de',
      'de',
      'zh',
      'zh',
    ])
    expect(ISO_639_1.has('ja')).toBe(true)
    expect(ISO_639_1.has('bh')).toBe(false)
  })

  test('a stream’s tag: 639-1, 639-2 in any case, or an IETF tag’s language; else null', () => {
    expect(
      ['ENG', 'ja', 'pt-BR', 'en_US', 'und', 'zxx', 'xx', '', null, 'english'].map(streamLanguage),
    ).toEqual(['en', 'ja', 'pt', 'en', null, null, null, null, null, null])
  })
})

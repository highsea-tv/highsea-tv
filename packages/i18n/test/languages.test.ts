// SPDX-License-Identifier: AGPL-3.0-only
// The language names catalog: every language the server reports, named as Intl.DisplayNames names
// it, without calling Intl.DisplayNames (Hermes has none:
// https://github.com/facebook/hermes/blob/main/doc/IntlAPIs.md).
import { describe, expect, test } from 'bun:test'
import { LANGUAGE_CODES } from '@highsea-tv/subtitles/shared'
import { languageName, languageNames } from '../src/languages.ts'

const codes = Object.keys(languageNames)

// The names as Node gives them (the server's ICU), asked once from `node`.
const nodeNames: Record<string, string> = JSON.parse(
  Bun.spawnSync([
    'node',
    '-e',
    `const d = new Intl.DisplayNames(['en'], { type: 'language' });
     console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(codes)}.map((c) => [c, d.of(c)]))))`,
  ]).stdout.toString(),
)

describe('language names', () => {
  test('lists every language the server can report, and nothing else', () => {
    expect([...codes].sort()).toEqual([...LANGUAGE_CODES].sort())
  })

  test('each name is the one Intl.DisplayNames gives in English', () => {
    const bun = new Intl.DisplayNames(['en'], { type: 'language' })
    for (const code of codes) {
      const name = languageName(code)
      // Node's ICU (CLDR, as Chromium's) is the catalog's source; Bun on macOS reads the system's
      // ICU, which names a few differently (`zh-Hans` "Chinese, Simplified", `tl` "Tagalog").
      expect([bun.of(code), nodeNames[code]]).toContain(name)
      expect(name).toBe(nodeNames[code] ?? '')
    }
  })

  test('never calls Intl.DisplayNames', () => {
    const real = Intl.DisplayNames
    Object.defineProperty(Intl, 'DisplayNames', {
      value: () => {
        throw new Error('Intl.DisplayNames called')
      },
      configurable: true,
    })
    try {
      for (const code of codes) expect(languageName(code)).not.toBe(code)
    } finally {
      Object.defineProperty(Intl, 'DisplayNames', { value: real, configurable: true })
    }
  })

  test('regions and scripts as the catalog lists them, in any case', () => {
    expect(languageName('pt-BR')).toBe('Brazilian Portuguese')
    expect(languageName('pt_br')).toBe('Brazilian Portuguese')
    expect(languageName('zh-Hant')).toBe('Traditional Chinese')
    expect(languageName('ZH-HANS')).toBe('Simplified Chinese')
  })

  test('a region it doesn’t list takes its language; an unknown code shows as itself', () => {
    expect(languageName('en-GB')).toBe('English')
    expect(languageName('qq')).toBe('qq')
    expect(languageName('')).toBe('')
  })

  test('a translation wins where it has the code', () => {
    expect(languageName('de', { de: 'Deutsch' })).toBe('Deutsch')
    expect(languageName('fr', { de: 'Deutsch' })).toBe('French')
  })
})

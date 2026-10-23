// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import {
  isLanguageCode,
  languageList,
  languageName,
  satisfies,
  toLanguageCode,
} from '../../src/shared/languages.ts'

describe('toLanguageCode', () => {
  test.each([
    ['en', 'en'],
    ['EN', 'en'],
    ['eng', 'en'],
    ['fre', 'fr'],
    ['fra', 'fr'],
    ['ger', 'de'],
    ['deu', 'de'],
    ['chi', 'zh'],
    ['zho', 'zh'],
    ['pt-BR', 'pt-BR'],
    ['pt_br', 'pt-BR'],
    ['pob', 'pt-BR'],
    ['zh-Hans', 'zh-Hans'],
    ['zh-CN', 'zh-Hans'],
    ['zh-Hant', 'zh-Hant'],
    ['zh-TW', 'zh-Hant'],
    ['en-US', 'en'],
    ['fr-CA', 'fr'],
    ['fil', 'tl'],
    ['English', 'en'],
    ['Brazilian', 'pt-BR'],
    ['Brazilian Portuguese', 'pt-BR'],
    ['Simplified Chinese', 'zh-Hans'],
    ['Traditional Chinese', 'zh-Hant'],
  ])('%s is %s', (tag, code) => {
    expect(toLanguageCode(tag)).toBe(code)
  })

  test.each(['und', 'zxx', 'xyz', '', 'BluRay', null, undefined])('%p is none', (tag) => {
    expect(toLanguageCode(tag)).toBeNull()
  })
})

describe('satisfies', () => {
  test('the same code', () => {
    expect(satisfies('en', 'en')).toBe(true)
    expect(satisfies('en', 'fr')).toBe(false)
  })

  test('a base language counts for its regional codes, not the other way round', () => {
    expect(satisfies('pt', 'pt-BR')).toBe(true)
    expect(satisfies('zh', 'zh-Hant')).toBe(true)
    expect(satisfies('pt-BR', 'pt')).toBe(false)
    expect(satisfies('zh-Hans', 'zh-Hant')).toBe(false)
  })
})

describe('names and the list', () => {
  test('English names', () => {
    expect(languageName('en')).toBe('English')
    expect(languageName('pt-BR')).toBe('Brazilian Portuguese')
    expect(languageName('de')).toBe('German')
  })

  test('the list has the regional codes, sorted by name', () => {
    const list = languageList()
    const codes = list.map((l) => l.code)
    for (const c of ['en', 'pt-BR', 'zh-Hans', 'zh-Hant']) expect(codes).toContain(c)
    const names = list.map((l) => l.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')))
    expect(codes.every(isLanguageCode)).toBe(true)
  })

  test('isLanguageCode', () => {
    expect(isLanguageCode('en')).toBe(true)
    expect(isLanguageCode('pt-BR')).toBe(true)
    expect(isLanguageCode('eng')).toBe(false)
    expect(isLanguageCode('bh')).toBe(false)
  })
})

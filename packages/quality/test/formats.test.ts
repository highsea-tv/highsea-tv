// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import {
  type Condition,
  type ConditionInput,
  type CustomFormat,
  conditionHolds,
  conditionSchema,
  customFormatSchema,
  describeCondition,
  describeFormat,
  type FormatInput,
  matchesFormat,
  validateFormat,
} from '../src/formats.ts'
import { GB, release } from './helpers.ts'

const cond = (c: ConditionInput): Condition => conditionSchema.parse(c)
const format = (...conditions: ConditionInput[]): CustomFormat =>
  customFormatSchema.parse({ id: 'f', name: 'F', source: 'custom', conditions })

const dv = release('Sintel.2010.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX', {
  quality: { source: 'webdl', resolution: 2160 },
  releaseGroup: 'FLUX',
  languages: ['fr', 'en'],
  edition: 'Director’s Cut',
})
const input = (over: Partial<FormatInput> = {}): FormatInput => ({
  release: dv,
  size: 14.8 * GB,
  indexerFlags: ['freeleech'],
  originalLanguage: 'en',
  ...over,
})

/** Each kind: one condition that holds and one that doesn't, for `dv` and `input()`. */
const kinds: [string, ConditionInput, ConditionInput][] = [
  ['title', { kind: 'title', value: '\\bdv\\b' }, { kind: 'title', value: '\\bREMUX\\b' }],
  ['edition', { kind: 'edition', value: 'director' }, { kind: 'edition', value: 'IMAX' }],
  [
    'releaseGroup',
    { kind: 'releaseGroup', value: '^(flux)$' },
    { kind: 'releaseGroup', value: '^(YTS)$' },
  ],
  [
    'language',
    { kind: 'language', value: { language: 'fr' } },
    { kind: 'language', value: { language: 'ja' } },
  ],
  [
    'indexerFlag',
    { kind: 'indexerFlag', value: 'freeleech' },
    { kind: 'indexerFlag', value: 'internal' },
  ],
  ['source', { kind: 'source', value: 'webdl' }, { kind: 'source', value: 'bluray' }],
  ['resolution', { kind: 'resolution', value: 2160 }, { kind: 'resolution', value: 1080 }],
  ['modifier', { kind: 'modifier', value: 'none' }, { kind: 'modifier', value: 'remux' }],
  [
    'size',
    { kind: 'size', value: { min: 10, max: 20 } },
    { kind: 'size', value: { min: 20, max: 40 } },
  ],
  [
    'year',
    { kind: 'year', value: { min: 2000, max: 2010 } },
    { kind: 'year', value: { min: 2011, max: 2020 } },
  ],
]

describe('conditions', () => {
  describe.each(kinds)('%s', (_, yes, no) => {
    test('holds or doesn’t', () => {
      expect(conditionHolds(cond(yes), input())).toBe(true)
      expect(conditionHolds(cond(no), input())).toBe(false)
    })

    test('negate inverts it', () => {
      expect(conditionHolds(cond({ ...yes, negate: true }), input())).toBe(false)
      expect(conditionHolds(cond({ ...no, negate: true }), input())).toBe(true)
    })

    test('required must hold even when another of its kind does', () => {
      expect(matchesFormat(format(yes, no), input())).toBe(true)
      expect(matchesFormat(format(yes, { ...no, required: true }), input())).toBe(false)
      expect(matchesFormat(format({ ...yes, required: true }, no), input())).toBe(true)
    })
  })

  test('regexes are case-insensitive', () => {
    expect(conditionHolds(cond({ kind: 'title', value: 'web-dl' }), input())).toBe(true)
  })

  test('the original language is the movie’s', () => {
    const original = cond({ kind: 'language', value: { language: 'original' } })
    expect(conditionHolds(original, input())).toBe(true)
    expect(conditionHolds(original, input({ originalLanguage: 'ja' }))).toBe(false)
    expect(conditionHolds(original, input({ originalLanguage: null }))).toBe(false)
  })

  test('except matches any language but the one given', () => {
    const notEnglish = cond({ kind: 'language', value: { language: 'en', except: true } })
    expect(conditionHolds(notEnglish, input())).toBe(true)
    const english = release('Sintel.2010.1080p.BluRay.x264-GRP')
    expect(conditionHolds(notEnglish, input({ release: english }))).toBe(false)
  })

  test('a name that tags no language is English', () => {
    const en = cond({ kind: 'language', value: { language: 'en' } })
    expect(conditionHolds(en, input({ release: release('Sintel.2010.1080p.BluRay-GRP') }))).toBe(
      true,
    )
  })

  test('size is in GiB with both ends included, and unknown sizes don’t match', () => {
    const c = cond({ kind: 'size', value: { min: 1, max: 2 } })
    expect(conditionHolds(c, input({ size: 2 * 1024 ** 3 }))).toBe(true)
    expect(conditionHolds(c, input({ size: 2 * 1024 ** 3 + 1 }))).toBe(false)
    expect(conditionHolds(c, input({ size: null }))).toBe(false)
  })

  test('what the name lacks doesn’t match', () => {
    const bare = release('Sintel.1080p.BluRay', { year: null })
    expect(conditionHolds(cond(kinds[1]?.[1] as ConditionInput), input({ release: bare }))).toBe(
      false,
    )
    expect(conditionHolds(cond(kinds[2]?.[1] as ConditionInput), input({ release: bare }))).toBe(
      false,
    )
    expect(conditionHolds(cond(kinds[9]?.[1] as ConditionInput), input({ release: bare }))).toBe(
      false,
    )
    expect(conditionHolds(cond(kinds[4]?.[1] as ConditionInput), input({ indexerFlags: [] }))).toBe(
      false,
    )
  })
})

describe('matching', () => {
  const title = (value: string, extra: Partial<ConditionInput> = {}) =>
    ({ kind: 'title', value, ...extra }) as ConditionInput

  test('conditions of one kind are alternatives', () => {
    expect(matchesFormat(format(title('nope'), title('HDR')), input())).toBe(true)
    expect(matchesFormat(format(title('nope'), title('neither')), input())).toBe(false)
  })

  test('different kinds must all hold', () => {
    const f = format(title('HDR'), { kind: 'resolution', value: 1080 })
    expect(matchesFormat(f, input())).toBe(false)
    const g = format(title('HDR'), { kind: 'resolution', value: 2160 })
    expect(matchesFormat(g, input())).toBe(true)
  })

  test('the wiki’s example: both required titles and one of the languages', () => {
    const f = format(
      title('DV', { required: true }),
      title('HDR', { required: true }),
      { kind: 'language', value: { language: 'de' } },
      { kind: 'language', value: { language: 'fr' } },
      { kind: 'language', value: { language: 'ja' } },
    )
    expect(matchesFormat(f, input())).toBe(true)
    const noHdr = release('Sintel.2010.2160p.WEB-DL.DV-FLUX', { languages: ['fr'] })
    expect(matchesFormat(f, input({ release: noHdr }))).toBe(false)
    const english = release('Sintel.2010.2160p.WEB-DL.DV.HDR-FLUX')
    expect(matchesFormat(f, input({ release: english }))).toBe(false)
  })

  test('a negated required condition excludes', () => {
    const f = format(title('x265|HEVC'), {
      kind: 'resolution',
      value: 2160,
      negate: true,
      required: true,
    })
    expect(matchesFormat(f, input({ release: release('Sintel.2010.1080p.BluRay.x265-GRP') }))).toBe(
      true,
    )
    expect(matchesFormat(f, input())).toBe(false)
  })

  test('a format without conditions matches nothing', () => {
    expect(matchesFormat(format(), input())).toBe(false)
  })

  test('an invalid regex never matches, negated or not, and validation reports it', () => {
    const bad = format(title('(unclosed'), title('(also', { negate: true }))
    expect(matchesFormat(bad, input())).toBe(false)
    expect(validateFormat(bad).map((i) => i.message)).toEqual([
      '“(unclosed” isn’t a valid regular expression',
      '“(also” isn’t a valid regular expression',
    ])
  })

  test('validation reports empty formats and upside-down ranges', () => {
    expect(validateFormat(format())).toEqual([
      { condition: null, message: 'A format needs at least one condition' },
    ])
    expect(validateFormat(format({ kind: 'year', value: { min: 2020, max: 2010 } }))).toEqual([
      { condition: 0, message: 'The range’s minimum is above its maximum' },
    ])
    expect(validateFormat(format(title('HDR')))).toEqual([])
  })
})

describe('describing', () => {
  test('one condition in a line', () => {
    expect(describeCondition(cond({ kind: 'title', value: '\\bDV\\b' }))).toBe(
      'Title matches \\bDV\\b',
    )
    expect(
      describeCondition(cond({ kind: 'resolution', value: 2160, negate: true, required: true })),
    ).toBe('Not: Resolution is 2160p (required)')
    expect(describeCondition(cond({ kind: 'language', value: { language: 'fr' } }))).toBe(
      'In French',
    )
    expect(
      describeCondition(cond({ kind: 'language', value: { language: 'original', except: true } })),
    ).toBe('In a language other than the original language')
    expect(describeCondition(cond({ kind: 'source', value: 'webdl' }))).toBe('Source is WEB-DL')
    expect(describeCondition(cond({ kind: 'size', value: { min: 1, max: 4 } }))).toBe(
      'Size between 1 and 4 GB',
    )
  })

  test('a long list of alternatives is one line', () => {
    const groups = ['A', 'B', 'C', 'D'].map((g) => ({ kind: 'releaseGroup', value: `^(${g})$` }))
    const f = format(...(groups as ConditionInput[]), { kind: 'modifier', value: 'remux' })
    expect(describeFormat(f)).toEqual(['Release group: any of 4 patterns', 'Modifier is Remux'])
  })
})

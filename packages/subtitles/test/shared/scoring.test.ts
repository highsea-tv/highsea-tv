// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import {
  compareResults,
  fitsRule,
  MAX_POINTS,
  type ScoredFile,
  scoreResult,
  WEIGHTS,
} from '../../src/shared/scoring.ts'
import type { LanguageRule, ProviderResult } from '../../src/shared/types.ts'
import { must } from '../must.ts'

const FILE: ScoredFile = {
  title: 'Sintel',
  year: 2010,
  releaseName: 'Sintel.2010.1080p.BluRay.x264-GRP',
}
const ON = { preferReleaseMatch: true }
const OFF = { preferReleaseMatch: false }

const result = (patch: Partial<ProviderResult> = {}): ProviderResult => {
  const releaseName = patch.releaseName ?? 'Sintel.2010.1080p.BluRay.x264-GRP'
  return {
    provider: 'opensubtitles',
    ref: '1',
    language: 'en',
    releaseName,
    releases: [releaseName],
    forced: false,
    hi: false,
    hashMatch: false,
    idMatch: false,
    format: 'srt',
    downloads: 0,
    rating: 0,
    translated: false,
    ...patch,
  }
}

const rule = (hi: LanguageRule['hi'], forced: LanguageRule['forced'] = 'no'): LanguageRule => ({
  code: 'en',
  forced,
  hi,
})

describe('scoreResult', () => {
  test('Bazarr’s movie weights, out of 180', () => {
    expect(MAX_POINTS).toBe(180)
    expect(WEIGHTS).toMatchObject({
      hash: 179,
      title: 60,
      year: 40,
      source: 30,
      edition: 30,
      releaseGroup: 15,
    })
  })

  test('a hash match with the source and codec stands alone at 99', () => {
    const s = scoreResult(result({ hashMatch: true }), FILE, rule('no'), ON)
    expect(s).toEqual({ score: 99, points: 179, matches: ['hash'] })
  })

  test('a hash match without the source does not count as one', () => {
    const s = scoreResult(
      result({ hashMatch: true, releaseName: 'Sintel.2010.1080p.WEB-DL.x264-GRP' }),
      FILE,
      null,
      ON,
    )
    expect(s.matches).not.toContain('hash')
    expect(s.matches).not.toContain('source')
    expect(s.points).toBeLessThan(179)
  })

  test('the same release by name scores every field', () => {
    const s = scoreResult(result(), FILE, rule('no'), ON)
    expect([...s.matches].sort() as string[]).toEqual(
      [
        'edition',
        'hearingImpaired',
        'releaseGroup',
        'resolution',
        'source',
        // neither names a service: a match, as Bazarr's optional fields are
        'streamingService',
        'title',
        'videoCodec',
        'year',
      ].sort(),
    )
    expect(s.points).toBe(60 + 40 + 30 + 30 + 15 + 1 + 1 + 1 + 1)
    expect(s.score).toBe(Math.round((179 * 100) / 180))
  })

  test('an id match counts as title and year', () => {
    const s = scoreResult(
      result({ idMatch: true, releaseName: 'Something.Else.1999.DVDRip-XYZ' }),
      FILE,
      null,
      OFF,
    )
    expect(s).toEqual({
      score: Math.round((100 * 100) / 180),
      points: 100,
      matches: ['title', 'year'],
    })
  })

  test('with Prefer release matches off, the release fields do not count', () => {
    const s = scoreResult(result(), FILE, null, OFF)
    expect([...s.matches].sort() as string[]).toEqual(['title', 'year'])
    expect(s.points).toBe(100)
  })

  test('the best of the release names is kept', () => {
    const r = result({
      releaseName: 'Other.1999.DVDRip',
      releases: ['Other.1999.DVDRip', 'Sintel.2010.1080p.BluRay.x264-GRP'],
    })
    expect(scoreResult(r, FILE, null, ON).points).toBe(scoreResult(result(), FILE, null, ON).points)
  })

  test('the hearing impaired point follows the rule', () => {
    expect(scoreResult(result({ hi: true }), FILE, rule('also'), OFF).matches).toContain(
      'hearingImpaired',
    )
    expect(scoreResult(result({ hi: true }), FILE, rule('no'), OFF).matches).not.toContain(
      'hearingImpaired',
    )
    expect(scoreResult(result(), FILE, rule('no'), OFF).matches).toContain('hearingImpaired')
  })

  test('the probe’s codec counts when the name doesn’t say', () => {
    const file = { ...FILE, releaseName: 'Sintel (2010) Bluray-1080p', videoCodec: 'avc' }
    expect(scoreResult(result(), file, null, ON).matches).toContain('videoCodec')
  })
})

describe('fitsRule', () => {
  const want = { language: 'en', forced: false, hi: false }
  test('language, forced and translation', () => {
    expect(fitsRule(result(), want, rule('no'))).toBe(true)
    expect(fitsRule(result({ language: 'fr' }), want, rule('no'))).toBe(false)
    expect(fitsRule(result({ forced: true }), want, rule('no'))).toBe(false)
    expect(fitsRule(result({ translated: true }), want, rule('no'))).toBe(false)
  })

  test('a base language result fills a regional want', () => {
    expect(
      fitsRule(
        result({ language: 'pt' }),
        { ...want, language: 'pt-BR' },
        { ...rule('no'), code: 'pt-BR' },
      ),
    ).toBe(true)
  })

  test('SDH only wants SDH; Without SDH takes SDH as the fallback', () => {
    expect(fitsRule(result(), { ...want, hi: true }, rule('only'))).toBe(false)
    expect(fitsRule(result({ hi: true }), { ...want, hi: true }, rule('only'))).toBe(true)
    expect(fitsRule(result({ hi: true }), want, rule('no'))).toBe(true)
  })
})

describe('compareResults', () => {
  const r = (patch: Partial<Parameters<typeof compareResults>[0]>) => ({
    score: 80,
    downloads: 0,
    rating: 0,
    providerRank: 0,
    fallback: false,
    ...patch,
  })

  test('fallbacks last, then score, downloads, rating and provider order', () => {
    const list = [
      r({ fallback: true, score: 100 }),
      r({ score: 70 }),
      r({ score: 90, providerRank: 2 }),
      r({ score: 90, providerRank: 1 }),
      r({ score: 90, downloads: 5 }),
      r({ score: 90, downloads: 5, rating: 9 }),
    ]
    const sorted = [...list].sort(compareResults)
    expect(sorted).toEqual([5, 4, 3, 2, 1, 0].map((i) => must(list[i])))
  })
})

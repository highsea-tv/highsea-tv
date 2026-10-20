// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import type { ParsedRelease } from '@highsea/parser'
import {
  type DecisionInput,
  decide,
  defaultSpecifications,
  SPECIFICATION_IDS,
  withSpecification,
} from '../src/decision.ts'
import { seedFormats } from '../src/presets.ts'
import { type QualityProfile, seedProfiles } from '../src/profiles.ts'
import { compareReleases, type Rankable } from '../src/ranking.ts'
import { defaultQualitySizes, type QualitySize } from '../src/sizes.ts'
import { GB, release, revision } from './helpers.ts'

const profiles = seedProfiles()
const profile = (id: string) => profiles.find((p) => p.id === id) as QualityProfile
const hd = profile('qp-hd')
const uhd = profile('qp-uhd')

const bluray = release('Sintel.2010.1080p.BluRay.x264.DTS-HD.MA.5.1-EPSiLON', {
  releaseGroup: 'EPSiLON',
})
const sizes: QualitySize[] = defaultQualitySizes().map((s) =>
  s.quality === 'Bluray-1080p' ? { ...s, min: 15, preferred: 60, max: 130 } : s,
)

const input = (over: Partial<DecisionInput> & { release?: ParsedRelease } = {}): DecisionInput => ({
  release: bluray,
  size: 8.4 * GB,
  movie: { title: 'Sintel', year: 2010, runtimeMinutes: 132, originalLanguage: 'en' },
  profile: hd,
  formats: seedFormats(),
  sizes,
  existing: null,
  ...over,
})
const messages = (over: Partial<DecisionInput> = {}) => decide(input(over)).reasons

describe('decide', () => {
  test('a release the profile wants', () => {
    const d = decide(input())
    expect(d).toEqual({
      approved: true,
      reasons: [{ kind: 'accepted', message: 'Matches target Bluray-1080p' }],
      quality: 'Bluray-1080p',
      formats: [],
      formatScore: 0,
    })
  })

  describe('quality allowed', () => {
    test('a quality outside the profile', () => {
      const uhdRelease = release('Sintel.2010.2160p.BluRay.x265-GRP', {
        quality: { resolution: 2160 },
      })
      const d = decide(input({ release: uhdRelease }))
      expect(d.approved).toBe(false)
      expect(d.reasons[0]).toEqual({
        kind: 'rejected',
        message: 'Bluray-2160p isn’t allowed in HD 1080p',
      })
    })

    test('allowed, below the cutoff', () => {
      const web = release('Sintel.2010.1080p.WEB-DL.H.264-NTb', { quality: { source: 'webdl' } })
      expect(messages({ release: web })[0]).toEqual({
        kind: 'accepted',
        message: 'Matches WEBDL-1080p',
      })
    })
  })

  describe('size', () => {
    test('too large, against the runtime', () => {
      expect(messages({ size: 32.1 * GB })).toContainEqual({
        kind: 'rejected',
        message: 'Too large: 32.1 GB, the limit is 18.0 GB for 2h 12m',
      })
    })

    test('too small', () => {
      expect(messages({ size: 0.7 * GB })).toContainEqual({
        kind: 'rejected',
        message: 'Too small: 700 MB, the minimum is 2.1 GB for 2h 12m',
      })
    })

    test('an unknown runtime assumes 110 minutes, and says so', () => {
      const movie = { title: 'Sintel', year: 2010, runtimeMinutes: null, originalLanguage: 'en' }
      expect(messages({ size: 32.1 * GB, movie })).toContainEqual({
        kind: 'rejected',
        message: 'Too large: 32.1 GB, the limit is 15.0 GB for 1h 50m, as the runtime isn’t known',
      })
    })

    test('an unknown size, or a quality with no limit, passes', () => {
      expect(decide(input({ size: null })).approved).toBe(true)
      expect(decide(input({ size: 500 * GB, sizes: defaultQualitySizes() })).approved).toBe(true)
    })
  })

  describe('custom format score', () => {
    const flux = release('Sintel.2010.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX', {
      quality: { source: 'webdl', resolution: 2160 },
      releaseGroup: 'FLUX',
    })

    test('each scored format is a reason', () => {
      const d = decide(input({ release: flux, profile: uhd }))
      expect(d.approved).toBe(true)
      expect(d.formatScore).toBe(2600)
      expect(d.formats.map((f) => f.name)).toEqual(['Dolby Vision', 'HDR10', 'x265'])
      expect(d.reasons).toEqual([
        { kind: 'accepted', message: 'Matches target WEBDL-2160p' },
        { kind: 'accepted', message: 'Dolby Vision format score +1500' },
        { kind: 'accepted', message: 'HDR10 format score +1000' },
        { kind: 'accepted', message: 'x265 format score +100' },
      ])
    })

    test('below the minimum', () => {
      const yify = release('Sintel.2010.1080p.BluRay.x264-YIFY', { releaseGroup: 'YIFY' })
      const d = decide(input({ release: yify }))
      expect(d.approved).toBe(false)
      expect(d.reasons).toEqual([
        { kind: 'accepted', message: 'Matches target Bluray-1080p' },
        { kind: 'warning', message: 'Low-quality groups format score -10000' },
        { kind: 'rejected', message: 'Format score -10000 is below the minimum of 0 in HD 1080p' },
      ])
    })

    test('formats the profile doesn’t score count 0 and aren’t listed', () => {
      const x265 = release('Sintel.2010.1080p.BluRay.x265-GRP')
      const any = profile('qp-any')
      const d = decide(
        input({ release: x265, profile: { ...any, items: hd.items, cutoff: hd.cutoff } }),
      )
      expect(d.formats).toEqual([{ id: 'cf-x265', name: 'x265', score: 0 }])
      expect(d.reasons).toHaveLength(1)
    })
  })

  describe('language', () => {
    const french = release('Sintel.2010.FRENCH.1080p.BluRay.x264-GRP', { languages: ['fr'] })

    test('any language passes silently', () => {
      expect(messages({ release: french })).toHaveLength(1)
    })

    test('one language', () => {
      const p = { ...hd, language: 'fr' }
      expect(messages({ release: french, profile: p })).toContainEqual({
        kind: 'accepted',
        message: 'In French',
      })
      expect(messages({ profile: p })).toContainEqual({
        kind: 'rejected',
        message: 'In English; HD 1080p wants French',
      })
    })

    test('the original language', () => {
      const p = { ...hd, language: 'original' }
      const movie = { title: 'Amélie', year: 2001, runtimeMinutes: 122, originalLanguage: 'fr' }
      expect(decide(input({ release: french, profile: p, movie })).approved).toBe(true)
      const multi = release('Amelie.2001.MULTi.1080p.BluRay-GRP', { languages: ['de', 'en'] })
      expect(messages({ release: multi, profile: p, movie })).toContainEqual({
        kind: 'rejected',
        message: 'In German and English; HD 1080p wants the original language, French',
      })
    })

    test('an unknown original language isn’t checked', () => {
      const p = { ...hd, language: 'original' }
      const movie = { title: 'Sintel', year: 2010, runtimeMinutes: 132, originalLanguage: null }
      expect(decide(input({ release: french, profile: p, movie })).approved).toBe(true)
    })
  })

  describe('upgrades', () => {
    const web = release('Sintel.2010.1080p.WEB-DL-NTb', { quality: { source: 'webdl' } })
    const existingWeb = { quality: 'WEBDL-1080p' as const, revision: revision(), formatScore: 0 }

    test('a better quality is an upgrade', () => {
      expect(messages({ existing: existingWeb })).toContainEqual({
        kind: 'accepted',
        message: 'Upgrades WEBDL-1080p to Bluray-1080p',
      })
    })

    test('upgrades not allowed', () => {
      const any = profile('qp-any')
      const d = decide(input({ release: web, profile: any, existing: existingWeb }))
      expect(d.approved).toBe(false)
      expect(d.reasons).toContainEqual({
        kind: 'rejected',
        message: 'There’s a file already, and Any doesn’t allow upgrades',
      })
    })

    test('the cutoff is met', () => {
      const existing = { quality: 'Bluray-1080p' as const, revision: revision(), formatScore: 100 }
      expect(messages({ existing })).toContainEqual({
        kind: 'rejected',
        message: 'The file already meets the cutoff: Bluray-1080p, format score 100',
      })
    })

    test('a newer revision of the same quality, even past the cutoff', () => {
      const existing = { quality: 'Bluray-1080p' as const, revision: revision(), formatScore: 100 }
      const proper = release('Sintel.2010.PROPER.1080p.BluRay-GRP', {
        quality: { revision: revision({ version: 2, proper: true }) },
      })
      const d = decide(input({ release: proper, existing }))
      expect(d.approved).toBe(true)
      expect(d.reasons).toContainEqual({
        kind: 'accepted',
        message: 'A newer revision of Bluray-1080p',
      })
    })

    test('the same quality with a better format score, under the cutoff score', () => {
      const existing = { quality: 'Bluray-1080p' as const, revision: revision(), formatScore: 0 }
      const x265 = release('Sintel.2010.1080p.BluRay.x265-GRP')
      expect(messages({ release: x265, existing })).toContainEqual({
        kind: 'accepted',
        message: 'Raises the format score from 0 to 100',
      })
      const minimum = { ...hd, minUpgradeFormatScore: 200 }
      expect(messages({ release: x265, existing, profile: minimum })).toContainEqual({
        kind: 'rejected',
        message: 'Not an upgrade: the file is Bluray-1080p with format score 0',
      })
    })

    test('a worse quality isn’t an upgrade, whatever its score', () => {
      const existing = { quality: 'Bluray-1080p' as const, revision: revision(), formatScore: 0 }
      const webX265 = release('Sintel.2010.1080p.WEB-DL.x265-GRP', { quality: { source: 'webdl' } })
      const d = decide(input({ release: webX265, existing }))
      expect(d.approved).toBe(false)
      expect(d.reasons.at(-1)).toEqual({
        kind: 'rejected',
        message: 'Not an upgrade: the file is Bluray-1080p with format score 0',
      })
    })
  })

  describe('the registry', () => {
    test('has the slots later checkpoints fill, silent until then', () => {
      expect(SPECIFICATION_IDS).toEqual([
        'quality',
        'size',
        'formatScore',
        'language',
        'upgradeAllowed',
        'cutoff',
        'upgrade',
        'seeders',
        'minimumAge',
        'blockedIndexer',
        'alreadyQueued',
        'alreadyImported',
        'blocklisted',
      ])
      expect(decide(input({ indexer: { seeders: 0, ageMinutes: 1 } })).approved).toBe(true)
    })

    test('a slot can be filled, and a new specification added', () => {
      const specifications = withSpecification(
        withSpecification(defaultSpecifications, {
          id: 'seeders',
          evaluate: (e) =>
            (e.indexer?.seeders ?? 0) < 3
              ? [{ kind: 'rejected', message: `Seeders (${e.indexer?.seeders})` }]
              : [],
        }),
        { id: 'extra', evaluate: () => [{ kind: 'warning', message: 'Extra' }] },
      )
      expect(specifications.map((s) => s.id)).toEqual([...SPECIFICATION_IDS, 'extra'])
      const d = decide(input({ indexer: { seeders: 2 } }), { specifications })
      expect(d.approved).toBe(false)
      expect(d.reasons.slice(1)).toEqual([
        { kind: 'rejected', message: 'Seeders (2)' },
        { kind: 'warning', message: 'Extra' },
      ])
    })
  })
})

describe('ranking', () => {
  const r = (quality: Rankable['quality'], formatScore = 0, version = 1): Rankable => ({
    quality,
    revision: revision({ version }),
    formatScore,
  })

  test('quality as the profile orders it, then revision, then format score', () => {
    const list = [
      r('WEBDL-1080p', 500),
      r('Bluray-1080p', 0),
      r('WEBRip-1080p', 600),
      r('Bluray-1080p', 0, 2),
      r('Bluray-1080p', 100),
    ]
    expect(list.sort(compareReleases(hd))).toEqual([
      r('Bluray-1080p', 0, 2),
      r('Bluray-1080p', 100),
      r('Bluray-1080p', 0),
      r('WEBRip-1080p', 600),
      r('WEBDL-1080p', 500),
    ])
  })

  test('the profile’s order, not the global rank', () => {
    const webFirst = { items: [...hd.items].reverse() }
    expect(compareReleases(webFirst)(r('Bluray-1080p'), r('HDTV-1080p'))).toBeGreaterThan(0)
  })

  test('tiebreakers run last, for checkpoint 5’s keys', () => {
    type WithSeeders = Rankable & { seeders: number }
    const bySeeders = (a: WithSeeders, b: WithSeeders) => b.seeders - a.seeders
    const cmp = compareReleases<WithSeeders>(hd, [bySeeders])
    const a = { ...r('Bluray-1080p'), seeders: 3 }
    const b = { ...r('Bluray-1080p'), seeders: 40 }
    expect([a, b].sort(cmp)).toEqual([b, a])
    expect(cmp({ ...r('Remux-1080p'), seeders: 0 }, b)).toBeGreaterThan(0)
  })
})

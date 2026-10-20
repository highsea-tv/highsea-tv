// SPDX-License-Identifier: AGPL-3.0-only
// End to end: release names through @highsea/parser, then the engine, with the seeded profiles and
// formats. The names are the prototype's search results (design/prototypes/src/mock/server.ts).
import { describe, expect, test } from 'bun:test'
import { parse } from '@highsea/parser'
import { type DecisionInput, decide } from '../src/decision.ts'
import { releaseLanguages } from '../src/formats.ts'
import { seedFormats } from '../src/presets.ts'
import { type QualityProfile, seedProfiles } from '../src/profiles.ts'
import { compareReleases } from '../src/ranking.ts'
import { defaultQualitySizes } from '../src/sizes.ts'

const GB = 1e9
const [uhd, hd] = seedProfiles() as [QualityProfile, QualityProfile]
const at = (name: string, size: number, profile: QualityProfile): DecisionInput => ({
  release: parse(name),
  size,
  movie: { title: 'Sintel', year: 2010, runtimeMinutes: 15, originalLanguage: 'en' },
  profile,
  formats: seedFormats(),
  sizes: defaultQualitySizes(),
})

describe('parsed names', () => {
  const names = {
    flux: 'Sintel.2010.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX',
    epsilon: 'Sintel.2010.1080p.BluRay.x264.DTS-HD.MA.5.1-EPSiLON',
    ntb: 'Sintel.2010.1080p.WEB-DL.AAC2.0.H.264-NTb',
    hdtv: 'Sintel.2010.720p.HDTV.x264-DEADPOOL',
    cam: 'Sintel.2010.CAM.XviD-UNKNOWN',
  }

  test('the UHD release, in each profile', () => {
    const d = decide(at(names.flux, 14.8 * GB, uhd))
    expect(d.approved).toBe(true)
    expect(d.quality).toBe('WEBDL-2160p')
    expect(d.formats.map((f) => f.name)).toEqual(['Dolby Vision', 'HDR10', 'x265'])
    expect(d.formatScore).toBe(2600)
    expect(decide(at(names.flux, 14.8 * GB, hd)).reasons[0]).toEqual({
      kind: 'rejected',
      message: 'WEBDL-2160p isn’t allowed in HD 1080p',
    })
  })

  test('the 1080p releases, ranked', () => {
    const ranked = [names.ntb, names.hdtv, names.epsilon, names.cam]
      .map((n) => ({ n, ...decide(at(n, 3 * GB, hd)), revision: parse(n).quality.revision }))
      .sort(compareReleases(hd))
    expect(ranked.map((r) => [r.quality, r.approved])).toEqual([
      ['Bluray-1080p', true],
      ['WEBDL-1080p', true],
      ['HDTV-720p', false],
      ['CAM', false],
    ])
  })

  test('a PROPER upgrades the file it fixes', () => {
    const { revision } = parse(names.epsilon).quality
    const d = decide({
      ...at('Sintel.2010.PROPER.1080p.BluRay.x264-GRP', 8 * GB, hd),
      existing: { quality: 'Bluray-1080p', revision, formatScore: 100 },
    })
    expect(d.approved).toBe(true)
    expect(d.reasons.at(-1)?.message).toBe('A newer revision of Bluray-1080p')
  })

  test('MULTi is the original language, plus what the indexer says', () => {
    const multi = parse('Amelie.2001.MULTi.1080p.BluRay.x264-GRP')
    expect(releaseLanguages(multi, { originalLanguage: 'fr' })).toEqual(['fr'])
    expect(releaseLanguages(multi, { originalLanguage: 'fr', multiLanguages: ['en'] })).toEqual([
      'fr',
      'en',
    ])
    expect(releaseLanguages(parse(names.epsilon))).toEqual(['en'])
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { customFormatSchema, matchesFormat, validateFormat } from '../src/formats.ts'
import { presetFormats, seedFormats, TRASH_PRESETS } from '../src/presets.ts'
import { importTrashFormat } from '../src/trash.ts'
import { release } from './helpers.ts'

const preset = (file: string) => importTrashFormat(TRASH_PRESETS[file])

describe('TRaSH import', () => {
  test('every bundled preset imports whole, valid, with nothing skipped', () => {
    for (const [file, json] of Object.entries(TRASH_PRESETS)) {
      const { format, skipped } = importTrashFormat(json)
      expect({ file, skipped }).toEqual({ file, skipped: [] })
      expect(customFormatSchema.parse(format)).toEqual(format)
      expect(validateFormat(format)).toEqual([])
      expect(format.id).toBe(`trash-${format.trashId}`)
      expect(format.source).toBe('preset')
    }
    expect(presetFormats()).toHaveLength(Object.keys(TRASH_PRESETS).length)
  })

  test('each specification becomes its kind, with negate and required kept', () => {
    const { format, defaultScore } = preset('x265-hd')
    expect(format.name).toBe('x265 (HD)')
    expect(defaultScore).toBe(-10000)
    expect(format.conditions).toEqual([
      {
        kind: 'title',
        name: 'x265/HEVC',
        value: '[xh][ ._-]?265|\\bHEVC(\\b|\\d)',
        negate: false,
        required: true,
      },
      { kind: 'resolution', name: 'Not 2160p', value: 2160, negate: true, required: true },
    ])
    expect(preset('webdl-boost').format.conditions.map((c) => c.value)).toEqual(['webdl', 'webrip'])
    expect(preset('remux-tier-01').format.conditions[0]).toMatchObject({
      kind: 'modifier',
      value: 'remux',
      required: true,
    })
    expect(preset('freeleech').format.conditions[0]).toMatchObject({
      kind: 'indexerFlag',
      value: 'freeleech',
    })
    expect(preset('language-not-english').format.conditions[0]).toMatchObject({
      kind: 'language',
      value: { language: 'en', except: false },
      negate: true,
    })
    expect(preset('wrong-language').format.conditions[0]).toMatchObject({
      kind: 'language',
      value: { language: 'original', except: false },
    })
  })

  test('what highsea can’t express is skipped and listed', () => {
    const { format, skipped } = importTrashFormat({
      trash_id: 'x',
      name: 'Odd',
      specifications: [
        { name: 'Swedish', implementation: 'LanguageSpecification', fields: { value: 14 } },
        { name: 'Nope', implementation: 'MysterySpecification', fields: { value: 1 } },
        { name: 'Size', implementation: 'SizeSpecification', fields: { min: 1, max: 10 } },
        { name: 'Year', implementation: 'YearSpecification', fields: { min: 1990, max: 1999 } },
        { name: 'Cut', implementation: 'EditionSpecification', fields: { value: 'Final Cut' } },
      ],
    })
    expect(skipped.map((s) => s.name)).toEqual(['Swedish', 'Nope'])
    expect(format.conditions.map((c) => c.kind)).toEqual(['size', 'year', 'edition'])
  })

  test('a file that isn’t TRaSH’s shape throws', () => {
    expect(() => importTrashFormat({ name: 'No id' })).toThrow()
  })
})

describe('presets match what they say', () => {
  const at = (name: string, q: Parameters<typeof release>[1] = {}) => ({
    release: release(name, q),
    originalLanguage: 'en',
  })

  test('DTS-HD MA, but not TrueHD', () => {
    const f = preset('dts-hd-ma').format
    expect(matchesFormat(f, at('Sintel.2010.1080p.BluRay.DTS-HD.MA.5.1.x264-EPSiLON'))).toBe(true)
    expect(matchesFormat(f, at('Sintel.2010.1080p.BluRay.TrueHD.Atmos.7.1.x264-GRP'))).toBe(false)
  })

  test('x265 (HD): x265 below 2160p only', () => {
    const f = preset('x265-hd').format
    expect(matchesFormat(f, at('Sintel.2010.1080p.BluRay.x265-GRP'))).toBe(true)
    const uhd = at('Sintel.2010.2160p.BluRay.x265-GRP', { quality: { resolution: 2160 } })
    expect(matchesFormat(f, uhd)).toBe(false)
  })

  test('Remux Tier 01: a remux by a listed group', () => {
    const f = preset('remux-tier-01').format
    const remux = (group: string) =>
      at(`Sintel.2010.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-${group}`, {
        releaseGroup: group,
        quality: { modifier: 'remux' },
      })
    expect(matchesFormat(f, remux('FraMeSToR'))).toBe(true)
    expect(matchesFormat(f, remux('NOBODY'))).toBe(false)
    expect(
      matchesFormat(f, at('Sintel.2010.1080p.BluRay-FraMeSToR', { releaseGroup: 'FraMeSToR' })),
    ).toBe(false)
  })

  test('BR-DISK and Language: Not Original', () => {
    expect(matchesFormat(preset('br-disk').format, at('Sintel.2010.COMPLETE.BLURAY-GRP'))).toBe(
      true,
    )
    const french = at('Sintel.2010.FRENCH.1080p.BluRay.x264-GRP', { languages: ['fr'] })
    expect(matchesFormat(preset('language-not-original').format, french)).toBe(true)
    expect(
      matchesFormat(preset('language-not-original').format, at('Sintel.2010.1080p.BluRay-GRP')),
    ).toBe(false)
  })
})

describe('seeded formats', () => {
  test('are the prototype’s four, with its ids and names', () => {
    const seeds = seedFormats()
    expect(seeds.map((f) => [f.id, f.name, f.source])).toEqual([
      ['cf-dv', 'Dolby Vision', 'preset'],
      ['cf-hdr10', 'HDR10', 'preset'],
      ['cf-x265', 'x265', 'preset'],
      ['cf-lq', 'Low-quality groups', 'preset'],
    ])
    for (const f of seeds) expect(validateFormat(f)).toEqual([])
  })

  test('match the prototype’s release names', () => {
    const [dv, hdr10, x265, lq] = seedFormats()
    const flux = {
      release: release('Sintel.2010.2160p.WEB-DL.DDP5.1.Atmos.DV.HDR.H.265-FLUX', {
        quality: { source: 'webdl', resolution: 2160 },
        releaseGroup: 'FLUX',
      }),
    }
    expect(dv && matchesFormat(dv, flux)).toBe(true)
    expect(hdr10 && matchesFormat(hdr10, flux)).toBe(true)
    expect(x265 && matchesFormat(x265, flux)).toBe(true)
    expect(lq && matchesFormat(lq, flux)).toBe(false)
    const yify = {
      release: release('Sintel.2010.1080p.BluRay.x264-YIFY', { releaseGroup: 'YIFY' }),
    }
    expect(lq && matchesFormat(lq, yify)).toBe(true)
    expect(dv && matchesFormat(dv, yify)).toBe(false)
  })
})

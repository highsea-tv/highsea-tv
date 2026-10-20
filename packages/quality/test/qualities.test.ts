// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import type { Modifier, Resolution, Source } from '@highsea/parser'
import {
  fromPrototypeQuality,
  QUALITIES,
  QUALITY_NAMES,
  qualityDefinition,
  qualityOf,
  qualityRank,
} from '../src/qualities.ts'

const of = (source: Source, resolution: Resolution | null, modifier: Modifier = 'none') =>
  qualityOf({ source, resolution, modifier })

describe('the vocabulary', () => {
  test('is ranked from Unknown to Remux-2160p, one definition per name', () => {
    expect(QUALITY_NAMES[0]).toBe('Unknown')
    expect(QUALITY_NAMES.at(-1)).toBe('Remux-2160p')
    expect(QUALITIES.map((q) => q.name)).toEqual([...QUALITY_NAMES])
    expect(qualityRank('Bluray-1080p')).toBeGreaterThan(qualityRank('WEBDL-1080p'))
    expect(qualityRank('WEBDL-1080p')).toBeGreaterThan(qualityRank('WEBRip-1080p'))
    expect(qualityRank('HDTV-2160p')).toBeGreaterThan(qualityRank('Remux-1080p'))
  })

  test('every definition maps back to its own name', () => {
    for (const q of QUALITIES) {
      if (q.source === 'unknown' || q.resolution === null) continue
      expect(of(q.source, q.resolution, q.modifier)).toBe(q.name)
    }
    expect(qualityDefinition('Remux-2160p')).toEqual({
      name: 'Remux-2160p',
      source: 'bluray',
      resolution: 2160,
      modifier: 'remux',
    })
  })
})

describe('qualityOf', () => {
  test.each([
    [of('bluray', 1080), 'Bluray-1080p'],
    [of('bluray', 2160, 'remux'), 'Remux-2160p'],
    [of('bluray', 1080, 'remux'), 'Remux-1080p'],
    [of('bluray', null, 'remux'), 'Remux-1080p'],
    [of('bluray', 1080, 'brdisk'), 'BR-DISK'],
    [of('bluray', 576), 'Bluray-576p'],
    [of('bluray', 540), 'Bluray-576p'],
    [of('bluray', 480), 'Bluray-480p'],
    [of('bluray', null), 'Bluray-480p'],
    [of('webdl', 2160), 'WEBDL-2160p'],
    [of('webrip', 720), 'WEBRip-720p'],
    [of('webdl', null), 'WEBDL-480p'],
    [of('webrip', 576), 'WEBRip-480p'],
    [of('tv', 1080), 'HDTV-1080p'],
    [of('tv', 1080, 'rawhd'), 'Raw-HD'],
    [of('tv', 480), 'SDTV'],
    [of('tv', null), 'SDTV'],
    [of('dvd', 480), 'DVD'],
    [of('dvd', null, 'remux'), 'DVD-R'],
    [of('dvd', 480, 'screener'), 'DVDSCR'],
    [of('dvd', 480, 'regional'), 'REGIONAL'],
    [of('cam', null), 'CAM'],
    [of('telesync', 720), 'TELESYNC'],
    [of('telecine', null), 'TELECINE'],
    [of('workprint', null), 'WORKPRINT'],
    [of('unknown', 1080), 'HDTV-1080p'],
    [of('unknown', 480), 'SDTV'],
    [of('unknown', null), 'Unknown'],
  ])('%s', (got, want) => expect<string>(got).toBe(want))
})

describe('the prototype’s quality strings', () => {
  test('map onto qualities and the WEB groups', () => {
    expect(fromPrototypeQuality('Bluray 1080p')).toEqual({
      name: 'Bluray-1080p',
      qualities: ['Bluray-1080p'],
    })
    expect(fromPrototypeQuality('Remux 2160p')?.name).toBe('Remux-2160p')
    expect(fromPrototypeQuality('HDTV 720p')?.name).toBe('HDTV-720p')
    expect(fromPrototypeQuality('DVD')?.name).toBe('DVD')
    expect(fromPrototypeQuality('SDTV')?.name).toBe('SDTV')
    expect(fromPrototypeQuality('CAM')?.name).toBe('CAM')
    expect(fromPrototypeQuality('WEB 1080p')).toEqual({
      name: 'WEB 1080p',
      qualities: ['WEBDL-1080p', 'WEBRip-1080p'],
    })
    expect(fromPrototypeQuality('Bluray-2160p')?.name).toBe('Bluray-2160p')
  })

  test('a profile name or a tag isn’t a quality', () => {
    expect(fromPrototypeQuality('HD 1080p')).toBeNull()
    expect(fromPrototypeQuality('4K')).toBeNull()
    expect(fromPrototypeQuality('HDR')).toBeNull()
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
// One block per field of ParsedRelease. The corpus test covers the breadth; these pin the rules.
import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_REVISION,
  languageCode,
  parse,
  parseLanguages,
  parseQuality,
  readEdition,
} from '../src/index.ts'

describe('title and year', () => {
  test('the title is what precedes the year', () => {
    const p = parse('The.Shawshank.Redemption.1994.1080p.BluRay.x264-SPARKS')
    expect(p.title).toBe('The Shawshank Redemption')
    expect(p.year).toBe(1994)
  })

  test('the title ends at the first tag when there is no year', () => {
    const p = parse('Arrival.1080p.BluRay.x264-SPARKS')
    expect(p.title).toBe('Arrival')
    expect(p.year).toBeNull()
  })

  test('titles that are or contain years keep them', () => {
    expect(parse('1917.2019.1080p.BluRay.x264-SPARKS')).toMatchObject({ title: '1917', year: 2019 })
    expect(parse('2012.2009.720p.BluRay.x264-SPARKS')).toMatchObject({ title: '2012', year: 2009 })
    expect(parse('Blade.Runner.2049.2017.2160p.UHD.BluRay.x265-TERMiNAL')).toMatchObject({
      title: 'Blade Runner 2049',
      year: 2017,
    })
    expect(parse('Wonder Woman 1984 (2020) [1080p] [WEBRip]')).toMatchObject({
      title: 'Wonder Woman 1984',
      year: 2020,
    })
  })

  test('spaced names keep the title’s own punctuation', () => {
    expect(parse('Mr. Nobody (2009) 1080p BluRay x264').title).toBe('Mr. Nobody')
    expect(parse('L.A.Confidential.1997.1080p.BluRay.x264-SiNNERS').title).toBe('L.A. Confidential')
  })

  test('a leading fansub group and a site prefix are not the title', () => {
    expect(parse('[YTS.MX] Heat (1995) [1080p] [BluRay]').title).toBe('Heat')
    expect(parse('www.Torrenting.com - Heat.1995.1080p.BluRay.x264-SADPANDA').title).toBe('Heat')
  })

  test('a title in two scripts keeps the Latin one', () => {
    expect(parse('Голубая волна / Blue Crush (2002) BDRip 1080p').title).toBe('Blue Crush')
  })

  test('a date is an air date, not a year', () => {
    expect(parse('The.Daily.Show.2019.10.25.720p.WEB.x264-TBS').year).toBeNull()
  })
})

describe('quality', () => {
  test('source and resolution in Radarr’s vocabulary', () => {
    expect(parseQuality('Heat.1995.1080p.BluRay.x264-SADPANDA')).toMatchObject({
      source: 'bluray',
      resolution: 1080,
      modifier: 'none',
    })
    expect(parseQuality('Heat.1995.2160p.WEB-DL.DDP5.1.HEVC-FLUX')).toMatchObject({
      source: 'webdl',
      resolution: 2160,
    })
    expect(parseQuality('Heat.1995.1080p.WEBRip.x264-RARBG').source).toBe('webrip')
    expect(parseQuality('Heat.1995.HDTV.x264-LOL')).toMatchObject({
      source: 'tv',
      resolution: null,
    })
  })

  test('remux, BR-DISK, DVD-R and regional', () => {
    expect(parseQuality('Heat.1995.1080p.BluRay.REMUX.AVC.DTS-HD.MA.5.1-FGT')).toMatchObject({
      source: 'bluray',
      modifier: 'remux',
    })
    expect(parseQuality('Heat.1995.COMPLETE.UHD.BLURAY-GUHZER')).toMatchObject({
      source: 'bluray',
      resolution: 2160,
      modifier: 'brdisk',
    })
    expect(parseQuality('Heat.1995.PAL.DVDR-NORDiC')).toMatchObject({
      source: 'dvd',
      modifier: 'remux',
    })
    expect(parseQuality('Heat.1995.R5.LINE.XviD-REGIONAL')).toMatchObject({
      source: 'dvd',
      modifier: 'regional',
    })
  })

  test('pre-release sources win over anything else in the name', () => {
    expect(parseQuality('Heat.1995.HDCAM.x264').source).toBe('cam')
    expect(parseQuality('Heat.1995.TELESYNC.XviD-AXXO').source).toBe('telesync')
    expect(parseQuality('Heat.1995.DVDSCR.XviD-MAXSPEED')).toMatchObject({
      source: 'dvd',
      modifier: 'screener',
    })
  })

  test('resolution from dimensions, by width', () => {
    expect(parseQuality('Heat 1995 BDRip 1920x800').resolution).toBe(1080)
    expect(parseQuality('Heat 1995 BDRip 1280x544').resolution).toBe(720)
  })

  test('revisions count PROPER, REPACK and v2 up, and REAL separately', () => {
    expect(parseQuality('Heat.1995.1080p.BluRay.x264-SADPANDA').revision).toEqual(DEFAULT_REVISION)
    expect(parseQuality('Heat.1995.PROPER.1080p.BluRay.x264-SADPANDA').revision).toEqual({
      version: 2,
      real: 0,
      proper: true,
      repack: false,
    })
    expect(parseQuality('Heat.1995.REPACK2.1080p.BluRay.x264-SADPANDA').revision.version).toBe(3)
    expect(parseQuality('Heat.1995.REAL.PROPER.1080p.BluRay.x264-SADPANDA').revision.real).toBe(1)
    expect(parseQuality('Heat.1995.1080p.BluRay.x264.v2-SADPANDA').revision.version).toBe(2)
  })
})

describe('edition', () => {
  test('edition tags as written', () => {
    expect(parse('Aliens.1986.Special.Edition.1080p.BluRay.x264-SADPANDA').edition).toBe(
      'Special Edition',
    )
    expect(parse('Amadeus.1984.DC.1080p.BluRay.x264-CiNEFiLE').edition).toBe('DC')
    expect(parse('Heat.1995.1080p.BluRay.x264-SADPANDA').edition).toBeNull()
    expect(readEdition('Extended Directors Cut 1080p')).toBe('Extended Directors Cut')
  })

  test('an edition word inside the title is not an edition', () => {
    const p = parse('Extended.Family.2010.1080p.WEB-DL.H264-NTb')
    expect(p.title).toBe('Extended Family')
    expect(p.edition).toBeNull()
  })

  test('an edition phrase before the year ends the title', () => {
    const p = parse('Kingdom.of.Heaven.Directors.Cut.2005.1080p.BluRay.x264-HiDt')
    expect(p.title).toBe('Kingdom of Heaven')
    expect(p.year).toBe(2005)
    expect(p.edition).toBe('Directors Cut')
  })
})

describe('languages', () => {
  test('ISO 639-1 codes, in order', () => {
    expect(parse('Amélie.2001.FRENCH.1080p.BluRay.x264-LOST').languages).toEqual(['fr'])
    expect(parse('Arrival 2016 1080p BluRay x264 [Eng Fre Ger]').languages).toEqual([
      'en',
      'fr',
      'de',
    ])
    expect(languageCode('GERMAN')).toBe('de')
    expect(languageCode('nonsense')).toBeNull()
  })

  test('MULTi and DUAL say more than one audio language without naming them', () => {
    expect(parseLanguages('Amélie.2001.MULTi.1080p.BluRay.x264-LOST')).toEqual({
      languages: [],
      multi: true,
    })
    expect(parse('Leon.1994.GERMAN.DL.1080p.BluRay.x264-DETAiLS')).toMatchObject({
      languages: ['de'],
      multi: true,
    })
  })

  test('subtitle tags are kept apart from audio', () => {
    expect(parse('Insomnia.1997.SWESUB.720p.BluRay.x264-NORDiC')).toMatchObject({
      languages: [],
      subtitles: ['sv'],
    })
    expect(parse('La.Haine.1995.FRENCH.VOSTFR.1080p.BluRay.x264-FiDELiO')).toMatchObject({
      languages: ['fr'],
      subtitles: ['fr'],
    })
  })

  test('a language word in the title is not a tag', () => {
    const p = parse('The.French.Connection.1971.1080p.BluRay.x264-AMIABLE')
    expect(p.title).toBe('The French Connection')
    expect(p.languages).toEqual([])
  })
})

describe('release group', () => {
  test('the -GROUP suffix', () => {
    expect(parse('Heat.1995.1080p.BluRay.x264-SADPANDA').releaseGroup).toBe('SADPANDA')
    expect(parse('Heat.1995.1080p.BluRay.DTS.x264-D-Z0N3').releaseGroup).toBe('D-Z0N3')
  })

  test('extensions, retags and posters’ suffixes are not the group', () => {
    expect(parse('Heat.1995.1080p.BluRay.x264-SADPANDA.mkv').releaseGroup).toBe('SADPANDA')
    expect(parse('Heat.1995.1080p.BluRay.x264-SADPANDA[rarbg]').releaseGroup).toBe('SADPANDA')
    expect(parse('Heat.1995.1080p.BluRay.x264-SADPANDA-Obfuscated').releaseGroup).toBe('SADPANDA')
  })

  test('no hyphen, no group', () => {
    expect(parse('Heat 1995 1080p BluRay x264').releaseGroup).toBeNull()
  })
})

describe('hardcoded subs', () => {
  test('HC and the language-SUB forms', () => {
    expect(parse('Parasite.2019.HC.1080p.WEBRip.x264-RARBG').hardcodedSubs).toBe('HC')
    expect(parse('Parasite.2019.KORSUB.1080p.WEBRip.x264-RARBG').hardcodedSubs).toBe('KORSUB')
    expect(parse('Parasite.2019.1080p.BluRay.x264-REGRET').hardcodedSubs).toBeNull()
  })
})

describe('ids', () => {
  test('Radarr’s id tokens and a bare IMDb id', () => {
    expect(parse('Heat (1995) {imdb-tt0113277} [Bluray-1080p]').ids).toEqual({
      imdb: 'tt0113277',
      tmdb: null,
    })
    expect(parse('Heat (1995) [imdbid-tt0113277] [tmdbid-949]').ids).toEqual({
      imdb: 'tt0113277',
      tmdb: 949,
    })
    expect(parse('Heat.1995.tt0113277.1080p.BluRay.x264-SADPANDA').ids.imdb).toBe('tt0113277')
    expect(parse('Heat.1995.1080p.BluRay.x264-SADPANDA').ids).toEqual({ imdb: null, tmdb: null })
  })
})

describe('codec, dynamic range and 3D', () => {
  test('codec in any spelling', () => {
    expect(parse('Heat.1995.1080p.BluRay.x264-SADPANDA').codec).toBe('avc')
    expect(parse('Heat.1995.1080p.WEB-DL.H.264-NTb').codec).toBe('avc')
    expect(parse('Heat.1995.2160p.WEB-DL.HEVC-FLUX').codec).toBe('hevc')
    expect(parse('Heat.1995.1080p.WEB-DL.AV1-Vyndros').codec).toBe('av1')
    expect(parse('Heat.1995.DVDRip.XviD-DiAMOND').codec).toBe('xvid')
    expect(parse('Heat.1995.1080p.BluRay').codec).toBeNull()
  })

  test('HDR formats in order', () => {
    expect(parse('Heat.1995.2160p.BluRay.REMUX.HEVC.DV.HDR10-FraMeSToR').hdr).toEqual([
      'dv',
      'hdr10',
    ])
    expect(parse('Heat.1995.2160p.WEB-DL.HDR10+.HEVC-FLUX').hdr).toEqual(['hdr10plus'])
    expect(parse('Heat.1995.1080p.BluRay.x264-SADPANDA').hdr).toEqual([])
  })

  test('3D', () => {
    expect(parse('Avatar.2009.1080p.BluRay.3D.Half-SBS.x264-CHD').threeD).toBe(true)
    expect(parse('Avatar.2009.1080p.BluRay.x264-CHD').threeD).toBe(false)
  })
})

test('pure: the same name always parses the same', () => {
  const name = 'Heat.1995.REPACK.1080p.BluRay.x264-SADPANDA'
  expect(parse(name)).toEqual(parse(name))
  expect(parse(name).name).toBe(name)
})

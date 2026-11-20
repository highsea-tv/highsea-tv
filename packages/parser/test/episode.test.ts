// SPDX-License-Identifier: AGPL-3.0-only
// Seasons and episodes (ADR 0064). The cases are written for highsea in the shapes Sonarr's own
// parser tests cover (single, multi-episode in each of its naming styles, `1x01`, specials, packs,
// and names that aren't episodes), and in the shapes the owner's library has (phase-5-real-use.md,
// What the owner's library looks like). Sonarr's fixtures aren't copied.
import { describe, expect, test } from 'bun:test'
import { parseEpisode, parseSeasonFolder, parseShowFolder } from '../src/index.ts'

const numbering = (name: string) => {
  const p = parseEpisode(name)
  return p && { season: p.season, episodes: p.episodes, fullSeason: p.fullSeason }
}

describe('one episode', () => {
  test.each([
    ['Brooklyn Nine-Nine - S01E01 - Pilot.mkv', 'Brooklyn Nine-Nine', 1, 1],
    ['Show.Name.S01E05.720p.HDTV.x264-GROUP', 'Show Name', 1, 5],
    ['show.name.s03e12.hdtv.xvid-group.avi', 'show name', 3, 12],
    ['Show Name S2E7 1080p WEB-DL', 'Show Name', 2, 7],
    ['Show Name - S01 E02 - Title', 'Show Name', 1, 2],
    ['Show.Name.S10E100.1080p.WEB.h264-GROUP', 'Show Name', 10, 100],
    ['[Group] Show Name - S01E03 [1080p].mkv', 'Show Name', 1, 3],
    // the owner's NAS: an EP before the number
    ['The.Silent.Sea.S01EP01.WEBRip.1080p.x264.mp4', 'The Silent Sea', 1, 1],
  ])('%s', (name, title, season, episode) => {
    expect(parseEpisode(name)).toEqual({
      title,
      year: null,
      season,
      episodes: [episode],
      fullSeason: false,
      seasons: [season],
    })
  })

  test('the episode’s own title may start with a number, after a spaced hyphen', () => {
    expect(numbering('Show Name - S01E01 - 24 Hours [WEBDL-1080p].mkv')).toEqual({
      season: 1,
      episodes: [1],
      fullSeason: false,
    })
    expect(numbering('Show Name - S02E04 - 3-2-1.mkv')?.episodes).toEqual([4])
  })

  test('a quality right after the number isn’t a range', () => {
    expect(numbering('Show.Name.S01E01-1080p.mkv')?.episodes).toEqual([1])
    expect(numbering('Show.Name.S01E01-720p-GROUP')?.episodes).toEqual([1])
  })

  test('titles that are numbers keep them', () => {
    expect(parseEpisode('9-1-1 - S01E01 - Pilot.mkv')?.title).toBe('9-1-1')
    expect(parseEpisode('24 - S08E24 - 3-00 PM - 4-00 PM.mkv')?.title).toBe('24')
    expect(parseEpisode('The 100 - S01E01 - Pilot.mkv')?.title).toBe('The 100')
    expect(parseEpisode('1923 - S01E01 - 1923.mkv')).toMatchObject({ title: '1923', year: null })
  })

  test('a year beside the title is the show’s', () => {
    expect(parseEpisode('Doctor Who (2005) - S01E01 - Rose.mkv')).toMatchObject({
      title: 'Doctor Who',
      year: 2005,
      season: 1,
      episodes: [1],
    })
    expect(parseEpisode('Show.Name.2019.S02E03.1080p.WEB')).toMatchObject({
      title: 'Show Name',
      year: 2019,
    })
  })

  test('seasons numbered by year, as Sonarr allows', () => {
    expect(numbering('Show.Name.S2010E01.720p.HDTV')).toEqual({
      season: 2010,
      episodes: [1],
      fullSeason: false,
    })
  })
})

describe('specials', () => {
  test('season 0', () => {
    expect(numbering('The Office - S00E01 - Christmas Special Part 1.mkv')).toEqual({
      season: 0,
      episodes: [1],
      fullSeason: false,
    })
    expect(numbering('Show.Name.S00E12.Behind.the.Scenes.720p')?.season).toBe(0)
  })
})

describe('several episodes in one file', () => {
  test.each([
    // Repeat
    ['Show Name - S01E01E02 - Title.mkv', [1, 2]],
    ['Show.Name.S02E03E04E05.720p.HDTV', [3, 4, 5]],
    // Scene
    ['Show Name - S01E01-E02 - Title.mkv', [1, 2]],
    ['Show Name - S01E01-E02-E03 - Title.mkv', [1, 2, 3]],
    // Range and Prefixed Range: the episodes between are in it too
    ['Show Name - S01E01-03 - Title.mkv', [1, 2, 3]],
    ['Show Name - S01E10-E12 - Title.mkv', [10, 11, 12]],
    // Extend
    ['Show Name - S01E01-02-03 - Title.mkv', [1, 2, 3]],
    // Duplicate
    ['Show.Name.S01E01.S01E02.720p.HDTV', [1, 2]],
    ['Show Name - S01E05 - S01E06 - Title.mkv', [5, 6]],
    // lower case
    ['show.name.s01e01e02.hdtv', [1, 2]],
  ])('%s', (name, episodes) => {
    expect(numbering(name)).toEqual({
      season: 1 + (name.includes('S02') ? 1 : 0),
      episodes,
      fullSeason: false,
    })
  })

  test('a number that goes backwards or another season’s episode ends it', () => {
    expect(numbering('Show.Name.S01E05E03.720p')?.episodes).toEqual([5])
    expect(numbering('Show.Name.S01E01.S02E01.720p')?.episodes).toEqual([1])
  })

  test('a range too long to be one is left as the first episode', () => {
    expect(numbering('Show.Name.S01E01-E99.720p')?.episodes).toEqual([1])
  })
})

describe('the 1x01 style', () => {
  test.each([
    ['Show Name - 1x01 - Pilot.mkv', 1, [1]],
    ['Show.Name.3x12.HDTV.XviD-GROUP', 3, [12]],
    ['Show Name - 1x01x02 - Title.mkv', 1, [1, 2]],
    ['Show Name - 1x01-02 - Title.mkv', 1, [1, 2]],
    ['Show Name - 2x05 - 2x06 - Title.mkv', 2, [5, 6]],
    ['Show Name - 0x03 - Special.mkv', 0, [3]],
  ])('%s', (name, season, episodes) => {
    expect(numbering(name)).toEqual({ season, episodes, fullSeason: false })
  })

  test('a resolution isn’t one', () => {
    expect(parseEpisode('Movie.Name.2019.1920x1080.BluRay.x264')).toBeNull()
  })
})

describe('full-season packs', () => {
  test.each([
    ['Show.Name.S01.1080p.BluRay.x264-GROUP', [1]],
    ['Show Name S03 Complete 720p WEB-DL', [3]],
    ['Show Name Season 2 Complete 1080p', [2]],
    ['Show.Name.Season.04.720p.HDTV', [4]],
    ['Show.Name.S01-S03.1080p.BluRay', [1, 2, 3]],
    ['Show.Name.S01-03.720p.WEB-DL', [1, 2, 3]],
    ['Show Name Seasons 1-4 1080p', [1, 2, 3, 4]],
    ['Show.Name.S00.Specials.720p', [0]],
  ])('%s', (name, seasons) => {
    expect(parseEpisode(name)).toMatchObject({
      season: seasons[0],
      seasons,
      episodes: [],
      fullSeason: true,
    })
  })

  test('the title is what precedes the season', () => {
    expect(parseEpisode('Show.Name.S01.1080p.BluRay.x264-GROUP')?.title).toBe('Show Name')
  })
})

describe('names that aren’t episodes this parser reads', () => {
  test.each([
    // films
    ['The.Shawshank.Redemption.1994.1080p.BluRay.x264-SPARKS'],
    ['Zootopia 2 (2025) [tmdb-1084242] - [Bluray-1080p][AAC 5.1][x264]-GROUP.mkv'],
    // daily numbering waits for its phase
    ['Show.Name.2019.10.25.720p.HDTV.x264-GROUP'],
    ['Show Name - 2019-10-25 - Guest.mkv'],
    // absolute numbering is anime's
    ['[SubsPlease] Show Name - 05 [1080p].mkv'],
    ['Show Name - 105 - Title.mkv'],
  ])('%s', (name) => {
    expect(parseEpisode(name)).toBeNull()
  })
})

describe('season folders', () => {
  test.each([
    ['Season 01', 1],
    ['Season 1', 1],
    ['Season 12', 12],
    ['Season 00', 0],
    ['Specials', 0],
    ['Special', 0],
    ['season 3', 3],
    ['S02', 2],
    ['Season 2010', 2010],
    ['Series 2', 2],
  ])('%s is season %i', (name, season) => {
    expect(parseSeasonFolder(name)).toBe(season)
  })

  test.each([['Extras'], ['Featurettes'], ['Season'], ['Season 1 Extras'], ['Subs']])(
    '%s is no season',
    (name) => {
      expect(parseSeasonFolder(name)).toBeNull()
    },
  )
})

describe('show folders', () => {
  test('Sonarr’s {Series TitleYear} with [tvdb-…]', () => {
    expect(parseShowFolder('Brooklyn Nine-Nine (2013) [tvdb-269586]')).toEqual({
      title: 'Brooklyn Nine-Nine',
      year: 2013,
      ids: { tvdb: 269586, tmdb: null, imdb: null },
    })
  })

  test('a title alone, or with its year', () => {
    expect(parseShowFolder('Brooklyn Nine-Nine')).toEqual({
      title: 'Brooklyn Nine-Nine',
      year: null,
      ids: { tvdb: null, tmdb: null, imdb: null },
    })
    expect(parseShowFolder('Doctor Who (2005)')).toMatchObject({ title: 'Doctor Who', year: 2005 })
    expect(parseShowFolder('1923 (2022)')).toMatchObject({ title: '1923', year: 2022 })
    expect(parseShowFolder('1923')).toMatchObject({ title: '1923', year: null })
  })

  test('the ids each app writes', () => {
    expect(parseShowFolder('Show Name [tvdbid-81189]').ids.tvdb).toBe(81189)
    expect(parseShowFolder('Show Name {tvdb-81189}').ids.tvdb).toBe(81189)
    expect(parseShowFolder('Show Name (2008) [tmdbid-1396]')).toEqual({
      title: 'Show Name',
      year: 2008,
      ids: { tvdb: null, tmdb: 1396, imdb: null },
    })
    expect(parseShowFolder('Show Name (2008) {imdb-tt0903747}').ids.imdb).toBe('tt0903747')
    expect(parseShowFolder('Show Name (2008) [tvdb-81189] [imdbid-tt0903747]')).toEqual({
      title: 'Show Name',
      year: 2008,
      ids: { tvdb: 81189, tmdb: null, imdb: 'tt0903747' },
    })
  })
})

// HT-110: fresh names in the shapes the TV and anime indexers write, each seen in that site's own
// answer on 2026-11-19 (EZTV's API, showRSS's and SubsPlease's feeds, Nyaa's search feed). The show
// names are made up.
describe('the TV and anime sites’ shapes', () => {
  test.each([
    // EZTV's `title`, after the definition drops its trailing " EZTV"
    ['Harbour Lights S03E07 1080p HEVC x265-GROUP', 'Harbour Lights', 3, [7]],
    ['Harbour Lights S03E07 480p x264-mSD', 'Harbour Lights', 3, [7]],
    // showRSS's `tv:raw_title`, and its own title
    ['Harbour Lights S03E07 720p HDTV H264 GROUP', 'Harbour Lights', 3, [7]],
    ['Harbour Lights 3x07 Episode 7 720p', 'Harbour Lights', 3, [7]],
    // SubsPlease and Nyaa: an episode after the season
    ['[SubsPlease] Kumo no Michi S2 - 07 (1080p) [0A1B2C3D].mkv', 'Kumo no Michi', 2, [7]],
    ['[SubsPlease] Kumo no Michi S2 - 07v2 (720p) [0A1B2C3D].mkv', 'Kumo no Michi', 2, [7]],
    [
      '[Group] Kumo no Michi 2nd Season - 05 [1080p WEBRip HEVC AAC][ABCD1234]',
      'Kumo no Michi',
      2,
      [5],
    ],
    ['[Group] Kumo no Michi Season 3 - 11 [1080p]', 'Kumo no Michi', 3, [11]],
    ['[Group] Kumo no Michi S01E05 [1080p] [HEVC WEBRip]', 'Kumo no Michi', 1, [5]],
  ])('%s', (name, title, season, episodes) => {
    expect(parseEpisode(name)).toMatchObject({ title, season, episodes, fullSeason: false })
  })

  test.each([
    [
      '[Group] Kumo no Michi 2nd Season [1080p WEBRip HEVC AAC][MultiSub] (Batch)',
      'Kumo no Michi',
      2,
    ],
    ['[Group] Kumo no Michi (Season 1) [1080p][HEVC x265 10bit] (Batch)', 'Kumo no Michi', 1],
    [
      'Road of Clouds (Kumo no Michi) - S01 (WEB-DL 720p) (English dub)',
      'Road of Clouds (Kumo no Michi)',
      1,
    ],
  ])('a season pack: %s', (name, title, season) => {
    expect(parseEpisode(name)).toMatchObject({ title, season, episodes: [], fullSeason: true })
  })

  // a bare number may count from the show's first episode or the season's: anime's own part
  test.each([
    ['[SubsPlease] Kumo no Michi - 07 (1080p) [0A1B2C3D].mkv'],
    ['[Group] Kumo no Michi - 1100 [1080p HEVC x265 10Bit][AAC]'],
    ['[Group] Kumo no Michi - 01 ~ 12 [1080p][Multiple Subtitle]'],
  ])('an absolute number gives null: %s', (name) => {
    expect(parseEpisode(name)).toBeNull()
  })

  test('a resolution after a season’s hyphen isn’t an episode', () => {
    expect(numbering('Kumo no Michi S2 - 1080p')).toEqual({
      season: 2,
      episodes: [],
      fullSeason: true,
    })
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
// The shows pages' rules and words (@highsea-tv/client/shows), as the prototype had them.
import { describe, expect, test } from 'bun:test'
import {
  ALL_SHOW_GENRES,
  arrangeShows,
  createShowsText,
  seasonOf,
  showGenresOf,
} from '../src/shows/index.ts'

const show = (title: string, o: Partial<Parameters<typeof arrangeShows>[0][number]> = {}) => ({
  title,
  sortTitle: title.replace(/^The /, ''),
  genres: ['Drama'],
  watched: false,
  addedAt: '2026-01-01T00:00:00.000Z',
  year: 2020,
  rating: 3,
  ...o,
})

const text = createShowsText('en')

describe('arrangeShows', () => {
  const shows = [
    show('The Lantern Keepers', { year: 2019, rating: 4, addedAt: '2026-03-01T00:00:00.000Z' }),
    show('Saltmarsh', { genres: ['Comedy'], watched: true, year: 2022 }),
    show('Amber Line', { rating: 5 }),
  ]
  test('sorts by title without "The", newest, added and rating', () => {
    const titles = (sort: Parameters<typeof arrangeShows>[2]) =>
      arrangeShows(shows, ALL_SHOW_GENRES, sort).map((s) => s.title)
    expect(titles('title')).toEqual(['Amber Line', 'The Lantern Keepers', 'Saltmarsh'])
    expect(titles('year')).toEqual(['Saltmarsh', 'Amber Line', 'The Lantern Keepers'])
    expect(titles('added')[0]).toBe('The Lantern Keepers')
    expect(titles('rating')[0]).toBe('Amber Line')
  })
  test('filters by genre and unwatched', () => {
    expect(arrangeShows(shows, 'Comedy', 'title').map((s) => s.title)).toEqual(['Saltmarsh'])
    expect(arrangeShows(shows, ALL_SHOW_GENRES, 'title', true)).toHaveLength(2)
    expect(showGenresOf(shows)).toEqual(['Comedy', 'Drama'])
  })
})

describe('the words', () => {
  test('years, codes and places', () => {
    expect(text.showYears({ year: 2019, endYear: null })).toBe('2019–present')
    expect(text.showYears({ year: 2015, endYear: 2021 })).toBe('2015–2021')
    expect(text.showYears({ year: 2020, endYear: 2020 })).toBe('2020')
    expect(text.episodeCode({ season: 2, number: 6 })).toBe('S2, E6')
    expect(text.episodeCode({ season: 0, number: 1 })).toBe('Special 1')
    expect(text.episodePlace({ season: 2, number: 6 })).toBe('Season 2, Episode 6')
    expect(text.seasonsCount(1)).toBe('1 season')
    expect(text.episodesCount(12)).toBe('12 episodes')
    expect(text.showsCount(3)).toBe('3 shows')
  })
  test('Play, its line, an episode’s time and the meta line', () => {
    const episode = { season: 2, number: 6 }
    expect(text.playLabel({ kind: 'resume', episode })).toBe('Resume S2, E6')
    expect(text.playLabel({ kind: 'next', episode })).toBe('Play S2, E6')
    expect(text.nextLine({ kind: 'again' })).toBe('Watch again')
    expect(text.episodeTime({ progress: 0.5, runtimeMinutes: 42 })).toBe('21 min left')
    expect(text.episodeTime({ progress: null, runtimeMinutes: 42 })).toBe('42 min')
    expect(text.airedDate('2024-03-12')).toBe('12 Mar 2024')
    expect(text.showMeta({ seasons: 3, year: 2019, endYear: null, genres: ['Drama'] })).toBe(
      '3 seasons · 2019–present · Drama',
    )
  })
  test('the sorts and filters', () => {
    expect(text.sorts.map((s) => s.label)).toEqual([
      'Title',
      'Recently added',
      'Newest first',
      'Highest rated',
    ])
    expect(text.filters.map((s) => s.label)).toEqual(['All shows', 'Unwatched'])
  })
})

describe('seasonOf', () => {
  const seasons = [
    { number: 1, episodes: [{ id: 'a' }, { id: 'b' }] },
    { number: 2, episodes: [{ id: 'c' }] },
  ]
  test('opens at the episode’s season, else the fallback', () => {
    expect(seasonOf(seasons, 'c', 1)).toEqual({ episode: 'c', season: 2 })
    expect(seasonOf(seasons, 'z', 1)).toEqual({ episode: null, season: 1 })
    expect(seasonOf(seasons, undefined, 2)).toEqual({ episode: null, season: 2 })
  })
})

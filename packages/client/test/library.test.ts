// SPDX-License-Identifier: AGPL-3.0-only
// C3 Library's arranging (client-library.md), shared by the web and the phone, and the words the
// title and person pages and Continue watching's menu share (apps-catch-up.md › A.1).
import { describe, expect, test } from 'bun:test'
import type { ClientItem } from '@highsea-tv/api-contract'
import {
  ALL,
  arrange,
  createLibraryText,
  type FactCredit,
  filmographyOf,
  genresOf,
  LETTERS,
  letterOf,
  peopleOf,
  previewOf,
  videoLength,
} from '../src/library/index.ts'

const item = (id: number, title: string, x: Partial<ClientItem> = {}) =>
  ({
    id,
    title,
    year: 2000 + id,
    genres: [],
    rating: id,
    addedAt: `2026-10-${String(10 + id).padStart(2, '0')}T00:00:00.000Z`,
    watched: false,
    ...x,
  }) as ClientItem

const items = [
  item(1, 'The Matrix', { genres: ['Science Fiction', 'Action'], watched: true }),
  item(2, 'Arrival', { genres: ['Science Fiction', 'Drama'] }),
  item(3, 'Big Buck Bunny', { genres: ['Animation', 'Comedy'], year: null }),
  item(4, 'a Quiet Place', { genres: ['Horror'] }),
]
const titles = (xs: ClientItem[]) => xs.map((x) => x.title)

describe('library', () => {
  test('sorts by title without a leading article, as the admin files them', () => {
    expect(titles(arrange(items, ALL, 'title'))).toEqual([
      'Arrival',
      'Big Buck Bunny',
      'The Matrix',
      'a Quiet Place',
    ])
  })

  test('newest added first, newest year first with no year last, best rated first', () => {
    expect(titles(arrange(items, ALL, 'added'))[0]).toBe('a Quiet Place')
    expect(titles(arrange(items, ALL, 'year')).at(-1)).toBe('Big Buck Bunny')
    expect(titles(arrange(items, ALL, 'rating'))[0]).toBe('a Quiet Place')
  })

  test('a genre, and Unwatched, narrow it', () => {
    expect(titles(arrange(items, 'Science Fiction', 'title'))).toEqual(['Arrival', 'The Matrix'])
    expect(titles(arrange(items, 'Science Fiction', 'title', true))).toEqual(['Arrival'])
  })

  test('leaves the list it was given as it was', () => {
    const before = titles(items)
    arrange(items, ALL, 'rating')
    expect(titles(items)).toEqual(before)
  })

  test('the genres, each once, in order', () => {
    expect(genresOf(items)).toEqual([
      'Action',
      'Animation',
      'Comedy',
      'Drama',
      'Horror',
      'Science Fiction',
    ])
  })

  test('the letter a title files under, by its sort title', () => {
    expect(LETTERS).toHaveLength(27)
    expect(letterOf('The Matrix')).toBe('M')
    expect(letterOf('an American Werewolf in London')).toBe('A')
    expect(letterOf('12 Angry Men')).toBe('#')
    expect(letterOf('Amélie')).toBe('A')
  })

  test('the sorts and Show, in the menu’s order and words', () => {
    const text = createLibraryText('en')
    expect(text.sorts).toEqual([
      { value: 'title', label: 'Title' },
      { value: 'added', label: 'Recently added' },
      { value: 'year', label: 'Newest first' },
      { value: 'rating', label: 'Highest rated' },
    ])
    expect(text.shows.map((x) => x.label)).toEqual(['All movies', 'Unwatched'])
  })
})

describe('the title and person pages’ words', () => {
  const text = createLibraryText('en')
  const credit = (personId: number, name: string, x: Partial<FactCredit> = {}): FactCredit => ({
    personId,
    name,
    character: null,
    job: null,
    ...x,
  })
  const film = {
    item: { title: 'Sintel', releaseDate: '2010-09-27', runtimeMinutes: 15, genres: ['Animation'] },
    certification: null,
    directors: [credit(1, 'Colin Levy', { job: 'Director' })],
    crew: [
      credit(1, 'Colin Levy', { job: 'Director' }),
      credit(2, 'Esther Wouda', { job: 'Screenplay' }),
    ],
    studios: ['Blender Foundation'],
    originalTitle: 'Sintel',
    versions: [
      {
        label: '1080p',
        audio: [{ language: 'en' }],
        subtitles: [{ language: 'en' }, { language: 'de' }],
      },
      { label: '4K', audio: [{ language: 'en' }], subtitles: [] },
    ],
  }

  test('Information leaves out what isn’t known, and says when it isn’t rated', () => {
    expect(text.informationOf(film)).toEqual([
      ['Released', '27 September 2010'],
      ['Runtime', '15m'],
      ['Rated', 'Not rated'],
      ['Genres', 'Animation'],
      ['Directed by', 'Colin Levy'],
      ['Written by', 'Esther Wouda'],
      ['Studio', 'Blender Foundation'],
    ])
  })

  test('each language once, by name', () => {
    expect(text.languagesOf(film)).toEqual([
      ['Versions', '1080p, 4K'],
      ['Audio', 'English'],
      ['Subtitles', 'English, German'],
    ])
    expect(text.languagesOf({ versions: [{ label: 'SD', audio: [], subtitles: [] }] })).toEqual([
      ['Versions', 'SD'],
      ['Audio', 'None listed'],
      ['Subtitles', 'None'],
    ])
  })

  test('cast and crew in one row, a director once', () => {
    const cast = [credit(3, 'Halina Reijn', { character: 'Sintel' })]
    const row = peopleOf({ cast, directors: film.directors, crew: film.crew })
    expect(row.map((c) => c.name)).toEqual(['Halina Reijn', 'Colin Levy', 'Esther Wouda'])
    expect(row.map(text.role)).toEqual(['Sintel', 'Director', 'Writer'])
    expect(text.roleNames('Director, Original Music Composer')).toBe('Director, Music')
  })

  test('a person’s page: what’s here and their life', () => {
    expect(text.hereOf({ films: 3 })).toBe('3 movies here')
    expect(text.hereOf({ films: 3, shows: 2, albums: 1 })).toBe(
      '3 movies, 2 shows and 1 album here',
    )
    expect(
      text.lifeOf({
        born: { date: '1895-10-04', place: 'Piqua, Kansas, USA' },
        died: { date: '1966-02-01' },
      }),
    ).toBe('Born 4 October 1895 in Piqua, Kansas, USA · Died 1 February 1966')
    expect(text.lifeOf({ born: null, died: null })).toBeNull()
  })

  test('Continue watching’s menu for a film and for an episode', () => {
    expect(text.continueMenu({ id: 45745, title: 'Sintel' })).toEqual({
      goTo: { label: 'Go to the film', path: '/movies/45745' },
      markWatched: 'Mark as watched',
      remove: 'Remove from Continue watching',
      marked: 'Sintel marked as watched',
      removed: {
        title: 'Sintel removed from Continue watching',
        description: 'It isn’t marked as watched.',
      },
    })
    const episode = text.continueMenu({
      id: 'e1',
      title: 'Pilot',
      show: { id: 's1', title: 'Harbor', code: 'S1 E1' },
    })
    expect(episode.goTo).toEqual({ label: 'Go to the show', path: '/shows/s1/episodes/e1' })
    expect(episode.marked).toBe('Harbor, S1 E1 marked as watched')
  })

  test('the trailer and its length', () => {
    expect(
      previewOf({ videos: [{ kind: 'Clip' }, { kind: 'Teaser' }, { kind: 'Trailer' }] }),
    ).toEqual({ kind: 'Teaser' })
    expect(videoLength(124)).toBe('2:04')
  })
})

describe('filmographyOf', () => {
  const credit = (
    id: number,
    department: string,
    role: string,
    year: number,
    inLibrary = true,
  ) => ({
    id,
    year,
    inLibrary,
    role,
    department,
  })

  test('puts the known-for department first, newest first, leaving out films not here', () => {
    const rows = filmographyOf(
      [
        credit(1, 'Acting', 'Rick', 1990),
        credit(2, 'Directing', 'Director', 2001),
        credit(3, 'Directing', 'Director', 2010),
        credit(4, 'Directing', 'Director', 2020, false),
      ],
      'Directing',
    )
    expect(rows.map((r) => r.department)).toEqual(['Directing', 'Acting'])
    expect(rows[0]?.credits.map((c) => c.item.id)).toEqual([3, 2])
  })

  test('joins a film’s roles in one department', () => {
    const rows = filmographyOf(
      [credit(1, 'Writing', 'Screenplay', 2000), credit(1, 'Writing', 'Story', 2000)],
      null,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.credits[0]?.role).toBe('Screenplay, Story')
  })
})

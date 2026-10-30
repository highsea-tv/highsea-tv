// SPDX-License-Identifier: AGPL-3.0-only
// C3 Library's arranging (client-library.md), shared by the web and the phone.
import { describe, expect, test } from 'bun:test'
import type { ClientItem } from '@highsea-tv/api-contract'
import { ALL, arrange, genresOf } from '../src/library/index.ts'

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
})

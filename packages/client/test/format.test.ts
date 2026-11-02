// SPDX-License-Identifier: AGPL-3.0-only
// The words and numbers under titles (ADR 0055), as the prototype's client shows them.
import { describe, expect, test } from 'bun:test'
import { createFormat, inlineParts } from '../src/format/index.ts'

const f = createFormat('en')

describe('format', () => {
  test('clock times, with hours only when there are some', () => {
    expect(f.clock(0)).toBe('0:00')
    expect(f.clock(724)).toBe('12:04')
    expect(f.clock(3845)).toBe('1:04:05')
    expect(f.clock(-3)).toBe('0:00')
  })

  test('running times, and nothing when it isn’t known', () => {
    expect(f.runtime(96)).toBe('1h 36m')
    expect(f.runtime(120)).toBe('2h')
    expect(f.runtime(15)).toBe('15m')
    expect(f.runtime(null)).toBe('')
  })

  test('what’s left, never less than a minute', () => {
    expect(f.left({ runtimeMinutes: 96, position: 44 * 60 })).toBe('52 min left')
    expect(f.left({ runtimeMinutes: 150, position: 0 })).toBe('2h 30m left')
    expect(f.left({ runtimeMinutes: 96, position: 96 * 60 })).toBe('1 min left')
  })

  test('a meta line leaves out what isn’t known', () => {
    expect(
      f.meta({ year: 2010, runtimeMinutes: 15, genres: ['Fantasy', 'Animation'], position: 0 }),
    ).toBe('2010 · 15m · Fantasy')
    expect(f.meta({ year: null, runtimeMinutes: null, genres: [], position: 0 })).toBe('')
  })

  test('counts and captions', () => {
    expect(f.movies(1)).toBe('1 movie')
    expect(f.moviesHere(6)).toBe('6 movies here')
    expect(f.collections(3)).toBe('3 collections')
    expect(f.caption({ count: 6, years: '2010–2020' })).toBe('6 movies · 2010–2020')
    expect(f.caption({ count: 2, years: '' })).toBe('2 movies')
  })

  test('a collection with shows counts both, and its row is named by what’s in it', () => {
    expect(f.caption({ count: 6, shows: 1, years: '2006–2019' })).toBe(
      '6 movies and 1 show · 2006–2019',
    )
    expect(f.caption({ count: 0, shows: 2, years: '' })).toBe('2 shows')
    expect(f.titlesHere(4, 0)).toBe('4 movies')
    expect(f.titlesHere(1, 3)).toBe('1 movie and 3 shows')
    expect(f.titlesRow(4)).toBe('Films')
    expect(f.titlesRow(0, 2)).toBe('Shows')
    expect(f.titlesRow(4, 1)).toBe('Films and shows')
  })

  test('the server’s name, and this server until it’s known', () => {
    expect(f.serverName('Harbor')).toBe('Harbor')
    expect(f.serverName(null)).toBe('this server')
    expect(f.serverName('')).toBe('this server')
  })
})

describe('inlineParts', () => {
  test('splits bold, italic and links from the plain words', () => {
    expect(inlineParts('Hi **all**, see _this_ and [notes](https://x.test/a).')).toEqual([
      { kind: 'text', text: 'Hi ' },
      { kind: 'bold', text: 'all' },
      { kind: 'text', text: ', see ' },
      { kind: 'italic', text: 'this' },
      { kind: 'text', text: ' and ' },
      { kind: 'link', text: 'notes', url: 'https://x.test/a' },
      { kind: 'text', text: '.' },
    ])
  })
})

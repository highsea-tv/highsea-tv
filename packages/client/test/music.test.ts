// SPDX-License-Identifier: AGPL-3.0-only
// The music library's rules and words (@highsea-tv/client/music), as the prototype had them.
import { describe, expect, test } from 'bun:test'
import {
  ALL_GENRES,
  albumIndexKey,
  arrangeAlbums,
  arrangeArtists,
  arrangeSongs,
  createMusicText,
  musicGenresOf,
  shownEntries,
  songGenresOf,
  songIndexKey,
  songMenuPaths,
  songTime,
} from '../src/music/index.ts'

const album = (title: string, artist: string, o: Partial<ReturnType<typeof base>> = {}) => ({
  ...base(title, artist),
  ...o,
})
const base = (title: string, artist: string) => ({
  id: title.toLowerCase(),
  title,
  sortTitle: title.replace(/^The /, ''),
  year: 2020,
  addedAt: '2026-01-01T00:00:00.000Z',
  genres: ['Score'],
  kind: 'album' as 'album' | 'ep' | 'single' | 'soundtrack' | 'compilation',
  artist: { id: artist.toLowerCase(), name: artist },
})

const text = createMusicText('en')

describe('albums, songs and artists', () => {
  const albums = [
    album('Sintel', 'Jan Morgenstern', { year: 2010, kind: 'soundtrack' }),
    album('The Gate', 'The Beatniks', { year: 2024, genres: ['Rock'] }),
    album('Arrival', 'Jan Morgenstern', { year: 2008, addedAt: '2026-05-01T00:00:00.000Z' }),
  ]
  test('albums by title, artist (oldest first), newest and added', () => {
    const titles = (sort: Parameters<typeof arrangeAlbums>[2]) =>
      arrangeAlbums(albums, ALL_GENRES, sort).map((a) => a.title)
    expect(titles('title')).toEqual(['Arrival', 'The Gate', 'Sintel'])
    expect(titles('artist')).toEqual(['The Gate', 'Arrival', 'Sintel'])
    expect(titles('year')[0]).toBe('The Gate')
    expect(titles('added')[0]).toBe('Arrival')
    expect(arrangeAlbums(albums, 'Rock', 'title').map((a) => a.title)).toEqual(['The Gate'])
    expect(musicGenresOf(albums)).toEqual(['Rock', 'Score'])
    expect(albumIndexKey(albums[1] ?? null, 'artist')).toBe('Beatniks')
    expect(albumIndexKey(albums[1] ?? null, 'year')).toBeNull()
  })
  test('songs by title, plays and album order', () => {
    const [sintel, gate] = albums
    if (!sintel || !gate) throw new Error('albums')
    const songs = [
      { title: 'The End', number: 2, plays: 1, album: sintel },
      { title: 'Opening', number: 1, plays: 9, album: sintel },
      { title: 'Bells', number: 1, plays: 3, album: gate },
    ]
    expect(arrangeSongs(songs, ALL_GENRES, 'title').map((s) => s.title)).toEqual([
      'Bells',
      'The End',
      'Opening',
    ])
    expect(arrangeSongs(songs, ALL_GENRES, 'plays')[0]?.title).toBe('Opening')
    expect(arrangeSongs(songs, ALL_GENRES, 'album').map((s) => s.title)).toEqual([
      'Bells',
      'Opening',
      'The End',
    ])
    expect(songGenresOf(songs)).toEqual(['Rock', 'Score'])
    expect(songIndexKey({ title: 'The End', album: sintel }, 'title')).toBe('End')
  })
  test('artists by name and added', () => {
    const artists = [
      { sortName: 'Morgenstern, Jan', addedAt: '2026-01-01T00:00:00.000Z' },
      { sortName: 'Beatniks', addedAt: '2026-02-01T00:00:00.000Z' },
    ]
    expect(arrangeArtists(artists, 'name')[0]?.sortName).toBe('Beatniks')
    expect(arrangeArtists(artists, 'added')[0]?.sortName).toBe('Beatniks')
  })
})

describe('the words', () => {
  test('lengths, counts, summaries and kinds', () => {
    expect(songTime(222)).toBe('3:42')
    expect(text.albumLength(48 * 60)).toBe('48 min')
    expect(text.albumLength(72 * 60)).toBe('1 hr 12 min')
    expect(text.albumSummary(12, 48 * 60)).toBe('12 songs, 48 min')
    expect(text.playlistSummary(0, 0)).toBe('No songs yet')
    expect(text.songsCount(1)).toBe('1 song')
    expect(text.albumMeta({ kind: 'album', year: 2019 })).toBe('2019')
    expect(text.albumMeta({ kind: 'ep', year: 2024 })).toBe('EP · 2024')
    expect(text.discographyTitle.singles).toBe('Singles and EPs')
    expect(text.releasedOn('2010-03-14')).toBe('14 March 2010')
    expect(text.views.map((v) => v.path)).toEqual([
      '/music',
      '/music/artists',
      '/music/songs',
      '/music/playlists',
    ])
  })
  test('Home’s card, the song menu and a playlist’s edits', () => {
    expect(
      text.homeMusicCard({ kind: 'artist', artist: { id: 'jan', name: 'Jan', photo: null } }),
    ).toEqual({
      id: 'jan',
      title: 'Jan',
      caption: 'Artist',
      src: null,
      path: '/music/artists/jan',
      round: true,
    })
    expect(text.songMenu.playsNext('Sintel')).toBe('Sintel plays next')
    expect(text.playlistEdits.deleted(undefined)).toBe('The playlist deleted')
    expect(songMenuPaths({ id: 'a', artist: { id: 'b' } })).toEqual({
      album: '/music/albums/a',
      artist: '/music/artists/b',
    })
  })
  test('a dragged order shows until the server answers with a newer playlist', () => {
    const data = { v: 1 }
    expect(shownEntries(data, ['a', 'b'], { on: data, songs: ['b', 'a'] })).toEqual(['b', 'a'])
    expect(shownEntries({ v: 2 }, ['b', 'a'], { on: data, songs: ['x'] })).toEqual(['b', 'a'])
  })
})

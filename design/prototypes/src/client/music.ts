// SPDX-License-Identifier: AGPL-3.0-only
// The music library's views on every client: Albums and Artists, each with its own sorts, as Apple
// Music, Plex and Navidrome give them. Albums filter by genre; both sort by name by default, which
// is when the A–Z index shows.
import type { ClientAlbum, ClientArtist } from '../mock/types.ts'

export type MusicView = 'albums' | 'artists'

export type AlbumSort = 'title' | 'artist' | 'added' | 'year'
export const albumSorts: { value: AlbumSort; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
  { value: 'added', label: 'Recently added' },
  { value: 'year', label: 'Newest first' },
]

export type ArtistSort = 'name' | 'added'
export const artistSorts: { value: ArtistSort; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'added', label: 'Recently added' },
]

export const ALL_GENRES = 'all'

export const musicGenresOf = (albums: ClientAlbum[]) =>
  [...new Set(albums.flatMap((a) => a.genres))].sort((a, b) => a.localeCompare(b))

/** Albums in a genre, sorted; by artist, each artist's albums oldest first, as a discography. */
export function arrangeAlbums(albums: ClientAlbum[], genre: string, sort: AlbumSort) {
  const shown = albums.filter((a) => genre === ALL_GENRES || a.genres.includes(genre))
  return [...shown].sort((a, b) =>
    sort === 'added'
      ? Date.parse(b.addedAt) - Date.parse(a.addedAt) || a.sortTitle.localeCompare(b.sortTitle)
      : sort === 'year'
        ? b.year - a.year || a.sortTitle.localeCompare(b.sortTitle)
        : sort === 'artist'
          ? artistKey(a).localeCompare(artistKey(b)) || a.year - b.year
          : a.sortTitle.localeCompare(b.sortTitle),
  )
}

const artistKey = (a: ClientAlbum) => a.artist.name.replace(/^(the|a)\s+/i, '')

export function arrangeArtists(artists: ClientArtist[], sort: ArtistSort) {
  return [...artists].sort((a, b) =>
    sort === 'added'
      ? Date.parse(b.addedAt) - Date.parse(a.addedAt) || a.sortName.localeCompare(b.sortName)
      : a.sortName.localeCompare(b.sortName),
  )
}

/** The key the A–Z index reads, when the sort is by name. */
export const albumIndexKey = (a: ClientAlbum | null, sort: AlbumSort) =>
  sort === 'title' ? (a?.sortTitle ?? '') : sort === 'artist' ? (a ? artistKey(a) : '') : null

/** "Album · 2019", "EP · 2024": the kind only when it isn't a plain album. */
export function albumMeta(a: ClientAlbum) {
  const kind = {
    album: '',
    ep: 'EP',
    single: 'Single',
    soundtrack: 'Soundtrack',
    compilation: 'Compilation',
  }[a.kind]
  return kind ? `${kind} · ${a.year}` : String(a.year)
}

export const albumsCount = (n: number) => `${n} ${n === 1 ? 'album' : 'albums'}`
export const artistsCount = (n: number) => `${n} ${n === 1 ? 'artist' : 'artists'}`

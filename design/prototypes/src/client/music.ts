// SPDX-License-Identifier: AGPL-3.0-only
// The music library's views on every client: Albums and Artists, each with its own sorts, as Apple
// Music, Plex and Navidrome give them. Albums filter by genre; both sort by name by default, which
// is when the A–Z index shows.
import type { ClientAlbum, ClientArtist, DiscographyKind, HomeMusic } from '../mock/types.ts'

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

export const songsCount = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`

/** "3:42": a song's length, as every music app shows it. */
export const songTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/** "48 min", "1 hr 12 min": an album's length, as Apple Music writes it. */
export function albumLength(seconds: number) {
  const minutes = Math.round(seconds / 60)
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours} hr ${minutes % 60} min` : `${minutes} min`
}

/** "12 songs, 48 min". */
export const albumSummary = (songs: number, seconds: number) =>
  `${songsCount(songs)}, ${albumLength(seconds)}`

/** "14 March 2010". */
export const releasedOn = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

/** Each group's heading on an artist's page. */
export const discographyTitle: Record<DiscographyKind, string> = {
  albums: 'Albums',
  singles: 'Singles and EPs',
  soundtracks: 'Soundtracks',
  compilations: 'Compilations',
}

/** "Album", "EP", "Soundtrack": the eyebrow over an album's title. */
export const albumKind: Record<ClientAlbum['kind'], string> = {
  album: 'Album',
  ep: 'EP',
  single: 'Single',
  soundtrack: 'Soundtrack',
  compilation: 'Compilation',
}

/** A Recently played card on Home: an album's square cover, or an artist's round photo. */
export const homeMusicCard = (x: HomeMusic) =>
  x.kind === 'album'
    ? {
        id: x.album.id,
        title: x.album.title,
        caption: x.album.artist.name,
        src: x.album.cover,
        path: `/music/albums/${x.album.id}`,
        round: false,
      }
    : {
        id: x.artist.id,
        title: x.artist.name,
        caption: 'Artist',
        src: x.artist.photo,
        path: `/music/artists/${x.artist.id}`,
        round: true,
      }

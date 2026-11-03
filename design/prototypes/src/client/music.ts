// SPDX-License-Identifier: AGPL-3.0-only
// The music library's views on every client: Albums, Artists, Songs and Playlists, as Apple Music,
// Plex and Navidrome give them (prototype-gaps.md › 3.8). Albums and Songs filter by genre; the
// first three sort by name by default, which is when the A–Z index shows. Playlists are the
// person's own, the most recently changed first.
import type {
  ClientAlbum,
  ClientArtist,
  ClientLibrarySong,
  DiscographyKind,
  HomeMusic,
} from '@highsea-tv/mock/types'

export type MusicView = 'albums' | 'artists' | 'songs' | 'playlists'

/** Each view, its name and its address. */
export const musicViews: { value: MusicView; label: string; path: string }[] = [
  { value: 'albums', label: 'Albums', path: '/music' },
  { value: 'artists', label: 'Artists', path: '/music/artists' },
  { value: 'songs', label: 'Songs', path: '/music/songs' },
  { value: 'playlists', label: 'Playlists', path: '/music/playlists' },
]

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

export type SongSort = 'title' | 'artist' | 'album' | 'added' | 'plays'
export const songSorts: { value: SongSort; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'artist', label: 'Artist' },
  { value: 'album', label: 'Album' },
  { value: 'added', label: 'Recently added' },
  { value: 'plays', label: 'Most played' },
]

/** A song's title as the index files it: "The Gate" under G, as Apple Music does. */
const titleKey = (s: ClientLibrarySong) => s.title.replace(/^(the|a)\s+/i, '')

/** The genres of the songs' albums. */
export const songGenresOf = (songs: ClientLibrarySong[]) =>
  musicGenresOf([...new Map(songs.map((s) => [s.album.id, s.album])).values()])

/** Songs in a genre, sorted; by artist or album, each album's songs in their order. */
export function arrangeSongs(songs: ClientLibrarySong[], genre: string, sort: SongSort) {
  const shown = songs.filter((s) => genre === ALL_GENRES || s.album.genres.includes(genre))
  const inAlbum = (a: ClientLibrarySong, b: ClientLibrarySong) =>
    a.album.sortTitle.localeCompare(b.album.sortTitle) || a.number - b.number
  return [...shown].sort((a, b) =>
    sort === 'added'
      ? Date.parse(b.album.addedAt) - Date.parse(a.album.addedAt) || inAlbum(a, b)
      : sort === 'plays'
        ? b.plays - a.plays || titleKey(a).localeCompare(titleKey(b))
        : sort === 'artist'
          ? artistKey(a.album).localeCompare(artistKey(b.album)) ||
            a.album.year - b.album.year ||
            inAlbum(a, b)
          : sort === 'album'
            ? inAlbum(a, b)
            : titleKey(a).localeCompare(titleKey(b)),
  )
}

/** The key the A–Z index reads, when the sort is by name. */
export const songIndexKey = (s: ClientLibrarySong, sort: SongSort) =>
  sort === 'title'
    ? titleKey(s)
    : sort === 'artist'
      ? artistKey(s.album)
      : sort === 'album'
        ? s.album.sortTitle
        : null

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
export const playlistsCount = (n: number) => `${n} ${n === 1 ? 'playlist' : 'playlists'}`

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

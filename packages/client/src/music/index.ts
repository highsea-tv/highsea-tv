// SPDX-License-Identifier: AGPL-3.0-only
// The music library's views on every client (one-client-platform-b.md › B3), moved from the
// prototype's design/prototypes/src/client/music.ts, playlists.ts and song-menu.ts: Albums,
// Artists, Songs and Playlists, as Apple Music, Plex and Navidrome give them (prototype-gaps.md ›
// 3.8). Albums and Songs filter by genre; the first three sort by name by default, which is when
// the A–Z index shows. Playlists are the person's own, the most recently changed first. React
// without the DOM; the words come from `createMusicText(locale)`. Each function takes only the
// fields it reads, so the prototype's mock types and the contract's both fit.
import { createT, defineMessages } from '@highsea-tv/i18n'

export const MUSIC_VIEWS = ['albums', 'artists', 'songs', 'playlists'] as const
export type MusicView = (typeof MUSIC_VIEWS)[number]
/** Each view's address, on every app's routes. */
export const MUSIC_PATHS: Record<MusicView, string> = {
  albums: '/music',
  artists: '/music/artists',
  songs: '/music/songs',
  playlists: '/music/playlists',
}

export const ALBUM_SORTS = ['title', 'artist', 'added', 'year'] as const
export type AlbumSort = (typeof ALBUM_SORTS)[number]
export const ARTIST_SORTS = ['name', 'added'] as const
export type ArtistSort = (typeof ARTIST_SORTS)[number]
export const SONG_SORTS = ['title', 'artist', 'album', 'added', 'plays'] as const
export type SongSort = (typeof SONG_SORTS)[number]
export const ALBUM_KINDS = ['album', 'ep', 'single', 'soundtrack', 'compilation'] as const
export type AlbumKind = (typeof ALBUM_KINDS)[number]
export const DISCOGRAPHY = ['albums', 'singles', 'soundtracks', 'compilations'] as const
export type Discography = (typeof DISCOGRAPHY)[number]

export const ALL_GENRES = 'all'

type Album = {
  id: string
  title: string
  sortTitle: string
  year: number
  addedAt: string
  genres: string[]
  kind: AlbumKind
  artist: { id: string; name: string }
}
type Song = { title: string; number: number; plays: number; album: Album }
type Artist = { sortName: string; addedAt: string }

/** An artist's name as the index files it: "The Gate" under G, as Apple Music does. */
const artistKey = (a: Pick<Album, 'artist'>) => a.artist.name.replace(/^(the|a)\s+/i, '')
/** A song's title as the index files it. */
const titleKey = (s: Pick<Song, 'title'>) => s.title.replace(/^(the|a)\s+/i, '')

export const musicGenresOf = (albums: Pick<Album, 'genres'>[]) =>
  [...new Set(albums.flatMap((a) => a.genres))].sort((a, b) => a.localeCompare(b))

/** Albums in a genre, sorted; by artist, each artist's albums oldest first, as a discography. */
export function arrangeAlbums<A extends Album>(albums: A[], genre: string, sort: AlbumSort): A[] {
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

/** The genres of the songs' albums. */
export const songGenresOf = (songs: { album: Pick<Album, 'id' | 'genres'> }[]) =>
  musicGenresOf([...new Map(songs.map((s) => [s.album.id, s.album])).values()])

/** Songs in a genre, sorted; by artist or album, each album's songs in their order. */
export function arrangeSongs<S extends Song>(songs: S[], genre: string, sort: SongSort): S[] {
  const shown = songs.filter((s) => genre === ALL_GENRES || s.album.genres.includes(genre))
  const inAlbum = (a: Song, b: Song) =>
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
export const songIndexKey = (s: Pick<Song, 'title' | 'album'>, sort: SongSort) =>
  sort === 'title'
    ? titleKey(s)
    : sort === 'artist'
      ? artistKey(s.album)
      : sort === 'album'
        ? s.album.sortTitle
        : null

export function arrangeArtists<A extends Artist>(artists: A[], sort: ArtistSort): A[] {
  return [...artists].sort((a, b) =>
    sort === 'added'
      ? Date.parse(b.addedAt) - Date.parse(a.addedAt) || a.sortName.localeCompare(b.sortName)
      : a.sortName.localeCompare(b.sortName),
  )
}

/** The key the A–Z index reads, when the sort is by name. */
export const albumIndexKey = (a: Pick<Album, 'sortTitle' | 'artist'> | null, sort: AlbumSort) =>
  sort === 'title' ? (a?.sortTitle ?? '') : sort === 'artist' ? (a ? artistKey(a) : '') : null

/** "3:42": a song's length, as every music app shows it. */
export const songTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/** A Recently played card on Home, without its words: an album's square cover, or an artist's round photo. */
export type MusicCard<Src extends string | null = string | null> = {
  id: string
  title: string
  caption: string
  /** The cover or photo, as the server gave it: the mock's are never null, the contract's may be. */
  src: Src
  path: string
  round: boolean
}

export const musicMessages = defineMessages({
  albums: 'Albums',
  artists: 'Artists',
  songs: 'Songs',
  playlists: 'Playlists',
  sortByTitle: 'Title',
  sortByArtist: 'Artist',
  sortByAlbum: 'Album',
  sortByName: 'Name',
  sortByAdded: 'Recently added',
  sortByYear: 'Newest first',
  sortByPlays: 'Most played',
  albumsCount: '{count, plural, one {# album} other {# albums}}',
  artistsCount: '{count, plural, one {# artist} other {# artists}}',
  songsCount: '{count, plural, one {# song} other {# songs}}',
  playlistsCount: '{count, plural, one {# playlist} other {# playlists}}',
  hours: '{hours} hr {minutes} min',
  minutes: '{minutes} min',
  summary: '{songs}, {length}',
  noSongs: 'No songs yet',
  kindAlbum: 'Album',
  kindEp: 'EP',
  kindSingle: 'Single',
  kindSoundtrack: 'Soundtrack',
  kindCompilation: 'Compilation',
  meta: '{kind} · {year}',
  discAlbums: 'Albums',
  discSingles: 'Singles and EPs',
  discSoundtracks: 'Soundtracks',
  discCompilations: 'Compilations',
  artist: 'Artist',
  playsNext: '{name} plays next',
  addedToQueue: '{name} added to the queue',
  addedTo: 'Added to {playlist}',
  made: '{playlist} made',
  madeWith: 'With {name} in it.',
  renamed: 'Renamed {name}',
  removed: '{name} removed',
  removedFrom: 'From {playlist}.',
  deleted: '{playlist} deleted',
  thePlaylist: 'The playlist',
})

export function createMusicText(locale = 'en') {
  const t = createT(musicMessages, locale)
  const songsCount = (n: number) => t('songsCount', { count: n })
  /** "48 min", "1 hr 12 min": an album's length, as Apple Music writes it. */
  const albumLength = (seconds: number) => {
    const minutes = Math.round(seconds / 60)
    const hours = Math.floor(minutes / 60)
    return hours > 0 ? t('hours', { hours, minutes: minutes % 60 }) : t('minutes', { minutes })
  }
  const albumSummary = (songs: number, seconds: number) =>
    t('summary', { songs: songsCount(songs), length: albumLength(seconds) })
  const albumKind: Record<AlbumKind, string> = {
    album: t('kindAlbum'),
    ep: t('kindEp'),
    single: t('kindSingle'),
    soundtrack: t('kindSoundtrack'),
    compilation: t('kindCompilation'),
  }
  return {
    views: MUSIC_VIEWS.map((value) => ({ value, label: t(value), path: MUSIC_PATHS[value] })),
    albumSorts: [
      { value: 'title', label: t('sortByTitle') },
      { value: 'artist', label: t('sortByArtist') },
      { value: 'added', label: t('sortByAdded') },
      { value: 'year', label: t('sortByYear') },
    ] as { value: AlbumSort; label: string }[],
    artistSorts: [
      { value: 'name', label: t('sortByName') },
      { value: 'added', label: t('sortByAdded') },
    ] as { value: ArtistSort; label: string }[],
    songSorts: [
      { value: 'title', label: t('sortByTitle') },
      { value: 'artist', label: t('sortByArtist') },
      { value: 'album', label: t('sortByAlbum') },
      { value: 'added', label: t('sortByAdded') },
      { value: 'plays', label: t('sortByPlays') },
    ] as { value: SongSort; label: string }[],
    albumsCount: (n: number) => t('albumsCount', { count: n }),
    artistsCount: (n: number) => t('artistsCount', { count: n }),
    songsCount,
    playlistsCount: (n: number) => t('playlistsCount', { count: n }),
    albumLength,
    /** "12 songs, 48 min". */
    albumSummary,
    /** "12 songs, 48 min", or "No songs yet". */
    playlistSummary: (songs: number, seconds: number) =>
      songs === 0 ? t('noSongs') : albumSummary(songs, seconds),
    /** "Album · 2019", "EP · 2024": the kind only when it isn't a plain album. */
    albumMeta: (a: Pick<Album, 'kind' | 'year'>) =>
      a.kind === 'album' ? String(a.year) : t('meta', { kind: albumKind[a.kind], year: a.year }),
    /** "Album", "EP", "Soundtrack": the eyebrow over an album's title. */
    albumKind,
    /** Each group's heading on an artist's page. */
    discographyTitle: {
      albums: t('discAlbums'),
      singles: t('discSingles'),
      soundtracks: t('discSoundtracks'),
      compilations: t('discCompilations'),
    } as Record<Discography, string>,
    /** "14 March 2010". */
    releasedOn: (date: string) =>
      new Date(`${date}T12:00:00Z`).toLocaleDateString(locale === 'en' ? 'en-GB' : locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    /** A Recently played card on Home: an album's square cover, or an artist's round photo. */
    homeMusicCard: <Src extends string | null>(
      x:
        | {
            kind: 'album'
            album: { id: string; title: string; cover: Src; artist: { name: string } }
          }
        | { kind: 'artist'; artist: { id: string; name: string; photo: Src } },
    ): MusicCard<Src> =>
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
            caption: t('artist'),
            src: x.artist.photo,
            path: `/music/artists/${x.artist.id}`,
            round: true,
          },
    /**
     * A song's ⋯ menu and an album's toasts (prototype-gaps.md › 3.4, 3.8): what each action
     * says once done, with the songs' name ("Gymnopédie No. 1", or the album's title).
     */
    songMenu: {
      playsNext: (name: string) => t('playsNext', { name }),
      addedToQueue: (name: string) => t('addedToQueue', { name }),
      addedTo: (playlist: string) => t('addedTo', { playlist }),
      made: (playlist: string) => t('made', { playlist }),
      madeWith: (name: string) => t('madeWith', { name }),
    },
    /** A playlist's edits, as their toasts say them. */
    playlistEdits: {
      renamed: (name: string) => t('renamed', { name }),
      removed: (name: string) => t('removed', { name }),
      removedFrom: (playlist: string) => t('removedFrom', { playlist }),
      deleted: (playlist: string | undefined) =>
        t('deleted', { playlist: playlist ?? t('thePlaylist') }),
    },
  }
}

export type MusicText = ReturnType<typeof createMusicText>

/** A song's ⋯ menu's links, on every app's routes. */
export const songMenuPaths = (album: { id: string; artist: { id: string } }) => ({
  album: `/music/albums/${album.id}`,
  artist: `/music/artists/${album.artist.id}`,
})

/**
 * A playlist's songs as shown while a reorder is with the server: the order as dragged, until the
 * server answers with a newer playlist, so a dragged row doesn't jump back while the list reloads.
 */
export const shownEntries = <D, E>(
  data: D | undefined,
  songs: E[],
  moved: { on: D | undefined; songs: E[] } | null,
): E[] => (moved && moved.on === data ? moved.songs : songs)

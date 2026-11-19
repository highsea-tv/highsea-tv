// SPDX-License-Identifier: AGPL-3.0-only
// Music as the apps read it (`music` in @highsea-tv/api-contract's music.ts, HT-101): every artist
// and album, Songs with the household's play counts, an album with its songs and the artist's
// other albums, an artist with their albums by kind and like artists, the player's queue, search's
// artists, albums and songs, and Home's Recently played. The mock's rules (packages/mock's
// server.ts) are the ones kept: an album plays in its order, an artist's newest album first; an
// artist's albums group as Apple Music and Plexamp group them; like artists share genres.
//
// What the files and MusicBrainz don't give stays empty: an album's note and an artist's bio
// (no source used here has one free), the film an album scores, the artist's person page, and the
// song's loudness for the scrubber (the waveform draws flat until the server analyses loudness,
// a later part of D).
import type {
  ClientAlbum,
  ClientAlbumDetail,
  ClientArtist,
  ClientArtistDetail,
  ClientLibrarySong,
  ClientSong,
  DiscographyKind,
  HomeMusic,
  MusicSource,
  QueuedSong,
  SearchSong,
} from '@highsea-tv/api-contract'
import { AppError } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm'
import { matchScore, rankByMatch, SEARCH_LIMIT } from '../shared/search.ts'
import { CHUNK } from '../shared/sql.ts'
import { albumCover, artistPhoto } from './admin.ts'
import { announce, type MusicDeps } from './context.ts'

const {
  musicAlbums,
  musicArtists,
  musicPlays,
  musicPlaylistEntries,
  musicPlaylists,
  musicRecent,
  musicTracks,
} = schema

type AlbumRow = typeof musicAlbums.$inferSelect
type ArtistRow = typeof musicArtists.$inferSelect
type TrackRow = typeof musicTracks.$inferSelect

const iso = (ms: number) => new Date(ms).toISOString()
/** Like artists on an artist's page, as the mock gives them. */
const SIMILAR = 12
/** Home's Recently played. */
const RECENT = 20

/** An artist's albums under each heading of their page (the contract's `DISCOGRAPHY_KINDS`). */
const SECTION_OF: Record<AlbumRow['kind'], DiscographyKind> = {
  album: 'albums',
  ep: 'singles',
  single: 'singles',
  soundtrack: 'soundtracks',
  compilation: 'compilations',
}

/** Newest first; an album without a year after those with one. */
const newestFirst = (a: AlbumRow, b: AlbumRow) =>
  (b.year ?? 0) - (a.year ?? 0) || a.sortTitle.localeCompare(b.sortTitle)

const byPlace = (a: TrackRow, b: TrackRow) =>
  a.disc - b.disc || a.number - b.number || a.path.localeCompare(b.path)

export function createMusicClient(ctx: MusicDeps) {
  const { db, clock } = ctx

  // ---------------------------------------------------------------- reading

  const artistRows = () => db.select().from(musicArtists).all()
  const albumRows = () => db.select().from(musicAlbums).all()

  function trackCounts() {
    const by = new Map<string, number>()
    for (const r of db
      .select({ albumId: musicTracks.albumId, n: count() })
      .from(musicTracks)
      .groupBy(musicTracks.albumId)
      .all())
      by.set(r.albumId, r.n)
    return by
  }

  function tracksOf(albumIds: string[]): TrackRow[] {
    if (albumIds.length === 0) return []
    if (albumIds.length > CHUNK) {
      const wanted = new Set(albumIds)
      return db
        .select()
        .from(musicTracks)
        .all()
        .filter((t) => wanted.has(t.albumId))
    }
    return db.select().from(musicTracks).where(inArray(musicTracks.albumId, albumIds)).all()
  }

  function tracksById(ids: string[]): TrackRow[] {
    const out: TrackRow[] = []
    for (let i = 0; i < ids.length; i += CHUNK)
      out.push(
        ...db
          .select()
          .from(musicTracks)
          .where(inArray(musicTracks.id, ids.slice(i, i + CHUNK)))
          .all(),
      )
    return out
  }

  /** What the reads need to draw albums and artists, read once per answer. */
  function lookup(albums = albumRows(), artists = artistRows()) {
    const counts = trackCounts()
    const artistById = new Map(artists.map((a) => [a.id, a]))
    const albumsOf = new Map<string, AlbumRow[]>()
    for (const al of albums) {
      const list = albumsOf.get(al.artistId)
      if (list) list.push(al)
      else albumsOf.set(al.artistId, [al])
    }
    const album = (row: AlbumRow): ClientAlbum => ({
      id: row.id,
      title: row.title,
      sortTitle: row.sortTitle,
      artist: { id: row.artistId, name: artistById.get(row.artistId)?.name ?? '' },
      year: row.year,
      cover: row.coverFile || row.embeddedCover || row.coverUrl ? albumCover(row.id) : null,
      genres: row.genres,
      tracks: counts.get(row.id) ?? 0,
      kind: row.kind,
      addedAt: iso(row.addedAt),
    })
    const artist = (row: ArtistRow): ClientArtist => ({
      id: row.id,
      name: row.name,
      sortName: row.sortName,
      photo: row.photoFile || row.photoUrl ? artistPhoto(row.id) : null,
      albums: albumsOf.get(row.id)?.length ?? 0,
      // an artist's own genres (MusicBrainz's), else their albums'
      genres: row.genres.length
        ? row.genres
        : [...new Set((albumsOf.get(row.id) ?? []).flatMap((a) => a.genres))].slice(0, 5),
      addedAt: iso(row.addedAt),
    })
    return { album, artist, artistById, albumsOf }
  }

  const song = (t: TrackRow, place: number): ClientSong => ({
    id: t.id,
    number: Math.max(1, place),
    title: t.title,
    duration: t.duration,
  })

  /** Each track's place on its album, counted through its discs (the contract's `number`). */
  function placesOf(tracks: TrackRow[]) {
    const byAlbum = new Map<string, TrackRow[]>()
    for (const t of tracks) {
      const list = byAlbum.get(t.albumId)
      if (list) list.push(t)
      else byAlbum.set(t.albumId, [t])
    }
    const place = new Map<string, number>()
    for (const list of byAlbum.values()) {
      const multi = new Set(list.map((t) => t.disc)).size > 1
      list.sort(byPlace).forEach((t, i) => {
        place.set(t.id, multi ? i + 1 : Math.max(1, t.number))
      })
    }
    return place
  }

  /** The household's plays of each song: those heard far enough to count (`finished`). */
  function playCounts(): Map<string, number> {
    const by = new Map<string, number>()
    for (const r of db
      .select({ trackId: musicPlays.trackId, n: count() })
      .from(musicPlays)
      .where(eq(musicPlays.finished, true))
      .groupBy(musicPlays.trackId)
      .all())
      if (r.trackId) by.set(r.trackId, r.n)
    return by
  }

  // ---------------------------------------------------------------- the routes' answers

  function library() {
    const albums = albumRows()
    const artists = artistRows()
    const l = lookup(albums, artists)
    return {
      artists: artists
        .filter((a) => l.albumsOf.has(a.id))
        .sort((a, b) => a.sortName.localeCompare(b.sortName))
        .map(l.artist),
      albums: albums.sort((a, b) => a.sortTitle.localeCompare(b.sortTitle)).map(l.album),
    }
  }

  function songs(): ClientLibrarySong[] {
    const albums = albumRows()
    const l = lookup(albums)
    const albumById = new Map(albums.map((a) => [a.id, l.album(a)]))
    const tracks = db.select().from(musicTracks).all()
    const place = placesOf(tracks)
    const plays = playCounts()
    return tracks.sort(byPlace).flatMap((t) => {
      const album = albumById.get(t.albumId)
      return album
        ? [{ ...song(t, place.get(t.id) ?? t.number), album, plays: plays.get(t.id) ?? 0 }]
        : []
    })
  }

  function album(id: string): ClientAlbumDetail {
    const row = db.select().from(musicAlbums).where(eq(musicAlbums.id, id)).get()
    if (!row) throw new AppError('not-found', 'That album isn’t here.')
    const theirs = db.select().from(musicAlbums).where(eq(musicAlbums.artistId, row.artistId)).all()
    const l = lookup(
      theirs,
      db.select().from(musicArtists).where(eq(musicArtists.id, row.artistId)).all(),
    )
    const tracks = tracksOf([id]).sort(byPlace)
    const place = placesOf(tracks)
    return {
      album: l.album(row),
      songs: tracks.map((t) => song(t, place.get(t.id) ?? t.number)),
      duration: tracks.reduce((s, t) => s + t.duration, 0),
      released: row.released,
      label: row.label,
      about: null,
      film: null,
      more: theirs
        .filter((a) => a.id !== id)
        .sort(newestFirst)
        .map(l.album),
    }
  }

  function artist(id: string): ClientArtistDetail {
    const row = db.select().from(musicArtists).where(eq(musicArtists.id, id)).get()
    if (!row) throw new AppError('not-found', 'That artist isn’t here.')
    const albums = albumRows()
    const artists = artistRows()
    const l = lookup(albums, artists)
    const theirs = (l.albumsOf.get(id) ?? []).sort(newestFirst)
    const me = l.artist(row)
    const sections = (['albums', 'singles', 'soundtracks', 'compilations'] as const)
      .map((kind) => ({
        kind,
        albums: theirs.filter((a) => SECTION_OF[a.kind] === kind).map(l.album),
      }))
      .filter((s) => s.albums.length > 0)
    const mine = new Set(me.genres)
    const similar = artists
      .filter((a) => a.id !== id && l.albumsOf.has(a.id))
      .map((a) => ({ a: l.artist(a), shared: 0 }))
      .map((x) => ({ ...x, shared: x.a.genres.filter((g) => mine.has(g)).length }))
      .filter((x) => x.shared > 0)
      .sort((x, y) => y.shared - x.shared || x.a.sortName.localeCompare(y.a.sortName))
      .slice(0, SIMILAR)
      .map((x) => x.a)
    const first = theirs[0]
    return {
      artist: me,
      bio: null,
      backdrop: first ? l.album(first).cover : null,
      songs: theirs.length
        ? (db
            .select({ n: count() })
            .from(musicTracks)
            .where(
              inArray(
                musicTracks.albumId,
                theirs.map((a) => a.id),
              ),
            )
            .get()?.n ?? 0)
        : 0,
      person: null,
      sections,
      similar,
    }
  }

  /** Songs for the player, each with its album; in the order given, unknown ids left out. */
  function queued(tracks: TrackRow[]): QueuedSong[] {
    if (tracks.length === 0) return []
    const albumIds = [...new Set(tracks.map((t) => t.albumId))]
    const albums =
      albumIds.length <= CHUNK
        ? db.select().from(musicAlbums).where(inArray(musicAlbums.id, albumIds)).all()
        : albumRows()
    const l = lookup(albums)
    const albumById = new Map(albums.map((a) => [a.id, l.album(a)]))
    const place = placesOf(tracksOf(albumIds))
    return tracks.flatMap((t) => {
      const album = albumById.get(t.albumId)
      return album ? [{ ...song(t, place.get(t.id) ?? t.number), album, loudness: [] }] : []
    })
  }

  function shuffled<T>(list: T[]): T[] {
    const out = [...list]
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[out[i], out[j]] = [out[j] as T, out[i] as T]
    }
    return out
  }

  /** Keeps an album or an artist played as a whole for Home's Recently played. */
  function remember(profileId: string, kind: 'album' | 'artist', targetId: string) {
    const playedAt = clock.now()
    db.insert(musicRecent)
      .values({ profileId, kind, targetId, playedAt })
      .onConflictDoUpdate({
        target: [musicRecent.profileId, musicRecent.kind, musicRecent.targetId],
        set: { playedAt },
      })
      .run()
    announce(ctx.events, [targetId])
  }

  /**
   * The songs to play: an album in its order, an artist's albums newest first, a playlist in its
   * order, or songs by id; shuffled when asked. An album or an artist goes on Recently played.
   */
  function queue(
    who: { profileId: string },
    source: MusicSource,
    shuffle: boolean,
    playlistOf?: (id: string) => string[],
  ): QueuedSong[] {
    let tracks: TrackRow[] = []
    if ('album' in source) {
      tracks = tracksOf([source.album]).sort(byPlace)
      if (tracks.length) remember(who.profileId, 'album', source.album)
    } else if ('artist' in source) {
      const albums = db
        .select()
        .from(musicAlbums)
        .where(eq(musicAlbums.artistId, source.artist))
        .all()
        .sort(newestFirst)
      const all = tracksOf(albums.map((a) => a.id))
      tracks = albums.flatMap((a) => all.filter((t) => t.albumId === a.id).sort(byPlace))
      if (tracks.length) remember(who.profileId, 'artist', source.artist)
    } else if ('playlist' in source) {
      const ids = playlistOf?.(source.playlist) ?? []
      const byId = new Map(tracksById([...new Set(ids)]).map((t) => [t.id, t]))
      tracks = ids.flatMap((i) => {
        const t = byId.get(i)
        return t ? [t] : []
      })
    } else {
      const byId = new Map(tracksById([...new Set(source.songs)]).map((t) => [t.id, t]))
      tracks = source.songs.flatMap((i) => {
        const t = byId.get(i)
        return t ? [t] : []
      })
    }
    if (tracks.length === 0) throw new AppError('not-found', 'There’s nothing here to play.')
    return queued(shuffle ? shuffled(tracks) : tracks)
  }

  /** Songs by id for Play next and Add to queue, not kept as played. */
  function tracks(ids: string[]): QueuedSong[] {
    const byId = new Map(tracksById([...new Set(ids)]).map((t) => [t.id, t]))
    return queued(
      ids.flatMap((i) => {
        const t = byId.get(i)
        return t ? [t] : []
      }),
    )
  }

  /** Home's Recently played for a profile: its albums and artists, the latest first. */
  function recent(profileId: string): HomeMusic[] {
    const rows = db
      .select()
      .from(musicRecent)
      .where(eq(musicRecent.profileId, profileId))
      .orderBy(desc(musicRecent.playedAt))
      .limit(RECENT * 2)
      .all()
    if (rows.length === 0) return []
    const l = lookup()
    const albums = new Map(albumRows().map((a) => [a.id, a]))
    return rows
      .flatMap((r): HomeMusic[] => {
        if (r.kind === 'album') {
          const a = albums.get(r.targetId)
          return a ? [{ kind: 'album', album: l.album(a) }] : []
        }
        const a = l.artistById.get(r.targetId)
        return a ? [{ kind: 'artist', artist: l.artist(a) }] : []
      })
      .slice(0, RECENT)
  }

  /** Search's artists, albums and songs for what someone typed; each at most 20, best first. */
  function search(query: string) {
    const q = query.trim()
    if (!q) return { artists: [], albums: [], songs: [] as SearchSong[] }
    const albums = albumRows()
    const artists = artistRows()
    const l = lookup(albums, artists)
    const foundArtists = rankByMatch(
      artists.filter((a) => l.albumsOf.has(a.id) && matchScore(a.name, q) > 0),
      (a) => matchScore(a.name, q),
      (a, b) => a.sortName.localeCompare(b.sortName),
    ).map(l.artist)
    const foundAlbums = rankByMatch(
      albums.filter((a) => matchScore(a.title, q) > 0),
      (a) => matchScore(a.title, q),
      (a, b) => a.sortTitle.localeCompare(b.sortTitle),
    ).map(l.album)
    const matching = db
      .select()
      .from(musicTracks)
      .orderBy(asc(musicTracks.title))
      .all()
      .filter((t) => matchScore(t.title, q) > 0)
    const top = rankByMatch(matching, (t) => matchScore(t.title, q)).slice(0, SEARCH_LIMIT)
    const songs: SearchSong[] = queued(top).map(({ loudness: _, ...s }) => s)
    return { artists: foundArtists, albums: foundAlbums, songs }
  }

  /** Track ids in a profile's playlist, in order; for the queue. */
  function playlistTracks(profileId: string, id: string): string[] {
    const p = db
      .select({ id: musicPlaylists.id })
      .from(musicPlaylists)
      .where(and(eq(musicPlaylists.id, id), eq(musicPlaylists.profileId, profileId)))
      .get()
    if (!p) throw new AppError('not-found', 'That playlist isn’t yours, or was deleted.')
    return db
      .select({ trackId: musicPlaylistEntries.trackId })
      .from(musicPlaylistEntries)
      .where(eq(musicPlaylistEntries.playlistId, id))
      .orderBy(asc(musicPlaylistEntries.position))
      .all()
      .map((r) => r.trackId)
  }

  return {
    library,
    songs,
    album,
    artist,
    queue: (who: { profileId: string }, source: MusicSource, shuffle: boolean) =>
      queue(who, source, shuffle, (id) => playlistTracks(who.profileId, id)),
    tracks,
    recent,
    search,
    internal: { queued, lookup, playCounts, tracksById },
  }
}

export type MusicClient = ReturnType<typeof createMusicClient>

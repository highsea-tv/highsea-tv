// SPDX-License-Identifier: AGPL-3.0-only
// The admin's music, in the contract's shapes (`@highsea-tv/api-contract`'s music-library.ts): the
// artists, an artist with their albums, the albums, an album with its discs and tracks, what the
// scan set aside, and each Music folder's figures. Reads only, with the owner's Ignore; the routes
// that serve them are the next task's (ADR 0065).
//
// Covers and pictures are addresses on highsea's image route (`albumCover`, `artistPhoto`), served
// from the file found in the folder, the track's own picture, or the Cover Art Archive's, in that
// order. Serving them is the next task's; the addresses are fixed here.
import type {
  LibraryAlbum,
  LibraryAlbumDetail,
  LibraryArtist,
  LibraryArtistDetail,
  MusicFolder,
  UnmatchedMusic,
} from '@highsea-tv/api-contract'
import { AppError } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { and, asc, count, desc, eq, inArray, sum } from 'drizzle-orm'
import type { z } from 'zod'
import type { Media } from '../shared/index.ts'
import { CHUNK } from '../shared/sql.ts'
import { announce, type MusicDeps } from './context.ts'

const { musicArtists, musicAlbums, musicTracks, musicUnmatched } = schema

type Album = z.infer<typeof LibraryAlbum>
type AlbumDetail = z.infer<typeof LibraryAlbumDetail>
type Artist = z.infer<typeof LibraryArtist>
type ArtistDetail = z.infer<typeof LibraryArtistDetail>

/** Where an album's cover is served (the next task's route). */
export const albumCover = (id: string) => `/api/v1/images/music/album/${id}`
/** Where an artist's picture is served (the next task's route). */
export const artistPhoto = (id: string) => `/api/v1/images/music/artist/${id}`

const iso = (ms: number) => new Date(ms).toISOString()

type AlbumRow = typeof musicAlbums.$inferSelect
type TrackRow = typeof musicTracks.$inferSelect

export function createMusicAdmin(ctx: MusicDeps, deps: { media: Media }) {
  const { db } = ctx

  const tracksOf = (albumIds: string[]) => {
    const order = [asc(musicTracks.disc), asc(musicTracks.number), asc(musicTracks.path)]
    // a few albums by id; a whole list in one read rather than thousands of ids
    const rows =
      albumIds.length === 0
        ? []
        : albumIds.length <= CHUNK
          ? db
              .select()
              .from(musicTracks)
              .where(inArray(musicTracks.albumId, albumIds))
              .orderBy(...order)
              .all()
          : db
              .select()
              .from(musicTracks)
              .orderBy(...order)
              .all()
    const by = new Map<string, TrackRow[]>()
    const wanted = new Set(albumIds)
    for (const t of rows) {
      if (!wanted.has(t.albumId)) continue
      const list = by.get(t.albumId)
      if (list) list.push(t)
      else by.set(t.albumId, [t])
    }
    return by
  }

  const artistNames = () =>
    new Map(
      db
        .select({ id: musicArtists.id, name: musicArtists.name })
        .from(musicArtists)
        .all()
        .map((a) => [a.id, a.name]),
    )

  function album(row: AlbumRow, tracks: TrackRow[], artistName: string): Album {
    const formats = new Map<string, number>()
    for (const t of tracks) formats.set(t.format, (formats.get(t.format) ?? 0) + 1)
    return {
      id: row.id,
      title: row.title,
      sortTitle: row.sortTitle,
      artist: { id: row.artistId, name: artistName },
      year: row.year,
      kind: row.kind,
      cover: row.coverFile || row.embeddedCover || row.coverUrl ? albumCover(row.id) : null,
      genres: row.genres,
      tracks: tracks.length,
      discs: Math.max(1, new Set(tracks.map((t) => t.disc)).size),
      duration: tracks.reduce((s, t) => s + t.duration, 0),
      size: tracks.reduce((s, t) => s + t.size, 0),
      formats: [...formats].sort((a, b) => b[1] - a[1]).map(([f]) => f),
      path: row.path,
      source: row.source,
      musicBrainzId: row.releaseGroupId,
      addedAt: iso(row.addedAt),
    }
  }

  function albumDetail(row: AlbumRow, tracks: TrackRow[], artistName: string): AlbumDetail {
    const discs = new Map<number, TrackRow[]>()
    for (const t of tracks) {
      const list = discs.get(t.disc)
      if (list) list.push(t)
      else discs.set(t.disc, [t])
    }
    return {
      ...album(row, tracks, artistName),
      released: row.released,
      label: row.label,
      discList: [...discs]
        .sort((a, b) => a[0] - b[0])
        .map(([number, list]) => ({
          number,
          folder: list[0]?.discFolder ?? null,
          tracks: list.map((t) => ({
            id: t.id,
            disc: t.disc,
            number: Math.max(1, t.number),
            title: t.title,
            artist: t.artist,
            duration: t.duration,
            file: {
              path: t.path,
              format: t.format,
              bitrate: t.bitrate,
              sampleRate: t.sampleRate,
              bitDepth: t.bitDepth,
              size: t.size,
              lyrics: !!t.lyricsFile,
            },
          })),
        })),
      extras: { coverFile: row.coverFile, nfo: row.nfo },
    }
  }

  function artists(): Artist[] {
    const rows = db.select().from(musicArtists).orderBy(asc(musicArtists.sortName)).all()
    const albums = db.select().from(musicAlbums).all()
    const tracks = tracksOf(albums.map((a) => a.id))
    return rows.map((a) => {
      const own = albums.filter((al) => al.artistId === a.id)
      const theirs = own.flatMap((al) => tracks.get(al.id) ?? [])
      return artistRow(a, own, theirs)
    })
  }

  function artistRow(
    a: typeof musicArtists.$inferSelect,
    albums: AlbumRow[],
    tracks: TrackRow[],
  ): Artist {
    return {
      id: a.id,
      name: a.name,
      sortName: a.sortName,
      photo: a.photoFile ? artistPhoto(a.id) : null,
      genres: a.genres,
      albums: albums.length,
      tracks: tracks.length,
      size: tracks.reduce((s, t) => s + t.size, 0),
      path: a.path ?? albums[0]?.path ?? a.rootFolder,
      source: a.source,
      musicBrainzId: a.musicBrainzId,
      addedAt: iso(a.addedAt),
    }
  }

  function artist(id: string): ArtistDetail {
    const a = db.select().from(musicArtists).where(eq(musicArtists.id, id)).get()
    if (!a) throw new AppError('not-found', 'That artist isn’t in the library.')
    const albums = db
      .select()
      .from(musicAlbums)
      .where(eq(musicAlbums.artistId, id))
      .orderBy(desc(musicAlbums.year), asc(musicAlbums.sortTitle))
      .all()
    const tracks = tracksOf(albums.map((al) => al.id))
    return {
      ...artistRow(
        a,
        albums,
        albums.flatMap((al) => tracks.get(al.id) ?? []),
      ),
      bio: null,
      albumList: albums.map((al) => album(al, tracks.get(al.id) ?? [], a.name)),
      videos: a.videos,
    }
  }

  function albums(): Album[] {
    const rows = db.select().from(musicAlbums).orderBy(asc(musicAlbums.sortTitle)).all()
    const tracks = tracksOf(rows.map((r) => r.id))
    const names = artistNames()
    return rows.map((r) => album(r, tracks.get(r.id) ?? [], names.get(r.artistId) ?? ''))
  }

  function albumById(id: string): AlbumDetail {
    const row = db.select().from(musicAlbums).where(eq(musicAlbums.id, id)).get()
    if (!row) throw new AppError('not-found', 'That album isn’t in the library.')
    const tracks = tracksOf([id]).get(id) ?? []
    return albumDetail(row, tracks, artistNames().get(row.artistId) ?? '')
  }

  function unmatched(): z.infer<typeof UnmatchedMusic>[] {
    return db
      .select()
      .from(musicUnmatched)
      .where(eq(musicUnmatched.ignored, false))
      .orderBy(asc(musicUnmatched.path))
      .all()
      .map((u) => ({
        id: u.id,
        path: u.path,
        files: u.files,
        size: u.size,
        reason: u.reason,
        guess: { artist: u.guessArtist, album: u.guessAlbum, year: u.guessYear },
        foundAt: iso(u.foundAt),
      }))
  }

  /** The owner's Ignore: later scans pass the folder by until it's gone. */
  function ignore(id: string) {
    const waiting = db
      .select({ id: musicUnmatched.id })
      .from(musicUnmatched)
      .where(and(eq(musicUnmatched.id, id), eq(musicUnmatched.ignored, false)))
      .get()
    if (!waiting) throw new AppError('not-found', 'That folder isn’t waiting.')
    db.update(musicUnmatched)
      .set({ ignored: true })
      .where(and(eq(musicUnmatched.id, id), eq(musicUnmatched.ignored, false)))
      .run()
    announce(ctx.events, [id])
  }

  function folders(): z.infer<typeof MusicFolder>[] {
    return deps.media.rootFolders.list('music').map((r) => {
      const albums = db
        .select({ id: musicAlbums.id, artistId: musicAlbums.artistId })
        .from(musicAlbums)
        .where(eq(musicAlbums.rootFolder, r.path))
        .all()
      const ids = new Set(albums.map((a) => a.id))
      const t = db
        .select({ albumId: musicTracks.albumId, n: count(), size: sum(musicTracks.size) })
        .from(musicTracks)
        .groupBy(musicTracks.albumId)
        .all()
        .filter((x) => ids.has(x.albumId))
      const waiting = db
        .select({ n: count() })
        .from(musicUnmatched)
        .where(and(eq(musicUnmatched.rootFolder, r.path), eq(musicUnmatched.ignored, false)))
        .get()
      return {
        id: r.id,
        artists: new Set(albums.map((a) => a.artistId)).size,
        albums: albums.length,
        tracks: t.reduce((s, x) => s + x.n, 0),
        size: t.reduce((s, x) => s + Number(x.size ?? 0), 0),
        unmatched: waiting?.n ?? 0,
      }
    })
  }

  return { artists, artist, albums, album: albumById, unmatched, ignore, folders }
}

export type MusicAdmin = ReturnType<typeof createMusicAdmin>

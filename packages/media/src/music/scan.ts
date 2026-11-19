// SPDX-License-Identifier: AGPL-3.0-only
// Music's library scan and import (Phase 5 D, ADR 0065): one pass that imports what's in the Music
// root folders where it is and keeps it in step, every 12 hours as the films' and shows' scans run,
// for one folder when watching sees a change there, and when the owner asks. Through the job
// machinery (`music.scan`, deduped per folder). Files are only read, never moved or written to, so
// a read-only folder (ADR 0063) is scanned as any other.
//
// - Each album folder (folders.ts) is read with ffprobe and grouped by its tags (group.ts): an album
//   under its album artist, found again by its folder, its tracks by their files. A folder whose
//   files haven't changed (the same files, sizes and times) isn't read again.
// - A folder that can't be read as one album is kept in `music_unmatched` with its reason and its
//   files stay where they are, as shows keep theirs; one the owner ignored is passed by.
// - An album whose folder is gone is removed with its tracks, and an artist left with no albums
//   after it. A root folder that can't be read (an unmounted disk) is skipped whole, so a missing
//   disk never reads as every album deleted. Safe to repeat (ADR 0022): a second scan changes
//   nothing.
//
// MusicBrainz isn't asked here: albums and artists with an id are looked up afterwards by the
// `music.metadata` job (metadata.ts), at MusicBrainz's pace.
import { promises as fsp } from 'node:fs'
import { basename, dirname } from 'node:path'
import { newId } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'
import { sortTitleOf } from '../shared/fold.ts'
import type { Media } from '../shared/index.ts'
import { isWithin } from '../shared/paths.ts'
import { announce, type MusicDeps } from './context.ts'
import {
  type AlbumFolder,
  artistFolderFiles,
  artistFolderOf,
  discOfFolder,
  guessFromFolder,
  readMusicNfo,
  scanMusicFolder,
} from './folders.ts'
import { artistKey, type GroupedAlbum, groupAlbum } from './group.ts'
import { createTagReader, type TrackRead } from './tags.ts'

const { musicArtists, musicAlbums, musicMatches, musicTracks, musicUnmatched } = schema

export const MUSIC_SCAN_JOB = 'music.scan'

export type MusicScanResult = {
  /** Albums found for the first time. */
  added: number
  /** Albums whose files changed and were read again. */
  changed: number
  /** Albums whose folders are gone. */
  removed: number
  /** Albums whose files hadn't changed, left as they were. */
  unchanged: number
  /** Folders set aside this scan, with their reasons. */
  unmatched: number
  /** Tracks in the scanned albums. */
  tracks: number
  /** Files ffprobe couldn't read in albums otherwise read; the next scan tries them again. */
  unreadableFiles: number
  /** Root folders that couldn't be read, left alone. */
  unreadable: string[]
}

type Tx = Parameters<Parameters<MusicDeps['db']['transaction']>[0]>[0]

export function createMusicScan(ctx: MusicDeps, deps: { media: Media; afterScan: () => void }) {
  const { db, clock } = ctx
  const log = ctx.logger.child('music-scan')
  const readTags = ctx.readTags ?? createTagReader()

  const readable = (dir: string) =>
    fsp.readdir(dir).then(
      () => true,
      () => false,
    )

  /** The scope a change names: a disc folder (`CD2`) stands for its album. */
  const scopeOf = (root: string, folder: string) =>
    folder !== root && discOfFolder(basename(folder)) ? dirname(folder) : folder

  /** Whether the album's rows already match what's on disk, so its files needn't be read. */
  function unchanged(albumId: string, folder: AlbumFolder) {
    const rows = db
      .select({
        path: musicTracks.path,
        size: musicTracks.size,
        mtime: musicTracks.mtime,
        lyricsFile: musicTracks.lyricsFile,
      })
      .from(musicTracks)
      .where(eq(musicTracks.albumId, albumId))
      .all()
    if (rows.length !== folder.tracks.length) return false
    const byPath = new Map(rows.map((r) => [r.path, r]))
    return folder.tracks.every((t) => {
      const r = byPath.get(t.path)
      return r && r.size === t.size && r.mtime === t.mtime && r.lyricsFile === t.lyricsFile
    })
  }

  function findArtist(tx: Tx, name: string, mbid: string | null) {
    if (mbid) {
      const byId = tx.select().from(musicArtists).where(eq(musicArtists.musicBrainzId, mbid)).get()
      if (byId) return byId
    }
    const byName = tx
      .select()
      .from(musicArtists)
      .where(eq(musicArtists.nameKey, artistKey(name)))
      .all()
    // a namesake MusicBrainz tells apart stays apart
    return byName.find((a) => !mbid || !a.musicBrainzId || a.musicBrainzId === mbid) ?? null
  }

  function upsertArtist(
    tx: Tx,
    root: string,
    album: GroupedAlbum,
    files: { photoFile: string | null; folder: string | null },
    nfoArtistId: string | null,
  ) {
    const now = clock.now()
    const mbid = album.artistMusicBrainzId ?? nfoArtistId
    const have = findArtist(tx, album.artist, mbid)
    if (have) {
      const set: Partial<typeof musicArtists.$inferInsert> = {}
      if (mbid && !have.musicBrainzId) set.musicBrainzId = mbid
      if (!have.path && files.folder) set.path = files.folder
      if (files.folder && have.path === files.folder && have.photoFile !== files.photoFile)
        set.photoFile = files.photoFile
      if (have.source === 'tags' && have.genres.length === 0 && album.genres.length)
        set.genres = album.genres
      if (Object.keys(set).length)
        tx.update(musicArtists)
          .set({ ...set, updatedAt: now })
          .where(eq(musicArtists.id, have.id))
          .run()
      return have.id
    }
    const id = newId('ar')
    tx.insert(musicArtists)
      .values({
        id,
        name: album.artist,
        sortName: sortTitleOf(album.artist),
        nameKey: artistKey(album.artist),
        musicBrainzId: mbid,
        path: files.folder,
        rootFolder: root,
        photoFile: files.photoFile,
        genres: album.genres,
        source: 'tags',
        addedAt: now,
        updatedAt: now,
      })
      .run()
    return id
  }

  /** Writes one album and its tracks; returns its id. */
  function writeAlbum(
    tx: Tx,
    root: string,
    folder: AlbumFolder,
    album: GroupedAlbum,
    artistId: string,
  ): { id: string; created: boolean } {
    const now = clock.now()
    const have = tx.select().from(musicAlbums).where(eq(musicAlbums.path, folder.path)).get()
    const fromTags = {
      artistId,
      title: album.title,
      sortTitle: sortTitleOf(album.title),
      releaseId: album.releaseId,
      releaseGroupId: album.releaseGroupId ?? have?.releaseGroupId ?? null,
      coverFile: folder.coverFile,
      embeddedCover: album.embeddedCover,
      nfo: !!folder.nfo,
      rootFolder: root,
    }
    // what MusicBrainz says wins over the tags once it's been asked (metadata.ts)
    const details = {
      year: album.year,
      released: album.released,
      kind: album.kind,
      label: album.label,
      genres: album.genres,
    }
    let id: string
    let created = false
    if (have) {
      id = have.id
      const keepMusicBrainz = have.source === 'musicbrainz' && have.releaseId === album.releaseId
      tx.update(musicAlbums)
        .set({
          ...fromTags,
          ...(keepMusicBrainz ? {} : { ...details, source: 'tags' as const }),
          updatedAt: now,
        })
        .where(eq(musicAlbums.id, id))
        .run()
    } else {
      id = newId('al')
      created = true
      tx.insert(musicAlbums)
        .values({
          id,
          path: folder.path,
          ...fromTags,
          ...details,
          source: 'tags',
          addedAt: now,
          updatedAt: now,
        })
        .run()
    }

    const paths = album.tracks.map((t) => t.found.path)
    tx.delete(musicTracks)
      .where(
        paths.length
          ? and(eq(musicTracks.albumId, id), notInArray(musicTracks.path, paths))
          : eq(musicTracks.albumId, id),
      )
      .run()
    for (const t of album.tracks) {
      const a = t.read.audio
      const values = {
        albumId: id,
        disc: t.disc,
        number: t.number,
        title: t.title,
        artist: t.artist,
        duration: a.duration,
        recordingId: t.read.tags.musicBrainz.recordingId,
        discFolder: t.found.discFolder,
        size: t.found.size,
        mtime: t.found.mtime,
        format: a.format,
        codec: a.codec,
        bitrate: a.bitrate,
        sampleRate: a.sampleRate,
        bitDepth: a.bitDepth,
        channels: a.channels,
        lyricsFile: t.found.lyricsFile,
        updatedAt: now,
      }
      tx.insert(musicTracks)
        .values({ id: newId('tr'), path: t.found.path, addedAt: now, ...values })
        .onConflictDoUpdate({ target: musicTracks.path, set: values })
        .run()
    }
    return { id, created }
  }

  function setAside(
    tx: Tx,
    root: string,
    folder: AlbumFolder,
    reason: (typeof schema.MUSIC_UNMATCHED_REASONS)[number],
  ) {
    const guess = guessFromFolder(root, folder.path)
    const values = {
      rootFolder: root,
      reason,
      files: folder.tracks.length,
      size: folder.tracks.reduce((s, t) => s + t.size, 0),
      guessArtist: guess.artist,
      guessAlbum: guess.album,
      guessYear: guess.year,
    }
    tx.insert(musicUnmatched)
      .values({ id: newId('mu'), path: folder.path, foundAt: clock.now(), ...values })
      .onConflictDoUpdate({ target: musicUnmatched.path, set: values })
      .run()
    // a folder that was an album and no longer reads as one
    tx.delete(musicAlbums).where(eq(musicAlbums.path, folder.path)).run()
  }

  /** Removes artists left with no albums. */
  const pruneArtists = (tx: Tx) =>
    tx
      .delete(musicArtists)
      .where(
        sql`NOT EXISTS (SELECT 1 FROM ${musicAlbums} WHERE ${musicAlbums.artistId} = ${musicArtists.id})`,
      )
      .run()

  /**
   * The owner's Match for a folder the scan set aside (`music_matches`): its album artist, album
   * and year laid over every track's tags, so the folder groups as one album, at this scan and every
   * one after. The files and their tags stay as they are; a year that differs drops the tags' date.
   */
  function matched<R extends { read: TrackRead | null }>(path: string, reads: R[]): R[] {
    const m = db.select().from(musicMatches).where(eq(musicMatches.path, path)).get()
    if (!m) return reads
    return reads.map((r) => {
      if (!r.read) return r
      const t = r.read.tags
      const keepDate = m.year !== null && t.date?.startsWith(String(m.year))
      return {
        ...r,
        read: {
          ...r.read,
          tags: {
            ...t,
            album: m.album,
            albumArtist: m.artist,
            year: m.year,
            date: keepDate ? t.date : null,
            compilation: false,
          },
        },
      }
    })
  }

  /**
   * Scans every Music root folder, or only `folder` (an artist's or album's folder, after a change
   * seen by watching) when it's inside one.
   */
  async function scan({ folder }: { folder?: string } = {}): Promise<MusicScanResult> {
    const result: MusicScanResult = {
      added: 0,
      changed: 0,
      removed: 0,
      unchanged: 0,
      unmatched: 0,
      tracks: 0,
      unreadableFiles: 0,
      unreadable: [],
    }
    const touched = new Set<string>()
    const roots = deps.media.rootFolders.list('music').map((r) => r.path)
    const scopes = folder
      ? roots.filter((r) => isWithin(r, folder)).map((r) => scopeOf(r, folder))
      : roots
    for (const scope of scopes) {
      const root = roots.find((r) => isWithin(r, scope)) as string
      if (!(await readable(root))) {
        result.unreadable.push(root)
        log.warn('a root folder can’t be read; the scan leaves it alone', { root })
        continue
      }
      // a folder gone since the change was seen: what it held is removed below
      const found = (await scanMusicFolder(scope)) ?? { albums: [], videos: [] }
      const seen = new Set<string>()
      const artistFiles = new Map<string, Awaited<ReturnType<typeof artistFolderFiles>>>()

      for (const f of found.albums) {
        seen.add(f.path)
        const aside = db.select().from(musicUnmatched).where(eq(musicUnmatched.path, f.path)).get()
        if (aside?.ignored) continue
        const size = f.tracks.reduce((s, t) => s + t.size, 0)
        if (
          aside &&
          aside.reason !== 'unreadable' &&
          aside.files === f.tracks.length &&
          aside.size === size
        ) {
          result.unmatched++
          continue
        }
        const have = db
          .select({ id: musicAlbums.id, coverFile: musicAlbums.coverFile, nfo: musicAlbums.nfo })
          .from(musicAlbums)
          .where(eq(musicAlbums.path, f.path))
          .get()
        if (have && unchanged(have.id, f)) {
          if (have.coverFile !== f.coverFile || have.nfo !== !!f.nfo) {
            db.update(musicAlbums)
              .set({ coverFile: f.coverFile, nfo: !!f.nfo, updatedAt: clock.now() })
              .where(eq(musicAlbums.id, have.id))
              .run()
            touched.add(have.id)
          }
          result.unchanged++
          result.tracks += f.tracks.length
          continue
        }

        const reads: { found: (typeof f.tracks)[number]; read: TrackRead | null }[] = []
        for (const t of f.tracks) {
          const read = await readTags(t.path).catch((e: Error) => {
            log.info('couldn’t read a track', { path: t.path, error: e.message })
            return null
          })
          reads.push({ found: t, read })
        }
        const nfo = await readMusicNfo(f.nfo)
        const outcome = groupAlbum(matched(f.path, reads), nfo)
        const artistFolder = artistFolderOf(root, f.path)
        if (outcome.ok && artistFolder && !artistFiles.has(artistFolder))
          artistFiles.set(artistFolder, await artistFolderFiles(artistFolder))
        const af = artistFolder ? artistFiles.get(artistFolder) : undefined
        const artistNfo = af?.nfo ? (await readMusicNfo(af.nfo)).artistId : null

        const files = {
          photoFile: af?.photoFile ?? null,
          folder: artistFolder,
        }
        const written = db.transaction((tx) => {
          if (!outcome.ok) {
            setAside(tx, root, f, outcome.reason)
            return null
          }
          tx.delete(musicUnmatched).where(eq(musicUnmatched.path, f.path)).run()
          const artistId = upsertArtist(tx, root, outcome.album, files, artistNfo)
          return { ...writeAlbum(tx, root, f, outcome.album, artistId), artistId }
        })
        if (!outcome.ok || !written) {
          result.unmatched++
          continue
        }
        touched.add(written.id).add(written.artistId)
        if (written.created) result.added++
        else result.changed++
        result.tracks += outcome.album.tracks.length
        result.unreadableFiles += reads.filter((r) => !r.read).length
      }

      // what's gone from under the scope
      db.transaction((tx) => {
        const albums = tx
          .select({ id: musicAlbums.id, path: musicAlbums.path })
          .from(musicAlbums)
          .where(eq(musicAlbums.rootFolder, root))
          .all()
          .filter((a) => isWithin(scope, a.path) && !seen.has(a.path))
        if (albums.length) {
          tx.delete(musicAlbums)
            .where(
              inArray(
                musicAlbums.id,
                albums.map((a) => a.id),
              ),
            )
            .run()
          for (const a of albums) touched.add(a.id)
          result.removed += albums.length
        }
        const aside = tx
          .select({ id: musicUnmatched.id, path: musicUnmatched.path })
          .from(musicUnmatched)
          .where(eq(musicUnmatched.rootFolder, root))
          .all()
          .filter((u) => isWithin(scope, u.path) && !seen.has(u.path))
        if (aside.length)
          tx.delete(musicUnmatched)
            .where(
              inArray(
                musicUnmatched.id,
                aside.map((u) => u.id),
              ),
            )
            .run()
        pruneArtists(tx)

        // each artist's music videos, set aside and counted (answer 11)
        const artists = tx
          .select({ id: musicArtists.id, path: musicArtists.path, videos: musicArtists.videos })
          .from(musicArtists)
          .where(eq(musicArtists.rootFolder, root))
          .all()
          .filter((a) => a.path && isWithin(scope, a.path))
        for (const a of artists) {
          const n = found.videos.filter((v) => isWithin(a.path as string, v)).length
          if (n !== a.videos)
            tx.update(musicArtists).set({ videos: n }).where(eq(musicArtists.id, a.id)).run()
        }
      })
    }
    if (touched.size) {
      announce(ctx.events, touched)
      deps.afterScan()
    }
    log.info('scanned music', { ...result, folder: folder ?? null })
    return result
  }

  return { scan }
}

export type MusicScan = ReturnType<typeof createMusicScan>

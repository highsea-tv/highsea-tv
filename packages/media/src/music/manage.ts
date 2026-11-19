// SPDX-License-Identifier: AGPL-3.0-only
// The admin's changes to music (docs/product/music.md, HT-101): Unmatched's Match, an artist's or
// album's Refresh, and music's track naming.
//
// Match: the owner says what a set-aside folder is (its album artist, album and year, `MusicMatch`);
// it's kept in `music_matches` by the folder's path and laid over the files' tags at every scan
// (scan.ts), so the folder becomes an album now and stays one. Nothing on disk changes, as the
// spec's dialog says. There's no searching MusicBrainz by name (the owner's answer 10).
//
// Refresh: the folder is scanned again (what changed on disk is read), then MusicBrainz, the Cover
// Art Archive and fanart.tv are asked again for what carries an id.
//
// Track naming is Lidarr's (Servarr wiki, Lidarr settings › Track Naming:
// https://wiki.servarr.com/lidarr/settings#track-naming) with its defaults and renaming off: it's
// recorded now and acted on when highsea files music it downloads, a phase of its own. Nothing here
// renames a file; the owner's files are read where they are (ADR 0065).
import type { MusicMatch, TrackNaming } from '@highsea-tv/api-contract'
import { AppError } from '@highsea-tv/core'
import { readSetting, schema, writeSetting } from '@highsea-tv/db'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { invalid } from '../shared/context.ts'
import { announce, type MusicDeps } from './context.ts'

const { musicAlbums, musicArtists, musicMatches, musicUnmatched } = schema

export const TRACK_NAMING_KEY = 'trackNaming'

/** Lidarr's defaults (its NamingConfig), renaming off: highsea reads music where it is. */
export const defaultTrackNaming = (): TrackNaming => ({
  rename: false,
  standardFormat:
    '{Album Title} ({Release Year})/{Artist Name} - {Album Title} - {track:00} - {Track Title}',
  multiDiscFormat:
    '{Album Title} ({Release Year})/{Medium Format} {medium:00}/{Artist Name} - {Album Title} - {track:00} - {Track Title}',
  artistFolderFormat: '{Artist Name}',
})

const FORMATS = ['standardFormat', 'multiDiscFormat', 'artistFolderFormat'] as const
/** A track's file needs its number, or two tracks of an album would get one name. */
const TRACK_TOKEN = /\{track(:0+)?\}/i
const format = z.string().max(500)
export const trackNamingSchema = z.object({
  rename: z.boolean(),
  standardFormat: format,
  multiDiscFormat: format,
  artistFolderFormat: format,
})

export function createMusicManage(
  ctx: MusicDeps,
  deps: {
    scan: (opts: { folder?: string }) => Promise<unknown>
    refreshMetadata: (opts: {
      force?: boolean
      only?: { albums: string[]; artists: string[] }
    }) => Promise<unknown>
  },
) {
  const { db, clock } = ctx

  /**
   * Makes a waiting folder an album from what the owner typed, scans it now, and answers once
   * it's in. 404 when it isn't waiting (matched or gone since).
   */
  async function match(id: string, input: MusicMatch) {
    const waiting = db
      .select()
      .from(musicUnmatched)
      .where(and(eq(musicUnmatched.id, id), eq(musicUnmatched.ignored, false)))
      .get()
    if (!waiting) throw new AppError('not-found', 'That folder isn’t waiting.')
    const row = {
      path: waiting.path,
      artist: input.artist.trim(),
      album: input.album.trim(),
      year: input.year,
      matchedAt: clock.now(),
    }
    db.transaction((tx) => {
      tx.insert(musicMatches)
        .values(row)
        .onConflictDoUpdate({ target: musicMatches.path, set: row })
        .run()
      // the scan reads it again: an unchanged folder in Unmatched is otherwise passed by
      tx.delete(musicUnmatched).where(eq(musicUnmatched.id, id)).run()
    })
    announce(ctx.events, [id])
    await deps.scan({ folder: waiting.path })
    const album = db
      .select({ id: musicAlbums.id })
      .from(musicAlbums)
      .where(eq(musicAlbums.path, waiting.path))
      .get()
    return { albumId: album?.id ?? null }
  }

  /** Reads the artist's folders again, then asks MusicBrainz and fanart.tv again. */
  async function refreshArtist(id: string) {
    const a = db.select().from(musicArtists).where(eq(musicArtists.id, id)).get()
    if (!a) throw new AppError('not-found', 'That artist isn’t in the library.')
    const folders = a.path
      ? [a.path]
      : db
          .select({ path: musicAlbums.path })
          .from(musicAlbums)
          .where(eq(musicAlbums.artistId, id))
          .all()
          .map((r) => r.path)
    for (const folder of folders) await deps.scan({ folder })
    const albums = db
      .select({ id: musicAlbums.id })
      .from(musicAlbums)
      .where(eq(musicAlbums.artistId, id))
      .all()
      .map((r) => r.id)
    // MusicBrainz at one request a second: answered now, looked up after
    void deps
      .refreshMetadata({ force: true, only: { albums, artists: [id] } })
      .catch(() => undefined)
  }

  /** Reads the album's folder again, then asks MusicBrainz and the Cover Art Archive again. */
  async function refreshAlbum(id: string) {
    const a = db.select().from(musicAlbums).where(eq(musicAlbums.id, id)).get()
    if (!a) throw new AppError('not-found', 'That album isn’t in the library.')
    await deps.scan({ folder: a.path })
    void deps
      .refreshMetadata({ force: true, only: { albums: [id], artists: [a.artistId] } })
      .catch(() => undefined)
  }

  /** The stored naming over the defaults; a field that no longer parses reads its default. */
  function naming(): TrackNaming {
    const defaults = defaultTrackNaming()
    const stored = readSetting<Record<string, unknown>>(db, TRACK_NAMING_KEY, {})
    const out = { ...defaults }
    for (const key of Object.keys(defaults) as (keyof TrackNaming)[]) {
      const field = trackNamingSchema.shape[key].safeParse(stored[key])
      if (field.success && (key === 'rename' || String(field.data).trim()))
        (out as Record<string, unknown>)[key] = field.data
    }
    return out
  }

  function saveNaming(input: TrackNaming): TrackNaming {
    const parsed = trackNamingSchema.safeParse(input)
    if (!parsed.success)
      throw invalid(
        'That format isn’t valid. Check it and try again.',
        String(parsed.error.issues[0]?.path[0] ?? 'trackNaming'),
      )
    const value = { ...parsed.data }
    for (const k of FORMATS) {
      value[k] = value[k].trim()
      if (!value[k]) throw invalid('A format can’t be empty.', k)
    }
    for (const k of ['standardFormat', 'multiDiscFormat'] as const)
      if (!TRACK_TOKEN.test(value[k]))
        throw invalid('A track’s file needs {track:00} in it, or two tracks would get one name.', k)
    writeSetting(db, TRACK_NAMING_KEY, value, clock.now())
    return naming()
  }

  return { match, refreshArtist, refreshAlbum, naming, saveNaming }
}

export type MusicManage = ReturnType<typeof createMusicManage>

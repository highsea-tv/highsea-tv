// SPDX-License-Identifier: AGPL-3.0-only
// Music (Phase 5 D, ADR 0065): artists, their albums, each album's tracks with the file behind
// each, the folders the scan set aside, and MusicBrainz's and the Cover Art Archive's answers.
// Music has its own tables rather than rows in `media_items` (ADR 0065 says why): it has no TMDB
// id, isn't searched for or downloaded, and an album is a folder on disk read where it is.
//
// Every row is addressed by its own string id (`ar_…`, `al_…`, `tr_…`), as the drafted contract
// addresses music (`musicLibrary`, `music`). A track is its file: highsea reads the owner's files
// where they are, one row per file, so a track's id lasts as long as its path does.

import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

/** Where an artist's or album's details came from (the contract's `MUSIC_METADATA_SOURCES`). */
export const MUSIC_SOURCES = ['musicbrainz', 'tags'] as const
export type MusicSource = (typeof MUSIC_SOURCES)[number]

/** The contract's `ALBUM_KINDS`: MusicBrainz's primary type, a soundtrack or compilation first. */
export const MUSIC_ALBUM_KINDS = ['album', 'ep', 'single', 'soundtrack', 'compilation'] as const
export type MusicAlbumKind = (typeof MUSIC_ALBUM_KINDS)[number]

/** The contract's `UNMATCHED_REASONS`: why a folder couldn't be read as one album. */
export const MUSIC_UNMATCHED_REASONS = ['no-tags', 'no-album', 'many-albums', 'unreadable'] as const
export type MusicUnmatchedReason = (typeof MUSIC_UNMATCHED_REASONS)[number]

/**
 * An album artist, from the tags. Found again by their MusicBrainz id when one is known, else by
 * `name_key` (the name folded: lowercased, accents and a leading "The" dropped), so "The Beatles"
 * and "Beatles, The" on two albums are one artist.
 */
export const musicArtists = sqliteTable(
  'music_artists',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** For A–Z: MusicBrainz's sort name when known, else the name without a leading article. */
    sortName: text('sort_name').notNull(),
    nameKey: text('name_key').notNull(),
    /** MusicBrainz's artist id: the album artist id in the tags, or `artist.nfo`'s. */
    musicBrainzId: text('musicbrainz_id'),
    /** The artist's own folder (`Artist/` above their albums), when their albums share one. */
    path: text('path'),
    rootFolder: text('root_folder').notNull(),
    /** A picture in their folder (`artist.jpg`, `folder.jpg`), used as found. */
    photoFile: text('photo_file'),
    /** From MusicBrainz when known, else every album's genre tags. */
    genres: text('genres', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    source: text('source', { enum: MUSIC_SOURCES }).notNull(),
    addedAt: integer('added_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('music_artists_mbid').on(t.musicBrainzId).where(sql`musicbrainz_id IS NOT NULL`),
    index('music_artists_name').on(t.nameKey),
    index('music_artists_sort').on(t.sortName, t.id),
  ],
)

/**
 * An album: one folder of tracks (with `CD1`, `CD2` disc folders inside it when it has them), the
 * tracks agreeing on one album in their tags. Found again by its folder.
 */
export const musicAlbums = sqliteTable(
  'music_albums',
  {
    id: text('id').primaryKey(),
    artistId: text('artist_id')
      .notNull()
      .references(() => musicArtists.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    sortTitle: text('sort_title').notNull(),
    year: integer('year'),
    /** `YYYY-MM-DD`, `YYYY-MM` or `YYYY`: MusicBrainz's first release date, else the tags' date. */
    released: text('released'),
    kind: text('kind', { enum: MUSIC_ALBUM_KINDS }).notNull().default('album'),
    label: text('label'),
    genres: text('genres', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    /** MusicBrainz's release (the tags' `MUSICBRAINZ_ALBUMID`) and release group. */
    releaseId: text('release_id'),
    releaseGroupId: text('release_group_id'),
    /** The album's folder. */
    path: text('path').notNull(),
    rootFolder: text('root_folder').notNull(),
    /** A cover beside the tracks (`cover.jpg`, `folder.jpg`), used as found. */
    coverFile: text('cover_file'),
    /** A track whose file carries a picture (ffprobe's `attached_pic`), when there's no cover file. */
    embeddedCover: text('embedded_cover'),
    /** The Cover Art Archive's front image, when the folder and the files have none. */
    coverUrl: text('cover_url'),
    /** Lidarr's or Kodi's `album.nfo` is in the folder. */
    nfo: integer('nfo', { mode: 'boolean' }).notNull().default(false),
    source: text('source', { enum: MUSIC_SOURCES }).notNull(),
    addedAt: integer('added_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('music_albums_path').on(t.path),
    index('music_albums_artist').on(t.artistId, t.year),
    index('music_albums_sort').on(t.sortTitle, t.id),
    index('music_albums_added').on(t.addedAt, t.id),
    index('music_albums_root').on(t.rootFolder),
  ],
)

/** A track and its file, as ffprobe reads it. */
export const musicTracks = sqliteTable(
  'music_tracks',
  {
    id: text('id').primaryKey(),
    albumId: text('album_id')
      .notNull()
      .references(() => musicAlbums.id, { onDelete: 'cascade' }),
    disc: integer('disc').notNull().default(1),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    /** The track's own artist when it isn't the album's (a guest, a compilation). */
    artist: text('artist'),
    /** Seconds. */
    duration: real('duration').notNull().default(0),
    /** MusicBrainz's recording id, when the tags carry it. */
    recordingId: text('recording_id'),
    path: text('path').notNull(),
    /** The disc's own folder (`CD1`), or null when the album's tracks share its folder. */
    discFolder: text('disc_folder'),
    size: integer('size').notNull(),
    /** The file's modification time in ms, to tell a changed file at the next scan. */
    mtime: integer('mtime').notNull(),
    /** FLAC, MP3, AAC, ALAC… */
    format: text('format').notNull(),
    /** ffprobe's `codec_name`, for playback's decisions. */
    codec: text('codec').notNull(),
    /** Kilobits a second. */
    bitrate: integer('bitrate').notNull().default(0),
    sampleRate: integer('sample_rate').notNull().default(0),
    /** Lossless files only. */
    bitDepth: integer('bit_depth'),
    channels: integer('channels').notNull().default(2),
    /** A `.lrc` beside it with the same name. */
    lyricsFile: text('lyrics_file'),
    addedAt: integer('added_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('music_tracks_path').on(t.path),
    index('music_tracks_album').on(t.albumId, t.disc, t.number),
  ],
)

/**
 * A folder of music the scan couldn't read as one album, with why (the admin's Unmatched). Its
 * files stay where they are. `ignored` is the owner's Ignore: later scans pass it by. A row goes
 * when the folder reads as an album, or is gone.
 */
export const musicUnmatched = sqliteTable(
  'music_unmatched',
  {
    id: text('id').primaryKey(),
    path: text('path').notNull(),
    rootFolder: text('root_folder').notNull(),
    reason: text('reason', { enum: MUSIC_UNMATCHED_REASONS }).notNull(),
    files: integer('files').notNull(),
    size: integer('size').notNull(),
    /** What the folder's names suggest (`Artist/Album (Year)`), for the Match dialog. */
    guessArtist: text('guess_artist'),
    guessAlbum: text('guess_album'),
    guessYear: integer('guess_year'),
    ignored: integer('ignored', { mode: 'boolean' }).notNull().default(false),
    foundAt: integer('found_at').notNull(),
  },
  (t) => [
    uniqueIndex('music_unmatched_path').on(t.path),
    index('music_unmatched_root').on(t.rootFolder, t.ignored),
  ],
)

/** What MusicBrainz and the Cover Art Archive are asked for, each by its MusicBrainz id. */
export const MUSICBRAINZ_KINDS = ['artist', 'release', 'release-group', 'cover'] as const
export type MusicBrainzKind = (typeof MUSICBRAINZ_KINDS)[number]

/**
 * MusicBrainz's answers (`/ws/2/artist`, `/release`, `/release-group`) and the Cover Art Archive's
 * (`cover`, a release group's image list), as sent, by id (ADR 0030's cache, ADR 0065). `data` is
 * null when the id isn't known there (a 404), so it isn't asked again until the row is old. A
 * failure writes nothing.
 */
export const musicBrainzCache = sqliteTable(
  'musicbrainz_cache',
  {
    kind: text('kind', { enum: MUSICBRAINZ_KINDS }).notNull(),
    mbid: text('mbid').notNull(),
    data: text('data', { mode: 'json' }),
    fetchedAt: integer('fetched_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.kind, t.mbid] }), index('musicbrainz_fetched').on(t.fetchedAt)],
)

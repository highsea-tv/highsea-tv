// SPDX-License-Identifier: AGPL-3.0-only
// Music as the admin keeps it (docs/product/music.md), drafted with HT-68 for Phase 5's part D
// (phase-5-real-use.md, the owner's answers 10 and 12; prototype-gaps.md's stage 7): artists, their
// albums, each album's discs and tracks with the file behind each, the folders the scan couldn't
// read as an album (Unmatched), each Music folder's figures, and music's naming. Every route here
// is a draft the prototypes' mock answers and the real server answers 501 until it has music
// (`draft()` in common.ts), and the admin draws Music only when public info's `sources` lists
// `music`. They sit beside the apps' `/music` (music.ts), as the admin's shows sit at `/series`
// beside the apps' `/shows`, and take Lidarr's nouns: artists, albums, tracks and track files.
//
// Music differs from films where the plan says so: metadata comes from the files' tags first, then
// MusicBrainz and the Cover Art Archive where a MusicBrainz id is known (answer 10), so there's no
// TMDB id and every artist and album says where its details came from (`source`). Nothing here
// searches for or downloads music: that's a phase of its own after Phase 5.
import { createRoute, z } from '@hono/zod-openapi'
import {
  API_PREFIX,
  access,
  body,
  draft,
  errors,
  IdParam,
  IsoDate,
  IsoDay,
  json,
  noContent,
  notServed,
} from './common.ts'
import { ALBUM_KINDS } from './kinds.ts'

/**
 * Where an artist's or album's details came from: MusicBrainz (with the Cover Art Archive's cover)
 * when the tags or the folder's NFO carry its id, the files' own tags otherwise.
 */
export const MUSIC_METADATA_SOURCES = ['musicbrainz', 'tags'] as const

/** The file behind a track, as ffprobe reads it. */
export const TrackFile = z
  .object({
    path: z.string(),
    /** The codec's short name: FLAC, MP3, AAC, ALAC. */
    format: z.string(),
    /** Kilobits a second; a lossless file's average. */
    bitrate: z.number().int().nonnegative(),
    /** Hertz. */
    sampleRate: z.number().int().nonnegative(),
    /** 16 or 24 for lossless files; null for lossy ones, which have none. */
    bitDepth: z.number().int().nullable(),
    /** Bytes. */
    size: z.number().nonnegative(),
    /** A `.lrc` beside it with the same name. */
    lyrics: z.boolean(),
  })
  .openapi('TrackFile')

export const LibraryTrack = z
  .object({
    id: z.string(),
    disc: z.number().int().min(1),
    /** Its place on its disc, from 1. */
    number: z.number().int().min(1),
    title: z.string(),
    /** The track's own artist when it isn't the album's (a guest, a compilation). */
    artist: z.string().nullable(),
    /** Seconds. */
    duration: z.number().nonnegative(),
    file: TrackFile,
  })
  .openapi('LibraryTrack')

export const LibraryDisc = z
  .object({
    number: z.number().int().min(1),
    /** The disc's own folder (`CD1`), or null when the album's tracks share one. */
    folder: z.string().nullable(),
    tracks: z.array(LibraryTrack),
  })
  .openapi('LibraryDisc')

/** An album in the admin's library. */
export const LibraryAlbum = z
  .object({
    id: z.string(),
    title: z.string(),
    sortTitle: z.string(),
    /** The album artist, from the tags. */
    artist: z.object({ id: z.string(), name: z.string() }),
    year: z.number().int().nullable(),
    kind: z.enum(ALBUM_KINDS),
    cover: z.string().nullable(),
    genres: z.array(z.string()),
    tracks: z.number().int().nonnegative(),
    discs: z.number().int().min(1),
    /** Seconds, every track together. */
    duration: z.number().nonnegative(),
    /** Bytes on disk. */
    size: z.number().nonnegative(),
    /** Each format among its files, the most first: ["FLAC"], or ["MP3", "FLAC"]. */
    formats: z.array(z.string()),
    /** Its folder. */
    path: z.string(),
    source: z.enum(MUSIC_METADATA_SOURCES),
    /** The release group's MusicBrainz id, when known. */
    musicBrainzId: z.string().nullable(),
    addedAt: IsoDate,
  })
  .openapi('LibraryAlbum')

/** An album with its discs and tracks, newest details first. */
export const LibraryAlbumDetail = LibraryAlbum.extend({
  /** From MusicBrainz, or the tags' date; null when neither has one. */
  released: IsoDay.nullable(),
  label: z.string().nullable(),
  discList: z.array(LibraryDisc),
  /** What else is in the folder: its cover file (`folder.jpg`) and Lidarr's `album.nfo`. */
  extras: z.object({ coverFile: z.string().nullable(), nfo: z.boolean() }),
}).openapi('LibraryAlbumDetail')

/** An artist in the admin's library: an album artist from the tags. */
export const LibraryArtist = z
  .object({
    id: z.string(),
    name: z.string(),
    sortName: z.string(),
    /** The folder's artist picture, else MusicBrainz's; null when neither. */
    photo: z.string().nullable(),
    genres: z.array(z.string()),
    albums: z.number().int().nonnegative(),
    tracks: z.number().int().nonnegative(),
    /** Bytes on disk. */
    size: z.number().nonnegative(),
    /** Their folder. */
    path: z.string(),
    source: z.enum(MUSIC_METADATA_SOURCES),
    musicBrainzId: z.string().nullable(),
    addedAt: IsoDate,
  })
  .openapi('LibraryArtist')

/** An artist with their albums, newest first. */
export const LibraryArtistDetail = LibraryArtist.extend({
  /** From MusicBrainz, when known. */
  bio: z.string().nullable(),
  albumList: z.array(LibraryAlbum),
  /** Music videos (`.mp4`) in their folders, set aside for a later part (answer 11). */
  videos: z.number().int().nonnegative(),
}).openapi('LibraryArtistDetail')

/**
 * Why the scan couldn't read a folder as an album: its files have no tags to group by, no album
 * tag, tags naming more than one album, or files it couldn't open.
 */
export const UNMATCHED_REASONS = ['no-tags', 'no-album', 'many-albums', 'unreadable'] as const

/** A folder of music the scan set aside, until the owner says what it is or ignores it. */
export const UnmatchedMusic = z
  .object({
    id: z.string(),
    /** The folder. */
    path: z.string(),
    files: z.number().int().nonnegative(),
    size: z.number().nonnegative(),
    reason: z.enum(UNMATCHED_REASONS),
    /** What the folder's names suggest (`Artist/Album (Year)`), for the dialog to start from. */
    guess: z.object({
      artist: z.string().nullable(),
      album: z.string().nullable(),
      year: z.number().int().nullable(),
    }),
    foundAt: IsoDate,
  })
  .openapi('UnmatchedMusic')

/** What a set-aside folder is: its album artist, album and year, applied to every file in it. */
export const MusicMatch = z
  .object({
    artist: z.string().trim().min(1).max(200),
    album: z.string().trim().min(1).max(200),
    year: z.number().int().min(1000).max(9999).nullable(),
  })
  .openapi('MusicMatch')

/** A Music root folder's figures, for Settings' folders and the dashboard's Storage. */
export const MusicFolder = z
  .object({
    /** The root folder (`rootFolders.list`). */
    id: z.string(),
    artists: z.number().int().nonnegative(),
    albums: z.number().int().nonnegative(),
    tracks: z.number().int().nonnegative(),
    /** Bytes its tracks take. */
    size: z.number().nonnegative(),
    unmatched: z.number().int().nonnegative(),
  })
  .openapi('MusicFolder')

/**
 * Music's naming, as Lidarr's Track Naming (https://wiki.servarr.com/lidarr/settings#track-naming):
 * an album's tracks, the same with a folder per disc, and the artist's folder. Only a folder
 * highsea manages is renamed; one it only reads (ADR 0063) keeps its names.
 */
export const TrackNaming = z
  .object({
    rename: z.boolean(),
    /** The album's folder and a track's file, without its extension. */
    standardFormat: z.string(),
    /** The same for an album of more than one disc. */
    multiDiscFormat: z.string(),
    artistFolderFormat: z.string(),
  })
  .openapi('TrackNaming')

const staff = { ...access('staff'), ...draft() }
const refused = errors('unauthorized', 'forbidden')
const DRAFTED = 'Drafted: the server answers 501 until it has music.'

const ARTISTS = `${API_PREFIX}/artists`
const ALBUMS = `${API_PREFIX}/albums`
const UNMATCHED = `${ALBUMS}/unmatched`

// Static paths come before `/albums/{id}`, which would match them too: register them first.
export const musicLibrary = {
  folders: createRoute({
    method: 'get',
    path: `${API_PREFIX}/music/folders`,
    tags: ['Music library'],
    summary: 'Each Music folder’s artists, albums, tracks and size (draft)',
    description: `For Settings › Media management and the dashboard’s Storage. ${DRAFTED}`,
    ...staff,
    responses: { 200: json(z.array(MusicFolder), 'The folders'), ...refused, ...notServed },
  }),
  unmatched: createRoute({
    method: 'get',
    path: UNMATCHED,
    tags: ['Music library'],
    summary: 'The folders the scan couldn’t read as an album (draft)',
    description: DRAFTED,
    ...staff,
    responses: {
      200: json(z.array(UnmatchedMusic), 'The folders set aside'),
      ...refused,
      ...notServed,
    },
  }),
  match: createRoute({
    method: 'post',
    path: `${UNMATCHED}/{id}`,
    tags: ['Music library'],
    summary: 'Say what a set-aside folder is (draft)',
    description: `Its files join that album, made when it isn’t here; nothing on disk changes. ${DRAFTED}`,
    ...staff,
    request: { params: IdParam, ...body(MusicMatch) },
    responses: {
      ...noContent,
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
      ...notServed,
    },
  }),
  ignore: createRoute({
    method: 'delete',
    path: `${UNMATCHED}/{id}`,
    tags: ['Music library'],
    summary: 'Leave a set-aside folder out of the library (draft)',
    description: `Later scans pass it by; nothing on disk changes. ${DRAFTED}`,
    ...staff,
    request: { params: IdParam },
    responses: {
      ...noContent,
      ...errors('unauthorized', 'forbidden', 'not-found'),
      ...notServed,
    },
  }),
  artists: createRoute({
    method: 'get',
    path: ARTISTS,
    tags: ['Music library'],
    summary: 'The artists in the library (draft)',
    description: DRAFTED,
    ...staff,
    responses: { 200: json(z.array(LibraryArtist), 'The artists'), ...refused, ...notServed },
  }),
  artist: createRoute({
    method: 'get',
    path: `${ARTISTS}/{id}`,
    tags: ['Music library'],
    summary: 'An artist with their albums (draft)',
    description: `404 when they aren’t here. ${DRAFTED}`,
    ...staff,
    request: { params: IdParam },
    responses: {
      200: json(LibraryArtistDetail, 'The artist'),
      ...errors('unauthorized', 'forbidden', 'not-found'),
      ...notServed,
    },
  }),
  refreshArtist: createRoute({
    method: 'post',
    path: `${ARTISTS}/{id}/refresh`,
    tags: ['Music library'],
    summary: 'Read an artist’s tags again and refresh them from MusicBrainz (draft)',
    description: `Their albums too. MusicBrainz is asked only where an id is known, at its pace of one request a second. ${DRAFTED}`,
    ...staff,
    request: { params: IdParam },
    responses: {
      ...noContent,
      ...errors('unauthorized', 'forbidden', 'not-found'),
      ...notServed,
    },
  }),
  albums: createRoute({
    method: 'get',
    path: ALBUMS,
    tags: ['Music library'],
    summary: 'The albums in the library (draft)',
    description: DRAFTED,
    ...staff,
    responses: { 200: json(z.array(LibraryAlbum), 'The albums'), ...refused, ...notServed },
  }),
  album: createRoute({
    method: 'get',
    path: `${ALBUMS}/{id}`,
    tags: ['Music library'],
    summary: 'An album with its discs, tracks and files (draft)',
    description: `404 when it isn’t here. ${DRAFTED}`,
    ...staff,
    request: { params: IdParam },
    responses: {
      200: json(LibraryAlbumDetail, 'The album'),
      ...errors('unauthorized', 'forbidden', 'not-found'),
      ...notServed,
    },
  }),
  refreshAlbum: createRoute({
    method: 'post',
    path: `${ALBUMS}/{id}/refresh`,
    tags: ['Music library'],
    summary: 'Read an album’s tags again and refresh it from MusicBrainz (draft)',
    description: `The Cover Art Archive’s cover comes too, unless the folder has its own. ${DRAFTED}`,
    ...staff,
    request: { params: IdParam },
    responses: {
      ...noContent,
      ...errors('unauthorized', 'forbidden', 'not-found'),
      ...notServed,
    },
  }),
  naming: createRoute({
    method: 'get',
    path: `${API_PREFIX}/settings/trackNaming`,
    tags: ['Music library'],
    summary: 'Music’s naming (draft)',
    description: `Lidarr’s formats and tokens. ${DRAFTED}`,
    ...staff,
    responses: { 200: json(TrackNaming, 'Track naming'), ...refused, ...notServed },
  }),
  saveNaming: createRoute({
    method: 'put',
    path: `${API_PREFIX}/settings/trackNaming`,
    tags: ['Music library'],
    summary: 'Save music’s naming (draft)',
    description: `The details’ \`reason\` names the field a format is refused for. ${DRAFTED}`,
    ...staff,
    request: { ...body(TrackNaming) },
    responses: {
      200: json(TrackNaming, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
      ...notServed,
    },
  }),
} as const

export type MusicMetadataSource = (typeof MUSIC_METADATA_SOURCES)[number]
export type TrackFile = z.infer<typeof TrackFile>
export type LibraryTrack = z.infer<typeof LibraryTrack>
export type LibraryDisc = z.infer<typeof LibraryDisc>
export type LibraryAlbum = z.infer<typeof LibraryAlbum>
export type LibraryAlbumDetail = z.infer<typeof LibraryAlbumDetail>
export type LibraryArtist = z.infer<typeof LibraryArtist>
export type LibraryArtistDetail = z.infer<typeof LibraryArtistDetail>
export type UnmatchedReason = (typeof UNMATCHED_REASONS)[number]
export type UnmatchedMusic = z.infer<typeof UnmatchedMusic>
export type MusicMatch = z.infer<typeof MusicMatch>
export type MusicFolder = z.infer<typeof MusicFolder>
export type TrackNaming = z.infer<typeof TrackNaming>

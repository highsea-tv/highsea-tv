// SPDX-License-Identifier: AGPL-3.0-only
// The music library and each person's playlists as the apps read them (prototype-gaps.md › 3.8),
// drafted with B3 of the one client platform (one-client-platform-b.md, the owner's answer 1):
// every route here is a draft the prototypes' mock answers and the real server answers 501 until
// it has music (`draft()` in common.ts). Music is addressed by its own string ids. A playlist is
// its person's own; smart and shared playlists come later.
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
import { ClientAlbum, ClientArtist, ClientSong } from './kinds.ts'
import { ClientItem } from './library.ts'

/** Every artist and album the household can play; empty on a server without music. */
export const ClientMusic = z
  .object({ artists: z.array(ClientArtist), albums: z.array(ClientAlbum) })
  .openapi('ClientMusic')

/**
 * A song in the player's queue: the song, its album, and its loudness from the server's analysis
 * of the file (as Plex's loudness analysis gives Plexamp its waveform), drawn as the scrubber.
 */
export const QueuedSong = ClientSong.extend({
  album: ClientAlbum,
  /** The song's loudness from start to end in even steps, each 0 to 1. */
  loudness: z.array(z.number().min(0).max(1)),
}).openapi('QueuedSong')

/** A song with its album, as Music's Songs lists it. */
export const ClientLibrarySong = ClientSong.extend({
  album: ClientAlbum,
  /** How many times the household has played it, for Most played. */
  plays: z.number().int().min(0),
}).openapi('ClientLibrarySong')

/** What the player is asked to play: an album, an artist, a playlist, or songs by id. */
export const MusicSource = z
  .union([
    z.object({ album: z.string() }),
    z.object({ artist: z.string() }),
    z.object({ playlist: z.string() }),
    z.object({ songs: z.array(z.string()).min(1).max(500) }),
  ])
  .openapi('MusicSource')

/** One of the person's own playlists. */
export const ClientPlaylist = z
  .object({
    id: z.string(),
    name: z.string(),
    /** How many songs, and their length in seconds. */
    songs: z.number().int(),
    duration: z.number().min(0),
    /** The first four albums' covers, for the mosaic; fewer when the playlist has fewer albums. */
    covers: z.array(z.string()),
    updatedAt: IsoDate,
  })
  .openapi('ClientPlaylist')

/** A playlist and its songs, in its order; `entry` tells two of the same song apart. */
export const ClientPlaylistDetail = z
  .object({
    playlist: ClientPlaylist,
    songs: z.array(ClientLibrarySong.extend({ entry: z.string() })),
  })
  .openapi('ClientPlaylistDetail')

/**
 * An album with its songs, its length, when and by whom it was released, the film here it
 * scores, and the artist's other albums.
 */
export const ClientAlbumDetail = z
  .object({
    album: ClientAlbum,
    songs: z.array(ClientSong),
    /** Seconds, every song together. */
    duration: z.number().min(0),
    released: IsoDay,
    label: z.string(),
    /** The album's note from its metadata, when there is one. */
    about: z.string().nullable(),
    /** The film here this album is the score of. */
    film: ClientItem.nullable(),
    /** The artist's other albums here, newest first. */
    more: z.array(ClientAlbum),
  })
  .openapi('ClientAlbumDetail')

/** How an artist's albums are grouped on their page, as Apple Music and Plexamp group them. */
export const DISCOGRAPHY_KINDS = ['albums', 'singles', 'soundtracks', 'compilations'] as const

/** An artist, their albums here grouped by kind (newest first in each), and like artists. */
export const ClientArtistDetail = z
  .object({
    artist: ClientArtist,
    bio: z.string().nullable(),
    /** The newest album's cover, blurred behind the page. */
    backdrop: z.string().nullable(),
    songs: z.number().int(),
    /** Their person page (TMDB's number), when they're credited on a film or show here. */
    person: z.number().int().nullable(),
    sections: z.array(z.object({ kind: z.enum(DISCOGRAPHY_KINDS), albums: z.array(ClientAlbum) })),
    similar: z.array(ClientArtist),
  })
  .openapi('ClientArtistDetail')

export const QueueRequest = z
  .object({ source: MusicSource, shuffle: z.boolean().default(false) })
  .openapi('QueueRequest')

const PlaylistName = z.string().trim().min(1).max(100)
const SongIds = z.array(z.string()).max(500)

const MUSIC = `${API_PREFIX}/music`
const PLAYLISTS = `${MUSIC}/playlists`

/** The marks every route here shares: the person's own, and drafted. */
const mine = { ...access('user'), ...draft() }
const DRAFTED = 'Drafted: the server answers 501 until it has music.'

export const music = {
  library: createRoute({
    method: 'get',
    path: MUSIC,
    tags: ['Music'],
    summary: 'Every artist and album you can play (draft)',
    description: `Empty on a server without music. ${DRAFTED}`,
    ...mine,
    responses: { 200: json(ClientMusic, 'The music'), ...errors('unauthorized'), ...notServed },
  }),
  songs: createRoute({
    method: 'get',
    path: `${MUSIC}/songs`,
    tags: ['Music'],
    summary: 'Every song here, for Music’s Songs (draft)',
    description: `Sorted and filtered by the apps. ${DRAFTED}`,
    ...mine,
    responses: {
      200: json(z.array(ClientLibrarySong), 'The songs'),
      ...errors('unauthorized'),
      ...notServed,
    },
  }),
  album: createRoute({
    method: 'get',
    path: `${MUSIC}/albums/{id}`,
    tags: ['Music'],
    summary: 'An album with its songs (draft)',
    description: `404 when it isn’t here. ${DRAFTED}`,
    ...mine,
    request: { params: IdParam },
    responses: {
      200: json(ClientAlbumDetail, 'The album'),
      ...errors('unauthorized', 'not-found'),
      ...notServed,
    },
  }),
  artist: createRoute({
    method: 'get',
    path: `${MUSIC}/artists/{id}`,
    tags: ['Music'],
    summary: 'An artist with their albums by kind (draft)',
    description: `404 when they aren’t here. ${DRAFTED}`,
    ...mine,
    request: { params: IdParam },
    responses: {
      200: json(ClientArtistDetail, 'The artist'),
      ...errors('unauthorized', 'not-found'),
      ...notServed,
    },
  }),
  queue: createRoute({
    method: 'post',
    path: `${MUSIC}/queue`,
    tags: ['Music'],
    summary: 'The songs to play for an album, an artist, a playlist or songs (draft)',
    description: `An album's in order, an artist's newest album first, shuffled when asked; each with its loudness for the scrubber. An album or an artist played goes on Home's Recently played. 404 when there's nothing to play. ${DRAFTED}`,
    ...mine,
    request: body(QueueRequest),
    responses: {
      200: json(z.array(QueuedSong), 'The queue'),
      ...errors('invalid', 'unauthorized', 'not-found'),
      ...notServed,
    },
  }),
  tracks: createRoute({
    method: 'get',
    path: `${MUSIC}/tracks`,
    tags: ['Music'],
    summary: 'Songs for the queue by id, for Play next and Add to queue (draft)',
    description: `Unlike the queue, these aren’t recorded as played; ids not here are left out. ${DRAFTED}`,
    ...mine,
    request: {
      query: z.object({
        ids: z.string().max(4000).openapi({ description: 'Song ids, comma-separated' }),
      }),
    },
    responses: {
      200: json(z.array(QueuedSong), 'The songs'),
      ...errors('invalid', 'unauthorized'),
      ...notServed,
    },
  }),
} as const

export const playlists = {
  list: createRoute({
    method: 'get',
    path: PLAYLISTS,
    tags: ['Music'],
    summary: 'Your own playlists, the most recently changed first (draft)',
    description: DRAFTED,
    ...mine,
    responses: {
      200: json(z.array(ClientPlaylist), 'The playlists'),
      ...errors('unauthorized'),
      ...notServed,
    },
  }),
  get: createRoute({
    method: 'get',
    path: `${PLAYLISTS}/{id}`,
    tags: ['Music'],
    summary: 'A playlist and its songs (draft)',
    description: `404 when it isn't yours, or was deleted. ${DRAFTED}`,
    ...mine,
    request: { params: IdParam },
    responses: {
      200: json(ClientPlaylistDetail, 'The playlist'),
      ...errors('unauthorized', 'not-found'),
      ...notServed,
    },
  }),
  create: createRoute({
    method: 'post',
    path: PLAYLISTS,
    tags: ['Music'],
    summary: 'Make a playlist, with songs in it or none (draft)',
    description: DRAFTED,
    ...mine,
    request: body(
      z.object({ name: PlaylistName, songs: SongIds.default([]) }).openapi('NewPlaylist'),
    ),
    responses: {
      200: json(ClientPlaylist, 'The playlist'),
      ...errors('invalid', 'unauthorized'),
      ...notServed,
    },
  }),
  rename: createRoute({
    method: 'patch',
    path: `${PLAYLISTS}/{id}`,
    tags: ['Music'],
    summary: 'Rename a playlist (draft)',
    description: DRAFTED,
    ...mine,
    request: { params: IdParam, ...body(z.object({ name: PlaylistName })) },
    responses: {
      ...noContent,
      ...errors('invalid', 'unauthorized', 'not-found'),
      ...notServed,
    },
  }),
  add: createRoute({
    method: 'post',
    path: `${PLAYLISTS}/{id}/songs`,
    tags: ['Music'],
    summary: 'Add songs at the end, in the order given (draft)',
    description: DRAFTED,
    ...mine,
    request: { params: IdParam, ...body(z.object({ songs: SongIds.min(1) })) },
    responses: {
      ...noContent,
      ...errors('invalid', 'unauthorized', 'not-found'),
      ...notServed,
    },
  }),
  remove: createRoute({
    method: 'delete',
    path: `${PLAYLISTS}/{id}/songs/{entry}`,
    tags: ['Music'],
    summary: 'Take one entry out of a playlist (draft)',
    description: DRAFTED,
    ...mine,
    request: {
      params: IdParam.extend({
        entry: z.string().openapi({ param: { name: 'entry', in: 'path' } }),
      }),
    },
    responses: { ...noContent, ...errors('unauthorized', 'not-found'), ...notServed },
  }),
  reorder: createRoute({
    method: 'put',
    path: `${PLAYLISTS}/{id}/order`,
    tags: ['Music'],
    summary: 'Put a playlist’s entries in a new order (draft)',
    description: `Entries left out are dropped. ${DRAFTED}`,
    ...mine,
    request: { params: IdParam, ...body(z.object({ entries: z.array(z.string()).max(5000) })) },
    responses: {
      ...noContent,
      ...errors('invalid', 'unauthorized', 'not-found'),
      ...notServed,
    },
  }),
  delete: createRoute({
    method: 'delete',
    path: `${PLAYLISTS}/{id}`,
    tags: ['Music'],
    summary: 'Delete a playlist (draft)',
    description: DRAFTED,
    ...mine,
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'not-found'), ...notServed },
  }),
} as const

export type ClientMusic = z.infer<typeof ClientMusic>
export type QueuedSong = z.infer<typeof QueuedSong>
export type ClientLibrarySong = z.infer<typeof ClientLibrarySong>
export type MusicSource = z.infer<typeof MusicSource>
export type ClientPlaylist = z.infer<typeof ClientPlaylist>
export type ClientPlaylistDetail = z.infer<typeof ClientPlaylistDetail>
export type ClientAlbumDetail = z.infer<typeof ClientAlbumDetail>
export type DiscographyKind = (typeof DISCOGRAPHY_KINDS)[number]
export type ClientArtistDetail = z.infer<typeof ClientArtistDetail>
export type QueueRequest = z.infer<typeof QueueRequest>

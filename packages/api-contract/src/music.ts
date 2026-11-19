// SPDX-License-Identifier: AGPL-3.0-only
// The music library and each person's playlists as the apps read them (prototype-gaps.md › 3.8),
// drafted with B3 of the one client platform (one-client-platform-b.md, the owner's answer 1) and
// served since Phase 5's part D (HT-101, ADR 0065). Music is addressed by its own string ids. A
// playlist is its profile's own; smart and shared playlists come later.
//
// Playing a song (ADR 0051's and 0052's sections of 2026-11-19): `music.play` starts a play on the
// device and answers the address its audio element loads (`/stream/music/{token}`, the token the
// only credential, as a film's `/stream/files/…` is). The file goes as it is, by byte ranges, when
// the device's profile plays its codec, else made into AAC. The player reports its place
// (`music.progress`) and ends the play (`music.stop`): that's the play Now playing shows and the
// one the history and play counts keep.
import { createRoute, z } from '@hono/zod-openapi'
import {
  API_PREFIX,
  access,
  body,
  errors,
  IdParam,
  IsoDate,
  IsoDay,
  json,
  noContent,
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
    /** Null when neither MusicBrainz nor the tags give a full date. */
    released: IsoDay.nullable(),
    label: z.string().nullable(),
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

/** How a song goes to the player: its file as it is, or made into AAC for a device without its codec. */
export const MUSIC_PLAY_METHODS = ['direct-play', 'transcode'] as const

export const MusicPlayRequest = z
  .object({
    /**
     * A built-in device profile's id (ADR 0052), as a film's play request names one; else the
     * device's own, or the default.
     */
    profile: z.string().max(64).optional(),
  })
  .openapi('MusicPlayRequest')

/** A song started on this device: what its audio element loads, and how long the address lasts. */
export const MusicPlay = z
  .object({
    /** The play, for its reports and its end. */
    id: z.string(),
    /** `/stream/music/{token}`: the file by byte ranges, or the AAC made from it. */
    url: z.string(),
    method: z.enum(MUSIC_PLAY_METHODS),
    /** The audio's media type: `audio/flac`, `audio/mpeg`, `audio/mp4`, `audio/ogg`. */
    contentType: z.string(),
    /** Why it isn't played as it is, in the server's language; empty for a direct play. */
    reasons: z.array(z.string()),
    /** Seconds. */
    duration: z.number().min(0),
    /** The address stops working after this unless a report renews it. */
    expiresAt: IsoDate,
  })
  .openapi('MusicPlay')

export const MusicPlayReport = z
  .object({
    /** Seconds into the song. */
    position: z.number().min(0),
    paused: z.boolean(),
  })
  .openapi('MusicPlayReport')

export const QueueRequest = z
  .object({ source: MusicSource, shuffle: z.boolean().default(false) })
  .openapi('QueueRequest')

const PlaylistName = z.string().trim().min(1).max(100)
const SongIds = z.array(z.string()).max(500)

const MUSIC = `${API_PREFIX}/music`
const PLAYLISTS = `${MUSIC}/playlists`

/** Every route here is the person's own. */
const mine = access('user')

export const music = {
  library: createRoute({
    method: 'get',
    path: MUSIC,
    tags: ['Music'],
    summary: 'Every artist and album you can play',
    description: `Empty on a server without music.`,
    ...mine,
    responses: { 200: json(ClientMusic, 'The music'), ...errors('unauthorized') },
  }),
  songs: createRoute({
    method: 'get',
    path: `${MUSIC}/songs`,
    tags: ['Music'],
    summary: 'Every song here, for Music’s Songs',
    description: `Sorted and filtered by the apps.`,
    ...mine,
    responses: {
      200: json(z.array(ClientLibrarySong), 'The songs'),
      ...errors('unauthorized'),
    },
  }),
  album: createRoute({
    method: 'get',
    path: `${MUSIC}/albums/{id}`,
    tags: ['Music'],
    summary: 'An album with its songs',
    description: `404 when it isn’t here.`,
    ...mine,
    request: { params: IdParam },
    responses: {
      200: json(ClientAlbumDetail, 'The album'),
      ...errors('unauthorized', 'not-found'),
    },
  }),
  artist: createRoute({
    method: 'get',
    path: `${MUSIC}/artists/{id}`,
    tags: ['Music'],
    summary: 'An artist with their albums by kind',
    description: `404 when they aren’t here.`,
    ...mine,
    request: { params: IdParam },
    responses: {
      200: json(ClientArtistDetail, 'The artist'),
      ...errors('unauthorized', 'not-found'),
    },
  }),
  queue: createRoute({
    method: 'post',
    path: `${MUSIC}/queue`,
    tags: ['Music'],
    summary: 'The songs to play for an album, an artist, a playlist or songs',
    description: `An album's in order, an artist's newest album first, shuffled when asked; each with its loudness for the scrubber. An album or an artist played goes on Home's Recently played. 404 when there's nothing to play.`,
    ...mine,
    request: body(QueueRequest),
    responses: {
      200: json(z.array(QueuedSong), 'The queue'),
      ...errors('invalid', 'unauthorized', 'not-found'),
    },
  }),
  tracks: createRoute({
    method: 'get',
    path: `${MUSIC}/tracks`,
    tags: ['Music'],
    summary: 'Songs for the queue by id, for Play next and Add to queue',
    description: `Unlike the queue, these aren’t recorded as played; ids not here are left out.`,
    ...mine,
    request: {
      query: z.object({
        ids: z.string().max(4000).openapi({ description: 'Song ids, comma-separated' }),
      }),
    },
    responses: {
      200: json(z.array(QueuedSong), 'The songs'),
      ...errors('invalid', 'unauthorized'),
    },
  }),
  play: createRoute({
    method: 'post',
    path: `${MUSIC}/tracks/{id}/play`,
    tags: ['Music'],
    summary: 'Play a song on this device',
    description:
      'Starts a play and answers the address the audio element loads: the file by byte ranges when the device plays its codec, else AAC made from it. The play shows on Now playing until it’s stopped or goes quiet. 404 when the song isn’t here; 409 when its file can’t be read.',
    ...mine,
    request: { params: IdParam, ...body(MusicPlayRequest) },
    responses: {
      200: json(MusicPlay, 'The play'),
      ...errors('invalid', 'unauthorized', 'not-found', 'conflict'),
    },
  }),
  progress: createRoute({
    method: 'post',
    path: `${MUSIC}/plays/{id}/progress`,
    tags: ['Music'],
    summary: 'Say where a play is, every few seconds',
    description:
      'Keeps the address working and moves Now playing on. 404 once the play has ended, with who stopped it when someone did (`StoppedDetails`).',
    ...mine,
    request: { params: IdParam, ...body(MusicPlayReport) },
    responses: { ...noContent, ...errors('invalid', 'unauthorized', 'not-found') },
  }),
  stop: createRoute({
    method: 'delete',
    path: `${MUSIC}/plays/{id}`,
    tags: ['Music'],
    summary: 'End a play',
    description:
      'At the end of the song, or on a skip or a stop: the play is kept for play counts and the history, and its address stops working.',
    ...mine,
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'not-found') },
  }),
  image: createRoute({
    method: 'get',
    path: `${API_PREFIX}/images/music/{kind}/{id}`,
    tags: ['Music'],
    summary: 'An album’s cover or an artist’s picture',
    description:
      'An album’s cover file in its folder, else the picture in its files, else the Cover Art Archive’s; an artist’s picture in their folder, else fanart.tv’s. Fetched once and kept; `Cache-Control: private, max-age=86400` with an ETag, since a cover can change at the same address. 404 when there’s none.',
    ...mine,
    request: {
      params: z.object({
        kind: z
          .enum(['album', 'artist'])
          .openapi({ param: { name: 'kind', in: 'path' }, example: 'album' }),
        id: z.string().openapi({ param: { name: 'id', in: 'path' }, example: 'al_x1' }),
      }),
    },
    responses: {
      200: {
        description: 'The image',
        content: {
          'image/jpeg': { schema: z.string().openapi({ format: 'binary' }) },
          'image/png': { schema: z.string().openapi({ format: 'binary' }) },
          'image/webp': { schema: z.string().openapi({ format: 'binary' }) },
        },
      },
      304: { description: 'Not modified' },
      ...errors('unauthorized', 'not-found'),
    },
  }),
} as const

export const playlists = {
  list: createRoute({
    method: 'get',
    path: PLAYLISTS,
    tags: ['Music'],
    summary: 'Your own playlists, the most recently changed first',
    ...mine,
    responses: {
      200: json(z.array(ClientPlaylist), 'The playlists'),
      ...errors('unauthorized'),
    },
  }),
  get: createRoute({
    method: 'get',
    path: `${PLAYLISTS}/{id}`,
    tags: ['Music'],
    summary: 'A playlist and its songs',
    description: `404 when it isn't yours, or was deleted.`,
    ...mine,
    request: { params: IdParam },
    responses: {
      200: json(ClientPlaylistDetail, 'The playlist'),
      ...errors('unauthorized', 'not-found'),
    },
  }),
  create: createRoute({
    method: 'post',
    path: PLAYLISTS,
    tags: ['Music'],
    summary: 'Make a playlist, with songs in it or none',
    ...mine,
    request: body(
      z.object({ name: PlaylistName, songs: SongIds.default([]) }).openapi('NewPlaylist'),
    ),
    responses: {
      200: json(ClientPlaylist, 'The playlist'),
      ...errors('invalid', 'unauthorized'),
    },
  }),
  rename: createRoute({
    method: 'patch',
    path: `${PLAYLISTS}/{id}`,
    tags: ['Music'],
    summary: 'Rename a playlist',
    ...mine,
    request: { params: IdParam, ...body(z.object({ name: PlaylistName })) },
    responses: {
      ...noContent,
      ...errors('invalid', 'unauthorized', 'not-found'),
    },
  }),
  add: createRoute({
    method: 'post',
    path: `${PLAYLISTS}/{id}/songs`,
    tags: ['Music'],
    summary: 'Add songs at the end, in the order given',
    ...mine,
    request: { params: IdParam, ...body(z.object({ songs: SongIds.min(1) })) },
    responses: {
      ...noContent,
      ...errors('invalid', 'unauthorized', 'not-found'),
    },
  }),
  remove: createRoute({
    method: 'delete',
    path: `${PLAYLISTS}/{id}/songs/{entry}`,
    tags: ['Music'],
    summary: 'Take one entry out of a playlist',
    ...mine,
    request: {
      params: IdParam.extend({
        entry: z.string().openapi({ param: { name: 'entry', in: 'path' } }),
      }),
    },
    responses: { ...noContent, ...errors('unauthorized', 'not-found') },
  }),
  reorder: createRoute({
    method: 'put',
    path: `${PLAYLISTS}/{id}/order`,
    tags: ['Music'],
    summary: 'Put a playlist’s entries in a new order',
    description: `Entries left out are dropped.`,
    ...mine,
    request: { params: IdParam, ...body(z.object({ entries: z.array(z.string()).max(5000) })) },
    responses: {
      ...noContent,
      ...errors('invalid', 'unauthorized', 'not-found'),
    },
  }),
  delete: createRoute({
    method: 'delete',
    path: `${PLAYLISTS}/{id}`,
    tags: ['Music'],
    summary: 'Delete a playlist',
    ...mine,
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'not-found') },
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
export type MusicPlay = z.infer<typeof MusicPlay>
export type MusicPlayRequest = z.infer<typeof MusicPlayRequest>
export type MusicPlayReport = z.infer<typeof MusicPlayReport>
export type MusicPlayMethod = (typeof MUSIC_PLAY_METHODS)[number]

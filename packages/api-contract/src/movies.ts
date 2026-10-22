// SPDX-License-Identifier: AGPL-3.0-only
// The movie library (movies.md: A4 Discover, A5 Movies, A6 movie detail): adding by TMDB id, the
// paged library, editing, bulk edits, versions (ADR 0012), refresh, the dashboard's movie sources,
// and the root folders movies are filed under. A movie's `id` is its TMDB id (ADR 0014, amended
// 2026-10-20); version and root folder ids are the server's own row ids.
//
// Searching for releases waits for indexers (checkpoint 5, decision 2): `searchNow` on add and the
// bulk `search` action answer 409 with `details.reason` `no-indexers` until then.
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
  TmdbIdParam,
} from './common.ts'
import { Art, DISCOVER_LISTS, DiscoverPage } from './metadata.ts'
import { TagIds } from './tags.ts'

// ---------------------------------------------------------------- shapes

/**
 * What the library shows for a movie until files and downloads exist (checkpoint 6). Mirrors
 * @highsea/db's `LIBRARY_STATUSES`.
 */
export const LIBRARY_STATUSES = [
  'available',
  'wanted',
  'downloading',
  'not-released',
  'unmonitored',
] as const

export const MovieStatus = z.enum(LIBRARY_STATUSES).openapi('MovieStatus')
export const MinimumAvailability = z
  .enum(['announced', 'in-cinemas', 'released'])
  .openapi('MinimumAvailability')

/** One version of a movie, with its own quality profile: 4K HDR beside 1080p SDR (ADR 0012). */
export const MovieVersion = z
  .object({
    /** The version's row id. */
    id: z.string(),
    label: z.string().openapi({ example: '4K HDR' }),
    qualityProfileId: z.string(),
    /** Its file, once there is one (checkpoint 6). */
    fileId: z.string().nullable(),
  })
  .openapi('MovieVersion')

/** A movie in the library: TMDB's facts the lists need, and the library's own. */
export const Movie = z
  .object({
    /** TMDB's id: the movie's address. */
    id: z.number().int().openapi({ example: 603 }),
    type: z.literal('movie'),
    title: z.string(),
    originalTitle: z.string(),
    /** Lowercased, without a leading article: what Title sorts on. */
    sortTitle: z.string(),
    year: z.number().int().nullable(),
    runtimeMinutes: z.number().int().nullable(),
    genres: z.array(z.string()),
    synopsis: z.string(),
    rating: z.number().min(0).max(5).openapi({
      description: 'Out of 5: TMDB’s vote_average (0–10) halved, to one decimal',
    }),
    voteCount: z.number().int(),
    releaseDate: IsoDay.nullable(),
    art: Art,
    status: MovieStatus,
    monitored: z.boolean(),
    minimumAvailability: MinimumAvailability,
    /** The movie's subtitle language profile (checkpoint 7a), `subtitles.languageProfiles()`. */
    languageProfileId: z.string().nullable(),
    /** The first version's profile, which the library filters on. */
    qualityProfileId: z.string(),
    rootFolder: z.string().openapi({ example: '/data/media/movies' }),
    path: z.string().openapi({ example: '/data/media/movies/The Matrix (1999)' }),
    addedAt: IsoDate,
    /** In order; the first is the one the library's profile filter and bulk edit change. */
    versions: z.array(MovieVersion).min(1),
    /** TMDB removed or merged this id: "TMDB no longer has this movie". The library keeps it. */
    gone: z.boolean(),
    /** Its tags' ids (checkpoint 8c), A to Z by label. */
    tags: z.array(z.string()),
  })
  .openapi('Movie')

const Label = z.string().trim().min(1).max(40)

export const VersionInput = z
  .object({ label: Label, qualityProfileId: z.string().min(1).max(64) })
  .openapi('VersionInput')

export const AddMovieInput = z
  .object({
    /** The movie's TMDB id. */
    tmdbId: z.number().int().positive().openapi({ example: 603 }),
    /** One of the root folders, by path. */
    rootFolder: z.string().min(1).max(4096),
    monitored: z.boolean(),
    minimumAvailability: MinimumAvailability,
    /**
     * The subtitle language profile; null for none. Left out, the root folder's default
     * (checkpoint 8c), or none when the folder has no default.
     */
    languageProfileId: z.string().max(64).nullable().optional(),
    /** Tag ids (checkpoint 8c). */
    tags: TagIds.optional(),
    /** The movie's versions; the add dialog sends one. */
    versions: z.array(VersionInput).min(1).max(10),
    /** Refused (409, `no-indexers`) until an indexer is set up. */
    searchNow: z.boolean().optional(),
  })
  .openapi('AddMovieInput')

export const MovieUpdate = z
  .strictObject({
    monitored: z.boolean(),
    minimumAvailability: MinimumAvailability,
    languageProfileId: z.string().max(64).nullable(),
    /** Another root folder, by path. Nothing moves on disk until there are files (checkpoint 6). */
    rootFolder: z.string().min(1).max(4096),
    /** Its tags, all of them (checkpoint 8c). */
    tags: TagIds,
  })
  .partial()
  .openapi('MovieUpdate')

export const VersionUpdate = z
  .strictObject({ label: Label, qualityProfileId: z.string().min(1).max(64) })
  .partial()
  .openapi('VersionUpdate')

const Ids = z.array(z.number().int().positive()).min(1).max(10_000)

/**
 * The bulk bar's actions. `setQualityProfile` moves each movie's first version; extra versions keep
 * theirs. `search` answers 409 (`no-indexers`) until checkpoint 5.
 */
export const BulkInput = z
  .discriminatedUnion('action', [
    z.object({ action: z.literal('monitor'), ids: Ids }),
    z.object({ action: z.literal('unmonitor'), ids: Ids }),
    z.object({
      action: z.literal('setQualityProfile'),
      ids: Ids,
      qualityProfileId: z.string().min(1).max(64),
    }),
    /** The library's Subtitle languages menu (checkpoint 7); null for none. */
    z.object({
      action: z.literal('setLanguageProfile'),
      ids: Ids,
      languageProfileId: z.string().min(1).max(64).nullable(),
    }),
    z.object({ action: z.literal('search'), ids: Ids }),
    z.object({ action: z.literal('refresh'), ids: Ids }),
    /**
     * Tags (checkpoint 8c), as Radarr's movie editor applies them: `add` puts them on, `remove`
     * takes them off, `replace` leaves each movie with exactly these.
     */
    z.object({
      action: z.literal('setTags'),
      ids: Ids,
      tagIds: TagIds,
      mode: z.enum(['add', 'remove', 'replace']),
    }),
    /** `exclude`: import lists don't add them again (checkpoint 8a). */
    z.object({
      action: z.literal('delete'),
      ids: Ids,
      deleteFiles: z.boolean().optional(),
      exclude: z.boolean().optional(),
    }),
  ])
  .openapi('BulkInput')

export const BulkResult = z
  .object({
    /** The movies the action applied to (for `refresh`, queued). */
    ids: z.array(z.number().int()),
    /** Ids not in the library, skipped. */
    missing: z.array(z.number().int()),
  })
  .openapi('BulkResult')

export const MOVIE_SORTS = ['title', 'added', 'year', 'rating'] as const

const Bool = z.enum(['true', 'false'])

export const MovieListQuery = z.object({
  /** A status tab; all statuses when absent. */
  status: MovieStatus.optional(),
  /** Matches anywhere in the title or original title, ignoring case and accents. */
  title: z.string().max(200).optional(),
  /** Movies whose first version uses this profile. */
  qualityProfileId: z.string().max(64).optional(),
  monitored: Bool.optional(),
  /** Movies carrying this tag (checkpoint 8c). */
  tag: z.string().max(64).optional(),
  sort: z.enum(MOVIE_SORTS).optional().openapi({ description: 'Title when absent' }),
  dir: z.enum(['asc', 'desc']).optional().openapi({
    description: 'A to Z for title; newest or highest first for the others, when absent',
  }),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number<number>().int().min(1).max(200).optional().openapi({
    description: '60 when absent',
  }),
})

/**
 * A page of the library. Cursor paging (phase-3-server.md › Paging and sorting): the cursor holds
 * the last row's sort key and id, so pages stay right while movies are added or removed, and a
 * page deep in a 100k library costs what the first does.
 */
export const MoviePage = z
  .object({
    items: z.array(Movie),
    /** Pass back as `cursor` for the next page; null on the last. */
    next: z.string().nullable(),
    /** Movies matching every filter. */
    total: z.number().int(),
    /** The status tabs' counts: every filter but `status`. */
    counts: z.object({
      all: z.number().int(),
      available: z.number().int(),
      wanted: z.number().int(),
      downloading: z.number().int(),
      'not-released': z.number().int(),
      unmonitored: z.number().int(),
    }),
  })
  .openapi('MoviePage')

/** A folder movies are filed under. Free space, size and device are read when asked. */
export const RootFolder = z
  .object({
    id: z.string(),
    path: z.string().openapi({ example: '/data/media/movies' }),
    /** Bytes; null when the folder can't be read now (unmounted, gone). */
    free: z.number().nullable(),
    total: z.number().nullable(),
    /** The filesystem it's on (Storage's "what uses it" groups by it); null when unreadable. */
    device: z.string().nullable(),
    /** Whether the folder exists and the server can write to it now. */
    accessible: z.boolean(),
    /** Library movies filed under it. */
    movies: z.number().int(),
    /**
     * The subtitle language profile a movie added here takes when none is chosen (checkpoint
     * 8c): the add dialog starts on it, and import lists, the library import and migration use it.
     */
    languageProfileId: z.string().nullable(),
  })
  .openapi('RootFolder')

// ---------------------------------------------------------------- routes

const MOVIES = `${API_PREFIX}/movies`
const VersionParams = TmdbIdParam.extend({
  versionId: z.string().openapi({ param: { name: 'versionId', in: 'path' } }),
})

// Static paths come before `/movies/{id}`, which would match them too: register them first.
export const movies = {
  discover: createRoute({
    method: 'get',
    path: `${API_PREFIX}/discover/movies`,
    tags: ['Movies'],
    summary: 'Find movies on TMDB',
    description:
      'With a query, TMDB’s search; without one, a list for the server’s region: `trending` (this week, the default), `popular`, `now-playing` or `upcoming`. Library movies are marked `inLibrary`. Answers 503 with `details.reason` `no-tmdb-key` or `tmdb-unreachable`, or 429 with `tmdb-rate-limited`.',
    ...access('staff'),
    request: {
      query: z.object({
        query: z.string().max(200).optional(),
        list: z.enum(DISCOVER_LISTS).optional(),
        page: z.coerce.number<number>().int().min(1).max(500).optional(),
      }),
    },
    responses: {
      200: json(DiscoverPage, 'A page of results'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'rate-limited', 'unavailable'),
    },
  }),
  list: createRoute({
    method: 'get',
    path: MOVIES,
    tags: ['Movies'],
    summary: 'The library, a page at a time, filtered and sorted',
    ...access('staff'),
    request: { query: MovieListQuery },
    responses: {
      200: json(MoviePage, 'A page of movies'),
      ...errors('invalid', 'unauthorized'),
    },
  }),
  add: createRoute({
    method: 'post',
    path: MOVIES,
    tags: ['Movies'],
    summary: 'Add a movie to the library, by TMDB id',
    description:
      'Fetches its metadata when the server doesn’t have it. Adding a movie that’s already in the library returns it unchanged, with 200. 409 `no-indexers` for `searchNow` until an indexer is set up; 503 when the metadata can’t be fetched.',
    ...access('staff'),
    request: { ...body(AddMovieInput) },
    responses: {
      200: json(Movie, 'Already in the library, unchanged'),
      201: json(Movie, 'Added'),
      ...errors(
        'invalid',
        'unauthorized',
        'forbidden',
        'not-found',
        'conflict',
        'rate-limited',
        'unavailable',
      ),
    },
  }),
  bulk: createRoute({
    method: 'post',
    path: `${MOVIES}/bulk`,
    tags: ['Movies'],
    summary: 'Monitor, stop monitoring, change the profile, search, refresh or remove many',
    ...access('staff'),
    request: { ...body(BulkInput) },
    responses: {
      200: json(BulkResult, 'Done'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found', 'conflict'),
    },
  }),
  upcoming: createRoute({
    method: 'get',
    path: `${MOVIES}/upcoming`,
    tags: ['Movies'],
    summary: 'Monitored movies released in the next days, soonest first',
    description: 'The dashboard’s Upcoming and Calendar. Release dates are the server region’s.',
    ...access('user'),
    request: {
      query: z.object({
        days: z.coerce.number<number>().int().min(1).max(366).optional().openapi({
          description: '14 when absent',
        }),
      }),
    },
    responses: { 200: json(z.array(Movie), 'Movies'), ...errors('invalid', 'unauthorized') },
  }),
  recent: createRoute({
    method: 'get',
    path: `${MOVIES}/recent`,
    tags: ['Movies'],
    summary: 'The movies added last, newest first',
    description: 'The dashboard’s and home’s Recently added.',
    ...access('user'),
    request: {
      query: z.object({
        limit: z.coerce.number<number>().int().min(1).max(50).optional().openapi({
          description: '8 when absent',
        }),
      }),
    },
    responses: { 200: json(z.array(Movie), 'Movies'), ...errors('invalid', 'unauthorized') },
  }),
  get: createRoute({
    method: 'get',
    path: `${MOVIES}/{id}`,
    tags: ['Movies'],
    summary: 'A library movie',
    description: '404 when the movie isn’t in the library: its page then shows the metadata alone.',
    ...access('staff'),
    request: { params: TmdbIdParam },
    responses: { 200: json(Movie, 'The movie'), ...errors('unauthorized', 'not-found') },
  }),
  update: createRoute({
    method: 'patch',
    path: `${MOVIES}/{id}`,
    tags: ['Movies'],
    summary: 'Change a movie: monitored, minimum availability, subtitle languages, root folder',
    ...access('staff'),
    request: { params: TmdbIdParam, ...body(MovieUpdate) },
    responses: {
      200: json(Movie, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  delete: createRoute({
    method: 'delete',
    path: `${MOVIES}/{id}`,
    tags: ['Movies'],
    summary: 'Remove a movie from the library',
    description:
      'Its metadata stays cached, so its page keeps working without the library layer. Files stay on disk unless `deleteFiles` is true. `exclude` keeps import lists from adding it again (checkpoint 8a).',
    ...access('staff'),
    request: {
      params: TmdbIdParam,
      query: z.object({ deleteFiles: Bool.optional(), exclude: Bool.optional() }),
    },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),
  refresh: createRoute({
    method: 'post',
    path: `${MOVIES}/{id}/refresh`,
    tags: ['Movies'],
    summary: 'Refresh a library movie’s metadata from TMDB',
    description: 'Queues the refresh job; `metadata.updated` follows when it’s done.',
    ...access('staff'),
    request: { params: TmdbIdParam },
    responses: {
      202: { description: 'Queued' },
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  }),
  addVersion: createRoute({
    method: 'post',
    path: `${MOVIES}/{id}/versions`,
    tags: ['Movies'],
    summary: 'Add a version, with its own quality profile',
    ...access('staff'),
    request: { params: TmdbIdParam, ...body(VersionInput) },
    responses: {
      201: json(Movie, 'The movie, with the version last'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  updateVersion: createRoute({
    method: 'patch',
    path: `${MOVIES}/{id}/versions/{versionId}`,
    tags: ['Movies'],
    summary: 'Rename a version or change its quality profile',
    ...access('staff'),
    request: { params: VersionParams, ...body(VersionUpdate) },
    responses: {
      200: json(Movie, 'The movie'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  removeVersion: createRoute({
    method: 'delete',
    path: `${MOVIES}/{id}/versions/{versionId}`,
    tags: ['Movies'],
    summary: 'Remove a version',
    description: 'A movie keeps at least one: removing the last answers 409 (`last-version`).',
    ...access('staff'),
    request: { params: VersionParams },
    responses: {
      200: json(Movie, 'The movie'),
      ...errors('unauthorized', 'forbidden', 'not-found', 'conflict'),
    },
  }),
} as const

const ROOT_FOLDERS = `${API_PREFIX}/rootfolders`

export const rootFolders = {
  list: createRoute({
    method: 'get',
    path: ROOT_FOLDERS,
    tags: ['Root folders'],
    summary: 'The folders movies are filed under, with free space and device',
    ...access('staff'),
    responses: {
      200: json(z.array(RootFolder), 'Folders'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  add: createRoute({
    method: 'post',
    path: ROOT_FOLDERS,
    tags: ['Root folders'],
    summary: 'Add a root folder',
    description:
      'The path must be absolute, exist and be writable by the server (400, with `details.reason` `not-absolute`, `not-found` or `not-writable`). 409 when it’s already a root folder, or inside or around one.',
    ...access('staff'),
    request: { ...body(z.object({ path: z.string().min(1).max(4096) })) },
    responses: {
      201: json(RootFolder, 'Added'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'conflict'),
    },
  }),
  update: createRoute({
    method: 'patch',
    path: `${ROOT_FOLDERS}/{id}`,
    tags: ['Root folders'],
    summary: 'Set a root folder’s default subtitle language profile',
    description:
      'Null for none. Movies already filed there keep theirs. 404 (`unknown-language-profile`) for a profile that doesn’t exist.',
    ...access('staff'),
    request: {
      params: IdParam,
      ...body(z.object({ languageProfileId: z.string().min(1).max(64).nullable() })),
    },
    responses: {
      200: json(RootFolder, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  remove: createRoute({
    method: 'delete',
    path: `${ROOT_FOLDERS}/{id}`,
    tags: ['Root folders'],
    summary: 'Remove a root folder',
    description:
      'Nothing on disk changes. 409 (`in-use`) while titles of any type are filed under it, with `details.counts` by type.',
    ...access('staff'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found', 'conflict') },
  }),
} as const

export type MovieStatus = z.infer<typeof MovieStatus>
export type MinimumAvailability = z.infer<typeof MinimumAvailability>
export type MovieVersion = z.infer<typeof MovieVersion>
export type Movie = z.infer<typeof Movie>
export type AddMovieInput = z.infer<typeof AddMovieInput>
export type MovieUpdate = z.infer<typeof MovieUpdate>
export type VersionInput = z.infer<typeof VersionInput>
export type VersionUpdate = z.infer<typeof VersionUpdate>
export type BulkInput = z.infer<typeof BulkInput>
export type BulkResult = z.infer<typeof BulkResult>
export type MovieListQuery = z.infer<typeof MovieListQuery>
export type MoviePage = z.infer<typeof MoviePage>
export type RootFolder = z.infer<typeof RootFolder>

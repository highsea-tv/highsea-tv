// SPDX-License-Identifier: AGPL-3.0-only
// Import lists (settings.md › Import lists; checkpoint 8a, ADR 0045): lists highsea checks every
// 6 hours and adds new titles from, each with the root folder, profiles and monitoring its movies
// get. Three kinds (the owner's answer 4): TMDB lists, Trakt, and a generic JSON list in the format
// Radarr calls "StevenLu Custom" (`[{ "title", "imdb_id" }]`), which MDBList and other tools
// publish for IMDb and Letterboxd lists. A list never removes a movie; exclusions keep one a list
// added and the owner deleted from coming back.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, body, errors, IdParam, IsoDate, json, noContent } from './common.ts'
import { MinimumAvailability } from './movies.ts'
import { TagIds } from './tags.ts'

// ---------------------------------------------------------------- shapes

export const IMPORT_LIST_KINDS = ['tmdb', 'trakt', 'generic'] as const

/** TMDB's lists: a public list by id or link, or one of its charts for the server's region. */
export const TMDB_LIST_SOURCES = [
  'list',
  'popular',
  'top-rated',
  'upcoming',
  'now-playing',
] as const
/** Trakt's: a public list by link, its charts, and the connected account's watchlist. */
export const TRAKT_LIST_SOURCES = [
  'list',
  'trending',
  'popular',
  'anticipated',
  'watchlist',
] as const

export const ImportListSettings = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('tmdb'),
      source: z.enum(TMDB_LIST_SOURCES),
      /** For `list`: its id, or its address on themoviedb.org. */
      list: z.string().max(500).optional(),
    }),
    z.object({
      kind: z.literal('trakt'),
      source: z.enum(TRAKT_LIST_SOURCES),
      /** For `list`: its address on trakt.tv. */
      list: z.string().max(500).optional(),
    }),
    z.object({
      kind: z.literal('generic'),
      /** An address answering `[{ "title", "imdb_id" }]` (or `tmdb_id`). */
      url: z.string().max(2000),
    }),
  ])
  .openapi('ImportListSettings')

export const ImportListInput = z
  .object({
    name: z.string().min(1).max(100),
    enabled: z.boolean(),
    settings: ImportListSettings,
    rootFolder: z.string().max(4096),
    qualityProfileId: z.string().max(64),
    /** Null: the root folder's default (checkpoint 8c), or none when it has no default. */
    languageProfileId: z.string().max(64).nullable(),
    monitored: z.boolean(),
    minimumAvailability: MinimumAvailability,
    /** Search for each movie the list adds. */
    searchOnAdd: z.boolean(),
    /** Tag ids given to each movie the list adds (checkpoint 8c). */
    tags: TagIds.optional(),
  })
  .openapi('ImportListInput')

export const ImportListResult = z
  .object({
    /** Titles on the list. */
    found: z.number().int(),
    added: z.number().int(),
    /** Already in the library, or excluded. */
    skipped: z.number().int(),
    /** Titles that couldn't be matched to a TMDB id, by name (at most 20). */
    unresolved: z.array(z.string()),
    /** Why the list couldn't be read; null when it was. */
    error: z.string().nullable(),
  })
  .openapi('ImportListResult')

export const ImportList = ImportListInput.extend({
  id: z.string(),
  tags: z.array(z.string()),
  kind: z.enum(IMPORT_LIST_KINDS),
  lastSync: IsoDate.nullable(),
  lastResult: ImportListResult.nullable(),
  /** Titles on the list at the last check. */
  items: z.number().int(),
}).openapi('ImportList')

export const ImportListTest = z
  .object({
    ok: z.boolean(),
    message: z.string(),
    /** Titles the list has now. */
    found: z.number().int(),
  })
  .openapi('ImportListTest')

export const ListExclusion = z
  .object({
    tmdbId: z.number().int(),
    title: z.string(),
    year: z.number().int().nullable(),
    createdAt: IsoDate,
  })
  .openapi('ListExclusion')

/** Trakt for this server: whether highsea has its application, and whose account is connected. */
export const TraktStatus = z
  .object({
    /** False in a build without highsea's Trakt application (its Client ID). */
    available: z.boolean(),
    /** The connected account's name; null when none is. */
    account: z.string().nullable(),
  })
  .openapi('TraktStatus')

/** Trakt's device flow: the code to enter at the address, until it expires. */
export const TraktDeviceCode = z
  .object({
    userCode: z.string(),
    verificationUrl: z.string(),
    expiresAt: IsoDate,
    /** Seconds between polls. */
    interval: z.number().int(),
  })
  .openapi('TraktDeviceCode')

export const TraktPoll = z
  .object({ state: z.enum(['pending', 'connected', 'expired', 'denied']) })
  .openapi('TraktPoll')

// ---------------------------------------------------------------- routes

const LISTS = `${API_PREFIX}/import-lists`

// Static paths come before `/import-lists/{id}`.
export const importLists = {
  list: createRoute({
    method: 'get',
    path: LISTS,
    tags: ['Import lists'],
    summary: 'The import lists',
    ...access('staff'),
    responses: { 200: json(z.array(ImportList), 'Lists'), ...errors('unauthorized', 'forbidden') },
  }),
  add: createRoute({
    method: 'post',
    path: LISTS,
    tags: ['Import lists'],
    summary: 'Add a list; it’s checked straight away when it’s on',
    ...access('staff'),
    request: { ...body(ImportListInput) },
    responses: {
      201: json(ImportList, 'Added'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  test: createRoute({
    method: 'post',
    path: `${LISTS}/test`,
    tags: ['Import lists'],
    summary: 'Read a list without saving it or adding anything',
    ...access('staff'),
    request: { ...body(z.object({ settings: ImportListSettings })) },
    responses: {
      200: json(ImportListTest, 'What the list says'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  exclusions: createRoute({
    method: 'get',
    path: `${LISTS}/exclusions`,
    tags: ['Import lists'],
    summary: 'Movies no list adds again',
    ...access('staff'),
    responses: {
      200: json(z.array(ListExclusion), 'Exclusions, newest first'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  removeExclusion: createRoute({
    method: 'delete',
    path: `${LISTS}/exclusions/{tmdbId}`,
    tags: ['Import lists'],
    summary: 'Let lists add a movie again',
    ...access('staff'),
    request: {
      params: z.object({
        tmdbId: z.coerce
          .number<number>()
          .int()
          .positive()
          .openapi({ param: { name: 'tmdbId', in: 'path' } }),
      }),
    },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),
  trakt: createRoute({
    method: 'get',
    path: `${LISTS}/trakt`,
    tags: ['Import lists'],
    summary: 'Whether Trakt is available, and the account connected',
    ...access('staff'),
    responses: { 200: json(TraktStatus, 'Trakt'), ...errors('unauthorized', 'forbidden') },
  }),
  traktConnect: createRoute({
    method: 'post',
    path: `${LISTS}/trakt/connect`,
    tags: ['Import lists'],
    summary: 'Start connecting a Trakt account: a code to enter on trakt.tv',
    description: '503 `trakt-unavailable` in a build without highsea’s Trakt application.',
    ...access('staff'),
    responses: {
      200: json(TraktDeviceCode, 'The code'),
      ...errors('unauthorized', 'forbidden', 'unavailable'),
    },
  }),
  traktPoll: createRoute({
    method: 'post',
    path: `${LISTS}/trakt/poll`,
    tags: ['Import lists'],
    summary: 'Whether the code has been entered yet',
    ...access('staff'),
    responses: {
      200: json(TraktPoll, 'The state'),
      ...errors('unauthorized', 'forbidden', 'not-found', 'unavailable'),
    },
  }),
  traktDisconnect: createRoute({
    method: 'delete',
    path: `${LISTS}/trakt`,
    tags: ['Import lists'],
    summary: 'Forget the connected Trakt account',
    ...access('staff'),
    responses: { ...noContent, ...errors('unauthorized', 'forbidden') },
  }),
  update: createRoute({
    method: 'put',
    path: `${LISTS}/{id}`,
    tags: ['Import lists'],
    summary: 'Change a list',
    ...access('staff'),
    request: { params: IdParam, ...body(ImportListInput) },
    responses: {
      200: json(ImportList, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  remove: createRoute({
    method: 'delete',
    path: `${LISTS}/{id}`,
    tags: ['Import lists'],
    summary: 'Remove a list; the movies it added stay',
    ...access('staff'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),
  sync: createRoute({
    method: 'post',
    path: `${LISTS}/{id}/sync`,
    tags: ['Import lists'],
    summary: 'Check a list now',
    ...access('staff'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),
} as const

export type ImportListKind = (typeof IMPORT_LIST_KINDS)[number]
export type ImportListSettings = z.infer<typeof ImportListSettings>
export type ImportListInput = z.infer<typeof ImportListInput>
export type ImportListResult = z.infer<typeof ImportListResult>
export type ImportList = z.infer<typeof ImportList>
export type ImportListTest = z.infer<typeof ImportListTest>
export type ListExclusion = z.infer<typeof ListExclusion>
export type TraktStatus = z.infer<typeof TraktStatus>
export type TraktDeviceCode = z.infer<typeof TraktDeviceCode>
export type TraktPoll = z.infer<typeof TraktPoll>

/** Import lists' topic: a list was added, changed, removed or checked. */
export const LIST_TOPICS = { lists: 'lists.updated' } as const

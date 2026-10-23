// SPDX-License-Identifier: AGPL-3.0-only
// The client API (client-library.md, client-detail.md, client-search.md): what the household's apps
// read. A title is addressed by its type and TMDB id, so a show and a movie with the same number
// stay apart. Watch positions are stored per person and title; playback writes them in Phase 4,
// and these shapes carry them now so they're settled.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, errors, IsoDate, IsoDay, json } from './common.ts'
import { Art, CollectionRef, Credit, DiscoverMovie, Video } from './metadata.ts'
import { MOVIE_SORTS, MovieStatus } from './movies.ts'

/** The media types the library has so far. Shows, music and books join later. */
export const ITEM_TYPES = ['movie'] as const

/** A title as the clients see it: the library item plus this person's watch state. */
export const ClientItem = z
  .object({
    /** TMDB's id; with `type`, the title's address. */
    id: z.number().int().openapi({ example: 603 }),
    type: z.enum(ITEM_TYPES),
    title: z.string(),
    year: z.number().int().nullable(),
    runtimeMinutes: z.number().int().nullable(),
    genres: z.array(z.string()),
    synopsis: z.string(),
    rating: z.number().min(0).max(5).openapi({
      description: 'Out of 5: TMDB’s vote_average (0–10) halved, to one decimal',
    }),
    voteCount: z.number().int(),
    releaseDate: IsoDay.nullable(),
    addedAt: IsoDate,
    status: MovieStatus,
    /** Whether a version has a file to play. False for every title until files arrive (checkpoint 6). */
    playable: z.boolean(),
    art: Art,
    /** 0–1 through the title, or null when not started or finished. */
    progress: z.number().min(0).max(1).nullable(),
    /** Seconds in, for Resume; 0 when not started. */
    position: z.number().min(0),
  })
  .openapi('ClientItem')

export const ClientSubtitle = z
  .object({
    id: z.string(),
    language: z.string().openapi({ example: 'en' }),
    /** "English (forced)". */
    label: z.string(),
    forced: z.boolean(),
    hi: z.boolean(),
    format: z.string(),
    kind: z.enum(['embedded', 'external', 'bundled']),
  })
  .openapi('ClientSubtitle')

export const ClientVersion = z
  .object({
    id: z.string(),
    label: z.string().openapi({ example: '4K HDR' }),
    /** "4K · HDR10 · HEVC · 18.2 GB" once it has a file; null until then. */
    detail: z.string().nullable(),
    playable: z.boolean(),
    /**
     * Its subtitle tracks (checkpoint 7): the file's own streams, then the sidecars highsea keeps.
     * Playing them waits for `/stream`.
     */
    subtitles: z.array(ClientSubtitle),
  })
  .openapi('ClientVersion')

/** A title's page and the player read the same shape. */
export const ClientDetail = z
  .object({
    item: ClientItem,
    originalTitle: z.string(),
    tagline: z.string().nullable(),
    /** In the server's region. */
    certification: z.string().nullable(),
    studios: z.array(z.string()),
    cast: z.array(Credit),
    directors: z.array(Credit),
    videos: z.array(Video),
    collection: CollectionRef.nullable(),
    versions: z.array(ClientVersion),
    /** TMDB's recommendations that are in the library here. */
    related: z.array(ClientItem),
  })
  .openapi('ClientDetail')

export const ClientItemPage = z
  .object({
    items: z.array(ClientItem),
    next: z.string().nullable(),
    total: z.number().int(),
  })
  .openapi('ClientItemPage')

/** A collection as clients see it: only its parts here count. */
export const ClientCollection = z
  .object({
    id: z.number().int(),
    name: z.string(),
    overview: z.string(),
    art: Art,
    /** How many of its titles are here. */
    count: z.number().int(),
    /** "2010–2016", or one year. */
    years: z.string(),
  })
  .openapi('ClientCollection')

/** A person in search results, with how many titles here they're in. */
export const SearchPerson = z
  .object({
    id: z.number().int(),
    name: z.string(),
    photo: z.string().nullable(),
    titles: z.number().int(),
  })
  .openapi('SearchPerson')

/**
 * One kind of result. New media types join as new kinds; clients show the sections in the order
 * the server ranks them and skip kinds they don't know. `discover` is TMDB's titles that aren't
 * here, to request, only for people who may ask for titles.
 */
export const SearchSection = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('movies'), items: z.array(ClientItem) }),
    z.object({ kind: z.literal('collections'), items: z.array(ClientCollection) }),
    z.object({ kind: z.literal('people'), items: z.array(SearchPerson) }),
    z.object({ kind: z.literal('discover'), items: z.array(DiscoverMovie) }),
  ])
  .openapi('SearchSection')

/** Results grouped by kind, the best-matching kind first. Empty kinds are left out. */
export const SearchResults = z.object({ sections: z.array(SearchSection) }).openapi('SearchResults')

const ItemParams = z.object({
  type: z.enum(ITEM_TYPES).openapi({ param: { name: 'type', in: 'path' } }),
  id: z.coerce
    .number<number>()
    .int()
    .positive()
    .openapi({ param: { name: 'id', in: 'path' }, example: 603 }),
})

const ITEMS = `${API_PREFIX}/items`

export const library = {
  list: createRoute({
    method: 'get',
    path: ITEMS,
    tags: ['Library'],
    summary: 'The library for the apps, a page at a time, with your watch state',
    ...access('user'),
    request: {
      query: z.object({
        type: z.enum(ITEM_TYPES).optional().openapi({ description: 'Every type when absent' }),
        genre: z.string().max(100).optional(),
        /** Only titles with a file to play. */
        playable: z.enum(['true', 'false']).optional(),
        sort: z.enum(MOVIE_SORTS).optional().openapi({ description: 'Title when absent' }),
        dir: z.enum(['asc', 'desc']).optional(),
        cursor: z.string().max(500).optional(),
        limit: z.coerce.number<number>().int().min(1).max(200).optional(),
      }),
    },
    responses: {
      200: json(ClientItemPage, 'A page of titles'),
      ...errors('invalid', 'unauthorized'),
    },
  }),
  item: createRoute({
    method: 'get',
    path: `${ITEMS}/{type}/{id}`,
    tags: ['Library'],
    summary: 'A title for its page and the player',
    description: '404 when the title isn’t in the library here.',
    ...access('user'),
    request: { params: ItemParams },
    responses: { 200: json(ClientDetail, 'The title'), ...errors('unauthorized', 'not-found') },
  }),
  search: createRoute({
    method: 'get',
    path: `${API_PREFIX}/search`,
    tags: ['Library'],
    summary: 'Search the library: titles, collections and people',
    description:
      'Titles by name, genre or person; collections by name or a part’s title; people by name. A kind with a name starting with the query (at a word) ranks first, then one containing it. For people who may ask for titles, a `discover` section adds TMDB’s matches that aren’t here, to request; it’s left out when TMDB can’t be reached, and for everyone until requests arrive.',
    ...access('user'),
    request: { query: z.object({ query: z.string().max(200) }) },
    responses: { 200: json(SearchResults, 'Results'), ...errors('invalid', 'unauthorized') },
  }),
} as const

export type ClientItem = z.infer<typeof ClientItem>
export type ClientSubtitle = z.infer<typeof ClientSubtitle>
export type ClientVersion = z.infer<typeof ClientVersion>
export type ClientDetail = z.infer<typeof ClientDetail>
export type ClientItemPage = z.infer<typeof ClientItemPage>
export type ClientCollection = z.infer<typeof ClientCollection>
export type SearchPerson = z.infer<typeof SearchPerson>
export type SearchSection = z.infer<typeof SearchSection>
export type SearchResults = z.infer<typeof SearchResults>

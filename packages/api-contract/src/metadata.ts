// SPDX-License-Identifier: AGPL-3.0-only
// What TMDB knows about a title, a person or a collection, in any state (media-pages.md, ADR 0014):
// the metadata cache's side of a media page. Titles, people and collections are addressed by their
// TMDB ids (ADR 0014's 2026-10-20 amendment), so every `id` here is TMDB's number and there's no
// second one. Art is served by this server from its image cache; clients never contact TMDB
// (checkpoint 4, decision 4).
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, errors, IsoDate, IsoDay, json, TmdbIdParam } from './common.ts'

// ---------------------------------------------------------------- vocabulary

/** TMDB's 12 departments (`/3/configuration/jobs`). Cast is Acting. */
export const DEPARTMENTS = [
  'Acting',
  'Directing',
  'Writing',
  'Production',
  'Sound',
  'Camera',
  'Editing',
  'Art',
  'Costume & Make-Up',
  'Visual Effects',
  'Crew',
  'Lighting',
] as const

/** TMDB's video types. */
export const VIDEO_KINDS = [
  'Trailer',
  'Teaser',
  'Clip',
  'Featurette',
  'Behind the Scenes',
  'Bloopers',
  'Opening Credits',
] as const

/** Discover's tabs when there's no query (checkpoint 4, decision 7), each TMDB's list for the region. */
export const DISCOVER_LISTS = ['trending', 'popular', 'now-playing', 'upcoming'] as const

/**
 * Why a metadata route couldn't answer, in the error's `details.reason`, as @highsea/metadata
 * throws them:
 * - `no-tmdb-key`: no TMDB key is set and the cache doesn't have it (503 `unavailable`);
 * - `tmdb-unreachable`: TMDB didn't answer, or answered with a server error (503 `unavailable`);
 * - `tmdb-rate-limited`: TMDB kept answering 429 after the retries (429 `rate-limited`);
 * - `tmdb-key-rejected`: TMDB didn't accept the key (400 `invalid`, when saving or checking it).
 */
export const METADATA_REASONS = [
  'no-tmdb-key',
  'tmdb-unreachable',
  'tmdb-rate-limited',
  'tmdb-key-rejected',
] as const

/** The owners, kinds and sizes of cached images: @highsea/metadata's `image-url.ts`. */
export const IMAGE_OWNERS = ['movie', 'person', 'collection'] as const
export const IMAGE_KINDS = ['poster', 'backdrop', 'profile', 'still', 'logo'] as const

/** The notice TMDB's terms ask for, in their wording (https://www.themoviedb.org/api-terms-of-use). */
export const TMDB_ATTRIBUTION = {
  name: 'TMDB',
  notice:
    'This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.',
  url: 'https://www.themoviedb.org',
} as const

export const Department = z.enum(DEPARTMENTS).openapi('Department')

// ---------------------------------------------------------------- art

/**
 * A cached image's address on this server: `/api/v1/images/{owner}/{ownerId}/{kind}/{size}/{file}`,
 * relative to the server's origin as `Branding.mark` is. The owner is what the image shows (a
 * movie, a person, a collection), so it's purged with it. `size` is one of TMDB's size names
 * (`w342`, `w1280`, `h632`); a client may swap it for another the server serves for that kind.
 */
const ImageUrl = z
  .string()
  .openapi({ example: '/api/v1/images/movie/603/poster/w342/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg' })

export const Art = z
  .object({
    /** 2:3. Null when TMDB has none. */
    poster: ImageUrl.nullable(),
    /** 16:9. Null when TMDB has none. */
    backdrop: ImageUrl.nullable(),
  })
  .openapi('Art')

// ---------------------------------------------------------------- titles

/**
 * `rating` is out of 5 for the five-star `Rating` component, converted at the API's edge from
 * TMDB's `vote_average` (0 to 10, halved and rounded to one decimal). The cache stores TMDB's value.
 */
const Rating = z.number().min(0).max(5).openapi({
  description: 'Out of 5: TMDB’s vote_average (0–10) halved, to one decimal',
  example: 4.3,
})

/** A movie as a list shows it: Discover, filmographies, collections, recommendations. */
export const DiscoverMovie = z
  .object({
    /** TMDB's id: the movie's address, in the library or not. */
    id: z.number().int().openapi({ example: 603 }),
    title: z.string().openapi({ example: 'The Matrix' }),
    /** Null when TMDB has no release date. */
    year: z.number().int().nullable().openapi({ example: 1999 }),
    /** Minutes. Null in lists that TMDB returns without it (Discover, recommendations). */
    runtimeMinutes: z.number().int().nullable(),
    genres: z.array(z.string()),
    synopsis: z.string(),
    rating: Rating,
    /** How many votes `rating` rests on. */
    voteCount: z.number().int(),
    /** The primary release date; null when TMDB has none. */
    releaseDate: IsoDay.nullable(),
    art: Art,
    inLibrary: z.boolean(),
  })
  .openapi('DiscoverMovie')

/** A person's part in a title: a character (cast) or a job (crew). */
export const Credit = z
  .object({
    /**
     * Unique within the title's cast or crew (one person can have several credits on a title).
     * A key for lists, not an address.
     */
    id: z.string(),
    personId: z.number().int(),
    name: z.string(),
    photo: ImageUrl.nullable(),
    department: Department,
    /** Cast: who they play. */
    character: z.string().nullable(),
    /** Crew: what they did ("Director", "Screenplay"). */
    job: z.string().nullable(),
  })
  .openapi('Credit')

/**
 * A trailer or extra, embedded from youtube-nocookie.com only when someone plays it
 * (media-pages.md). TMDB gives no duration, so there's no length.
 */
export const Video = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(VIDEO_KINDS),
    site: z.enum(['YouTube', 'Vimeo']),
    /** The video's id at the site. */
    key: z.string(),
    official: z.boolean(),
    publishedAt: IsoDate.nullable(),
    /** The movie's backdrop: a site's thumbnail would load from it before anyone asks. */
    still: ImageUrl.nullable(),
  })
  .openapi('Video')

export const CollectionRef = z
  .object({ id: z.number().int(), name: z.string() })
  .openapi('CollectionRef')

/** `GET /api/v1/movies/{id}/metadata`: everything TMDB knows about a movie, in any state. */
export const MovieMetadata = DiscoverMovie.extend({
  originalTitle: z.string(),
  /** ISO 639-1. */
  originalLanguage: z.string().openapi({ example: 'en' }),
  tagline: z.string().nullable(),
  /**
   * The certification in the server's region ("PG-13"): from the theatrical release first, then
   * digital, then any (checkpoint 4, decision 5). Null when there's none.
   */
  certification: z.string().nullable(),
  /** USD; null when unknown. */
  budget: z.number().nullable(),
  revenue: z.number().nullable(),
  studios: z.array(z.string()),
  imdbId: z.string().nullable().openapi({ example: 'tt0133093' }),
  wikidataId: z.string().nullable().openapi({ example: 'Q83495' }),
  /** In billing order. */
  cast: z.array(Credit),
  crew: z.array(Credit),
  videos: z.array(Video),
  collection: CollectionRef.nullable(),
  /** TMDB removed or merged this id: shown as "TMDB no longer has this movie". */
  gone: z.boolean(),
  /** When the server last fetched it from TMDB. */
  fetchedAt: IsoDate,
}).openapi('MovieMetadata')

export const Collection = CollectionRef.extend({
  overview: z.string(),
  art: Art,
  /** Oldest first; those without a date last. */
  parts: z.array(DiscoverMovie),
}).openapi('Collection')

/** A title in a person's filmography, with their part in it. One entry per credit. */
export const PersonCredit = DiscoverMovie.extend({
  /** Unique within the filmography: one row per title and department. */
  creditId: z.string(),
  /** The character, or the job. */
  role: z.string(),
  department: Department,
}).openapi('PersonCredit')

export const Person = z
  .object({
    id: z.number().int().openapi({ example: 6384 }),
    name: z.string(),
    photo: ImageUrl.nullable(),
    knownFor: Department.nullable(),
    bio: z.string().nullable(),
    /** Null when TMDB has neither; either part may be missing. */
    born: z.object({ date: IsoDay.nullable(), place: z.string().nullable() }).nullable(),
    /** TMDB has no place of death. */
    died: z.object({ date: IsoDay }).nullable(),
    imdbId: z.string().nullable(),
    wikidataId: z.string().nullable(),
    /** Newest first; titles without a date first, as they're still to come. */
    credits: z.array(PersonCredit),
  })
  .openapi('Person')

export const DiscoverPage = z
  .object({
    items: z.array(DiscoverMovie),
    /** TMDB's pages: 1-based, 20 a page, at most 500. */
    page: z.number().int(),
    totalPages: z.number().int(),
    totalResults: z.number().int(),
  })
  .openapi('DiscoverPage')

// ---------------------------------------------------------------- routes

const notCached =
  'Answers 503 with `details.reason` `no-tmdb-key` or `tmdb-unreachable`, or 429 with `tmdb-rate-limited`, when the cache can’t answer and TMDB is needed.'

export const metadata = {
  movie: createRoute({
    method: 'get',
    path: `${API_PREFIX}/movies/{id}/metadata`,
    tags: ['Metadata'],
    summary: 'Everything TMDB knows about a movie, in the library or not',
    description: `By TMDB id, for any movie on TMDB: from the cache, or from TMDB when the server hasn’t seen it. Nothing is added to the library. ${notCached}`,
    ...access('user'),
    request: { params: TmdbIdParam },
    responses: {
      200: json(MovieMetadata, 'The metadata'),
      ...errors('unauthorized', 'not-found', 'rate-limited', 'unavailable'),
    },
  }),
  recommendations: createRoute({
    method: 'get',
    path: `${API_PREFIX}/movies/{id}/recommendations`,
    tags: ['Metadata'],
    summary: 'More like this',
    description: `TMDB’s recommendations, or its “similar” list when those are empty (checkpoint 4, decision 6). At most 20. ${notCached}`,
    ...access('user'),
    request: { params: TmdbIdParam },
    responses: {
      200: json(z.array(DiscoverMovie), 'Movies'),
      ...errors('unauthorized', 'not-found', 'rate-limited', 'unavailable'),
    },
  }),
  collection: createRoute({
    method: 'get',
    path: `${API_PREFIX}/collections/{id}`,
    tags: ['Metadata'],
    summary: 'A collection and its parts',
    description: `By TMDB id. Each part says whether it’s in the library. ${notCached}`,
    ...access('user'),
    request: { params: TmdbIdParam },
    responses: {
      200: json(Collection, 'The collection'),
      ...errors('unauthorized', 'not-found', 'rate-limited', 'unavailable'),
    },
  }),
  person: createRoute({
    method: 'get',
    path: `${API_PREFIX}/people/{id}`,
    tags: ['Metadata'],
    summary: 'A person and their filmography',
    description: `By TMDB id. Each credit says whether its movie is in the library. ${notCached}`,
    ...access('user'),
    request: { params: TmdbIdParam },
    responses: {
      200: json(Person, 'The person'),
      ...errors('unauthorized', 'not-found', 'rate-limited', 'unavailable'),
    },
  }),
  image: createRoute({
    method: 'get',
    path: `${API_PREFIX}/images/{owner}/{ownerId}/{kind}/{size}/{file}`,
    tags: ['Metadata'],
    summary: 'A poster, backdrop, photo or logo from the image cache',
    description:
      'Art URLs in every response point here. Served with `Cache-Control: private, max-age=31536000, immutable` and an ETag: TMDB gives a changed image a new file name. Fetched from TMDB the first time; apps send their token with image requests as with any other. 404 for an owner, kind, size or file the server doesn’t serve.',
    ...access('user'),
    request: {
      params: z.object({
        owner: z
          .enum(IMAGE_OWNERS)
          .openapi({ param: { name: 'owner', in: 'path' }, example: 'movie' }),
        ownerId: z.coerce
          .number<number>()
          .int()
          .positive()
          .openapi({ param: { name: 'ownerId', in: 'path' }, example: 603 }),
        kind: z
          .enum(IMAGE_KINDS)
          .openapi({ param: { name: 'kind', in: 'path' }, example: 'poster' }),
        size: z
          .string()
          .regex(/^[wh]\d{2,4}$/)
          .openapi({ param: { name: 'size', in: 'path' }, example: 'w342' }),
        file: z
          .string()
          .regex(/^[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$/)
          .openapi({
            param: { name: 'file', in: 'path' },
            example: 'f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg',
          }),
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
      ...errors('unauthorized', 'not-found', 'rate-limited', 'unavailable'),
    },
  }),
} as const

export type Department = z.infer<typeof Department>
export type Art = z.infer<typeof Art>
export type DiscoverMovie = z.infer<typeof DiscoverMovie>
export type Credit = z.infer<typeof Credit>
export type Video = z.infer<typeof Video>
export type CollectionRef = z.infer<typeof CollectionRef>
export type MovieMetadata = z.infer<typeof MovieMetadata>
export type Collection = z.infer<typeof Collection>
export type PersonCredit = z.infer<typeof PersonCredit>
export type Person = z.infer<typeof Person>
export type DiscoverPage = z.infer<typeof DiscoverPage>

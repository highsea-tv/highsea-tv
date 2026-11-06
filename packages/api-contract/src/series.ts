// SPDX-License-Identifier: AGPL-3.0-only
// Shows as the admin keeps them (docs/product/shows.md), drafted with D3 of the one client platform
// (one-client-platform-d.md, the owner's answer 5): Sonarr's series, seasons and episodes,
// monitored or not, each episode with its file, and Add a show from TMDB. Every route here is a
// draft the prototypes' mock answers and the real server answers 501 until it has shows
// (`draft()` in common.ts), and the admin draws Shows only when public info's `sources` lists
// `shows`. The routes are at `/series`, Sonarr's own name for them, beside the apps' `/shows`
// (shows.ts), as the admin's collections sit beside the apps' (`/curation/collections` and
// `/library/collections`). A show is addressed by its id in the library, the prototype's slug
// ("the-lantern-keepers"); the server picks its ids when it builds them.
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

/**
 * Which episodes a show added watches, as Sonarr's Monitor choice: every one, only those not yet
 * aired, those without a file, the first season, or none.
 */
export const SHOW_MONITOR = ['all', 'future', 'missing', 'first-season', 'none'] as const

/** `unaired` until its air date; `cutoff-unmet` when its file is below its profile's cutoff. */
export const EPISODE_STATUS = [
  'available',
  'missing',
  'downloading',
  'cutoff-unmet',
  'unaired',
] as const

export const SeriesEpisode = z
  .object({
    id: z.string(),
    show: z.string(),
    season: z.number().int().min(0),
    number: z.number().int().min(0),
    title: z.string(),
    /** First aired. */
    aired: IsoDay,
    runtimeMinutes: z.number().int().nonnegative(),
    monitored: z.boolean(),
    status: z.enum(EPISODE_STATUS),
    /** Its file, or null; a multi-episode file names every episode it holds in `episodes`. */
    file: z
      .object({
        path: z.string(),
        size: z.number().nonnegative(),
        quality: z.string(),
        releaseGroup: z.string().nullable(),
        episodes: z.array(z.number().int()),
      })
      .nullable(),
    /** 0–100 while it downloads. */
    progress: z.number().min(0).max(100).optional(),
  })
  .openapi('SeriesEpisode')

export const SeriesSeason = z
  .object({
    /** 0 for specials. */
    number: z.number().int().min(0),
    /** "Season 2", or "Specials". */
    title: z.string(),
    monitored: z.boolean(),
    poster: z.string(),
    episodes: z.array(SeriesEpisode),
  })
  .openapi('SeriesSeason')

/** A show in the admin's library: Sonarr's series. */
export const Series = z
  .object({
    id: z.string(),
    tmdbId: z.number().int(),
    title: z.string(),
    sortTitle: z.string(),
    year: z.number().int(),
    endYear: z.number().int().nullable(),
    /** Still making episodes, or not. */
    airing: z.boolean(),
    network: z.string(),
    genres: z.array(z.string()),
    synopsis: z.string(),
    rating: z.number(),
    certification: z.string(),
    runtimeMinutes: z.number().int().nonnegative(),
    monitored: z.boolean(),
    qualityProfileId: z.string(),
    languageProfileId: z.string(),
    rootFolder: z.string(),
    path: z.string(),
    /** Files go in "Season 01" folders. */
    seasonFolders: z.boolean(),
    addedAt: IsoDate,
    art: z.object({ poster: z.string(), backdrop: z.string() }),
    /** Seasons, specials not counted. */
    seasons: z.number().int().nonnegative(),
    /**
     * Aired episodes monitored or with a file (Sonarr's count), how many of them have a file, and
     * the whole show's.
     */
    episodes: z.object({
      monitored: z.number().int().nonnegative(),
      have: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
    /** Bytes on disk. */
    size: z.number().nonnegative(),
    /** The next monitored episode to air, or null. */
    nextAiring: z
      .object({ id: z.string(), code: z.string(), title: z.string(), aired: IsoDay })
      .nullable(),
  })
  .openapi('Series')

/** A show with its seasons and episodes. */
export const SeriesDetail = Series.extend({ seasonList: z.array(SeriesSeason) }).openapi(
  'SeriesDetail',
)

/** A show TMDB knows, for Discover and Add a show. */
export const DiscoverSeries = z
  .object({
    id: z.string(),
    tmdbId: z.number().int(),
    title: z.string(),
    year: z.number().int(),
    endYear: z.number().int().nullable(),
    seasons: z.number().int().nonnegative(),
    network: z.string(),
    genres: z.array(z.string()),
    synopsis: z.string(),
    rating: z.number(),
    art: z.object({ poster: z.string(), backdrop: z.string() }),
    inLibrary: z.boolean(),
  })
  .openapi('DiscoverSeries')

export const AddSeriesInput = z
  .object({
    tmdbId: z.number().int(),
    title: z.string().min(1),
    year: z.number().int(),
    qualityProfileId: z.string(),
    languageProfileId: z.string(),
    rootFolder: z.string().min(1),
    monitor: z.enum(SHOW_MONITOR),
    seasonFolders: z.boolean(),
    /** Look for the missing episodes once it's added. */
    search: z.boolean(),
  })
  .openapi('AddSeriesInput')

/** What a show's Edit and the bulk bar change. */
export const SeriesUpdate = z
  .object({
    monitored: z.boolean(),
    qualityProfileId: z.string(),
    languageProfileId: z.string(),
    rootFolder: z.string().min(1),
    seasonFolders: z.boolean(),
  })
  .partial()
  .openapi('SeriesUpdate')

/** A search for the whole show, a season or one episode. */
export const SeriesSearch = z
  .object({ season: z.number().int().min(0).optional(), episode: z.string().optional() })
  .openapi('SeriesSearch')

const Monitored = z.object({ monitored: z.boolean() })

const SERIES = `${API_PREFIX}/series`
const SeasonParams = IdParam.extend({
  season: z.coerce
    .number<number>()
    .int()
    .min(0)
    .openapi({ param: { name: 'season', in: 'path' } }),
})
const EpisodeParams = IdParam.extend({
  episodeId: z.string().openapi({ param: { name: 'episodeId', in: 'path' } }),
})

const staff = { ...access('staff'), ...draft() }
const refused = errors('unauthorized', 'forbidden')

// Static paths come before `/series/{id}`, which would match them too: register them first.
export const series = {
  discover: createRoute({
    method: 'get',
    path: `${API_PREFIX}/discover/shows`,
    tags: ['Series'],
    summary: 'Find shows on TMDB (draft)',
    description:
      'Library shows are marked `inLibrary`. Drafted: the server answers 501 until it has shows.',
    ...staff,
    request: { query: z.object({ query: z.string().max(200).optional() }) },
    responses: {
      200: json(z.array(DiscoverSeries), 'The shows found'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
      ...notServed,
    },
  }),
  rootFolders: createRoute({
    method: 'get',
    path: `${SERIES}/rootfolders`,
    tags: ['Series'],
    summary: 'The folders shows are filed under (draft)',
    description:
      'Settings › Media management’s folders for shows, for Add a show and a show’s Edit. Drafted: the server answers 501.',
    ...staff,
    responses: {
      200: json(z.array(z.string()), 'Folders'),
      ...refused,
      ...notServed,
    },
  }),
  list: createRoute({
    method: 'get',
    path: SERIES,
    tags: ['Series'],
    summary: 'The shows in the library (draft)',
    description: 'Drafted: the server answers 501 until it has shows.',
    ...staff,
    responses: {
      200: json(z.array(Series), 'The shows'),
      ...refused,
      ...notServed,
    },
  }),
  add: createRoute({
    method: 'post',
    path: SERIES,
    tags: ['Series'],
    summary: 'Add a show (draft)',
    description:
      'Adding one already here answers it as it is. Drafted: the server answers 501 until it has shows.',
    ...staff,
    request: { ...body(AddSeriesInput) },
    responses: {
      200: json(SeriesDetail, 'The show added'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
      ...notServed,
    },
  }),
  get: createRoute({
    method: 'get',
    path: `${SERIES}/{id}`,
    tags: ['Series'],
    summary: 'A show with its seasons and episodes (draft)',
    description: '404 when the show isn’t here. Drafted: the server answers 501.',
    ...staff,
    request: { params: IdParam },
    responses: {
      200: json(SeriesDetail, 'The show'),
      ...errors('unauthorized', 'forbidden', 'not-found'),
      ...notServed,
    },
  }),
  update: createRoute({
    method: 'patch',
    path: `${SERIES}/{id}`,
    tags: ['Series'],
    summary: 'Change a show’s monitoring, profiles or folder (draft)',
    description: 'Drafted: the server answers 501.',
    ...staff,
    request: { params: IdParam, ...body(SeriesUpdate) },
    responses: {
      200: json(SeriesDetail, 'The show'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
      ...notServed,
    },
  }),
  remove: createRoute({
    method: 'delete',
    path: `${SERIES}/{id}`,
    tags: ['Series'],
    summary: 'Remove a show from the library (draft)',
    description:
      'It stops being monitored; its files stay on disk unless `deleteFiles`. Drafted: the server answers 501.',
    ...staff,
    request: {
      params: IdParam,
      query: z.object({ deleteFiles: z.enum(['true', 'false']).optional() }),
    },
    responses: {
      ...noContent,
      ...errors('unauthorized', 'forbidden', 'not-found'),
      ...notServed,
    },
  }),
  monitorSeason: createRoute({
    method: 'put',
    path: `${SERIES}/{id}/seasons/{season}/monitored`,
    tags: ['Series'],
    summary: 'Monitor a season, with every episode in it, or stop (draft)',
    description: 'Drafted: the server answers 501.',
    ...staff,
    request: { params: SeasonParams, ...body(Monitored) },
    responses: {
      ...noContent,
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
      ...notServed,
    },
  }),
  monitorEpisode: createRoute({
    method: 'put',
    path: `${SERIES}/{id}/episodes/{episodeId}/monitored`,
    tags: ['Series'],
    summary: 'Monitor one episode, or stop (draft)',
    description: 'Drafted: the server answers 501.',
    ...staff,
    request: { params: EpisodeParams, ...body(Monitored) },
    responses: {
      ...noContent,
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
      ...notServed,
    },
  }),
  search: createRoute({
    method: 'post',
    path: `${SERIES}/{id}/search`,
    tags: ['Series'],
    summary: 'Search for a show’s, a season’s or an episode’s wanted episodes (draft)',
    description:
      'Looks for monitored, aired episodes with no file or one below the cutoff, and says how many. Drafted: the server answers 501.',
    ...staff,
    request: { params: IdParam, ...body(SeriesSearch) },
    responses: {
      200: json(z.object({ found: z.number().int().nonnegative() }), 'How many it looks for'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
      ...notServed,
    },
  }),
} as const

export type SeriesEpisode = z.infer<typeof SeriesEpisode>
export type SeriesSeason = z.infer<typeof SeriesSeason>
export type Series = z.infer<typeof Series>
export type SeriesDetail = z.infer<typeof SeriesDetail>
export type DiscoverSeries = z.infer<typeof DiscoverSeries>
export type AddSeriesInput = z.infer<typeof AddSeriesInput>
export type SeriesUpdate = z.infer<typeof SeriesUpdate>
export type ShowMonitor = (typeof SHOW_MONITOR)[number]
export type EpisodeStatus = (typeof EPISODE_STATUS)[number]

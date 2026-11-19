// SPDX-License-Identifier: AGPL-3.0-only
// Shows as the admin keeps them (docs/product/shows.md), drafted with D3 of the one client platform
// (one-client-platform-d.md, the owner's answer 5): Sonarr's series, seasons and episodes,
// monitored or not, each episode with its file, and Add a show from TMDB. Served since Phase 5 B
// (@highsea-tv/media/shows) but for `search`, a draft until part C1 searches for episodes; the
// admin draws Shows when public info's `sources` lists `shows`. The routes are at `/series`,
// Sonarr's own name for them, beside the apps' `/shows` (shows.ts), as the admin's collections sit beside the apps' (`/curation/collections` and
// `/library/collections`). A show is addressed by a string id: on the server its TMDB id
// ("2996", ADR 0064), in the prototypes' mock a slug ("the-lantern-keepers"); an episode's is its
// TMDB id too.
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

/**
 * What Add a show sends. The server needs only the show's TMDB id; `title` and `year` are what the
 * dialog shows and the server reads TMDB's own. No language profile is `null`, left out, or the
 * empty string (ADR 0064's 2026-11-18 section).
 */
export const AddSeriesInput = z
  .object({
    tmdbId: z.number().int(),
    title: z.string().optional(),
    year: z.number().int().optional(),
    qualityProfileId: z.string(),
    languageProfileId: z.string().nullable().optional(),
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

const served = access('staff')
// searching for episodes is part C1's: it stays a draft until then
const staff = { ...access('staff'), ...draft() }
/**
 * A file or folder under a shows root folder that couldn't be placed (Phase 5 B): a show folder
 * TMDB couldn't name surely, or a file whose name gives no episode the show has. Kept with its
 * reason, never guessed, until the owner matches or dismisses it in the admin.
 */
export const UnmatchedShowPath = z
  .object({
    path: z.string(),
    kind: z.enum(['show-folder', 'episode-file']),
    rootFolder: z.string(),
    /** The show whose folder holds the file (its TMDB id as a string); null for a show folder. */
    show: z.string().nullable(),
    /** A code: `no-match`, `ambiguous`, `no-episode-number`, `unknown-season` and so on. */
    reason: z.string(),
    /** The reason in words. */
    message: z.string(),
    size: z.number().int().nonnegative(),
    foundAt: IsoDate,
  })
  .openapi('UnmatchedShowPath')

/**
 * Matches something unmatched by hand: a show folder to the show it holds (`show`, its TMDB id),
 * imported as the library import does; an episode file to the episodes it holds of the show whose
 * folder it's in (`episodes`, one or several for a multi-episode file).
 */
export const UnmatchedMatch = z
  .object({
    path: z.string().min(1).max(4096),
    show: z
      .string()
      .regex(/^\d{1,10}$/)
      .optional(),
    episodes: z
      .array(
        z.object({
          season: z.number().int().min(0).max(9999),
          episode: z.number().int().min(1).max(99999),
        }),
      )
      .max(20)
      .optional(),
  })
  .openapi('UnmatchedShowMatch')

const UnmatchedPath = z.object({ path: z.string().min(1).max(4096) })

const refused = errors('unauthorized', 'forbidden')

// Static paths come before `/series/{id}`, which would match them too: register them first.
export const series = {
  discover: createRoute({
    method: 'get',
    path: `${API_PREFIX}/discover/shows`,
    tags: ['Series'],
    summary: 'Find shows on TMDB',
    description: 'Library shows are marked `inLibrary`.',
    ...served,
    request: { query: z.object({ query: z.string().max(200).optional() }) },
    responses: {
      200: json(z.array(DiscoverSeries), 'The shows found'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  rootFolders: createRoute({
    method: 'get',
    path: `${SERIES}/rootfolders`,
    tags: ['Series'],
    summary: 'The folders shows are filed under',
    description:
      'Settings › Media management’s folders for shows, for Add a show and a show’s Edit.',
    ...served,
    responses: {
      200: json(z.array(z.string()), 'Folders'),
      ...refused,
    },
  }),
  unmatched: createRoute({
    method: 'get',
    path: `${SERIES}/unmatched`,
    tags: ['Series'],
    summary: 'What under the shows’ folders couldn’t be matched',
    description:
      'Show folders and episode files kept unmatched by the library import and the scan, with why, by path. `rootFolder` narrows it to one folder.',
    ...served,
    request: { query: z.object({ rootFolder: z.string().min(1).max(4096).optional() }) },
    responses: {
      200: json(z.array(UnmatchedShowPath), 'By path'),
      ...refused,
    },
  }),
  matchUnmatched: createRoute({
    method: 'post',
    path: `${SERIES}/unmatched/match`,
    tags: ['Series'],
    summary: 'Match something unmatched by hand',
    description:
      'A show folder is imported as the show picked (409 `running` while a library import runs); an episode file is filed under the episodes picked, an episode another file held taken from it. 404 when the path isn’t unmatched.',
    ...served,
    request: { ...body(UnmatchedMatch) },
    responses: {
      ...noContent,
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found', 'conflict'),
    },
  }),
  dismissUnmatched: createRoute({
    method: 'post',
    path: `${SERIES}/unmatched/dismiss`,
    tags: ['Series'],
    summary: 'Dismiss something unmatched',
    description:
      'It leaves the list and the scan doesn’t offer it again; the file or folder stays where it is.',
    ...served,
    request: { ...body(UnmatchedPath) },
    responses: {
      ...noContent,
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  list: createRoute({
    method: 'get',
    path: SERIES,
    tags: ['Series'],
    summary: 'The shows in the library',
    description: '',
    ...served,
    responses: {
      200: json(z.array(Series), 'The shows'),
      ...refused,
    },
  }),
  add: createRoute({
    method: 'post',
    path: SERIES,
    tags: ['Series'],
    summary: 'Add a show',
    description: 'Adding one already here answers it as it is.',
    ...served,
    request: { ...body(AddSeriesInput) },
    responses: {
      200: json(SeriesDetail, 'The show added'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  get: createRoute({
    method: 'get',
    path: `${SERIES}/{id}`,
    tags: ['Series'],
    summary: 'A show with its seasons and episodes',
    description: '404 when the show isn’t here.',
    ...served,
    request: { params: IdParam },
    responses: {
      200: json(SeriesDetail, 'The show'),
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  }),
  update: createRoute({
    method: 'patch',
    path: `${SERIES}/{id}`,
    tags: ['Series'],
    summary: 'Change a show’s monitoring, profiles or folder',
    description: '',
    ...served,
    request: { params: IdParam, ...body(SeriesUpdate) },
    responses: {
      200: json(SeriesDetail, 'The show'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  remove: createRoute({
    method: 'delete',
    path: `${SERIES}/{id}`,
    tags: ['Series'],
    summary: 'Remove a show from the library',
    description: 'It stops being monitored; its files stay on disk unless `deleteFiles`.',
    ...served,
    request: {
      params: IdParam,
      query: z.object({ deleteFiles: z.enum(['true', 'false']).optional() }),
    },
    responses: {
      ...noContent,
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  }),
  refresh: createRoute({
    method: 'post',
    path: `${SERIES}/{id}/refresh`,
    tags: ['Series'],
    summary: 'Refresh a show’s details from TMDB',
    description:
      'Queues TMDB’s refresh of the show and its seasons; new episodes and changed titles follow when it lands (`shows.updated`).',
    ...served,
    request: { params: IdParam },
    responses: {
      ...noContent,
      ...errors('unauthorized', 'forbidden', 'not-found'),
    },
  }),
  monitorSeason: createRoute({
    method: 'put',
    path: `${SERIES}/{id}/seasons/{season}/monitored`,
    tags: ['Series'],
    summary: 'Monitor a season, with every episode in it, or stop',
    description: '',
    ...served,
    request: { params: SeasonParams, ...body(Monitored) },
    responses: {
      ...noContent,
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
    },
  }),
  monitorEpisode: createRoute({
    method: 'put',
    path: `${SERIES}/{id}/episodes/{episodeId}/monitored`,
    tags: ['Series'],
    summary: 'Monitor one episode, or stop',
    description: '',
    ...served,
    request: { params: EpisodeParams, ...body(Monitored) },
    responses: {
      ...noContent,
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found'),
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
export type UnmatchedShowPath = z.infer<typeof UnmatchedShowPath>
export type UnmatchedShowMatch = z.infer<typeof UnmatchedMatch>
export type AddSeriesInput = z.infer<typeof AddSeriesInput>
export type SeriesUpdate = z.infer<typeof SeriesUpdate>
export type ShowMonitor = (typeof SHOW_MONITOR)[number]
export type EpisodeStatus = (typeof EPISODE_STATUS)[number]

// SPDX-License-Identifier: AGPL-3.0-only
// Wanted and the calendar (wanted.md, A14; checkpoint 8a, ADR 0045): monitored movies still to
// find, ones under their profile's cutoff, searching for them, each movie's release dates by month,
// and the calendar's iCal feed. The feed takes a `calendar` key in its address, since calendar
// apps can't send headers; that key opens the feed and nothing else (the owner's answer 10).
// Episodes join them (Phase 5 C1, HT-109, as stage 6 drew): their own Missing and Cutoff unmet
// lists, searched with the films, and each monitored episode on its air date.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, body, errors, IsoDate, IsoDay, json, noContent } from './common.ts'
import { MOVIE_SORTS, Movie, MoviePage } from './movies.ts'
import { EPISODE_STATUS } from './series.ts'

// ---------------------------------------------------------------- shapes

export const WantedQuery = z.object({
  /** Matches anywhere in the title or original title. */
  title: z.string().max(200).optional(),
  sort: z.enum(MOVIE_SORTS).optional().openapi({ description: 'Title when absent' }),
  dir: z.enum(['asc', 'desc']).optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number<number>().int().min(1).max(200).optional(),
})

export const WantedEpisodeQuery = z.object({
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number<number>().int().min(1).max(200).optional(),
})

/** One episode a Search on Wanted asks for: its show's TMDB id and its numbers. */
export const WantedEpisodeTarget = z.object({
  show: z.string().max(20),
  season: z.number().int().min(0),
  episode: z.number().int().min(0),
})

export const WantedSearchInput = z
  .object({
    /** TMDB ids; or `all` for every movie (and episode) on the list. */
    ids: z.array(z.number().int()).max(10_000).optional(),
    /** Episodes (HT-109), searched one at a time as a show's episode Search is. */
    episodes: z.array(WantedEpisodeTarget).max(10_000).optional(),
    all: z.enum(['missing', 'cutoff']).optional(),
    /** With `all`: only the movies or only the episodes; both when absent. */
    kind: z.enum(['movies', 'episodes']).optional(),
  })
  .openapi('WantedSearchInput')

export const WantedSearchResult = z
  .object({
    /** How many movie searches were queued. */
    queued: z.number().int(),
    /** How many episodes are looked for (HT-109). */
    episodes: z.number().int().optional(),
  })
  .openapi('WantedSearchResult')

/**
 * An episode on Wanted or the calendar (HT-109): its show, as the admin addresses it (the TMDB id
 * as a string), and the episode, with its status and its file's quality when it has one.
 */
export const WantedEpisode = z
  .object({
    show: z.object({
      id: z.string(),
      title: z.string(),
      year: z.number().int().nullable(),
      poster: z.string().nullable(),
      qualityProfileId: z.string(),
    }),
    episode: z.object({
      /** Its TMDB id as a string, as the show's page has it. */
      id: z.string(),
      season: z.number().int().min(0),
      number: z.number().int().min(0),
      title: z.string(),
      aired: IsoDay.nullable(),
      status: z.enum(EPISODE_STATUS),
      /** Its file's quality, or null without one. */
      quality: z.string().nullable(),
    }),
  })
  .openapi('WantedEpisode')

export const WantedEpisodePage = z
  .object({
    items: z.array(WantedEpisode),
    total: z.number().int(),
    next: z.string().nullable(),
  })
  .openapi('WantedEpisodePage')

/** Which of a movie's dates (the owner's answer 2): in cinemas, digital, or physical. */
export const CALENDAR_KINDS = ['cinema', 'digital', 'physical'] as const

export const MovieCalendarEntry = z
  .object({
    date: IsoDay,
    kind: z.enum(CALENDAR_KINDS),
    movie: Movie,
  })
  .openapi('MovieCalendarEntry')

/** A monitored episode on its air date (HT-109). */
export const EpisodeCalendarEntry = z
  .object({
    date: IsoDay,
    kind: z.literal('episode'),
    episode: WantedEpisode,
  })
  .openapi('EpisodeCalendarEntry')

export const CalendarEntry = z
  .union([MovieCalendarEntry, EpisodeCalendarEntry])
  .openapi('CalendarEntry')

export const CalendarQuery = z.object({
  from: IsoDay,
  to: IsoDay.openapi({ description: 'Inclusive; at most 400 days after `from`' }),
})

/** The person's calendar feed: its address with the key in it, or null before one is made. */
export const CalendarFeed = z
  .object({
    url: z.string().nullable(),
    createdAt: IsoDate.nullable(),
  })
  .openapi('CalendarFeed')

/** After RSS or the sweep, which may have changed Missing or Cutoff unmet; no ids (a grab or an
 * import announces `queue.updated` or `item.updated` as before). */
export const WANTED_TOPICS = { wanted: 'wanted.updated' } as const

// ---------------------------------------------------------------- routes

const WANTED = `${API_PREFIX}/wanted`

export const wanted = {
  missing: createRoute({
    method: 'get',
    path: `${WANTED}/missing`,
    tags: ['Wanted'],
    summary: 'Monitored movies past their minimum availability without a file',
    ...access('staff'),
    request: { query: WantedQuery },
    responses: { 200: json(MoviePage, 'A page of movies'), ...errors('invalid', 'unauthorized') },
  }),
  cutoff: createRoute({
    method: 'get',
    path: `${WANTED}/cutoff`,
    tags: ['Wanted'],
    summary: 'Monitored movies with a file under its profile’s cutoff',
    ...access('staff'),
    request: { query: WantedQuery },
    responses: { 200: json(MoviePage, 'A page of movies'), ...errors('invalid', 'unauthorized') },
  }),
  missingEpisodes: createRoute({
    method: 'get',
    path: `${WANTED}/missing/episodes`,
    tags: ['Wanted'],
    summary: 'Monitored, aired episodes of monitored shows without a file',
    description: 'Most recently aired first (HT-109).',
    ...access('staff'),
    request: { query: WantedEpisodeQuery },
    responses: {
      200: json(WantedEpisodePage, 'A page of episodes'),
      ...errors('invalid', 'unauthorized'),
    },
  }),
  cutoffEpisodes: createRoute({
    method: 'get',
    path: `${WANTED}/cutoff/episodes`,
    tags: ['Wanted'],
    summary: 'Monitored episodes with a file under their show’s profile’s cutoff',
    description: 'Most recently aired first (HT-109).',
    ...access('staff'),
    request: { query: WantedEpisodeQuery },
    responses: {
      200: json(WantedEpisodePage, 'A page of episodes'),
      ...errors('invalid', 'unauthorized'),
    },
  }),
  search: createRoute({
    method: 'post',
    path: `${WANTED}/search`,
    tags: ['Wanted'],
    summary: 'Search for some movies, or every movie on one of the lists',
    description:
      'Queues a search for each; results land in Activity. 409 `no-indexers` until an indexer is set up.',
    ...access('staff'),
    request: { ...body(WantedSearchInput) },
    responses: {
      200: json(WantedSearchResult, 'Queued'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'conflict'),
    },
  }),
  calendar: createRoute({
    method: 'get',
    path: `${API_PREFIX}/calendar`,
    tags: ['Wanted'],
    summary: 'Monitored movies’ release dates and episodes’ air dates between two days',
    description:
      'Each of a movie’s dates (in cinemas, digital, physical) is its own entry; each monitored episode of a monitored show is one on its air date (`kind: episode`).',
    ...access('staff'),
    request: { query: CalendarQuery },
    responses: {
      200: json(z.array(CalendarEntry), 'Entries, soonest first'),
      ...errors('invalid', 'unauthorized'),
    },
  }),
  feed: createRoute({
    method: 'get',
    path: '/feed/v1/calendar.ics',
    tags: ['Wanted'],
    summary: 'The calendar as an iCal feed (RFC 5545), for calendar apps',
    description:
      'Takes a `calendar` key in the address. 30 days back and 365 forward; each date an all-day event.',
    ...access('public'),
    request: { query: z.object({ key: z.string().max(200) }) },
    responses: {
      200: {
        description: 'The calendar',
        content: { 'text/calendar': { schema: z.string() } },
      },
      ...errors('unauthorized'),
    },
  }),
  feedKey: createRoute({
    method: 'get',
    path: `${API_PREFIX}/me/calendar-key`,
    tags: ['Wanted'],
    summary: 'Your calendar feed’s address',
    ...access('staff'),
    responses: { 200: json(CalendarFeed, 'The feed'), ...errors('unauthorized', 'forbidden') },
  }),
  makeFeedKey: createRoute({
    method: 'post',
    path: `${API_PREFIX}/me/calendar-key`,
    tags: ['Wanted'],
    summary: 'Make your calendar feed’s key, replacing the one you had',
    ...access('staff'),
    responses: { 200: json(CalendarFeed, 'The feed'), ...errors('unauthorized', 'forbidden') },
  }),
  revokeFeedKey: createRoute({
    method: 'delete',
    path: `${API_PREFIX}/me/calendar-key`,
    tags: ['Wanted'],
    summary: 'Turn your calendar feed off',
    ...access('staff'),
    responses: { ...noContent, ...errors('unauthorized', 'forbidden') },
  }),
} as const

export type WantedQuery = z.infer<typeof WantedQuery>
export type WantedSearchInput = z.infer<typeof WantedSearchInput>
export type WantedSearchResult = z.infer<typeof WantedSearchResult>
export type CalendarEntry = z.infer<typeof CalendarEntry>
export type MovieCalendarEntry = z.infer<typeof MovieCalendarEntry>
export type EpisodeCalendarEntry = z.infer<typeof EpisodeCalendarEntry>
export type WantedEpisode = z.infer<typeof WantedEpisode>
export type WantedEpisodePage = z.infer<typeof WantedEpisodePage>
export type WantedEpisodeQuery = z.infer<typeof WantedEpisodeQuery>
export type CalendarKind = (typeof CALENDAR_KINDS)[number]
export type CalendarFeed = z.infer<typeof CalendarFeed>

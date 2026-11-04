// SPDX-License-Identifier: AGPL-3.0-only
// The shows library as the apps read it (client-shows.md), drafted with B3 of the one client
// platform (one-client-platform-b.md, the owner's answer 1): every route here is a draft the
// prototypes' mock answers and the real server answers 501 until it has shows (`draft()` in
// common.ts). A show and an episode are addressed by TMDB's numbers, as a film is. Playing an
// episode, its picks and marking one watched use the films' own routes with the `episode` type
// (`TITLE_TYPES`), so there are no twins of them here; a season, or the whole show, is marked here.
import { createRoute, z } from '@hono/zod-openapi'
import {
  API_PREFIX,
  access,
  body,
  draft,
  errors,
  json,
  noContent,
  notServed,
  TmdbIdParam,
} from './common.ts'
import { ClientEpisode, ClientShow } from './kinds.ts'
import { Credit, Video } from './metadata.ts'

export const ClientSeason = z
  .object({
    /** 0 for specials. */
    number: z.number().int().min(0),
    /** "Season 2", or "Specials". */
    title: z.string(),
    /** The year it aired; null for specials. */
    year: z.number().int().nullable(),
    poster: z.string().nullable(),
    episodes: z.array(ClientEpisode),
  })
  .openapi('ClientSeason')

/** A language a show's episodes have, for Audio and subtitles on its page. */
const ShowTrack = z.object({ id: z.string(), label: z.string() })

/** A show with its seasons, episodes, people and like shows. */
export const ClientShowDetail = z
  .object({
    show: ClientShow,
    /** Seasons in order, specials last, as Plex and the Apple TV app place them. */
    seasons: z.array(ClientSeason),
    cast: z.array(Credit),
    creators: z.array(Credit),
    /** The rest of the crew: who wrote the score. */
    crew: z.array(Credit),
    /** Shows here that share a genre, closest first. */
    related: z.array(ClientShow),
    /** Its trailers from the metadata, newest first; none for some shows. */
    videos: z.array(Video),
    /**
     * The languages its episodes have: picked once for the show, they apply to every episode, as a
     * film's picks apply to the film.
     */
    tracks: z.object({ audio: z.array(ShowTrack), subtitles: z.array(ShowTrack) }),
    /** This person's picks for the show, or the server's defaults. */
    defaults: z.object({ audioId: z.string().nullable(), subtitleId: z.string().nullable() }),
  })
  .openapi('ClientShowDetail')

/** Mark a season, or every episode of the show (`season` null, specials left out). */
export const ShowWatched = z
  .object({ season: z.number().int().min(0).nullable(), watched: z.boolean() })
  .openapi('ShowWatched')

const SHOWS = `${API_PREFIX}/shows`

export const shows = {
  list: createRoute({
    method: 'get',
    path: SHOWS,
    tags: ['Shows'],
    summary: 'Every show you can watch, with your place in each (draft)',
    description:
      'Sorted and filtered by the apps, as the prototypes do. Drafted: the server answers 501 until it has shows.',
    ...access('user'),
    ...draft(),
    responses: {
      200: json(z.array(ClientShow), 'The shows'),
      ...errors('unauthorized'),
      ...notServed,
    },
  }),
  show: createRoute({
    method: 'get',
    path: `${SHOWS}/{id}`,
    tags: ['Shows'],
    summary: 'A show with its seasons and episodes (draft)',
    description: '404 when the show isn’t here. Drafted: the server answers 501.',
    ...access('user'),
    ...draft(),
    request: { params: TmdbIdParam },
    responses: {
      200: json(ClientShowDetail, 'The show'),
      ...errors('unauthorized', 'not-found'),
      ...notServed,
    },
  }),
  watched: createRoute({
    method: 'put',
    path: `${SHOWS}/{id}/watched`,
    tags: ['Shows'],
    summary: 'Mark a season, or the whole show, watched or not (draft)',
    description:
      'Watched plays each episode to the end; unwatched forgets each place. One episode is marked with the playback routes and the `episode` type. Drafted: the server answers 501.',
    ...access('user'),
    ...draft(),
    request: { params: TmdbIdParam, ...body(ShowWatched) },
    responses: {
      ...noContent,
      ...errors('invalid', 'unauthorized', 'not-found'),
      ...notServed,
    },
  }),
} as const

export type ClientSeason = z.infer<typeof ClientSeason>
export type ClientShowDetail = z.infer<typeof ClientShowDetail>
export type ShowWatched = z.infer<typeof ShowWatched>

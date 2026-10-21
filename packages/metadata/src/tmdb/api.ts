// SPDX-License-Identifier: AGPL-3.0-only
// The TMDB endpoints highsea calls, each with the query it documents
// (https://developer.themoviedb.org/reference). Query values are always spelled out (page 1
// included), so a request has one recording key.
import type { Credential, TmdbClient } from './client.ts'
import type {
  TmdbChanges,
  TmdbCollection,
  TmdbConfiguration,
  TmdbMovie,
  TmdbMovieItem,
  TmdbPage,
  TmdbPerson,
} from './types.ts'

/**
 * One movie request is the whole movie: `append_to_response` takes up to 20 sub-requests
 * ([Append to response](https://developer.themoviedb.org/docs/append-to-response)).
 */
export const MOVIE_APPEND = 'credits,videos,release_dates,external_ids,recommendations'
export const PERSON_APPEND = 'movie_credits,external_ids'

/** Discover's lists and their endpoints. Trending takes no region. */
export const LIST_PATHS = {
  trending: '/3/trending/movie/week',
  popular: '/3/movie/popular',
  'now-playing': '/3/movie/now_playing',
  upcoming: '/3/movie/upcoming',
} as const

export function tmdbApi(client: TmdbClient) {
  return {
    /** `GET /3/authentication`: 200 for a good credential, 401 (`status_code` 7) for a bad one. */
    authentication: (c: Credential) =>
      client.json<{ success: boolean; status_code?: number }>(c, '/3/authentication'),
    configuration: (c: Credential) => client.json<TmdbConfiguration>(c, '/3/configuration'),
    movie: (c: Credential, id: number, language: string) =>
      client.json<TmdbMovie>(c, `/3/movie/${id}`, { append_to_response: MOVIE_APPEND, language }),
    similar: (c: Credential, id: number, language: string) =>
      client.json<TmdbPage<TmdbMovieItem>>(c, `/3/movie/${id}/similar`, { language, page: 1 }),
    collection: (c: Credential, id: number, language: string) =>
      client.json<TmdbCollection>(c, `/3/collection/${id}`, { language }),
    person: (c: Credential, id: number, language: string) =>
      client.json<TmdbPerson>(c, `/3/person/${id}`, {
        append_to_response: PERSON_APPEND,
        language,
      }),
    search: (c: Credential, query: string, page: number, language: string) =>
      client.json<TmdbPage<TmdbMovieItem>>(c, '/3/search/movie', {
        query,
        page,
        language,
        include_adult: false,
      }),
    /**
     * `GET /3/find/{external_id}?external_source=imdb_id`: the TMDB titles an IMDb id belongs to
     * ([Find by ID](https://developer.themoviedb.org/reference/find-by-id)).
     */
    findImdb: (c: Credential, imdbId: string, language: string) =>
      client.json<{ movie_results: TmdbMovieItem[] }>(c, `/3/find/${encodeURIComponent(imdbId)}`, {
        external_source: 'imdb_id',
        language,
      }),
    list: (
      c: Credential,
      list: keyof typeof LIST_PATHS,
      page: number,
      language: string,
      region: string,
    ) =>
      client.json<TmdbPage<TmdbMovieItem>>(c, LIST_PATHS[list], {
        language,
        page,
        region: list === 'trending' ? undefined : region,
      }),
    /** Ids changed between two dates (`YYYY-MM-DD`), up to 14 days apart, 100 a page. */
    changes: (
      c: Credential,
      kind: 'movie' | 'person',
      startDate: string,
      endDate: string,
      page: number,
    ) =>
      client.json<TmdbChanges>(c, `/3/${kind}/changes`, {
        start_date: startDate,
        end_date: endDate,
        page,
      }),
  }
}

export type TmdbApi = ReturnType<typeof tmdbApi>

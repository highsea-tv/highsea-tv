// SPDX-License-Identifier: AGPL-3.0-only
// The TMDB endpoints highsea calls, each with the query it documents
// (https://developer.themoviedb.org/reference). Query values are always spelled out (page 1
// included), so a request has one recording key.
import type { Credential, TmdbClient } from './client.ts'
import type {
  TmdbCertifications,
  TmdbChanges,
  TmdbCollection,
  TmdbConfiguration,
  TmdbEpisode,
  TmdbFind,
  TmdbImages,
  TmdbMovie,
  TmdbMovieItem,
  TmdbPage,
  TmdbPerson,
  TmdbSeason,
  TmdbShow,
  TmdbShowItem,
} from './types.ts'

/**
 * One movie request is the whole movie: `append_to_response` takes up to 20 sub-requests
 * ([Append to response](https://developer.themoviedb.org/docs/append-to-response)). `keywords`
 * ([Movie keywords](https://developer.themoviedb.org/reference/movie-keywords)) came with smart
 * collections' keyword rules (checkpoint 8d); `images` came with chosen artwork (HT-66), for the
 * automatic logo.
 */
export const MOVIE_APPEND =
  'credits,videos,release_dates,external_ids,recommendations,keywords,images'

/**
 * The image languages a movie request asks for: the metadata language's, English, and none
 * (`null`), as TMDB's [Image languages](https://developer.themoviedb.org/docs/image-languages)
 * guide suggests, since images are filtered by `language` otherwise and a logo's text may be in
 * English alone.
 */
export const imageLanguages = (language: string) => {
  const lang = language.split('-')[0]?.toLowerCase() || 'en'
  return [...new Set([lang, 'en']), 'null'].join(',')
}
/**
 * One show request is the whole show but its episodes (ADR 0064): `aggregate_credits` for the cast
 * across every season, `content_ratings` for the certification, `external_ids` for TheTVDB's and
 * IMDb's ids, and `images` for the automatic logo, as a movie's request appends them
 * ([TV series details](https://developer.themoviedb.org/reference/tv-series-details),
 * [Append to response](https://developer.themoviedb.org/docs/append-to-response)).
 */
export const SHOW_APPEND =
  'aggregate_credits,content_ratings,external_ids,videos,recommendations,keywords,images'
/** A season is one request with its episodes; `external_ids` gives the season's TheTVDB id. */
export const SEASON_APPEND = 'external_ids'
export const PERSON_APPEND = 'movie_credits,external_ids'

/** Discover's lists and their endpoints. Trending takes no region. */
export const LIST_PATHS = {
  trending: '/3/trending/movie/week',
  popular: '/3/movie/popular',
  'now-playing': '/3/movie/now_playing',
  upcoming: '/3/movie/upcoming',
  /** Import lists' chart (checkpoint 8a); Discover doesn't show it. */
  'top-rated': '/3/movie/top_rated',
} as const

export function tmdbApi(client: TmdbClient) {
  return {
    /** `GET /3/authentication`: 200 for a good credential, 401 (`status_code` 7) for a bad one. */
    authentication: (c: Credential) =>
      client.json<{ success: boolean; status_code?: number }>(c, '/3/authentication'),
    configuration: (c: Credential) => client.json<TmdbConfiguration>(c, '/3/configuration'),
    /** Every country's film certifications, in order (smart collections' rating rule, 8d). */
    certifications: (c: Credential) =>
      client.json<TmdbCertifications>(c, '/3/certification/movie/list'),
    movie: (c: Credential, id: number, language: string) =>
      client.json<TmdbMovie>(c, `/3/movie/${id}`, {
        append_to_response: MOVIE_APPEND,
        include_image_language: imageLanguages(language),
        language,
      }),
    /**
     * Every image TMDB has for a movie, in every language: neither `language` nor
     * `include_image_language` is sent, so nothing is filtered (the artwork picker, HT-66).
     */
    show: (c: Credential, id: number, language: string) =>
      client.json<TmdbShow>(c, `/3/tv/${id}`, {
        append_to_response: SHOW_APPEND,
        include_image_language: imageLanguages(language),
        language,
      }),
    /** A season with its episodes ([TV season details](https://developer.themoviedb.org/reference/tv-season-details)). */
    season: (c: Credential, id: number, season: number, language: string) =>
      client.json<TmdbSeason>(c, `/3/tv/${id}/season/${season}`, {
        append_to_response: SEASON_APPEND,
        language,
      }),
    /** One episode with its external ids ([TV episode details](https://developer.themoviedb.org/reference/tv-episode-details)). */
    episode: (c: Credential, id: number, season: number, episode: number, language: string) =>
      client.json<TmdbEpisode>(c, `/3/tv/${id}/season/${season}/episode/${episode}`, {
        append_to_response: 'external_ids',
        language,
      }),
    /** Every image TMDB has for a show, unfiltered, as `movieImages` (the artwork picker). */
    showImages: (c: Credential, id: number) => client.json<TmdbImages>(c, `/3/tv/${id}/images`),
    searchShows: (c: Credential, query: string, page: number, language: string) =>
      client.json<TmdbPage<TmdbShowItem>>(c, '/3/search/tv', {
        query,
        page,
        language,
        include_adult: false,
      }),
    /**
     * `GET /3/trending/tv/week`: the shows trending this week, 20 a page, for Discover's shows with
     * no search, as `/3/trending/movie/week` is for films
     * ([Trending TV](https://developer.themoviedb.org/reference/trending-tv)). It takes no region.
     */
    trendingShows: (c: Credential, page: number, language: string) =>
      client.json<TmdbPage<TmdbShowItem>>(c, '/3/trending/tv/week', { language, page }),
    /**
     * `GET /3/find/{id}?external_source=tvdb_id`: the show, season or episode a TheTVDB id is
     * ([Find by ID](https://developer.themoviedb.org/reference/find-by-id)).
     */
    findTvdb: (c: Credential, tvdbId: number, language: string) =>
      client.json<TmdbFind>(c, `/3/find/${tvdbId}`, { external_source: 'tvdb_id', language }),
    movieImages: (c: Credential, id: number) => client.json<TmdbImages>(c, `/3/movie/${id}/images`),
    collectionImages: (c: Credential, id: number) =>
      client.json<TmdbImages>(c, `/3/collection/${id}/images`),
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
      client.json<TmdbFind>(c, `/3/find/${encodeURIComponent(imdbId)}`, {
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
    /**
     * `GET /3/list/{list_id}`: a public list's movies, 20 a page (import lists, checkpoint 8a;
     * [List details](https://developer.themoviedb.org/reference/list-details)).
     */
    publicList: (c: Credential, id: string, page: number, language: string) =>
      client.json<{
        id: number | string
        name: string
        items: (TmdbMovieItem & { media_type?: string })[]
        page: number
        total_pages: number
        total_results: number
      }>(c, `/3/list/${encodeURIComponent(id)}`, { language, page }),
    /**
     * Ids changed between two dates (`YYYY-MM-DD`), up to 14 days apart, 100 a page; `tv` is
     * [TV changes](https://developer.themoviedb.org/reference/changes-tv-list).
     */
    changes: (
      c: Credential,
      kind: 'movie' | 'person' | 'tv',
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

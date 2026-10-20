// SPDX-License-Identifier: AGPL-3.0-only
// TMDB's response shapes, as its API reference documents them (developer.themoviedb.org/reference).
// Only the fields highsea reads are typed; the cache stores whole responses, so a field read later
// needs no refetch. Every field TMDB may leave out or send as null is optional or nullable here.

export type TmdbGenre = { id: number; name: string }

/** A movie in a list: search, Discover's lists, recommendations, similar, a collection's parts. */
export type TmdbMovieItem = {
  id: number
  title: string
  original_title?: string
  original_language?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  release_date?: string
  genre_ids?: number[]
  vote_average?: number
  vote_count?: number
  popularity?: number
  adult?: boolean
}

export type TmdbPage<T> = {
  page: number
  results: T[]
  total_pages: number
  total_results: number
}

export type TmdbCast = {
  id: number
  name: string
  profile_path?: string | null
  character?: string
  credit_id: string
  order?: number
  known_for_department?: string
}

export type TmdbCrew = {
  id: number
  name: string
  profile_path?: string | null
  department: string
  job: string
  credit_id: string
  known_for_department?: string
}

export type TmdbVideo = {
  id: string
  name: string
  key: string
  site: string
  type: string
  official?: boolean
  published_at?: string
  iso_639_1?: string
  iso_3166_1?: string
}

/** `type`: 1 Premiere, 2 Theatrical (limited), 3 Theatrical, 4 Digital, 5 Physical, 6 TV. */
export type TmdbReleaseDate = {
  certification: string
  release_date: string
  type: number
  note?: string
  iso_639_1?: string
}

export type TmdbReleaseDates = {
  results: { iso_3166_1: string; release_dates: TmdbReleaseDate[] }[]
}

export type TmdbExternalIds = {
  imdb_id?: string | null
  wikidata_id?: string | null
}

/** `/3/movie/{id}` with `append_to_response=credits,videos,release_dates,external_ids,recommendations`. */
export type TmdbMovie = {
  id: number
  title: string
  original_title: string
  original_language: string
  overview?: string | null
  tagline?: string | null
  status?: string
  release_date?: string
  runtime?: number | null
  budget?: number
  revenue?: number
  genres?: TmdbGenre[]
  poster_path?: string | null
  backdrop_path?: string | null
  vote_average?: number
  vote_count?: number
  popularity?: number
  imdb_id?: string | null
  belongs_to_collection?: {
    id: number
    name: string
    poster_path?: string | null
    backdrop_path?: string | null
  } | null
  production_companies?: { id: number; name: string }[]
  credits?: { cast: TmdbCast[]; crew: TmdbCrew[] }
  videos?: { results: TmdbVideo[] }
  release_dates?: TmdbReleaseDates
  external_ids?: TmdbExternalIds
  recommendations?: TmdbPage<TmdbMovieItem>
  /**
   * Not TMDB's: highsea adds `/3/movie/{id}/similar` here when the recommendations are empty, so
   * the fallback is cached with the movie (and dropped when it's refreshed).
   */
  similar?: TmdbPage<TmdbMovieItem>
}

export type TmdbCollection = {
  id: number
  name: string
  overview?: string | null
  poster_path?: string | null
  backdrop_path?: string | null
  parts: TmdbMovieItem[]
}

export type TmdbPersonCast = TmdbMovieItem & { character?: string; credit_id: string }
export type TmdbPersonCrew = TmdbMovieItem & { department: string; job: string; credit_id: string }

/** `/3/person/{id}` with `append_to_response=movie_credits,external_ids`. */
export type TmdbPerson = {
  id: number
  name: string
  biography?: string | null
  birthday?: string | null
  deathday?: string | null
  place_of_birth?: string | null
  profile_path?: string | null
  known_for_department?: string | null
  imdb_id?: string | null
  movie_credits?: { cast: TmdbPersonCast[]; crew: TmdbPersonCrew[] }
  external_ids?: TmdbExternalIds
}

export type TmdbConfiguration = {
  images: {
    secure_base_url: string
    backdrop_sizes: string[]
    logo_sizes: string[]
    poster_sizes: string[]
    profile_sizes: string[]
    still_sizes: string[]
  }
}

export type TmdbChanges = TmdbPage<{ id: number; adult?: boolean | null }>

/** TMDB's error body ([Errors](https://developer.themoviedb.org/docs/errors)). */
export type TmdbError = { success?: false; status_code: number; status_message: string }

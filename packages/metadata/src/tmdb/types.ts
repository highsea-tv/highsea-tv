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

/**
 * One of a title's images ([Movie images](https://developer.themoviedb.org/reference/movie-images),
 * [Collection images](https://developer.themoviedb.org/reference/collection-images)). `iso_639_1` is
 * the language of the text on it, null for none.
 */
export type TmdbImage = {
  file_path: string
  width: number
  height: number
  aspect_ratio?: number
  iso_639_1?: string | null
  vote_average?: number
  vote_count?: number
}

/** `/3/movie/{id}/images`; a collection's has no logos. */
export type TmdbImages = {
  id?: number
  backdrops?: TmdbImage[]
  posters?: TmdbImage[]
  logos?: TmdbImage[]
}

/** `/3/movie/{id}` with `append_to_response=credits,videos,release_dates,external_ids,recommendations,keywords,images`. */
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
  /** ISO 3166-1 and TMDB's English name. */
  production_countries?: { iso_3166_1: string; name: string }[]
  credits?: { cast: TmdbCast[]; crew: TmdbCrew[] }
  videos?: { results: TmdbVideo[] }
  release_dates?: TmdbReleaseDates
  /** `/3/movie/{id}/keywords`, appended (checkpoint 8d); rows cached before it have none. */
  keywords?: { keywords: { id: number; name: string }[] }
  /**
   * `/3/movie/{id}/images` in the metadata language and none (HT-66), for the automatic logo; rows
   * cached before it have none until their next refresh.
   */
  images?: TmdbImages
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

/**
 * `GET /3/certification/movie/list`: each country's film certifications, with `order` from
 * mildest up ([Movie certifications](https://developer.themoviedb.org/reference/certification-movie-list)).
 */
export type TmdbCertifications = {
  certifications: Record<string, { certification: string; meaning: string; order: number }[]>
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

// ---------------------------------------------------------------- TV (Phase 5's part B, ADR 0064)

/** A show in a list: search, recommendations ([Search TV](https://developer.themoviedb.org/reference/search-tv)). */
export type TmdbShowItem = {
  id: number
  name: string
  original_name?: string
  original_language?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  first_air_date?: string
  genre_ids?: number[]
  origin_country?: string[]
  vote_average?: number
  vote_count?: number
  popularity?: number
}

/** A season as the show lists it, without its episodes. */
export type TmdbSeasonSummary = {
  id: number
  season_number: number
  name: string
  overview?: string | null
  air_date?: string | null
  episode_count?: number
  poster_path?: string | null
  vote_average?: number
}

/**
 * `/3/tv/{id}/aggregate_credits`: everyone across every season, each with their roles or jobs
 * ([TV series aggregate credits](https://developer.themoviedb.org/reference/tv-series-aggregate-credits)).
 */
export type TmdbAggregateCredits = {
  cast: {
    id: number
    name: string
    profile_path?: string | null
    order?: number
    total_episode_count?: number
    roles?: { credit_id: string; character?: string; episode_count?: number }[]
    known_for_department?: string
  }[]
  crew: {
    id: number
    name: string
    profile_path?: string | null
    department: string
    total_episode_count?: number
    jobs?: { credit_id: string; job: string; episode_count?: number }[]
    known_for_department?: string
  }[]
}

/** TV's own external ids: TheTVDB's among them ([TV series external IDs](https://developer.themoviedb.org/reference/tv-series-external-ids)). */
export type TmdbTvExternalIds = TmdbExternalIds & { tvdb_id?: number | null }

/**
 * `/3/tv/{id}` with `append_to_response=aggregate_credits,content_ratings,external_ids,videos,
 * recommendations,keywords,images` ([TV series details](https://developer.themoviedb.org/reference/tv-series-details)).
 */
export type TmdbShow = {
  id: number
  name: string
  original_name: string
  original_language: string
  overview?: string | null
  tagline?: string | null
  /** Returning Series, Planned, In Production, Ended, Canceled, Pilot. */
  status?: string
  /** Scripted, Reality, Documentary, News, Talk Show, Miniseries, Video. */
  type?: string
  in_production?: boolean
  first_air_date?: string | null
  last_air_date?: string | null
  number_of_seasons?: number
  number_of_episodes?: number
  /** Minutes; TMDB's own note: often empty for newer shows, so episodes' runtimes fill in. */
  episode_run_time?: number[]
  genres?: TmdbGenre[]
  networks?: { id: number; name: string; logo_path?: string | null; origin_country?: string }[]
  created_by?: { id: number; credit_id: string; name: string; profile_path?: string | null }[]
  origin_country?: string[]
  poster_path?: string | null
  backdrop_path?: string | null
  vote_average?: number
  vote_count?: number
  popularity?: number
  seasons?: TmdbSeasonSummary[]
  next_episode_to_air?: TmdbEpisode | null
  last_episode_to_air?: TmdbEpisode | null
  aggregate_credits?: TmdbAggregateCredits
  /** Each country's rating ([TV series content ratings](https://developer.themoviedb.org/reference/tv-series-content-ratings)). */
  content_ratings?: { results: { iso_3166_1: string; rating: string }[] }
  external_ids?: TmdbTvExternalIds
  videos?: { results: TmdbVideo[] }
  recommendations?: TmdbPage<TmdbShowItem>
  /** TV's keywords are `results`, where a movie's are `keywords`. */
  keywords?: { results: { id: number; name: string }[] }
  images?: TmdbImages
}

/** An episode inside a season ([TV season details](https://developer.themoviedb.org/reference/tv-season-details)). */
export type TmdbEpisode = {
  id: number
  show_id?: number
  season_number: number
  episode_number: number
  /** standard, finale, mid_season, … */
  episode_type?: string
  name: string
  overview?: string | null
  air_date?: string | null
  runtime?: number | null
  still_path?: string | null
  vote_average?: number
  vote_count?: number
  production_code?: string | null
  /** The episode's own crew and guests come with the season; highsea keeps them as sent. */
  crew?: TmdbCrew[]
  guest_stars?: TmdbCast[]
  external_ids?: TmdbTvExternalIds
}

/** `/3/tv/{id}/season/{n}` with `append_to_response=external_ids`. */
export type TmdbSeason = {
  /** TMDB's internal document id, a string; `id` is the number. */
  _id?: string
  id: number
  season_number: number
  name: string
  overview?: string | null
  air_date?: string | null
  poster_path?: string | null
  vote_average?: number
  episodes: TmdbEpisode[]
  external_ids?: TmdbTvExternalIds
}

/**
 * `GET /3/find/{external_id}?external_source=tvdb_id`: what a TheTVDB id is on TMDB, a show, a season
 * or an episode ([Find by ID](https://developer.themoviedb.org/reference/find-by-id)).
 */
export type TmdbFind = {
  movie_results?: TmdbMovieItem[]
  tv_results?: TmdbShowItem[]
  tv_season_results?: { id: number; season_number: number; show_id: number; name?: string }[]
  tv_episode_results?: {
    id: number
    show_id: number
    season_number: number
    episode_number: number
    name?: string
  }[]
}

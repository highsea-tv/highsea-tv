// SPDX-License-Identifier: AGPL-3.0-only
// The metadata's domain types: the prototype's (packages/mock/src/types.ts) with the
// changes real data forces (docs/plans/phase-3-checkpoint-4.md, Fields and how they map):
// - ids are TMDB's numbers, `id` alone (Addresses are TMDB ids);
// - `rating` is TMDB's `vote_average`, 0 to 10, with `voteCount`; the API converts to stars;
// - departments and video kinds are TMDB's lists; trailers have no length; death has no place;
// - art is a server URL (`/api/v1/images/…`), or null when TMDB has none.
// Whether a title is in the library isn't the metadata's to say: the movie service adds it.

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
export type Department = (typeof DEPARTMENTS)[number]

/** TMDB's 7 video types ([Movie videos](https://developer.themoviedb.org/reference/movie-videos)). */
export const VIDEO_KINDS = [
  'Trailer',
  'Teaser',
  'Clip',
  'Featurette',
  'Behind the Scenes',
  'Bloopers',
  'Opening Credits',
] as const
export type VideoKind = (typeof VIDEO_KINDS)[number]

/**
 * Server URLs for a title's art. `still` is the backdrop at a card's size. `logo` is the title's
 * logo (transparent, the name drawn), from TMDB or chosen; null when there's none.
 */
export type MovieArt = {
  poster: string | null
  backdrop: string | null
  still: string | null
  logo: string | null
}

/** A title on TMDB, as lists show it: Discover, search, filmographies, collections. */
export type DiscoverMovie = {
  id: number
  title: string
  originalTitle: string
  year: number | null
  /** `YYYY-MM-DD`; null when TMDB has no date yet. */
  releaseDate: string | null
  /** Null in lists, which don't carry it; known once the movie itself is fetched. */
  runtimeMinutes: number | null
  genres: string[]
  synopsis: string
  /** TMDB's `vote_average`, 0 to 10. */
  rating: number
  voteCount: number
  art: MovieArt
}

/** A person's part in a title: a character (cast) or a job (crew), one per job. */
export type Credit = {
  personId: number
  name: string
  photo: string | null
  department: Department
  character: string | null
  job: string | null
}

/** A trailer or extra, on YouTube, embedded from youtube-nocookie.com on click. */
export type Video = {
  id: string
  name: string
  kind: VideoKind
  site: 'YouTube'
  key: string
  official: boolean
  /** `YYYY-MM-DD`. */
  publishedAt: string | null
  /** The movie's backdrop: a YouTube thumbnail would load from Google before anyone asks. */
  still: string | null
}

export type CollectionRef = { id: number; name: string }

export type Collection = CollectionRef & {
  overview: string
  /** `logo` only when an admin chose one: TMDB keeps none for collections. */
  art: { poster: string | null; backdrop: string | null; logo: string | null }
  /** In release order, undated parts last. */
  parts: DiscoverMovie[]
}

/** The release dates in the server's region, by kind (`YYYY-MM-DD`), for availability. */
export type RegionalReleases = {
  theatrical: string | null
  digital: string | null
  physical: string | null
}

/** Everything TMDB knows about a movie, in any library state. */
export type MovieMetadata = DiscoverMovie & {
  /** ISO 639-1. */
  originalLanguage: string
  tagline: string | null
  /** TMDB's status: Rumored, Planned, In Production, Post Production, Released, Canceled. */
  status: string
  /** For the server's region; null when unrated. */
  certification: string | null
  releases: RegionalReleases
  /** USD; null when unknown. */
  budget: number | null
  revenue: number | null
  studios: string[]
  imdbId: string | null
  wikidataId: string | null
  cast: Credit[]
  crew: Credit[]
  videos: Video[]
  collection: CollectionRef | null
  /** When the cached copy was fetched. */
  fetchedAt: number
  /** When a refresh found TMDB no longer has this id (removed or merged); null otherwise. */
  goneAt: number | null
}

/** A title in a person's filmography, with their part in it: the character, or the jobs. */
export type PersonCredit = DiscoverMovie & { role: string; department: Department }

export type Person = {
  id: number
  name: string
  photo: string | null
  knownFor: Department
  bio: string | null
  born: { date: string | null; place: string | null } | null
  died: { date: string } | null
  imdbId: string | null
  wikidataId: string | null
  /** Newest first, undated (announced) titles at the top. */
  credits: PersonCredit[]
  fetchedAt: number
  goneAt: number | null
}

/** One page of a TMDB list. */
export type Page<T> = { page: number; totalPages: number; totalResults: number; results: T[] }

/** Discover's lists for an empty query (owner's decision 7). */
export const DISCOVER_LISTS = ['trending', 'popular', 'now-playing', 'upcoming'] as const
export type DiscoverList = (typeof DISCOVER_LISTS)[number]

/** What the API shows of the metadata settings. The key itself is never returned. */
export type MetadataSettingsView = {
  /** `set` is the owner's own key; `builtIn`, highsea's, used when the owner has none. */
  key: { set: boolean; last4: string | null; builtIn: boolean }
  /** TMDB's language for metadata (`en-US`). */
  language: string
  /** ISO 3166-1 alpha-2: certifications, release dates and Discover's lists. */
  region: string
}

export type CacheKind = 'movie' | 'person' | 'collection' | 'show'

// ---------------------------------------------------------------- shows (ADR 0064)

/**
 * A show on TMDB, as lists show it: search and recommendations. Laid out as `DiscoverMovie` is, with
 * a show's words: its title is TMDB's `name`, its date the first air date.
 */
export type DiscoverShow = {
  id: number
  title: string
  originalTitle: string
  /** The year it first aired. */
  year: number | null
  /** `YYYY-MM-DD`; null when TMDB has none yet. */
  firstAired: string | null
  genres: string[]
  synopsis: string
  /** TMDB's `vote_average`, 0 to 10. */
  rating: number
  voteCount: number
  art: MovieArt
}

/** An episode, from its season's answer. */
export type EpisodeMetadata = {
  /** TMDB's id for the episode: with the `episode` type, its address (`TITLE_TYPES`). */
  id: number
  /** TMDB's id for the show. */
  show: number
  /** 0 for specials. */
  season: number
  /** Its place in the season, from 1. */
  number: number
  title: string
  synopsis: string
  /** `YYYY-MM-DD`; null until TMDB has a date. */
  aired: string | null
  /** Minutes; null when TMDB doesn't say. */
  runtimeMinutes: number | null
  /** The episode's still, a server URL. */
  still: string | null
  rating: number
}

/** A season with its episodes. */
export type SeasonMetadata = {
  /** TMDB's id for the season. */
  id: number
  /** 0 for specials. */
  number: number
  /** TMDB's name for it: "Season 2", "Specials", or a name of its own. */
  title: string
  synopsis: string
  /** `YYYY-MM-DD` of its first episode; null when unknown. */
  aired: string | null
  year: number | null
  poster: string | null
  tvdbId: number | null
  /** In order; empty when the season itself couldn't be fetched. */
  episodes: EpisodeMetadata[]
}

/** Everything TMDB knows about a show, in any library state. */
export type ShowMetadata = DiscoverShow & {
  /** ISO 639-1. */
  originalLanguage: string
  tagline: string | null
  /** TMDB's status: Returning Series, Planned, In Production, Ended, Canceled, Pilot. */
  status: string
  /** Still making episodes: Returning Series, Planned, In Production or Pilot. */
  airing: boolean
  /** The year it ended; null while it's airing. */
  endYear: number | null
  /** `YYYY-MM-DD` of the latest episode aired. */
  lastAired: string | null
  /** The first network it's on ("BBC Two"), and every one. */
  network: string | null
  networks: string[]
  /** For the server's region, from TMDB's content ratings; null when unrated there. */
  certification: string | null
  /** An episode's usual length in minutes: TMDB's run time, else the episodes' middle one. */
  runtimeMinutes: number | null
  tvdbId: number | null
  imdbId: string | null
  wikidataId: string | null
  creators: Credit[]
  /** Across every season, most episodes first, as TMDB's aggregate credits order them. */
  cast: Credit[]
  crew: Credit[]
  videos: Video[]
  /** In order with specials last, as the apps place them (`ClientShowDetail`). */
  seasons: SeasonMetadata[]
  recommendations: DiscoverShow[]
  fetchedAt: number
  goneAt: number | null
}

/** What a TheTVDB id is on TMDB: a show, or a season or an episode of one. */
export type TvdbMatch =
  | { kind: 'show'; show: number }
  | { kind: 'season'; show: number; season: number }
  | { kind: 'episode'; show: number; season: number; episode: number }

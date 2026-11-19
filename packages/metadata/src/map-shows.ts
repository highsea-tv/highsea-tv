// SPDX-License-Identifier: AGPL-3.0-only
// TMDB's TV answers to the domain types (ADR 0064), as map.ts does films': mapped on read from the
// cached show and its seasons, so a change of region (the certification) needs no refetch. The
// shapes carry what the contract's drafted shows need from TMDB (`ClientShow`, `ClientSeason`,
// `ClientEpisode`, `Series`, `SeriesSeason`, `SeriesEpisode`): the library and each person's watch
// state are @highsea-tv/media/shows' to add.
import { DEFAULT_SIZES, imageUrl } from './image-url.ts'
import {
  type ArtPick,
  art,
  automaticLogo,
  date,
  departmentOf,
  noPick,
  photo,
  text,
  yearOf,
} from './map.ts'
import type {
  TmdbEpisode,
  TmdbSeason,
  TmdbSeasonSummary,
  TmdbShow,
  TmdbShowItem,
} from './tmdb/types.ts'
import {
  type Credit,
  type DiscoverShow,
  type EpisodeMetadata,
  type SeasonMetadata,
  type ShowMetadata,
  VIDEO_KINDS,
  type Video,
  type VideoKind,
} from './types.ts'

/**
 * TMDB's TV genres (`/3/genre/tv/list`), in English: TV has its own list, with joined genres
 * ("Action & Adventure", "Sci-Fi & Fantasy") where films have two.
 */
export const TV_GENRES: Record<number, string> = {
  10759: 'Action & Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  10762: 'Kids',
  9648: 'Mystery',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
  37: 'Western',
}

/** TMDB's statuses for a show still making episodes; Ended and Canceled are the rest. */
const AIRING = new Set(['Returning Series', 'Planned', 'In Production', 'Pilot'])

/** A season's poster and an episode's still are the show's images, purged with it. */
const seasonPoster = (show: number, file: string | null | undefined) =>
  imageUrl('show', show, 'poster', DEFAULT_SIZES.poster, file)
const episodeStill = (show: number, file: string | null | undefined) =>
  imageUrl('show', show, 'still', 'w300', file)

export function toDiscoverShow(item: TmdbShowItem, pick: ArtPick = noPick): DiscoverShow {
  const firstAired = date(item.first_air_date)
  return {
    id: item.id,
    title: item.name,
    originalTitle: item.original_name ?? item.name,
    year: yearOf(firstAired),
    firstAired,
    genres: (item.genre_ids ?? []).flatMap((g) => (TV_GENRES[g] ? [TV_GENRES[g]] : [])),
    synopsis: item.overview ?? '',
    rating: item.vote_average ?? 0,
    voteCount: item.vote_count ?? 0,
    // lists carry no logos: one shows only when an admin chose it
    art: art(item.id, { poster: item.poster_path, backdrop: item.backdrop_path }, pick, 'show'),
  }
}

export function toEpisode(show: number, e: TmdbEpisode): EpisodeMetadata {
  return {
    id: e.id,
    show,
    season: e.season_number,
    number: e.episode_number,
    title: text(e.name) ?? `Episode ${e.episode_number}`,
    synopsis: e.overview ?? '',
    aired: date(e.air_date),
    runtimeMinutes: e.runtime || null,
    still: episodeStill(show, e.still_path),
    rating: e.vote_average ?? 0,
  }
}

/**
 * A season from its own answer, or, when that couldn't be fetched, from the show's summary of it
 * with no episodes.
 */
export function toSeason(
  show: number,
  summary: TmdbSeasonSummary,
  season: TmdbSeason | undefined,
): SeasonMetadata {
  const aired = date(season?.air_date ?? summary.air_date)
  return {
    id: season?.id ?? summary.id,
    number: summary.season_number,
    title: text(season?.name ?? summary.name) ?? `Season ${summary.season_number}`,
    synopsis: season?.overview ?? summary.overview ?? '',
    aired,
    year: yearOf(aired),
    poster: seasonPoster(show, season?.poster_path ?? summary.poster_path),
    tvdbId: season?.external_ids?.tvdb_id ?? null,
    episodes: (season?.episodes ?? [])
      .map((e) => toEpisode(show, e))
      .sort((a, b) => a.number - b.number),
  }
}

/** The region's rating from TMDB's content ratings; null when the show has none there. */
export function showCertification(show: TmdbShow, region: string): string | null {
  return text(show.content_ratings?.results.find((r) => r.iso_3166_1 === region)?.rating)
}

/** TMDB's run time when it has one, else the middle of the episodes' own (TMDB leaves it empty for newer shows). */
function runtimeOf(show: TmdbShow, seasons: SeasonMetadata[]): number | null {
  const given = (show.episode_run_time ?? []).find((m) => m > 0)
  if (given) return given
  const minutes = seasons
    .filter((s) => s.number > 0)
    .flatMap((s) => s.episodes.map((e) => e.runtimeMinutes ?? 0))
    .filter((m) => m > 0)
    .sort((a, b) => a - b)
  return minutes.length ? (minutes[Math.floor(minutes.length / 2)] as number) : null
}

function videosOf(show: TmdbShow, still: string | null): Video[] {
  // embedded from youtube-nocookie.com (media-pages.md), so YouTube's alone
  return (show.videos?.results ?? []).flatMap((v) => {
    const kind = VIDEO_KINDS.find((k) => k === v.type)
    if (v.site !== 'YouTube' || !kind || !v.key) return []
    return [
      {
        id: v.id,
        name: v.name,
        kind: kind as VideoKind,
        site: 'YouTube' as const,
        key: v.key,
        official: v.official ?? false,
        publishedAt: date(v.published_at),
        still,
      },
    ]
  })
}

export function toShowMetadata(
  show: TmdbShow,
  seasons: TmdbSeason[],
  {
    region,
    fetchedAt,
    goneAt,
    language = 'en-US',
    pick = noPick,
  }: {
    region: string
    fetchedAt: number
    goneAt: number | null
    /** The metadata language, for the automatic logo. */
    language?: string
    pick?: ArtPick
  },
): ShowMetadata {
  const firstAired = date(show.first_air_date)
  const lastAired = date(show.last_air_date)
  const status = show.status ?? 'Returning Series'
  const airing = AIRING.has(status)
  const showArt = art(
    show.id,
    {
      poster: show.poster_path,
      backdrop: show.backdrop_path,
      logo: automaticLogo(show.images?.logos, language),
    },
    pick,
    'show',
  )
  const byNumber = new Map(seasons.map((s) => [s.season_number, s]))
  const seasonList = (show.seasons ?? [])
    .map((summary) => toSeason(show.id, summary, byNumber.get(summary.season_number)))
    // in order, specials last, as Plex and the Apple TV app place them
    .sort((a, b) => (a.number === 0 ? 1 : b.number === 0 ? -1 : a.number - b.number))
  const cast: Credit[] = [...(show.aggregate_credits?.cast ?? [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((c) => ({
      personId: c.id,
      name: c.name,
      photo: photo(c.id, c.profile_path),
      department: 'Acting',
      character: text(c.roles?.map((r) => r.character ?? '').find((r) => r.trim())),
      job: null,
    }))
  const crew: Credit[] = (show.aggregate_credits?.crew ?? []).flatMap((c) =>
    (c.jobs?.length ? c.jobs : [{ job: '', credit_id: '' }]).map((j) => ({
      personId: c.id,
      name: c.name,
      photo: photo(c.id, c.profile_path),
      department: departmentOf(c.department),
      character: null,
      job: text(j.job),
    })),
  )
  const creators: Credit[] = (show.created_by ?? []).map((c) => ({
    personId: c.id,
    name: c.name,
    photo: photo(c.id, c.profile_path),
    department: 'Writing',
    character: null,
    job: 'Creator',
  }))
  const external = show.external_ids ?? {}
  const networks = (show.networks ?? []).map((n) => n.name)
  return {
    id: show.id,
    title: show.name,
    originalTitle: show.original_name ?? show.name,
    year: yearOf(firstAired),
    firstAired,
    genres: (show.genres ?? []).map((g) => g.name),
    synopsis: show.overview ?? '',
    rating: show.vote_average ?? 0,
    voteCount: show.vote_count ?? 0,
    art: showArt,
    originalLanguage: show.original_language,
    tagline: text(show.tagline),
    status,
    airing,
    endYear: airing ? null : yearOf(lastAired),
    lastAired,
    network: networks[0] ?? null,
    networks,
    certification: showCertification(show, region),
    runtimeMinutes: runtimeOf(show, seasonList),
    tvdbId: external.tvdb_id ?? null,
    imdbId: text(external.imdb_id),
    wikidataId: text(external.wikidata_id),
    creators,
    cast,
    crew,
    videos: videosOf(show, showArt.still),
    seasons: seasonList,
    recommendations: (show.recommendations?.results ?? []).map((s) => toDiscoverShow(s, pick)),
    fetchedAt,
    goneAt,
  }
}

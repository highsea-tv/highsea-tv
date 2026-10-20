// SPDX-License-Identifier: AGPL-3.0-only
// TMDB's responses to the domain types. The cache keeps responses as TMDB sent them and maps on
// read, so the region (certification, release dates) can change without a refetch.
import { DEFAULT_SIZES, imageUrl } from './image-url.ts'
import type {
  TmdbCollection,
  TmdbMovie,
  TmdbMovieItem,
  TmdbPage,
  TmdbPerson,
  TmdbReleaseDate,
} from './tmdb/types.ts'
import {
  type Collection,
  type Credit,
  DEPARTMENTS,
  type Department,
  type DiscoverMovie,
  type MovieMetadata,
  type Page,
  type Person,
  type PersonCredit,
  type RegionalReleases,
  VIDEO_KINDS,
  type Video,
  type VideoKind,
} from './types.ts'

/**
 * TMDB's movie genres (`/3/genre/movie/list`), in English. List results carry only genre ids; a
 * movie's own response names its genres in the metadata language.
 */
export const GENRES: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
}

const text = (s: string | null | undefined) => (s?.trim() ? s.trim() : null)
const date = (s: string | null | undefined) =>
  s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
const yearOf = (d: string | null) => (d ? Number(d.slice(0, 4)) : null)

export const departmentOf = (d: string | null | undefined): Department =>
  DEPARTMENTS.find((x) => x === d) ?? 'Crew'

function art(id: number, poster?: string | null, backdrop?: string | null) {
  return {
    poster: imageUrl('movie', id, 'poster', DEFAULT_SIZES.poster, poster),
    backdrop: imageUrl('movie', id, 'backdrop', DEFAULT_SIZES.backdrop, backdrop),
    still: imageUrl('movie', id, 'backdrop', DEFAULT_SIZES.still, backdrop),
  }
}

export function toDiscoverMovie(item: TmdbMovieItem): DiscoverMovie {
  const releaseDate = date(item.release_date)
  return {
    id: item.id,
    title: item.title,
    originalTitle: item.original_title ?? item.title,
    year: yearOf(releaseDate),
    releaseDate,
    runtimeMinutes: null,
    genres: (item.genre_ids ?? []).flatMap((g) => (GENRES[g] ? [GENRES[g]] : [])),
    synopsis: item.overview ?? '',
    rating: item.vote_average ?? 0,
    voteCount: item.vote_count ?? 0,
    art: art(item.id, item.poster_path, item.backdrop_path),
  }
}

export const toPage = <T, U>(page: TmdbPage<T>, map: (item: T) => U): Page<U> => ({
  page: page.page,
  totalPages: page.total_pages,
  totalResults: page.total_results,
  results: page.results.map(map),
})

/**
 * The certification for `region`, from TMDB's release dates
 * ([Movie release dates](https://developer.themoviedb.org/reference/movie-release-dates): types
 * 1 Premiere, 2 Theatrical (limited), 3 Theatrical, 4 Digital, 5 Physical, 6 TV). The owner's
 * decision 5 asks for the theatrical release first, then digital, then any, so the order is:
 * Theatrical (3), Theatrical (limited) (2), Digital (4), then any other type (Physical, TV,
 * Premiere). Within a type, the earliest release with a certification wins.
 */
export function certificationFor(movie: TmdbMovie, region: string): string | null {
  const dates = regionDates(movie, region).filter((d) => d.certification.trim())
  for (const types of [[3], [2], [4], [5, 6, 1]]) {
    const found = dates
      .filter((d) => types.includes(d.type))
      .sort((a, b) => a.release_date.localeCompare(b.release_date))[0]
    if (found) return found.certification.trim()
  }
  return null
}

const regionDates = (movie: TmdbMovie, region: string): TmdbReleaseDate[] =>
  movie.release_dates?.results.find((r) => r.iso_3166_1 === region)?.release_dates ?? []

/** The earliest theatrical, digital and physical dates in `region`. */
export function releasesFor(movie: TmdbMovie, region: string): RegionalReleases {
  const dates = regionDates(movie, region)
  const earliest = (types: number[]) =>
    date(
      dates
        .filter((d) => types.includes(d.type))
        .map((d) => d.release_date)
        .sort()[0],
    )
  return { theatrical: earliest([2, 3]), digital: earliest([4]), physical: earliest([5]) }
}

const photo = (personId: number, path: string | null | undefined) =>
  imageUrl('person', personId, 'profile', DEFAULT_SIZES.profile, path)

export function toMovieMetadata(
  movie: TmdbMovie,
  { region, fetchedAt, goneAt }: { region: string; fetchedAt: number; goneAt: number | null },
): MovieMetadata {
  const releaseDate = date(movie.release_date)
  const still = imageUrl('movie', movie.id, 'backdrop', DEFAULT_SIZES.still, movie.backdrop_path)
  const cast: Credit[] = [...(movie.credits?.cast ?? [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((c) => ({
      personId: c.id,
      name: c.name,
      photo: photo(c.id, c.profile_path),
      department: 'Acting',
      character: text(c.character),
      job: null,
    }))
  const crew: Credit[] = (movie.credits?.crew ?? []).map((c) => ({
    personId: c.id,
    name: c.name,
    photo: photo(c.id, c.profile_path),
    department: departmentOf(c.department),
    character: null,
    job: text(c.job),
  }))
  // embedded from youtube-nocookie.com (media-pages.md), so YouTube's alone
  const videos: Video[] = (movie.videos?.results ?? []).flatMap((v) => {
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
  const external = movie.external_ids ?? {}
  return {
    id: movie.id,
    title: movie.title,
    originalTitle: movie.original_title,
    year: yearOf(releaseDate),
    releaseDate,
    runtimeMinutes: movie.runtime || null,
    genres: (movie.genres ?? []).map((g) => g.name),
    synopsis: movie.overview ?? '',
    rating: movie.vote_average ?? 0,
    voteCount: movie.vote_count ?? 0,
    art: art(movie.id, movie.poster_path, movie.backdrop_path),
    originalLanguage: movie.original_language,
    tagline: text(movie.tagline),
    status: movie.status ?? 'Released',
    certification: certificationFor(movie, region),
    releases: releasesFor(movie, region),
    budget: movie.budget || null,
    revenue: movie.revenue || null,
    studios: (movie.production_companies ?? []).map((c) => c.name),
    imdbId: text(external.imdb_id ?? movie.imdb_id),
    wikidataId: text(external.wikidata_id),
    cast,
    crew,
    videos,
    collection: movie.belongs_to_collection
      ? { id: movie.belongs_to_collection.id, name: movie.belongs_to_collection.name }
      : null,
    fetchedAt,
    goneAt,
  }
}

/** TMDB's recommendations, or its "similar" list when there are none (owner's decision 6). */
export function recommendationsOf(movie: TmdbMovie): DiscoverMovie[] {
  const recommended = movie.recommendations?.results ?? []
  return (recommended.length ? recommended : (movie.similar?.results ?? [])).map(toDiscoverMovie)
}

const byRelease = (a: DiscoverMovie, b: DiscoverMovie) =>
  a.releaseDate && b.releaseDate
    ? a.releaseDate.localeCompare(b.releaseDate)
    : a.releaseDate
      ? -1
      : b.releaseDate
        ? 1
        : 0

export function toCollection(c: TmdbCollection): Collection {
  return {
    id: c.id,
    name: c.name,
    overview: c.overview ?? '',
    art: {
      poster: imageUrl('collection', c.id, 'poster', DEFAULT_SIZES.poster, c.poster_path),
      backdrop: imageUrl('collection', c.id, 'backdrop', DEFAULT_SIZES.backdrop, c.backdrop_path),
    },
    parts: c.parts.map(toDiscoverMovie).sort(byRelease),
  }
}

/**
 * A person's filmography: one row per title and department, its jobs joined ("Director,
 * Screenplay"), newest first with undated (announced) titles at the top.
 */
export function toPerson(
  p: TmdbPerson,
  { fetchedAt, goneAt }: { fetchedAt: number; goneAt: number | null },
): Person {
  const rows = new Map<string, PersonCredit>()
  for (const c of p.movie_credits?.cast ?? []) {
    const key = `${c.id}:Acting`
    const existing = rows.get(key)
    const character = text(c.character)
    if (existing) {
      if (character && !existing.role.split(' / ').includes(character))
        existing.role = existing.role ? `${existing.role} / ${character}` : character
    } else rows.set(key, { ...toDiscoverMovie(c), role: character ?? '', department: 'Acting' })
  }
  for (const c of p.movie_credits?.crew ?? []) {
    const department = departmentOf(c.department)
    const key = `${c.id}:${department}`
    const existing = rows.get(key)
    if (existing) {
      if (c.job && !existing.role.split(', ').includes(c.job))
        existing.role = existing.role ? `${existing.role}, ${c.job}` : c.job
    } else rows.set(key, { ...toDiscoverMovie(c), role: c.job ?? '', department })
  }
  const credits = [...rows.values()].sort((a, b) =>
    a.releaseDate && b.releaseDate
      ? b.releaseDate.localeCompare(a.releaseDate)
      : a.releaseDate
        ? 1
        : b.releaseDate
          ? -1
          : 0,
  )
  const external = p.external_ids ?? {}
  const born = date(p.birthday)
  const place = text(p.place_of_birth)
  const died = date(p.deathday)
  return {
    id: p.id,
    name: p.name,
    photo: imageUrl('person', p.id, 'profile', DEFAULT_SIZES.portrait, p.profile_path),
    knownFor: departmentOf(p.known_for_department ?? 'Acting'),
    bio: text(p.biography),
    born: born || place ? { date: born, place } : null,
    died: died ? { date: died } : null,
    imdbId: text(external.imdb_id ?? p.imdb_id),
    wikidataId: text(external.wikidata_id),
    credits,
    fetchedAt,
    goneAt,
  }
}

// SPDX-License-Identifier: AGPL-3.0-only
// The metadata's domain shapes (@highsea/metadata) as the contract has them. The edge is where:
// - TMDB's `vote_average` (0 to 10) becomes the five-star rating, halved to one decimal
//   (checkpoint 4 › Fields and how they map: the Rating component draws five stars);
// - times become ISO 8601, as every API date is;
// - each title says whether it's in the library, which the metadata doesn't know;
// - credits get keys, unique within their list, since TMDB's credit ids aren't kept.
import type * as Api from '@highsea/api-contract'
import { iso } from '@highsea/core'
import { stars } from '@highsea/media-movies'
import type * as Md from '@highsea/metadata'

/** A `YYYY-MM-DD` day as the contract's date-time, at midnight UTC. */
const dayTime = (day: string | null) => (day ? `${day}T00:00:00.000Z` : null)

const art = (a: { poster: string | null; backdrop: string | null }): Api.Art => ({
  poster: a.poster,
  backdrop: a.backdrop,
})

/** Which of a list's TMDB ids are in the library. */
export type InLibrary = (ids: number[]) => Set<number>

export function discoverMovie(m: Md.DiscoverMovie, here: Set<number>): Api.DiscoverMovie {
  return {
    id: m.id,
    title: m.title,
    year: m.year,
    runtimeMinutes: m.runtimeMinutes,
    genres: m.genres,
    synopsis: m.synopsis,
    rating: stars(m.rating),
    voteCount: m.voteCount,
    releaseDate: m.releaseDate,
    art: art(m.art),
    inLibrary: here.has(m.id),
  }
}

export const discoverMovies = (list: Md.DiscoverMovie[], inLibrary: InLibrary) => {
  const here = inLibrary(list.map((m) => m.id))
  return list.map((m) => discoverMovie(m, here))
}

export function discoverPage(
  page: Md.Page<Md.DiscoverMovie>,
  inLibrary: InLibrary,
): Api.DiscoverPage {
  return {
    items: discoverMovies(page.results, inLibrary),
    page: page.page,
    totalPages: page.totalPages,
    totalResults: page.totalResults,
  }
}

const credits = (list: Md.Credit[], prefix: string): Api.Credit[] =>
  list.map((c, i) => ({
    id: `${prefix}-${i}`,
    personId: c.personId,
    name: c.name,
    photo: c.photo,
    department: c.department,
    character: c.character,
    job: c.job,
  }))

export const videos = (list: Md.Video[]): Api.Video[] =>
  list.map((v) => ({ ...v, publishedAt: dayTime(v.publishedAt) }))

export function movieMetadata(m: Md.MovieMetadata, inLibrary: InLibrary): Api.MovieMetadata {
  return {
    ...discoverMovie(m, inLibrary([m.id])),
    originalTitle: m.originalTitle,
    originalLanguage: m.originalLanguage,
    tagline: m.tagline,
    certification: m.certification,
    budget: m.budget,
    revenue: m.revenue,
    studios: m.studios,
    imdbId: m.imdbId,
    wikidataId: m.wikidataId,
    cast: credits(m.cast, 'cast'),
    crew: credits(m.crew, 'crew'),
    videos: videos(m.videos),
    collection: m.collection,
    gone: m.goneAt !== null,
    fetchedAt: iso(m.fetchedAt),
  }
}

export function collection(c: Md.Collection, inLibrary: InLibrary): Api.Collection {
  return {
    id: c.id,
    name: c.name,
    overview: c.overview,
    art: art(c.art),
    parts: discoverMovies(c.parts, inLibrary),
  }
}

export function person(p: Md.Person, inLibrary: InLibrary): Api.Person {
  const here = inLibrary(p.credits.map((c) => c.id))
  return {
    id: p.id,
    name: p.name,
    photo: p.photo,
    knownFor: p.knownFor,
    bio: p.bio,
    born: p.born,
    died: p.died,
    imdbId: p.imdbId,
    wikidataId: p.wikidataId,
    // one row per title and department (metadata's toPerson), so the pair is a key
    credits: p.credits.map((c) => ({
      ...discoverMovie(c, here),
      creditId: `${c.id}:${c.department}`,
      role: c.role,
      department: c.department,
    })),
  }
}

/** The metadata settings as the contract has them. */
export const metadataSettings = (v: Md.MetadataSettingsView): Api.MetadataSettings => v

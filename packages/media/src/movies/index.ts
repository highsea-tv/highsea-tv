// SPDX-License-Identifier: AGPL-3.0-only
// @highsea/media/movies: the movie library (checkpoint 4). Two layers joined by TMDB id (ADR 0014):
// @highsea/metadata's cache holds what TMDB says about any movie, and this package holds what the
// owner added: movies in the unified tree with their versions (ADR 0012), the client API's reads,
// and the parser's page. The profiles, formats, sizes and root folders every media type uses are
// @highsea/media/shared's, handed in as `media`.
//
// The shape, for the API routes (apps/server/src/api/):
//
//   const movies = createMovies({ db, jobs, clock, events, logger, metadata }, media)
//   movies.jobs.schedule(now)              once at boot: the daily availability check
//   await movies.add(AddMovieInput)        → { movie, created }  (201 when created, 200 when not)
//   movies.list(query) → MoviePage         get(id) → Movie        update(id, MovieUpdate) → Movie
//   movies.delete(id, { deleteFiles })     bulk(BulkInput) → BulkResult   refresh(id)
//   movies.upcoming(days) / recent(limit) → Movie[]
//   movies.versions.add / update / remove → Movie
//   movies.inLibrary(ids) → Set<number>    movies.decorate(DiscoverMovie[]) → API DiscoverMovie[]
//   movies.parse(title) → ParseResult
//   movies.searchInput(id)                 what a release search is judged by (the indexers search)
//   await movies.client.list(query, userId) / item('movie', id, userId) / search(q, { userId, mayRequest })
//   movies.close()                         stops listening for metadata.updated
//
// Movies, pages and client shapes are @highsea/api-contract's (ratings out of 5, ISO times).
// Errors are AppErrors with `details.reason` where the contract names one: `no-indexers` (409,
// search now and bulk search while no indexer is enabled), `last-version` (409),
// `unknown-root-folder`, `duplicate-label`, `versions` and `bad-cursor` (400),
// `unknown-quality-profile` (404).
import type { DiscoverMovie as ApiDiscoverMovie } from '@highsea/api-contract'
import type { DiscoverMovie } from '@highsea/metadata'
import type { Media } from '../shared/index.ts'
import { createClient } from './client.ts'
import type { MoviesDeps } from './context.ts'
import { defineMovieJobs, MOVIE_JOB_TYPES, scheduleMovieJobs } from './jobs.ts'
import { createLibrary } from './library.ts'
import { toApiDiscoverMovie } from './map.ts'
import { createParse } from './parse.ts'

export function createMovies(deps: MoviesDeps, media: Media) {
  const library = createLibrary(deps, media)
  const parse = createParse(deps, { media, library })
  const client = createClient(deps, { library })
  defineMovieJobs(deps.jobs, library.internal.checkAvailability)

  // the library's sort columns and statuses follow the cache
  const stop = deps.events.subscribe((event) => {
    if (event.topic !== 'metadata.updated' || !event.ids) return
    try {
      library.internal.onMetadataUpdated(event.ids)
    } catch (e) {
      deps.logger.child('movies').error('couldn’t update the library from metadata', {
        error: (e as Error).message,
      })
    }
  })

  return {
    add: library.add,
    list: library.list,
    get: library.get,
    update: library.update,
    delete: library.delete,
    bulk: library.bulk,
    refresh: library.refresh,
    /** What a release search for the movie is judged by, for the indexers' search. */
    searchInput: library.searchInput,
    upcoming: library.upcoming,
    recent: library.recent,
    versions: library.versions,
    inLibrary: library.inLibrary,
    /** TMDB's titles in the API's shape, each marked whether it's in the library. */
    decorate(movies: DiscoverMovie[]): ApiDiscoverMovie[] {
      const here = library.inLibrary(movies.map((m) => m.id))
      return movies.map((m) => toApiDiscoverMovie(m, here.has(m.id)))
    },
    parse,
    client,
    jobs: {
      types: MOVIE_JOB_TYPES,
      /** The daily availability check. The runtime calls this once at boot. */
      schedule: (now: number) => scheduleMovieJobs(deps.jobs, now),
      /** The same check, now: returns how many movies changed. */
      checkAvailability: library.internal.checkAvailability,
    },
    /** Stops following `metadata.updated`, for shutdown and tests. */
    close: () => {
      stop()
    },
  }
}

export type Movies = ReturnType<typeof createMovies>

export type { ClientListQuery } from './client.ts'
export type { MovieSearch, MoviesDeps } from './context.ts'
export { MOVIE_JOB_TYPES } from './jobs.ts'
export { DEFAULT_LIMIT, type ExtraFilters, type ListQuery, MAX_LIMIT } from './library.ts'
export { toApiDiscoverMovie } from './map.ts'
export {
  ASSUMED_HOME_RELEASE_DAYS,
  isAvailable,
  moviePath,
  regionalReleaseDate,
  statusOf,
} from './titles.ts'

// SPDX-License-Identifier: AGPL-3.0-only
// @highsea/media-movies: the movie library (checkpoint 4). Two layers joined by TMDB id (ADR 0014):
// @highsea/metadata's cache holds what TMDB says about any movie, and this package holds what the
// owner added: items in the unified tree with their versions (ADR 0012), the profiles, formats,
// sizes and root folders adding needs, the client API's reads, and the parser's page.
//
// The shape, for the API routes (apps/server/src/api/):
//
//   const movies = createMovies({ db, jobs, clock, events, logger, metadata })
//   movies.seed()                          first boot: profiles, formats, quality sizes; idempotent
//   movies.jobs.schedule(now)              once at boot: the daily availability check
//   await movies.add(AddMovieInput)        → { movie, created }  (201 when created, 200 when not)
//   movies.list(query) → MoviePage         get(id) → Movie        update(id, MovieUpdate) → Movie
//   movies.delete(id, { deleteFiles })     bulk(BulkInput) → BulkResult   refresh(id)
//   movies.upcoming(days) / recent(limit) → Movie[]
//   movies.versions.add / update / remove → Movie
//   movies.inLibrary(ids) → Set<number>    movies.decorate(DiscoverMovie[]) → API DiscoverMovie[]
//   movies.rootFolders.list / add / remove
//   movies.profiles.list / get, customFormats(), qualitySizes(), languageProfiles()
//   movies.parse(title) → ParseResult
//   await movies.client.list(query, userId) / item('movie', id, userId) / search(q, { userId, mayRequest })
//   movies.close()                         stops listening for metadata.updated
//
// Movies, pages and client shapes are @highsea/api-contract's (ratings out of 5, ISO times).
// Profiles, formats and sizes are @highsea/quality's, which the contract mirrors. Errors are
// AppErrors with `details.reason` where the contract names one: `no-indexers` (409, search now and
// bulk search), `last-version` and `in-use` (409), `not-absolute`, `not-found` and `not-writable`
// (400, adding a root folder), `unknown-root-folder`, `duplicate-label`, `versions` and
// `bad-cursor` (400), `unknown-quality-profile` (404).
import type { DiscoverMovie as ApiDiscoverMovie } from '@highsea/api-contract'
import type { DiscoverMovie } from '@highsea/metadata'
import { createCatalog } from './catalog.ts'
import { createClient } from './client.ts'
import type { MoviesDeps } from './context.ts'
import { defineMovieJobs, MOVIE_JOB_TYPES, scheduleMovieJobs } from './jobs.ts'
import { createLibrary } from './library.ts'
import { toApiDiscoverMovie } from './map.ts'
import { createParse } from './parse.ts'
import { createRootFolders } from './root-folders.ts'

export function createMovies(deps: MoviesDeps) {
  const catalog = createCatalog(deps)
  const rootFolders = createRootFolders(deps)
  const library = createLibrary(deps, { catalog, rootFolders })
  const parse = createParse(deps, { catalog, library })
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
    seed: catalog.seed,
    add: library.add,
    list: library.list,
    get: library.get,
    update: library.update,
    delete: library.delete,
    bulk: library.bulk,
    refresh: library.refresh,
    upcoming: library.upcoming,
    recent: library.recent,
    versions: library.versions,
    inLibrary: library.inLibrary,
    /** TMDB's titles in the API's shape, each marked whether it's in the library. */
    decorate(movies: DiscoverMovie[]): ApiDiscoverMovie[] {
      const here = library.inLibrary(movies.map((m) => m.id))
      return movies.map((m) => toApiDiscoverMovie(m, here.has(m.id)))
    },
    rootFolders: {
      list: rootFolders.list,
      add: rootFolders.add,
      remove: rootFolders.remove,
    },
    profiles: catalog.profiles,
    customFormats: catalog.customFormats,
    qualitySizes: catalog.qualitySizes,
    languageProfiles: catalog.languageProfiles,
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

export { LANGUAGE_PROFILES, QUALITY_SIZES_KEY } from './catalog.ts'
export { type ClientListQuery, matchScore } from './client.ts'
export type { MoviesDeps } from './context.ts'
export { MOVIE_JOB_TYPES } from './jobs.ts'
export { DEFAULT_LIMIT, type ExtraFilters, type ListQuery, MAX_LIMIT } from './library.ts'
export {
  progressOf,
  stars,
  toApiCredit,
  toApiDiscoverMovie,
  toApiVideo,
  WATCHED_AT,
} from './map.ts'
export { type Dir, defaultDir, SORTS, type Sort } from './paging.ts'
export { normalizeFolder } from './root-folders.ts'
export {
  ASSUMED_HOME_RELEASE_DAYS,
  fold,
  folderName,
  isAvailable,
  moviePath,
  regionalReleaseDate,
  safeName,
  sortTitleOf,
  statusOf,
} from './titles.ts'

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
//   await movies.importDownload(ImportInput) → imported { fileId, path, transfer } | blocked | failed
//   await movies.manualImport.scan(path) → ImportCandidate[]     run(files, 'hardlink' | 'move')
//   movies.files(id) → MediaFileView[]     movies.history(id, cursor?) → HistoryPage
//   await movies.libraryScan.scan({ folder? }) → ScanResult    movies.libraryScan.queue(folder?)
//   await movies.libraryImport.scan(root) → LibraryCandidate[]  run(items, { rename }) / status()
//   await movies.migrate.addInPlace(InPlaceInput) → { added, file }  (the importers, 6b)
//   movies.close()                         stops listening for metadata.updated
//
// Movies, pages and client shapes are @highsea/api-contract's (ratings out of 5, ISO times).
// Errors are AppErrors with `details.reason` where the contract names one: `no-indexers` (409,
// search now and bulk search while no indexer is enabled), `last-version` (409),
// `unknown-root-folder`, `duplicate-label`, `versions` and `bad-cursor` (400),
// `unknown-quality-profile` (404), `outside-roots` (400, manual import outside the root folders
// and the downloads folder).
import { dirname } from 'node:path'
import type { DiscoverMovie as ApiDiscoverMovie } from '@highsea/api-contract'
import type { DiscoverMovie } from '@highsea/metadata'
import { z } from 'zod'
import type { Media } from '../shared/index.ts'
import { createClient } from './client.ts'
import type { MoviesDeps } from './context.ts'
import { createImports } from './import.ts'
import { defineMovieJobs, MOVIE_JOB_TYPES, scheduleMovieJobs } from './jobs.ts'
import { createLibrary } from './library.ts'
import { createLibraryImport } from './library-import.ts'
import { toApiDiscoverMovie } from './map.ts'
import { createMigrate } from './migrate.ts'
import { createParse } from './parse.ts'
import { createLibraryScan, LIBRARY_SCAN_JOB, SCAN_EVERY_MS } from './scan.ts'

export function createMovies(deps: MoviesDeps, media: Media) {
  const library = createLibrary(deps, media)
  const parse = createParse(deps, { media, library })
  const client = createClient(deps, { library })
  const imports = createImports(deps, { media, library })
  defineMovieJobs(deps.jobs, library.internal.checkAvailability)
  const libraryScan = createLibraryScan(deps, { media, library, imports })
  const libraryImport = createLibraryImport(deps, { media, library, imports })
  const migrate = createMigrate(deps, { media, library, imports })
  deps.jobs.define({
    type: LIBRARY_SCAN_JOB,
    payload: z.object({ folder: z.string().optional() }),
    attempts: 2,
    // a whole library, probing what's new: generous, and still ends
    timeoutMs: 6 * 60 * 60 * 1000,
    async run({ folder }) {
      await libraryScan.scan({ folder })
    },
  })
  /** Asks for a scan of a title's folder, or of every root folder; one waits per folder. */
  const queueScan = (folder?: string) =>
    deps.jobs.enqueue(LIBRARY_SCAN_JOB, folder ? { folder } : {}, {
      dedupeKey: `scan:${folder ?? '*'}`,
    })

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
    /** A finished download into the library (checkpoint 6's import pipeline). */
    async importDownload(input: Parameters<typeof imports.importDownload>[0]) {
      const result = await imports.importDownload(input)
      // the scan after each import: the movie's folder, for anything else that changed there
      if (result.status === 'imported' && !result.already) queueScan(dirname(result.path))
      return result
    },
    /** A17: what a folder holds, and importing the files the owner picks. */
    manualImport: imports.manualImport,
    /** A movie's files with their streams, in its versions' order. */
    files: imports.files,
    /** A movie's history, newest first, cursor-paged. */
    history: imports.history,
    /** The library scan (6b): what changed on disk outside highsea. */
    libraryScan: { scan: libraryScan.scan, queue: queueScan },
    /** A17's Library import mode (6b): a library already on disk, added in place. */
    libraryImport,
    /** The importers (6b, ADR 0041): another program's movie, added where it is. */
    migrate,
    jobs: {
      types: { ...MOVIE_JOB_TYPES, libraryScan: LIBRARY_SCAN_JOB },
      /** The daily availability check and the 12-hourly library scan. The runtime calls this once at boot. */
      schedule: (now: number) => {
        scheduleMovieJobs(deps.jobs, now)
        deps.jobs.schedule(LIBRARY_SCAN_JOB, SCAN_EVERY_MS, { firstRunAt: now + 10 * 60_000 })
      },
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
export type {
  ImportCandidate,
  ImportInput,
  ImportMode,
  ImportOptions,
  ImportResult,
  ManualImportFile,
  MediaFileView,
  StoredFileInfo,
} from './import.ts'
export { MOVIE_JOB_TYPES } from './jobs.ts'
export { DEFAULT_LIMIT, type ExtraFilters, type ListQuery, MAX_LIMIT } from './library.ts'
export {
  bestMatch,
  LIBRARY_IMPORT_JOB,
  LIBRARY_IMPORT_KEY,
  LIBRARY_IMPORT_TOPIC,
  type LibraryCandidate,
  type LibraryImport,
  type LibraryImportItem,
  type LibraryImportState,
} from './library-import.ts'
export { toApiDiscoverMovie } from './map.ts'
export type { InPlaceInput, InPlaceResult, Migrate } from './migrate.ts'
export { LIBRARY_SCAN_JOB, type LibraryScan, SCAN_EVERY_MS, type ScanResult } from './scan.ts'
export {
  ASSUMED_HOME_RELEASE_DAYS,
  isAvailable,
  moviePath,
  regionalReleaseDate,
  statusOf,
} from './titles.ts'

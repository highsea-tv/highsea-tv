// SPDX-License-Identifier: AGPL-3.0-only
// @highsea-tv/media/shows: the shows library (ADR 0036, 0064). A show added from TMDB with its
// seasons and episodes and kept in step with TMDB's refreshes; the files on disk matched to
// episodes; the shows already on disk imported where they are; and the library scan. The routes,
// playback and watch state are part B's later tasks.
//
//   const shows = createShows({ db, clock, logger, events, jobs, metadata }, media)
//   shows.jobs.schedule(now)               once at boot: the 12-hourly scan
//   await shows.add(AddSeriesInput)        → { show: ShowTree, created }
//   shows.get(tmdbId)                      → ShowTree | null
//   shows.refresh(tmdbId)                  queues TMDB's refresh; the rows follow metadata.updated
//   shows.sync(tmdbId)                     brings the rows up to date with the cache now
//   await shows.libraryImport.scan(root) → ShowCandidate[]   run(items) / status() / addNew(…)
//   await shows.libraryScan.scan({ folder? }) → ShowScanResult   shows.libraryScan.queue(folder?)
//   await shows.files.assign(tmdbId, path, episodes)   a file matched by hand
//   shows.unmatched(root?)                 what the import and scan couldn't place, with why
//   shows.close()                          stops listening for metadata.updated
import { AppError } from '@highsea-tv/core'
import { z } from 'zod'
import { SCAN_EVERY_MS } from '../movies/scan.ts'
import type { Media } from '../shared/index.ts'
import type { ShowsDeps } from './context.ts'
import { createShowFiles } from './files.ts'
import { createShowLibrary } from './library.ts'
import { createShowLibraryImport } from './library-import.ts'
import { createShowScan, SHOW_SCAN_JOB } from './scan.ts'

export function createShows(deps: ShowsDeps, media: Media) {
  const library = createShowLibrary(deps, media)
  const files = createShowFiles(deps, { media })
  const libraryImport = createShowLibraryImport(deps, { media, library, files })
  const libraryScan = createShowScan(deps, { media, files, addNew: libraryImport.addNew })
  deps.jobs.define({
    type: SHOW_SCAN_JOB,
    payload: z.object({ folder: z.string().optional() }),
    attempts: 2,
    // every show's folder, probing what's new: generous, and still ends
    timeoutMs: 12 * 60 * 60 * 1000,
    async run({ folder }) {
      await libraryScan.scan({ folder })
    },
  })
  /** Asks for a scan of a show's folder, or of every Shows root folder; one waits per folder. */
  const queueScan = (folder?: string) =>
    deps.jobs.enqueue(SHOW_SCAN_JOB, folder ? { folder } : {}, {
      dedupeKey: `shows-scan:${folder ?? '*'}`,
    })

  // the seasons and episodes follow the cache
  const stop = deps.events.subscribe((event) => {
    if (event.topic !== 'metadata.updated' || !event.ids) return
    try {
      library.internal.onMetadataUpdated(event.ids)
    } catch (e) {
      deps.logger.child('shows').error('couldn’t update the shows from metadata', {
        error: (e as Error).message,
      })
    }
  })

  const showOf = (tmdbId: number) => {
    const row = library.internal.showRow(tmdbId)
    if (!row) throw new AppError('not-found', 'That show isn’t in the library.')
    return row
  }

  return {
    add: library.add,
    get: library.get,
    refresh: library.refresh,
    sync: library.sync,
    /** A Shows root folder's shows already on disk, added where they are (B). */
    libraryImport,
    /** What changed on disk outside highsea, in the Shows root folders. */
    libraryScan: { scan: libraryScan.scan, queue: queueScan },
    files: {
      /** Files a video under the episodes picked; one another file held keeps its others. */
      assign: (tmdbId: number, path: string, episodes: { season: number; episode: number }[]) =>
        files.assign(showOf(tmdbId), path, episodes),
    },
    /** What couldn't be placed, under one root folder or every one, with each reason. */
    unmatched: (rootFolder?: string) => files.unmatched.list(rootFolder),
    jobs: {
      types: { libraryScan: SHOW_SCAN_JOB },
      /** The 12-hourly scan of the Shows root folders. The runtime calls this once at boot. */
      schedule: (now: number) => {
        deps.jobs.schedule(SHOW_SCAN_JOB, SCAN_EVERY_MS, { firstRunAt: now + 15 * 60_000 })
      },
    },
    /** Stops following `metadata.updated`, for shutdown and tests. */
    close: () => {
      stop()
    },
  }
}

export type Shows = ReturnType<typeof createShows>
export type { ShowFileOptions, ShowsDeps } from './context.ts'
export {
  type EpisodeMatch,
  episodeMatch,
  type FileOutcome,
  type ReconcileResult,
  type UnmatchedFileReason,
} from './files.ts'
export { monitorsEpisode, type ShowTree, seasonFolder } from './library.ts'
export {
  pickShow,
  SHOW_IMPORT_JOB,
  SHOW_IMPORT_KEY,
  type ShowCandidate,
  type ShowFolderReason,
  type ShowImportItem,
  type ShowImportState,
} from './library-import.ts'
export { SHOW_SCAN_JOB, type ShowScanResult } from './scan.ts'

// SPDX-License-Identifier: AGPL-3.0-only
// @highsea-tv/media/shows: the shows library (ADR 0036, 0064). A show added from TMDB with its
// seasons and episodes and kept in step with TMDB's refreshes; the files on disk matched to
// episodes; the shows already on disk imported where they are; the library scan; the apps' reads
// with each profile's place, an episode's playback, and the admin's series and settings.
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
//   shows.client.list(profileId) / show(tmdbId, profileId) / item(episodeTmdbId, profileId) / home …
//   shows.playback.source / position / played / … by the episode's TMDB id, as films' playback
//   shows.admin.list() / get(id) / update / remove / monitorSeason / monitorEpisode / discover
//   shows.admin.setMarkers / findMarkers   the owner's intro and credits (ADR 0067)
//   shows.settings.naming() / sizes() / profileUsage(ids)
//   await shows.migrate.addInPlace(ShowInPlaceInput) → { added, changed, files, unmatched }  (Sonarr)
//   shows.close()                          stops listening for metadata.updated
import { DRAFT_TOPICS } from '@highsea-tv/api-contract'
import { AppError } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { SCAN_EVERY_MS } from '../movies/scan.ts'
import type { Media } from '../shared/index.ts'
import { createShowAdmin, showIdOf } from './admin.ts'
import { createShowClient } from './client.ts'
import type { ShowsDeps } from './context.ts'
import { createShowFiles } from './files.ts'
import { createEpisodeImport } from './import.ts'
import { createShowLibrary } from './library.ts'
import { createShowLibraryImport } from './library-import.ts'
import { createShowMarkers } from './markers.ts'
import { createShowMigrate } from './migrate.ts'
import { createShowPlayback } from './playback.ts'
import { createShowScan, SHOW_SCAN_JOB } from './scan.ts'
import { createShowSearch } from './search.ts'
import { createShowSettings } from './settings.ts'
import { createShowWanted, SHOW_SWEEP_SIZE } from './wanted.ts'

/** Weighs every episode's file against its cutoff once at boot (HT-109). */
export const SHOW_WANTED_BACKFILL_JOB = 'shows.wanted-backfill'

export function createShows(deps: ShowsDeps, media: Media) {
  const library = createShowLibrary(deps, media)
  const files = createShowFiles(deps, { media })
  const libraryImport = createShowLibraryImport(deps, { media, library, files })
  const libraryScan = createShowScan(deps, { media, files, addNew: libraryImport.addNew })
  const markers = createShowMarkers(deps)
  const client = createShowClient(deps, { markers })
  const playback = createShowPlayback(deps, { client })
  const admin = createShowAdmin(deps, { media, get: library.get, markers })
  const settings = createShowSettings(deps)
  const wanted = createShowWanted(deps, { media })
  const episodeImport = createEpisodeImport(deps, { media, files, settings, wanted })
  const search = createShowSearch(deps, { media, settings, wanted })
  const migrate = createShowMigrate(deps, { media, library, files })
  deps.jobs.define({
    type: SHOW_SCAN_JOB,
    payload: z.object({ folder: z.string().optional() }),
    attempts: 2,
    // every show's folder, probing what's new: generous, and still ends
    timeoutMs: 12 * 60 * 60 * 1000,
    async run({ folder }) {
      await libraryScan.scan({ folder })
      // what the scan filed may be under its cutoff (HT-109)
      wanted.backfill()
    },
  })
  /** Each episode's cutoff, once at boot: the shows filed before HT-109 never had it weighed. */
  deps.jobs.define({
    type: SHOW_WANTED_BACKFILL_JOB,
    payload: z.object({}),
    attempts: 2,
    timeoutMs: 60 * 60_000,
    async run() {
      wanted.backfill()
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
    /** The household's apps: shows, a show's page, an episode as a title, Home's rows, Search. */
    client,
    /** An episode's side of playback, the films' interface by the episode's TMDB id. */
    playback,
    /** The admin's series (ADR 0064: a show's id is its TMDB id as a string). */
    admin: {
      ...admin,
      /** A show's Edit; a new profile weighs its episodes' cutoff again (HT-109). */
      update: (id: string, patch: Parameters<typeof admin.update>[1]) => {
        const out = admin.update(id, patch)
        if (patch.qualityProfileId !== undefined) {
          const row = library.internal.showRow(showIdOf(id))
          if (row) wanted.refreshCutoff(row.id)
        }
        return out
      },
    },
    settings,
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
    /** What a show's release search is judged by, and what a Search looks for (Phase 5 C1). */
    search: { input: search.input, plan: search.plan },
    /** A show another program manages, added where it is (the Sonarr importer, Phase 5 C1). */
    migrate: {
      ...migrate,
      /** What it filed and the profile it set weigh its episodes' cutoff again (HT-109). */
      addInPlace: async (input: Parameters<typeof migrate.addInPlace>[0]) => {
        const out = await migrate.addInPlace(input)
        const row = library.internal.showRow(input.tmdbId)
        if (row) wanted.refreshCutoff(row.id)
        return out
      },
    },
    /**
     * Shows' Wanted (HT-109): Missing and Cutoff unmet's episodes, the calendar's, the sweep's
     * shows and RSS's, and each episode's cutoff kept on its row.
     */
    wanted: {
      missing: wanted.missing,
      cutoff: wanted.cutoff,
      all: wanted.all,
      calendar: wanted.calendar,
      takeDue: wanted.takeDue,
      reschedule: wanted.reschedule,
      found: wanted.found,
      rssTargets: wanted.rssTargets,
      refreshCutoff: wanted.refreshCutoff,
      backfill: wanted.backfill,
      sweepSize: SHOW_SWEEP_SIZE,
    },
    /** A show's finished download into its episodes (Phase 5 C1). */
    importDownload: episodeImport.importDownload,
    /** What couldn't be placed, under one root folder or every one, with each reason. */
    unmatched: (rootFolder?: string) => files.unmatched.list(rootFolder),
    /**
     * The admin's Match for something unmatched (Phase 5 B): a show folder is imported as the show
     * picked, by the library import's job (409 `running` while one runs); an episode file is filed
     * under the episodes picked of the show whose folder holds it.
     */
    async matchUnmatched(input: {
      path: string
      tmdbId?: number
      episodes?: { season: number; episode: number }[]
    }): Promise<void> {
      const row = files.unmatched.find(input.path)
      if (!row) throw new AppError('not-found', 'That isn’t unmatched any more.')
      if (row.kind === 'show-folder') {
        if (!input.tmdbId)
          throw new AppError('invalid', 'Pick the show this folder holds.', { reason: 'no-show' })
        libraryImport.run([{ folder: row.path, tmdbId: input.tmdbId }])
        return
      }
      const show = row.itemId
        ? deps.db.select().from(schema.mediaItems).where(eq(schema.mediaItems.id, row.itemId)).get()
        : null
      if (!show) throw new AppError('not-found', 'The show this file was found in isn’t here.')
      await files.assign(show, row.path, input.episodes ?? [])
    },
    /** The admin's Dismiss: it leaves the list and the scan doesn't offer it again. */
    dismissUnmatched(path: string): void {
      if (!files.unmatched.find(path))
        throw new AppError('not-found', 'That isn’t unmatched any more.')
      files.unmatched.dismiss(path)
      // the list is the shows' (the admin follows `shows.updated`)
      deps.events.emit({ topic: DRAFT_TOPICS.shows })
    },
    jobs: {
      types: { libraryScan: SHOW_SCAN_JOB },
      /** The 12-hourly scan of the Shows root folders. The runtime calls this once at boot. */
      schedule: (now: number) => {
        deps.jobs.schedule(SHOW_SCAN_JOB, SCAN_EVERY_MS, { firstRunAt: now + 15 * 60_000 })
        deps.jobs.enqueue(
          SHOW_WANTED_BACKFILL_JOB,
          {},
          { runAt: now + 60_000, dedupeKey: 'shows-wanted-backfill' },
        )
      },
    },
    /** Stops following `metadata.updated`, for shutdown and tests. */
    close: () => {
      stop()
    },
  }
}

export type Shows = ReturnType<typeof createShows>
export { adminCode, type ShowAdmin, showIdOf } from './admin.ts'
export { episodeCode, type ShowClient } from './client.ts'
export type { ShowFileOptions, ShowsDeps } from './context.ts'
export {
  type EpisodeMatch,
  episodeMatch,
  type FileOutcome,
  type ReconcileResult,
  type UnmatchedFileReason,
} from './files.ts'
export type { EpisodeImportInput, EpisodeImportResult } from './import.ts'
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
export {
  adminMarks,
  clientMarks,
  createShowMarkers,
  MARKERS_JOB,
  type MarkerRow,
  queueMarkers,
  type ShowMarkers,
} from './markers.ts'
export type {
  EpisodeRef,
  ShowInPlaceInput,
  ShowInPlaceResult,
  ShowMigrate,
} from './migrate.ts'
export type { ShowPlayback } from './playback.ts'
export { SHOW_SCAN_JOB, type ShowScanResult } from './scan.ts'
export type { ShowScope } from './search.ts'
export { defaultEpisodeNaming, type ShowSettings } from './settings.ts'
export { SHOW_SWEEP_SIZE, type ShowRssTarget, type ShowWanted } from './wanted.ts'

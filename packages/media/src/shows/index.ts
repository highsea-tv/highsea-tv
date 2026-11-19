// SPDX-License-Identifier: AGPL-3.0-only
// @highsea-tv/media/shows: the shows library (ADR 0036, 0064). Its first part: a show added from
// TMDB with its seasons and episodes, and kept in step with TMDB's refreshes. Import, the routes,
// search and playback are part B's later tasks.
//
//   const shows = createShows({ db, clock, logger, events, metadata }, media)
//   await shows.add(AddSeriesInput)        → { show: ShowTree, created }
//   shows.get(tmdbId)                      → ShowTree | null
//   shows.refresh(tmdbId)                  queues TMDB's refresh; the rows follow metadata.updated
//   shows.sync(tmdbId)                     brings the rows up to date with the cache now
//   shows.close()                          stops listening for metadata.updated
import type { Media } from '../shared/index.ts'
import type { ShowsDeps } from './context.ts'
import { createShowLibrary } from './library.ts'

export function createShows(deps: ShowsDeps, media: Media) {
  const library = createShowLibrary(deps, media)

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

  return {
    add: library.add,
    get: library.get,
    refresh: library.refresh,
    sync: library.sync,
    /** Stops following `metadata.updated`, for shutdown and tests. */
    close: () => {
      stop()
    },
  }
}

export type Shows = ReturnType<typeof createShows>
export type { ShowsDeps } from './context.ts'
export { monitorsEpisode, type ShowTree, seasonFolder } from './library.ts'

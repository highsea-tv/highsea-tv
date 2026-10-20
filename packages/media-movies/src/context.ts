// SPDX-License-Identifier: AGPL-3.0-only
// What the movie services share: the platform the runtime gives every domain package, and the
// metadata service the library reads TMDB's facts from.
import { AppError, type Clock, type EventBus, type Logger } from '@highsea/core'
import type { Db } from '@highsea/db'
import type { JobQueue } from '@highsea/jobs'
import type { Metadata } from '@highsea/metadata'

export type MoviesDeps = {
  db: Db
  jobs: JobQueue
  clock: Clock
  events: EventBus
  logger: Logger
  metadata: Metadata
}

export type Ctx = MoviesDeps

/** The library's topics (@highsea/api-contract's `MEDIA_TOPICS`). */
export const TOPICS = { movies: 'movies.updated', item: 'item.updated' } as const

/** Says what changed: the movies (by TMDB id) and each title's library layer (`movie:{id}`). */
export function announce(events: EventBus, tmdbIds: number[], { many = false } = {}) {
  if (tmdbIds.length === 0) return
  events.emit({ topic: TOPICS.movies, ids: many ? undefined : tmdbIds.map(String) })
  events.emit({ topic: TOPICS.item, ids: tmdbIds.map((id) => `movie:${id}`) })
}

export const notInLibrary = () => new AppError('not-found', 'That movie isn’t in the library.')

/** Searching needs an indexer (checkpoint 5); until then it's refused (checkpoint 4, decision 2). */
export const noIndexers = () =>
  new AppError('conflict', 'Add an indexer to search for releases.', { reason: 'no-indexers' })

// SPDX-License-Identifier: AGPL-3.0-only
// What the movie services share: the platform every media type gets (@highsea/media/shared), plus
// the job queue, events, the metadata service the library reads TMDB's facts from, and search.
import type { ClientSubtitle } from '@highsea/api-contract'
import { AppError, type EventBus } from '@highsea/core'
import type { JobQueue } from '@highsea/jobs'
import type { Metadata } from '@highsea/metadata'
import type { MediaDeps } from '../shared/context.ts'
import type { ImportOptions } from './import.ts'

/**
 * Searching for releases, which the indexers own (checkpoint 5). The runtime joins the two, so this
 * package doesn't depend on the indexers; without it, searching is refused as in checkpoint 4.
 */
export type MovieSearch = {
  /** Whether an enabled indexer exists. */
  canSearch(): boolean
  /** Queues a search for each movie; checkpoint 6 grabs what it finds. */
  queue(tmdbIds: number[]): void
}

export type MoviesDeps = MediaDeps & {
  jobs: JobQueue
  events: EventBus
  metadata: Metadata
  search?: MovieSearch
  /** A file's subtitle tracks for the client API (checkpoint 7); the runtime joins subtitles. */
  subtitles?: { forFile(fileId: string): ClientSubtitle[] }
  /** Importing's setup (checkpoint 6): the downloads folder, and seams for tests. */
  importing?: ImportOptions
}

export type Ctx = MoviesDeps

/** The library's topics (@highsea/api-contract's `MEDIA_TOPICS`; `history.updated` is checkpoint 6's). */
export const TOPICS = {
  movies: 'movies.updated',
  item: 'item.updated',
  history: 'history.updated',
} as const

/** Says what changed: the movies (by TMDB id) and each title's library layer (`movie:{id}`). */
export function announce(events: EventBus, tmdbIds: number[], { many = false } = {}) {
  if (tmdbIds.length === 0) return
  events.emit({ topic: TOPICS.movies, ids: many ? undefined : tmdbIds.map(String) })
  events.emit({ topic: TOPICS.item, ids: tmdbIds.map((id) => `movie:${id}`) })
}

export const notInLibrary = () => new AppError('not-found', 'That movie isn’t in the library.')

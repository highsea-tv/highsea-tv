// SPDX-License-Identifier: AGPL-3.0-only
// What every media type's services share: the platform the runtime gives each domain package. A
// media type adds what it needs on top (movies: the job queue, events, TMDB's metadata, search).
import { AppError, type Clock, type Logger } from '@highsea/core'
import type { Db } from '@highsea/db'
import type { HistoryInput } from './history.ts'

export type MediaDeps = {
  db: Db
  clock: Clock
  logger: Logger
  /**
   * Hears each history entry as it's written (8b): the runtime turns grabs, imports and subtitles
   * into notifications. Called after the row is in; whatever it throws is logged, never raised.
   */
  onHistory?(id: string, entry: HistoryInput): void
}

export const invalid = (message: string, reason: string) =>
  new AppError('invalid', message, { reason })

/** Searching needs an enabled indexer (checkpoint 4's decision 2, checked since checkpoint 5). */
export const noIndexers = () =>
  new AppError('conflict', 'Add an indexer to search for releases.', { reason: 'no-indexers' })

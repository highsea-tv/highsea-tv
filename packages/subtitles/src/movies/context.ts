// SPDX-License-Identifier: AGPL-3.0-only
// What the movie subtitle services share: the platform, the media services (history), the job
// queue and events, and the providers' seams.
import type { promises as fsp } from 'node:fs'
import type { EventBus } from '@highsea/core'
import type { JobQueue } from '@highsea/jobs'
import type { Media } from '@highsea/media/shared'
import type { SyncOutcome, SyncTask } from '../sync/worker.ts'
import type { AccountsDeps } from './accounts.ts'

export type SubtitlesDeps = AccountsDeps & {
  jobs: JobQueue
  events: EventBus
  media: Media
  /** The filesystem calls sidecars use; a test fails a rename through it. */
  fs?: SidecarFs
  /** Runs the sync engine: the runtime's worker pool; in this thread when absent. */
  sync?: (task: SyncTask, signal: AbortSignal) => Promise<SyncOutcome>
}

export type SidecarFs = Pick<
  typeof fsp,
  'writeFile' | 'rename' | 'unlink' | 'copyFile' | 'readFile' | 'readdir' | 'stat' | 'mkdir'
>

/** The topics: the mock's `subtitles.updated`, and the library's own as tracks come and go. */
export const TOPICS = {
  subtitles: 'subtitles.updated',
  item: 'item.updated',
  history: 'history.updated',
} as const

/** Says what changed, by the movie's TMDB id (`movie:{id}`, as the library's events do). */
export function announce(events: EventBus, tmdbIds: number[], { history = false } = {}) {
  const ids = tmdbIds.length > 0 ? tmdbIds.map((id) => `movie:${id}`) : undefined
  events.emit({ topic: TOPICS.subtitles, ids })
  if (!ids) return
  events.emit({ topic: TOPICS.item, ids })
  if (history) events.emit({ topic: TOPICS.history, ids })
}

/** How long a provider has to answer a search (ADR 0043). */
export const SEARCH_DEADLINE_MS = 20_000

/** How long a search's results stay usable for Use. */
export const RESULTS_TTL_MS = 30 * 60_000

export const DAY = 24 * 60 * 60_000

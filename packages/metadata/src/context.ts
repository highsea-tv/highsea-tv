// SPDX-License-Identifier: AGPL-3.0-only
// What the metadata service is built from: the platform the runtime gives every domain package.
import type { Clock, EventBus, Fetch, Logger, Sealer } from '@highsea-tv/core'
import type { Db } from '@highsea-tv/db'
import type { JobQueue } from '@highsea-tv/jobs'

export type MetadataDeps = {
  db: Db
  jobs: JobQueue
  clock: Clock
  logger: Logger
  events: EventBus
  /** Seals the TMDB key at rest (`/config/secret.key`). */
  sealer: Sealer
  /** Every request to TMDB goes through it (ADR 0029); tests pass the replaying one. */
  fetch: Fetch
  /** Where cached images live: `/data/images`. */
  imagesDir: string
  /**
   * highsea's own TMDB key, built into the image from the release environment
   * (install-simplicity.md, answer 7); the owner's key in Settings wins over it.
   */
  builtInKey?: string
  /** Waits between retries; tests pass one that moves a fake clock. */
  sleep?: (ms: number) => Promise<void>
}

/** The `metadata.updated` topic, with `movie:{id}`, `person:{id}` or `collection:{id}` ids. */
export const METADATA_TOPIC = 'metadata.updated'

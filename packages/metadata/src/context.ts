// SPDX-License-Identifier: AGPL-3.0-only
// What the metadata service is built from: the platform the runtime gives every domain package.
import type { Clock, EventBus, Fetch, Logger, Sealer } from '@highsea/core'
import type { Db } from '@highsea/db'
import type { JobQueue } from '@highsea/jobs'

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
  /** Waits between retries; tests pass one that moves a fake clock. */
  sleep?: (ms: number) => Promise<void>
}

/** The `metadata.updated` topic, with `movie:{id}`, `person:{id}` or `collection:{id}` ids. */
export const METADATA_TOPIC = 'metadata.updated'

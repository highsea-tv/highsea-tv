// SPDX-License-Identifier: AGPL-3.0-only
// What the indexers service is built from: the platform the runtime gives every domain package,
// and the definitions, which come from the catalog without this package depending on it.
import type { Clock, EventBus, Fetch, Logger, Sealer } from '@highsea-tv/core'
import type { Db } from '@highsea-tv/db'
import type { JobQueue } from '@highsea-tv/jobs'
import type { Definition } from '@highsea-tv/schemas/indexers'

/**
 * What a definition's catalog says of its upkeep (ADR 0069): @highsea-tv/catalog's
 * `DefinitionStatus`, the part the indexers pass on.
 */
export type SourceStatus = {
  stage: 'stable' | 'beta'
  status: 'working' | 'broken' | 'retired'
  since: string | null
  note: string | null
  checked: string | null
  result: 'working' | 'failing' | 'challenge' | 'skipped' | null
  verified: string | null
}

/** A definition as the catalog serves it. */
export type SourceDefinition = {
  definition: Definition
  /** `main`, `local` or `extra:{url}`. */
  origin: string
  /** A data URL, from the bundle. */
  logo: string | null
  /** What its catalog says of it; null or absent when it says nothing (a local one, an older bundle). */
  status?: SourceStatus | null
}

/** The part of `@highsea-tv/catalog` the indexers read. */
export type DefinitionSource = {
  definitions(): SourceDefinition[]
  definition(id: string): SourceDefinition | null
  /**
   * What the main catalog says of a definition, one it retired included (no longer among
   * `definitions()`). Optional: a source without stages says nothing.
   */
  statusOf?(id: string): SourceStatus | null
  /** Called with the ids whose definition changed or went away. */
  onDefinitionsChanged(
    listener: (changed: { id: string; definition: Definition | null }[]) => void,
  ): () => void
}

export type IndexersDeps = {
  db: Db
  jobs: JobQueue
  clock: Clock
  logger: Logger
  events: EventBus
  /** Seals secret settings and sign-in sessions at rest (`/config/secret.key`). */
  sealer: Sealer
  /** Every request to an indexer goes through it (ADR 0029); tests pass the fake indexer. */
  fetch: Fetch
  definitions: DefinitionSource
  /** Waits for a rate limit; tests pass one that moves a fake clock. */
  sleep?: (ms: number) => Promise<void>
  /** 0 to 1, for the backoff's jitter; tests pass a fixed one. */
  random?: () => number
  /** Each indexer's time to answer, 30 seconds unless a test shortens it (owner's answer 7). */
  timeoutMs?: number
}

/** `indexers.updated`, with the indexer ids that changed. */
export const INDEXERS_TOPIC = 'indexers.updated'
/** `health.updated`, when an indexer's health crosses a line. */
export const HEALTH_TOPIC = 'health.updated'

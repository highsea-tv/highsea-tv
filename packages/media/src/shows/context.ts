// SPDX-License-Identifier: AGPL-3.0-only
// What the show services share: the platform every media type gets, plus the job queue, events and
// the metadata service the library reads TMDB's facts from (ADR 0064).
import { type ClientSubtitle, DRAFT_TOPICS, MEDIA_TOPICS, topicId } from '@highsea-tv/api-contract'
import type { EventBus } from '@highsea-tv/core'
import type { JobQueue } from '@highsea-tv/jobs'
import type { Metadata } from '@highsea-tv/metadata'
import type { ImportHooks } from '../movies/import.ts'
import type { MediaDeps } from '../shared/context.ts'
import type { Extract } from '../shared/extract.ts'
import type { Probe } from '../shared/probe.ts'
import type { TransferFs } from '../shared/transfer.ts'

/** How shows' files are read; every part has a default, as films' `ImportOptions` do. */
export type ShowFileOptions = {
  /** ffprobe; defaults to `HIGHSEA_FFPROBE` or `ffprobe` on the PATH. */
  probe?: Probe
  /** Overrides DetectSample's minimum runtime in seconds, so tests can use short clips. */
  sampleSeconds?: number
  /**
   * What another package does as a file is filed, films' import hooks' shape: the runtime wires
   * subtitles', which keep the episode's sidecars, hash the file and search for what's wanted.
   */
  hooks?: Pick<ImportHooks, 'afterImport'>
  /** The downloads folder and the categories', allowed beside the root folders (Phase 5 C1). */
  downloadDirs?: () => string[]
  /** The filesystem calls transfers make; a test forces `EXDEV` through it. */
  fs?: TransferFs
  /** unar; defaults to `HIGHSEA_UNAR` or `unar` on the PATH. */
  extract?: Extract
}

export type ShowsDeps = MediaDeps & {
  jobs: JobQueue
  events: EventBus
  metadata: Metadata
  files?: ShowFileOptions
  /**
   * A file's subtitle tracks for the client API, as films' (the runtime joins subtitles), and what
   * subtitles do when episodes' language profile changes: their wanted rows are rewritten.
   */
  subtitles?: {
    forFile(fileId: string): ClientSubtitle[]
    profileChanged?(itemIds: string[]): void
  }
}

/** Says what changed: the shows (by TMDB id) and each show's library layer (`show:{id}`). */
export function announce(events: EventBus, tmdbIds: number[]) {
  if (tmdbIds.length === 0) return
  events.emit({ topic: DRAFT_TOPICS.shows, ids: tmdbIds.map(String) })
  events.emit({ topic: MEDIA_TOPICS.item, ids: tmdbIds.map((id) => topicId('show', id)) })
}

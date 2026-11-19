// SPDX-License-Identifier: AGPL-3.0-only
// What the music services share: the platform every media type gets, plus the job queue, events and
// the metadata service's MusicBrainz side (ADR 0065).
import { DRAFT_TOPICS } from '@highsea-tv/api-contract'
import type { EventBus } from '@highsea-tv/core'
import type { JobQueue } from '@highsea-tv/jobs'
import type { Metadata } from '@highsea-tv/metadata'
import type { MediaDeps } from '../shared/context.ts'
import type { CoverExtractor } from './images.ts'
import type { TagReader } from './tags.ts'

export type MusicDeps = MediaDeps & {
  jobs: JobQueue
  events: EventBus
  metadata: Pick<Metadata, 'music'>
  /** ffprobe's tag reader; defaults to `HIGHSEA_FFPROBE` or `ffprobe` on the PATH. */
  readTags?: TagReader
  /**
   * Where covers copied out of files and pictures fetched from the Cover Art Archive and fanart.tv
   * are kept (the data folder's `images/music`); without it, only pictures in folders are served.
   */
  imagesDir?: string
  /** Copies the picture out of an audio file (ffmpeg); without it, those covers aren't served. */
  extractCover?: CoverExtractor
}

/** Says music changed: the albums and artists by id (`music.updated`). */
export function announce(events: EventBus, ids: Iterable<string>) {
  const list = [...new Set(ids)]
  if (list.length) events.emit({ topic: DRAFT_TOPICS.music, ids: list })
}

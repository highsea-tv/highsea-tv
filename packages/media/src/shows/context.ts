// SPDX-License-Identifier: AGPL-3.0-only
// What the show services share: the platform every media type gets, plus events and the metadata
// service the library reads TMDB's facts from (ADR 0064).
import { DRAFT_TOPICS, MEDIA_TOPICS, topicId } from '@highsea-tv/api-contract'
import type { EventBus } from '@highsea-tv/core'
import type { Metadata } from '@highsea-tv/metadata'
import type { MediaDeps } from '../shared/context.ts'

export type ShowsDeps = MediaDeps & {
  events: EventBus
  metadata: Metadata
}

/** Says what changed: the shows (by TMDB id) and each show's library layer (`show:{id}`). */
export function announce(events: EventBus, tmdbIds: number[]) {
  if (tmdbIds.length === 0) return
  events.emit({ topic: DRAFT_TOPICS.shows, ids: tmdbIds.map(String) })
  events.emit({ topic: MEDIA_TOPICS.item, ids: tmdbIds.map((id) => topicId('show', id)) })
}

// SPDX-License-Identifier: AGPL-3.0-only
// Server events over SSE at /api/v1/events. Each says what changed (a topic and, when narrower,
// ids); clients refetch what they show. A reconnecting client sends Last-Event-ID to catch up,
// and gets a `reset` event when it fell too far behind to.
import { z } from '@hono/zod-openapi'

export const ServerEvent = z
  .object({
    id: z.number().int(),
    topic: z.string().openapi({ example: 'jobs.updated' }),
    ids: z.array(z.string()).optional(),
    at: z.number().int().openapi({ description: 'Epoch milliseconds' }),
  })
  .openapi('ServerEvent')

export type ServerEvent = z.infer<typeof ServerEvent>

/** Sent instead of a replay when the client's Last-Event-ID is too old: refetch everything. */
export const RESET_TOPIC = 'reset'

/**
 * The library's topics (checkpoint 4). Ids are strings, never objects:
 * - `movies.updated`: the library changed (added, edited, removed); ids are the movies' TMDB ids,
 *   absent when many changed at once;
 * - `item.updated`: one title's library layer changed; ids are `movie:{tmdbId}`, as the type keeps
 *   ids apart;
 * - `metadata.updated`: a refresh wrote new metadata; ids are `movie:{id}`, `person:{id}` or
 *   `collection:{id}`, TMDB ids.
 */
export const MEDIA_TOPICS = {
  movies: 'movies.updated',
  item: 'item.updated',
  metadata: 'metadata.updated',
} as const

/** `movie:603`: a title's id in `item.updated` and `metadata.updated` events. */
export const topicId = (type: 'movie' | 'person' | 'collection', id: number) => `${type}:${id}`

/**
 * Indexers' and the catalog's topics (checkpoint 5):
 * - `indexers.updated`: an indexer was added, changed, removed, or searched; ids are indexer ids;
 * - `catalog.updated`: the catalog's definitions, version or settings changed;
 * - `health.updated`: an indexer's health crossed a line, for the dashboard and System.
 */
export const INDEXER_TOPICS = {
  indexers: 'indexers.updated',
  catalog: 'catalog.updated',
  health: 'health.updated',
} as const

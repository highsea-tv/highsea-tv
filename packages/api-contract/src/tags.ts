// SPDX-License-Identifier: AGPL-3.0-only
// Tags (checkpoint 8c): labels the owner puts on movies, indexers, import lists and connections,
// scoping each to the movies that share one, as Radarr's do (wiki.servarr.com/radarr/settings#tags):
// - an indexer with tags is used only for movies with at least one matching tag; one without is
//   used for every movie;
// - an import list's tags are given to the movies it adds;
// - a connection with tags hears a movie's events only for movies with at least one matching tag;
//   events about no movie (health, updates) reach it as before.
// The library filters on them too. Ids are the server's; a label is unique, ignoring case.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, body, errors, IdParam, json, noContent } from './common.ts'

/** `tags.updated`: a tag was added, renamed or removed, or what uses one changed. */
export const TAG_TOPICS = { tags: 'tags.updated' } as const

export const TagLabel = z.string().trim().min(1).max(40).openapi({ example: 'kids' })

/** Tag ids on a movie, an indexer, a list or a connection. Unknown ids are refused. */
export const TagIds = z.array(z.string().min(1).max(64)).max(50).openapi('TagIds')

export const Tag = z
  .object({
    id: z.string(),
    label: TagLabel,
    /** What carries it: Settings › Tags shows the counts, and removing says what it leaves. */
    usage: z.object({
      movies: z.number().int(),
      indexers: z.number().int(),
      lists: z.number().int(),
      connections: z.number().int(),
    }),
  })
  .openapi('Tag')

export const TagInput = z.object({ label: TagLabel }).openapi('TagInput')

const TAGS = `${API_PREFIX}/tags`

export const tags = {
  list: createRoute({
    method: 'get',
    path: TAGS,
    tags: ['Tags'],
    summary: 'Every tag, A to Z, with what carries it',
    ...access('staff'),
    responses: { 200: json(z.array(Tag), 'Tags'), ...errors('unauthorized', 'forbidden') },
  }),
  add: createRoute({
    method: 'post',
    path: TAGS,
    tags: ['Tags'],
    summary: 'Add a tag',
    description: '409 (`exists`) when a tag has that label already, ignoring case.',
    ...access('staff'),
    request: { ...body(TagInput) },
    responses: {
      201: json(Tag, 'Added'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'conflict'),
    },
  }),
  rename: createRoute({
    method: 'patch',
    path: `${TAGS}/{id}`,
    tags: ['Tags'],
    summary: 'Rename a tag',
    description: 'What carries it keeps it. 409 (`exists`) when another tag has that label.',
    ...access('staff'),
    request: { params: IdParam, ...body(TagInput) },
    responses: {
      200: json(Tag, 'Renamed'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found', 'conflict'),
    },
  }),
  remove: createRoute({
    method: 'delete',
    path: `${TAGS}/{id}`,
    tags: ['Tags'],
    summary: 'Remove a tag',
    description:
      'It comes off every movie, indexer, list and connection that carries it. An indexer or connection left with no tags is used for every movie again.',
    ...access('staff'),
    request: { params: IdParam },
    responses: { ...noContent, ...errors('unauthorized', 'forbidden', 'not-found') },
  }),
} as const

export type Tag = z.infer<typeof Tag>
export type TagInput = z.infer<typeof TagInput>

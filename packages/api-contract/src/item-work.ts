// SPDX-License-Identifier: AGPL-3.0-only
// What the server is doing to a library item (HT-106, the owner's note of 2026-11-19): the jobs
// queued or running on a film, a show (with its seasons and episodes), a collection, an artist or
// an album, so the admin marks the item on its page and its card or row while work is in hand, and
// says how it went. Two reads: every item's work at once, for a library's marks without a read per
// item, and one item's with what finished lately. Both follow `jobs.updated`, which the queue raises
// whenever a job is queued, starts, moves on or ends.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, errors, IsoDate, json } from './common.ts'

/**
 * What a job can work on, as the admin addresses it: a film and a show by their TMDB id (the mock's
 * show by its slug), an episode by its TMDB id, a season by its show's id and its number
 * (`1396:2`), a collection, an artist and an album by their own ids.
 */
export const WORK_KINDS = [
  'movie',
  'show',
  'season',
  'episode',
  'collection',
  'artist',
  'album',
] as const
export type WorkKind = (typeof WORK_KINDS)[number]

/** The topic both reads follow. */
export const WORK_TOPICS = { jobs: 'jobs.updated' } as const

export const WorkSubject = z
  .object({ kind: z.enum(WORK_KINDS), id: z.string() })
  .openapi('WorkSubject')

export const ItemJob = z
  .object({
    id: z.string(),
    /**
     * The job type (`metadata.refresh`, `subtitles.search`, `movies.search`, …), which the admin
     * names in plain words; one it doesn't know reads as work in hand.
     */
    type: z.string(),
    state: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
    /** What it works on: the item itself, or one of its seasons or episodes. */
    subject: WorkSubject,
    /** Queued at, or started at while it runs. */
    since: IsoDate,
    /** While it waits to try again after a failure: when. */
    retryAt: IsoDate.nullable(),
    /** 0–100 while it runs, where its type says how far it is. */
    progress: z.number().min(0).max(100).nullable(),
    finishedAt: IsoDate.nullable(),
    /** Why it failed, or why its last try did while it waits to try again. */
    error: z.string().nullable(),
  })
  .openapi('ItemJob')

/** An item with work in hand: its own jobs and its seasons' and episodes'. */
export const ItemWork = WorkSubject.extend({ jobs: z.array(ItemJob) }).openapi('ItemWork')

/** One item's work, and what finished on it in the last ten minutes, newest first. */
export const ItemWorkDetail = WorkSubject.extend({
  active: z.array(ItemJob),
  finished: z.array(ItemJob),
}).openapi('ItemWorkDetail')

const WorkParams = z.object({
  kind: z.enum(WORK_KINDS).openapi({ param: { name: 'kind', in: 'path' } }),
  id: z.string().openapi({ param: { name: 'id', in: 'path' } }),
})

const WORK = `${API_PREFIX}/system/work`

export const itemWorkRoutes = {
  work: createRoute({
    method: 'get',
    path: WORK,
    tags: ['System'],
    summary: 'The library items with work in hand',
    description:
      'Every film, show, collection, artist and album a job is queued or running on, with its jobs, oldest first; a show carries its seasons’ and episodes’. One read for a library’s marks; refetch it on `jobs.updated`.',
    ...access('staff'),
    responses: {
      200: json(z.array(ItemWork), 'The items with work in hand'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  itemWork: createRoute({
    method: 'get',
    path: `${WORK}/{kind}/{id}`,
    tags: ['System'],
    summary: 'One item’s work, and how what finished lately went',
    description:
      'What’s queued or running on the item or on what it holds, and what finished on it in the last ten minutes with its outcome and reason. An item with nothing in hand answers empty lists, not 404.',
    ...access('staff'),
    request: { params: WorkParams },
    responses: {
      200: json(ItemWorkDetail, 'Its work'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
}

export type WorkSubject = z.infer<typeof WorkSubject>
export type ItemJob = z.infer<typeof ItemJob>
export type ItemWork = z.infer<typeof ItemWork>
export type ItemWorkDetail = z.infer<typeof ItemWorkDetail>

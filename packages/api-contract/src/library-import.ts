// SPDX-License-Identifier: AGPL-3.0-only
// Importing a library already on disk (checkpoint 6b; phase-3-checkpoint-6.md › Manual import and
// the owner's answer 9): A17's Library import mode. Scan a root folder for one candidate per
// folder, matched on TMDB; run the confirmed ones as a job, which adds each movie in place; read
// the job's progress, which changes on `import.updated`.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, body, errors, IsoDate, json } from './common.ts'

/** The topic a library import's progress is announced on. */
export const LIBRARY_IMPORT_TOPIC = 'import.updated'

export const LibraryImportScanInput = z
  .object({
    /** One of the root folders, by path. */
    root: z.string().min(1).max(4096),
  })
  .openapi('LibraryImportScanInput')

export const LibraryCandidate = z
  .object({
    folder: z.string(),
    /** The folder's own name, as read for the match. */
    name: z.string(),
    /** The main video file: the largest that isn't a sample or an extra. */
    file: z.string().nullable(),
    size: z.number().int().nonnegative(),
    quality: z.string().nullable(),
    /** TMDB's movie for the folder; null when nothing matched. */
    match: z
      .object({
        tmdbId: z.number().int().positive(),
        title: z.string(),
        year: z.number().int().nullable(),
      })
      .nullable(),
    inLibrary: z.boolean(),
    /** Why it can't be imported as it stands, or null. */
    skip: z.string().nullable(),
  })
  .openapi('LibraryCandidate')

export const LibraryImportRunInput = z
  .object({
    items: z
      .array(
        z.object({
          folder: z.string().min(1).max(4096),
          tmdbId: z.number().int().positive(),
        }),
      )
      .min(1)
      .max(2000),
    /** Rename to my format: the folder and the file take the naming formats. Off by default. */
    rename: z.boolean().optional(),
    /** The movies' quality profile; the first profile when left out. */
    qualityProfileId: z.string().min(1).max(64).optional(),
  })
  .openapi('LibraryImportRunInput')

export const LibraryImportStatus = z
  .object({
    state: z.enum(['idle', 'running', 'done', 'failed']),
    root: z.string().nullable(),
    rename: z.boolean(),
    total: z.number().int().nonnegative(),
    done: z.number().int().nonnegative(),
    imported: z.number().int().nonnegative(),
    failures: z.array(z.object({ folder: z.string(), message: z.string() })),
    startedAt: IsoDate.nullable(),
    finishedAt: IsoDate.nullable(),
  })
  .openapi('LibraryImportStatus')

export const libraryImport = {
  scan: createRoute({
    method: 'post',
    path: `${API_PREFIX}/import/library/scan`,
    tags: ['Import'],
    summary: 'Look through a root folder for movies already there, and match each on TMDB',
    ...access('staff'),
    request: { ...body(LibraryImportScanInput) },
    responses: {
      200: json(z.array(LibraryCandidate), 'One candidate per folder'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'unavailable'),
    },
  }),
  run: createRoute({
    method: 'post',
    path: `${API_PREFIX}/import/library`,
    tags: ['Import'],
    summary: 'Add the confirmed movies where they are, as a job',
    ...access('staff'),
    request: { ...body(LibraryImportRunInput) },
    responses: {
      200: json(LibraryImportStatus, 'The job started'),
      ...errors('invalid', 'unauthorized', 'forbidden', 'not-found', 'conflict'),
    },
  }),
  status: createRoute({
    method: 'get',
    path: `${API_PREFIX}/import/library`,
    tags: ['Import'],
    summary: 'The library import’s progress',
    ...access('staff'),
    responses: {
      200: json(LibraryImportStatus, 'The last or current run'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
}

export type LibraryCandidate = z.infer<typeof LibraryCandidate>
export type LibraryImportRunInput = z.infer<typeof LibraryImportRunInput>
export type LibraryImportStatus = z.infer<typeof LibraryImportStatus>

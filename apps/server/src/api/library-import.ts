// SPDX-License-Identifier: AGPL-3.0-only
// Importing a library already on disk over HTTP (checkpoint 6b): A17's Library import mode. Thin
// handlers over @highsea-tv/media's `movies.libraryImport`; starting a run goes in the audit log.
import { type LibraryImportStatus, routes } from '@highsea-tv/api-contract'
import type { LibraryImportState } from '@highsea-tv/media/movies'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { actor, type Env, me } from './guard.ts'

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString())

const view = ({ jobId: _job, startedAt, finishedAt, ...rest }: LibraryImportState) =>
  ({
    ...rest,
    startedAt: iso(startedAt),
    finishedAt: iso(finishedAt),
  }) satisfies LibraryImportStatus

export function registerLibraryImport(app: OpenAPIHono<Env>) {
  const runtime = (c: Context<Env>) => c.get('runtime')

  app.openapi(routes.libraryImport.scan, async (c) =>
    c.json(await runtime(c).movies.libraryImport.scan(c.req.valid('json').root), 200),
  )

  app.openapi(routes.libraryImport.run, (c) => {
    const { items, rename, qualityProfileId } = c.req.valid('json')
    const state = runtime(c).movies.libraryImport.run(items, { rename, qualityProfileId })
    runtime(c).auth.ctx.audit({
      action: 'import.library',
      actor: actor(me(c)),
      address: c.get('meta').address,
      targetType: 'folder',
      targetId: state.root ?? '',
    })
    return c.json(view(state), 200)
  })

  app.openapi(routes.libraryImport.status, (c) =>
    c.json(view(runtime(c).movies.libraryImport.status()), 200),
  )
}

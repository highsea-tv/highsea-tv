// SPDX-License-Identifier: AGPL-3.0-only
// Importing a library already on disk over HTTP (checkpoint 6b): A17's Library import mode. Thin
// handlers over @highsea-tv/media's `movies.libraryImport`, or `shows.libraryImport` for a shows
// root folder (Phase 5 B): a show's candidate takes the films' shape, with no file, size, quality
// or parts, since its folder holds many. Shows are matched where they are: Rename to my format
// isn't offered for them (400 `rename-shows`). Starting a run goes in the audit log.
import { type LibraryCandidate, type LibraryImportStatus, routes } from '@highsea-tv/api-contract'
import { AppError } from '@highsea-tv/core'
import type { LibraryImportState } from '@highsea-tv/media/movies'
import type { ShowCandidate, ShowImportState } from '@highsea-tv/media/shows'
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

const showView = (s: ShowImportState): LibraryImportStatus => ({
  state: s.state,
  root: s.root,
  rename: false,
  total: s.total,
  done: s.done,
  imported: s.imported,
  failures: s.failures,
  startedAt: iso(s.startedAt),
  finishedAt: iso(s.finishedAt),
})

const showCandidate = (s: ShowCandidate): LibraryCandidate => ({
  folder: s.folder,
  name: s.name,
  file: null,
  size: 0,
  quality: null,
  match: s.match,
  matchedBy: s.matchedBy,
  parts: [],
  check: null,
  inLibrary: s.inLibrary,
  skip: s.skip,
})

export function registerLibraryImport(app: OpenAPIHono<Env>) {
  const runtime = (c: Context<Env>) => c.get('runtime')
  /** Whether a path is in a shows root folder (the folder itself, or one inside it). */
  const inShows = (c: Context<Env>, path: string) =>
    runtime(c)
      .media.rootFolders.list('shows')
      .some((r) => path === r.path || path.startsWith(`${r.path.replace(/\/+$/, '')}/`))

  app.openapi(routes.libraryImport.scan, async (c) => {
    const { root } = c.req.valid('json')
    if (inShows(c, root))
      return c.json((await runtime(c).shows.libraryImport.scan(root)).map(showCandidate), 200)
    return c.json(await runtime(c).movies.libraryImport.scan(root), 200)
  })

  app.openapi(routes.libraryImport.run, (c) => {
    const { items, rename, qualityProfileId } = c.req.valid('json')
    const shows = items.length > 0 && inShows(c, items[0]?.folder ?? '')
    if (shows && rename)
      throw new AppError('invalid', 'Shows are matched where they are, without renaming.', {
        reason: 'rename-shows',
      })
    const state = shows
      ? showView(runtime(c).shows.libraryImport.run(items, { qualityProfileId }))
      : view(runtime(c).movies.libraryImport.run(items, { rename, qualityProfileId }))
    runtime(c).auth.ctx.audit({
      action: 'import.library',
      actor: actor(me(c)),
      address: c.get('meta').address,
      targetType: 'folder',
      targetId: state.root ?? '',
    })
    return c.json(state, 200)
  })

  // the films' and the shows' runs are separate jobs: the one running, else the latest started
  app.openapi(routes.libraryImport.status, (c) => {
    const films = runtime(c).movies.libraryImport.status()
    const shows = runtime(c).shows.libraryImport.status()
    if (shows.state === 'running') return c.json(showView(shows), 200)
    if (films.state === 'running') return c.json(view(films), 200)
    return (shows.startedAt ?? 0) > (films.startedAt ?? 0)
      ? c.json(showView(shows), 200)
      : c.json(view(films), 200)
  })
}

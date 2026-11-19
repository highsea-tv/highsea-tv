// SPDX-License-Identifier: AGPL-3.0-only
// The movie library over HTTP (movies.md: A5 Movies, A6 movie detail) and the root folders: thin
// handlers over @highsea-tv/media/movies and, for the folders every media type shares,
// @highsea-tv/media/shared. Static paths (`/movies/bulk`, `/movies/upcoming`) are registered before
// `/movies/{id}`, in the contract's order. Every change goes in the audit log, as other write
// routes do.
import { routes } from '@highsea-tv/api-contract'
import { AppError } from '@highsea-tv/core'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { actor, type Env, me } from './guard.ts'

export function registerMovies(app: OpenAPIHono<Env>) {
  const movies = (c: Context<Env>) => c.get('runtime').movies
  const audit = (c: Context<Env>, action: string, target?: { type: string; id: string }) =>
    c.get('runtime').auth.ctx.audit({
      action,
      actor: actor(me(c)),
      address: c.get('meta').address,
      ...(target ? { targetType: target.type, targetId: target.id } : {}),
    })
  const movie = (id: number) => ({ type: 'movie', id: String(id) })
  /** "Don't add it again from lists" (checkpoint 8a): exclusions written before the delete. */
  const exclude = (c: Context<Env>, tmdbIds: number[]) => c.get('runtime').excludeFromLists(tmdbIds)

  // ---------------------------------------------------------------- the library

  app.openapi(routes.movies.list, (c) => c.json(movies(c).list(c.req.valid('query')), 200))

  app.openapi(routes.movies.add, async (c) => {
    const { movie: added, created } = await movies(c).add(c.req.valid('json'))
    if (!created) return c.json(added, 200)
    audit(c, 'movie.added', movie(added.id))
    c.get('runtime').notifications.movieAdded(added.id, me(c).user.displayName)
    return c.json(added, 201)
  })

  app.openapi(routes.movies.bulk, async (c) => {
    const input = c.req.valid('json')
    if (input.action === 'delete' && input.exclude) exclude(c, input.ids)
    const result = await movies(c).bulk(input)
    audit(c, `movies.bulk-${input.action}`, { type: 'movies', id: String(result.ids.length) })
    return c.json(result, 200)
  })

  app.openapi(routes.movies.upcoming, (c) =>
    c.json(movies(c).upcoming(c.req.valid('query').days ?? 14), 200),
  )

  app.openapi(routes.movies.recent, (c) =>
    c.json(movies(c).recent(c.req.valid('query').limit ?? 8), 200),
  )

  app.openapi(routes.movies.get, (c) => c.json(movies(c).get(c.req.valid('param').id), 200))

  app.openapi(routes.movies.update, (c) => {
    const { id } = c.req.valid('param')
    const saved = movies(c).update(id, c.req.valid('json'))
    audit(c, 'movie.updated', movie(id))
    return c.json(saved, 200)
  })

  app.openapi(routes.movies.delete, (c) => {
    const { id } = c.req.valid('param')
    const query = c.req.valid('query')
    const deleteFiles = query.deleteFiles === 'true'
    movies(c).get(id)
    if (query.exclude === 'true') exclude(c, [id])
    movies(c).delete(id, { deleteFiles })
    audit(c, deleteFiles ? 'movie.deleted-with-files' : 'movie.deleted', movie(id))
    return c.body(null, 204)
  })

  app.openapi(routes.movies.refresh, (c) => {
    const { id } = c.req.valid('param')
    movies(c).refresh(id)
    return c.body(null, 202)
  })

  // ---------------------------------------------------------------- versions (ADR 0012)

  app.openapi(routes.movies.addVersion, (c) => {
    const { id } = c.req.valid('param')
    const saved = movies(c).versions.add(id, c.req.valid('json'))
    audit(c, 'movie.version-added', movie(id))
    return c.json(saved, 201)
  })

  app.openapi(routes.movies.updateVersion, (c) => {
    const { id, versionId } = c.req.valid('param')
    const saved = movies(c).versions.update(id, versionId, c.req.valid('json'))
    audit(c, 'movie.version-updated', movie(id))
    return c.json(saved, 200)
  })

  app.openapi(routes.movies.removeVersion, (c) => {
    const { id, versionId } = c.req.valid('param')
    const saved = movies(c).versions.remove(id, versionId)
    audit(c, 'movie.version-removed', movie(id))
    return c.json(saved, 200)
  })

  // ---------------------------------------------------------------- root folders

  app.openapi(routes.rootFolders.list, (c) =>
    c.json(c.get('runtime').media.rootFolders.list(c.req.valid('query').kind), 200),
  )

  app.openapi(routes.rootFolders.add, (c) => {
    const runtime = c.get('runtime')
    const folder = runtime.media.rootFolders.add(c.req.valid('json'))
    audit(c, 'rootfolder.added', { type: 'rootfolder', id: folder.id })
    // Settings › Media management and Storage's folders refetch on it
    runtime.events.emit({ topic: 'settings.updated' })
    // what's already there: the scan adds the sure matches, the rest wait for Library import.
    // Music's folders are kept for part D
    if (folder.kind === 'movies') runtime.movies.libraryScan.queue(folder.path)
    if (folder.kind === 'shows') runtime.shows.libraryScan.queue(folder.path)
    return c.json(folder, 201)
  })

  app.openapi(routes.rootFolders.update, (c) => {
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    const folders = c.get('runtime').media.rootFolders
    let folder = folders.list().find((f) => f.id === id)
    if (body.languageProfileId !== undefined)
      folder = folders.setLanguageProfile(id, body.languageProfileId)
    if (body.readOnly !== undefined) folder = folders.setReadOnly(id, body.readOnly)
    if (!folder) throw new AppError('not-found', 'That root folder doesn’t exist.')
    audit(c, 'rootfolder.updated', { type: 'rootfolder', id })
    c.get('runtime').events.emit({ topic: 'settings.updated' })
    return c.json(folder, 200)
  })

  app.openapi(routes.rootFolders.scan, (c) => {
    const { id } = c.req.valid('param')
    const runtime = c.get('runtime')
    const folder = runtime.media.rootFolders.list().find((f) => f.id === id)
    if (!folder) throw new AppError('not-found', 'That root folder doesn’t exist.')
    if (folder.kind === 'music')
      throw new AppError(
        'conflict',
        'highsea reads music from a later release. The folder is kept until then.',
        { reason: 'not-yet' },
      )
    if (folder.kind === 'shows') runtime.shows.libraryScan.queue(folder.path)
    else runtime.movies.libraryScan.queue(folder.path)
    audit(c, 'rootfolder.scanned', { type: 'rootfolder', id })
    return c.body(null, 204)
  })

  app.openapi(routes.rootFolders.remove, (c) => {
    const { id } = c.req.valid('param')
    c.get('runtime').media.rootFolders.remove(id)
    audit(c, 'rootfolder.removed', { type: 'rootfolder', id })
    c.get('runtime').events.emit({ topic: 'settings.updated' })
    return c.body(null, 204)
  })
}

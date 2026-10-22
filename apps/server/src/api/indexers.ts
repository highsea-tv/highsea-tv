// SPDX-License-Identifier: AGPL-3.0-only
// Indexers and the catalog over HTTP (indexers.md, checkpoint 5): thin handlers over
// @highsea/indexers and @highsea/catalog, and release search for a library movie. Changes go in
// the audit log, as other write routes do. `/indexers/test` is registered before `/indexers/{id}`.
import { routes } from '@highsea/api-contract'
import type { CatalogStatus } from '@highsea/catalog'
import { AppError } from '@highsea/core'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { actor, type Env, me } from './guard.ts'

const iso = (ms: number) => new Date(ms).toISOString()

/** The catalog's status in the contract's shape: times as ISO strings. */
const statusView = (s: CatalogStatus) => ({
  ...s,
  lastCheck: s.lastCheck ? { ...s.lastCheck, at: iso(s.lastCheck.at) } : null,
})

export function registerIndexers(app: OpenAPIHono<Env>) {
  const runtime = (c: Context<Env>) => c.get('runtime')
  const audit = (c: Context<Env>, action: string, target?: { type: string; id: string }) =>
    runtime(c).auth.ctx.audit({
      action,
      actor: actor(me(c)),
      address: c.get('meta').address,
      ...(target ? { targetType: target.type, targetId: target.id } : {}),
    })
  const indexer = (id: string) => ({ type: 'indexer', id })

  // ---------------------------------------------------------------- the catalog

  app.openapi(routes.catalog.status, (c) => c.json(statusView(runtime(c).catalog.status()), 200))

  app.openapi(routes.catalog.check, async (c) => {
    const status = await runtime(c).catalog.check()
    audit(c, 'catalog.checked')
    return c.json(statusView(status), 200)
  })

  app.openapi(routes.catalog.install, (c) => {
    const status = runtime(c).catalog.installPending()
    audit(c, 'catalog.installed', { type: 'catalog', id: status.version ?? '' })
    return c.json(statusView(status), 200)
  })

  app.openapi(routes.catalog.indexers, (c) =>
    c.json(runtime(c).indexers.catalog({ starter: c.req.valid('query').starter === 'true' }), 200),
  )

  app.openapi(routes.catalog.settings, (c) => c.json(runtime(c).catalog.settings(), 200))

  app.openapi(routes.catalog.updateSettings, (c) => {
    const { catalog } = runtime(c)
    catalog.updateSettings(c.req.valid('json'))
    audit(c, 'catalog.settings-changed')
    return c.json(catalog.settings(), 200)
  })

  // ---------------------------------------------------------------- indexers

  app.openapi(routes.indexers.list, (c) => c.json(runtime(c).indexers.list(), 200))

  app.openapi(routes.indexers.add, async (c) => {
    const { definitionId, ...input } = c.req.valid('json')
    // tags must exist (checkpoint 8c): the library's, which indexers don't import
    const tags = runtime(c).media.tags.check(input.tags)
    const added = await runtime(c).indexers.add(definitionId, { ...input, tags })
    audit(c, 'indexer.added', indexer(added.indexer.id))
    return c.json(added, 201)
  })

  app.openapi(routes.indexers.test, async (c) => {
    const { id, settings } = c.req.valid('json')
    return c.json(await runtime(c).indexers.test(id, settings), 200)
  })

  app.openapi(routes.indexers.update, (c) => {
    const { id } = c.req.valid('param')
    const patch = c.req.valid('json')
    const saved = runtime(c).indexers.update(
      id,
      patch.tags === undefined
        ? patch
        : { ...patch, tags: runtime(c).media.tags.check(patch.tags) },
    )
    audit(c, 'indexer.updated', indexer(id))
    return c.json(saved, 200)
  })

  app.openapi(routes.indexers.retry, (c) =>
    c.json(runtime(c).indexers.retry(c.req.valid('param').id), 200),
  )

  app.openapi(routes.indexers.remove, (c) => {
    const { id } = c.req.valid('param')
    runtime(c).indexers.remove(id)
    audit(c, 'indexer.removed', indexer(id))
    return c.body(null, 204)
  })

  // ---------------------------------------------------------------- release search

  app.openapi(routes.movies.interactiveSearch, async (c) => {
    const { id } = c.req.valid('param')
    const { movies, indexers, automation } = runtime(c)
    // judged with the movie's blocklist, as automation's searches are (checkpoint 8a)
    const input = automation.inputFor(id) ?? movies.searchInput(id)
    if (!indexers.hasEnabled())
      throw new AppError('conflict', 'Add an indexer to search for releases.', {
        reason: 'no-indexers',
      })
    return c.json(await indexers.search(input), 200)
  })

  app.openapi(routes.movies.releases, (c) => {
    const { id } = c.req.valid('param')
    const { movies, indexers } = runtime(c)
    movies.get(id)
    return c.json(indexers.releases(id), 200)
  })
}

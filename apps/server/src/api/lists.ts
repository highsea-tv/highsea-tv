// SPDX-License-Identifier: AGPL-3.0-only
// Import lists over HTTP (settings.md › Import lists; checkpoint 8a): thin handlers over
// `@highsea/lists`. Static paths (`/test`, `/exclusions`, `/trakt`) come before `/{id}`, in the
// contract's order. Changes go in the audit log, as other settings do.
import { routes } from '@highsea/api-contract'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { actor, type Env, me } from './guard.ts'

export function registerLists(app: OpenAPIHono<Env>) {
  const lists = (c: Context<Env>) => c.get('runtime').lists
  const audit = (c: Context<Env>, action: string, id: string) =>
    c.get('runtime').auth.ctx.audit({
      action,
      actor: actor(me(c)),
      address: c.get('meta').address,
      targetType: 'import-list',
      targetId: id,
    })

  app.openapi(routes.importLists.list, (c) => c.json(lists(c).list(), 200))

  app.openapi(routes.importLists.add, (c) => {
    const added = lists(c).add(c.req.valid('json'))
    audit(c, 'import-list.added', added.id)
    return c.json(added, 201)
  })

  app.openapi(routes.importLists.test, async (c) =>
    c.json(await lists(c).test(c.req.valid('json').settings), 200),
  )

  app.openapi(routes.importLists.exclusions, (c) => c.json(lists(c).exclusions(), 200))

  app.openapi(routes.importLists.removeExclusion, (c) => {
    const { tmdbId } = c.req.valid('param')
    lists(c).removeExclusion(tmdbId)
    audit(c, 'import-list.exclusion-removed', String(tmdbId))
    return c.body(null, 204)
  })

  app.openapi(routes.importLists.trakt, (c) => c.json(lists(c).trakt.status(), 200))

  app.openapi(routes.importLists.traktConnect, async (c) =>
    c.json(await lists(c).trakt.connect(), 200),
  )

  app.openapi(routes.importLists.traktPoll, async (c) => {
    const state = await lists(c).trakt.poll()
    if (state === 'connected') {
      audit(c, 'import-list.trakt-connected', 'trakt')
      c.get('runtime').events.emit({ topic: 'lists.updated' })
    }
    return c.json({ state }, 200)
  })

  app.openapi(routes.importLists.traktDisconnect, async (c) => {
    await lists(c).trakt.disconnect()
    audit(c, 'import-list.trakt-disconnected', 'trakt')
    c.get('runtime').events.emit({ topic: 'lists.updated' })
    return c.body(null, 204)
  })

  app.openapi(routes.importLists.update, (c) => {
    const { id } = c.req.valid('param')
    const saved = lists(c).update(id, c.req.valid('json'))
    audit(c, 'import-list.updated', id)
    return c.json(saved, 200)
  })

  app.openapi(routes.importLists.remove, (c) => {
    const { id } = c.req.valid('param')
    lists(c).remove(id)
    audit(c, 'import-list.removed', id)
    return c.body(null, 204)
  })

  app.openapi(routes.importLists.sync, (c) => {
    lists(c).syncNow(c.req.valid('param').id)
    return c.body(null, 204)
  })
}

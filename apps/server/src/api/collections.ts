// SPDX-License-Identifier: AGPL-3.0-only
// Smart collections over HTTP (collections.md; checkpoint 8d, ADR 0049): thin handlers over
// `@highsea-tv/curation/collections`. The admin's routes are staff only (ADR 0032) and sit beside
// featured sections; the apps' Library › Collections is every signed-in person's, resolved for
// them and the kind of app asking. Static paths (`/preview`, `/fields`, `/people`) come before
// `/{id}`, in the contract's order. Changes go in the audit log, as curation's do.
import { routes } from '@highsea-tv/api-contract'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { actor, type Env, me } from './guard.ts'

export function registerCollections(app: OpenAPIHono<Env>) {
  const collections = (c: Context<Env>) => c.get('runtime').collections
  const audit = (c: Context<Env>, action: string, id: string) =>
    c.get('runtime').auth.ctx.audit({
      action,
      actor: actor(me(c)),
      address: c.get('meta').address,
      targetType: 'collection',
      targetId: id,
    })

  app.openapi(routes.collections.list, (c) => c.json(collections(c).list(), 200))

  app.openapi(routes.collections.add, (c) => {
    const added = collections(c).add(c.req.valid('json'), me(c).user.id)
    audit(c, 'collection.added', added.id)
    return c.json(added, 201)
  })

  app.openapi(routes.collections.preview, (c) => {
    const { id, collection } = c.req.valid('json')
    return c.json(collections(c).preview(collection, id), 200)
  })

  app.openapi(routes.collections.fields, (c) =>
    c.json(collections(c).fields(c.req.valid('query').except), 200),
  )

  app.openapi(routes.collections.people, (c) => {
    const { q, field } = c.req.valid('query')
    return c.json(collections(c).people(q, field), 200)
  })

  app.openapi(routes.collections.get, (c) =>
    c.json(collections(c).get(c.req.valid('param').id), 200),
  )

  app.openapi(routes.collections.save, (c) => {
    const { id } = c.req.valid('param')
    const saved = collections(c).save(id, c.req.valid('json'))
    audit(c, 'collection.updated', id)
    return c.json(saved, 200)
  })

  app.openapi(routes.collections.remove, (c) => {
    const { id } = c.req.valid('param')
    collections(c).remove(id)
    audit(c, 'collection.removed', id)
    return c.body(null, 204)
  })

  // ----------------------------------------------------- the apps' own reads

  app.openapi(routes.library.collections, (c) =>
    c.json(collections(c).forApps(me(c).user.id, c.req.valid('query').client ?? 'web'), 200),
  )

  app.openapi(routes.library.collection, (c) =>
    c.json(
      collections(c).page(
        c.req.valid('param').id,
        me(c).user.id,
        c.req.valid('query').client ?? 'web',
      ),
      200,
    ),
  )
}

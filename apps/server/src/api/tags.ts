// SPDX-License-Identifier: AGPL-3.0-only
// Tags over HTTP (checkpoint 8c): thin handlers over @highsea/media/shared's tags. Each change goes
// in the audit log and announces `tags.updated`; removing one changes what carries it, so the
// library, indexers, lists and connections hear their own topics too.
import { routes, TAG_TOPICS } from '@highsea/api-contract'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { actor, type Env, me } from './guard.ts'

export function registerTags(app: OpenAPIHono<Env>) {
  const tags = (c: Context<Env>) => c.get('runtime').media.tags
  const audit = (c: Context<Env>, action: string, id: string) =>
    c.get('runtime').auth.ctx.audit({
      action,
      actor: actor(me(c)),
      address: c.get('meta').address,
      targetType: 'tag',
      targetId: id,
    })
  const announce = (c: Context<Env>, topics: string[] = []) => {
    for (const topic of [TAG_TOPICS.tags, ...topics]) c.get('runtime').events.emit({ topic })
  }

  app.openapi(routes.tags.list, (c) => c.json(tags(c).list(), 200))

  app.openapi(routes.tags.add, (c) => {
    const tag = tags(c).add(c.req.valid('json').label)
    audit(c, 'tag.added', tag.id)
    announce(c)
    return c.json(tag, 201)
  })

  app.openapi(routes.tags.rename, (c) => {
    const { id } = c.req.valid('param')
    const tag = tags(c).rename(id, c.req.valid('json').label)
    audit(c, 'tag.renamed', id)
    announce(c)
    return c.json(tag, 200)
  })

  app.openapi(routes.tags.remove, (c) => {
    const { id } = c.req.valid('param')
    tags(c).remove(id)
    audit(c, 'tag.removed', id)
    announce(c, ['movies.updated', 'indexers.updated', 'lists.updated', 'connections.updated'])
    return c.body(null, 204)
  })
}

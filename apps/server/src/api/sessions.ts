// SPDX-License-Identifier: AGPL-3.0-only
// Now playing (checkpoint 4.3a): the live sessions, 30 days of history, and Stop with a message.
// Thin handlers over the runtime's `nowPlaying` and `playback`; the contract keeps them staff only.
import { routes } from '@highsea-tv/api-contract'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { actor, type Env, me } from './guard.ts'

export function registerSessions(app: OpenAPIHono<Env>) {
  const nowPlaying = (c: Context<Env>) => c.get('runtime').nowPlaying

  app.openapi(routes.sessions.list, (c) => c.json(nowPlaying(c).list(), 200))

  app.openapi(routes.sessions.history, (c) =>
    c.json(nowPlaying(c).history(c.req.valid('query').userId), 200),
  )

  app.openapi(routes.sessions.stop, (c) => {
    const p = me(c)
    const { id } = c.req.valid('param')
    c.get('runtime').playback.stopFor(id, { name: p.user.displayName }, c.req.valid('json').message)
    c.get('runtime').auth.ctx.audit({
      action: 'playback.stopped',
      actor: actor(p),
      address: c.get('meta').address,
    })
    return c.json(nowPlaying(c).list(), 200)
  })
}

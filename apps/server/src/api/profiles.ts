// SPDX-License-Identifier: AGPL-3.0-only
// Profiles (Phase 5's A2b, ADR 0068): the account's list, kept by `@highsea-tv/auth`, and the one
// this device watches as. Every route is the signed-in person's own; what a profile watches is
// read by the playback and library routes through the principal's `profileId`.
import { routes } from '@highsea-tv/api-contract'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { actor, type Env, me } from './guard.ts'

const profiles = (c: Context<Env>) => c.get('runtime').auth.profiles

export function registerProfiles(app: OpenAPIHono<Env>) {
  app.openapi(routes.profiles.list, (c) => {
    const p = me(c)
    return c.json(profiles(c).list(p.user.id, p.deviceId), 200)
  })

  app.openapi(routes.profiles.create, (c) => {
    const p = me(c)
    return c.json(profiles(c).create(p.user.id, c.req.valid('json'), actor(p), c.get('meta')), 200)
  })

  app.openapi(routes.profiles.update, async (c) => {
    const p = me(c)
    const saved = await profiles(c).update(
      p.user.id,
      c.req.valid('param').id,
      c.req.valid('json'),
      actor(p),
      c.get('meta'),
    )
    return c.json(saved, 200)
  })

  app.openapi(routes.profiles.delete, (c) => {
    const p = me(c)
    profiles(c).delete(p.user.id, c.req.valid('param').id, actor(p), c.get('meta'))
    return c.body(null, 204)
  })

  app.openapi(routes.profiles.choose, async (c) => {
    const p = me(c)
    const chosen = await profiles(c).choose(
      p.user.id,
      p.deviceId,
      c.req.valid('param').id,
      c.req.valid('json').pin,
    )
    return c.json(chosen, 200)
  })
}

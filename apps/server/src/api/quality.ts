// SPDX-License-Identifier: AGPL-3.0-only
// Quality over HTTP (ADR 0031): profiles, custom formats and sizes, written by their editors since
// checkpoint 8c, and the parser for checking a release name by hand. Thin handlers over
// @highsea-tv/media/shared, which seeds and stores them, and @highsea-tv/media/movies for the parser.
// Every write announces `settings.updated`, which the editors and the add dialog listen to.
import { routes } from '@highsea-tv/api-contract'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import type { Env } from './guard.ts'

export function registerQuality(app: OpenAPIHono<Env>) {
  const media = (c: Context<Env>) => c.get('runtime').media
  const changed = (c: Context<Env>) => c.get('runtime').events.emit({ topic: 'settings.updated' })

  app.openapi(routes.quality.profiles, (c) => c.json(media(c).profiles.list(), 200))

  // before `{id}`, so `order` isn't read as a profile's id
  app.openapi(routes.quality.orderProfiles, (c) => {
    const saved = media(c).profiles.order(c.req.valid('json').ids)
    changed(c)
    return c.json(saved, 200)
  })

  app.openapi(routes.quality.profile, (c) =>
    c.json(media(c).profiles.get(c.req.valid('param').id), 200),
  )

  app.openapi(routes.quality.addProfile, (c) => {
    const added = media(c).profiles.add(c.req.valid('json'))
    changed(c)
    return c.json(added, 201)
  })

  app.openapi(routes.quality.saveProfile, (c) => {
    const saved = media(c).profiles.save(c.req.valid('param').id, c.req.valid('json'))
    changed(c)
    return c.json(saved, 200)
  })

  app.openapi(routes.quality.removeProfile, (c) => {
    media(c).profiles.remove(c.req.valid('param').id)
    changed(c)
    return c.body(null, 204)
  })

  app.openapi(routes.quality.customFormats, (c) => c.json(media(c).customFormats(), 200))

  app.openapi(routes.quality.addFormat, (c) => {
    const added = media(c).customFormats.add(c.req.valid('json'))
    changed(c)
    return c.json(added, 201)
  })

  app.openapi(routes.quality.saveFormat, (c) => {
    const saved = media(c).customFormats.save(c.req.valid('param').id, c.req.valid('json'))
    changed(c)
    return c.json(saved, 200)
  })

  app.openapi(routes.quality.removeFormat, (c) => {
    media(c).customFormats.remove(c.req.valid('param').id)
    changed(c)
    return c.body(null, 204)
  })

  app.openapi(routes.quality.parse, (c) =>
    c.json(c.get('runtime').movies.parse(c.req.valid('query').title), 200),
  )

  app.openapi(routes.settings.qualitySizes, (c) => c.json(media(c).qualitySizes(), 200))

  app.openapi(routes.settings.saveQualitySizes, (c) => {
    const saved = media(c).qualitySizes.save(c.req.valid('json'))
    changed(c)
    return c.json(saved, 200)
  })
}

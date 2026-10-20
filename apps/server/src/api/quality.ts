// SPDX-License-Identifier: AGPL-3.0-only
// Quality over HTTP (ADR 0031): profiles, custom formats and sizes, read-only until their editors
// (checkpoint 8, decision 3); the language profiles the add dialog offers; and the parser, for
// checking a release name by hand. Thin handlers over @highsea/media/shared, which seeds them, and
// @highsea/media/movies for the parser.
import { routes } from '@highsea/api-contract'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import type { Env } from './guard.ts'

export function registerQuality(app: OpenAPIHono<Env>) {
  const media = (c: Context<Env>) => c.get('runtime').media

  app.openapi(routes.quality.profiles, (c) => c.json(media(c).profiles.list(), 200))

  app.openapi(routes.quality.profile, (c) =>
    c.json(media(c).profiles.get(c.req.valid('param').id), 200),
  )

  app.openapi(routes.quality.customFormats, (c) => c.json(media(c).customFormats(), 200))

  app.openapi(routes.quality.languageProfiles, (c) => c.json(media(c).languageProfiles(), 200))

  app.openapi(routes.quality.parse, (c) =>
    c.json(c.get('runtime').movies.parse(c.req.valid('query').title), 200),
  )

  app.openapi(routes.settings.qualitySizes, (c) => c.json(media(c).qualitySizes(), 200))
}

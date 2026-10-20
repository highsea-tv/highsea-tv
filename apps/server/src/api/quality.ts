// SPDX-License-Identifier: AGPL-3.0-only
// Quality over HTTP (ADR 0031): profiles, custom formats and sizes, read-only until their editors
// (checkpoint 8, decision 3); the language profiles the add dialog offers; and the parser, for
// checking a release name by hand. Thin handlers over @highsea/media-movies, which seeds them.
import { routes } from '@highsea/api-contract'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import type { Env } from './guard.ts'

export function registerQuality(app: OpenAPIHono<Env>) {
  const movies = (c: Context<Env>) => c.get('runtime').movies

  app.openapi(routes.quality.profiles, (c) => c.json(movies(c).profiles.list(), 200))

  app.openapi(routes.quality.profile, (c) =>
    c.json(movies(c).profiles.get(c.req.valid('param').id), 200),
  )

  app.openapi(routes.quality.customFormats, (c) => c.json(movies(c).customFormats(), 200))

  app.openapi(routes.quality.languageProfiles, (c) => c.json(movies(c).languageProfiles(), 200))

  app.openapi(routes.quality.parse, (c) => c.json(movies(c).parse(c.req.valid('query').title), 200))

  app.openapi(routes.settings.qualitySizes, (c) => c.json(movies(c).qualitySizes(), 200))
}

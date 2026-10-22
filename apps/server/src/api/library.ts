// SPDX-License-Identifier: AGPL-3.0-only
// The client API (client-library.md, client-detail.md, client-search.md): what the household's apps
// read, with each person's watch state. Thin handlers over @highsea-tv/media/movies. Search adds TMDB's
// titles only for people who may add them (Manage the library), as the contract says.
import { routes } from '@highsea-tv/api-contract'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { type Env, me } from './guard.ts'

export function registerLibrary(app: OpenAPIHono<Env>) {
  const client = (c: Context<Env>) => c.get('runtime').movies.client

  app.openapi(routes.library.list, (c) =>
    c.json(client(c).list(c.req.valid('query'), me(c).user.id), 200),
  )

  app.openapi(routes.library.item, async (c) => {
    const { type, id } = c.req.valid('param')
    return c.json(await client(c).item(type, id, me(c).user.id), 200)
  })

  app.openapi(routes.library.search, async (c) => {
    const p = me(c)
    const results = await client(c).search(c.req.valid('query').query, {
      userId: p.user.id,
      // the discover section offers requests (ADR 0032); until the request flow exists, nobody
      // can make one, so it's left out for everyone
      mayRequest: false,
    })
    return c.json(results, 200)
  })
}

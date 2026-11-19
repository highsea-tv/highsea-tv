// SPDX-License-Identifier: AGPL-3.0-only
// The client API (client-library.md, client-detail.md, client-search.md): what the household's apps
// read, with each person's watch state. Thin handlers over @highsea-tv/media/movies, and /shows for
// an episode and Search's shows and episodes (Phase 5 B). Search adds TMDB's titles only for people
// who may add them (Manage the library), as the contract says. Someone who can't see the movie
// library gets an empty list and a 404 for its titles (checkpoint 4.1a); someone who can't see the
// shows, a 404 for an episode and no shows in Search.
import { routes } from '@highsea-tv/api-contract'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { type Env, me } from './guard.ts'
import { viewer } from './playback.ts'

export function registerLibrary(app: OpenAPIHono<Env>) {
  const client = (c: Context<Env>) => c.get('runtime').movies.client

  // the movie library is the only one yet: someone who can't see it sees an empty one
  app.openapi(routes.library.list, (c) => {
    const p = me(c)
    const { libraries } = p.user
    if (libraries !== 'all' && !libraries.includes('movies'))
      return c.json({ items: [], next: null, total: 0 }, 200)
    return c.json(client(c).list(c.req.valid('query'), p.profileId), 200)
  })

  app.openapi(routes.library.item, async (c) => {
    const { type, id } = c.req.valid('param')
    if (type === 'episode')
      return c.json(c.get('runtime').shows.client.item(id, viewer(c, type).profileId), 200)
    return c.json(await client(c).item(type, id, viewer(c).profileId), 200)
  })

  app.openapi(routes.library.search, async (c) => {
    const p = me(c)
    const { query } = c.req.valid('query')
    const films = await client(c).search(query, {
      profileId: p.profileId,
      // the discover section offers requests (ADR 0032); until the request flow exists, nobody
      // can make one, so it's left out for everyone
      mayRequest: false,
    })
    const { libraries } = p.user
    if (libraries !== 'all' && !libraries.includes('shows')) return c.json(films, 200)
    return c.json(c.get('runtime').shows.client.search.merge(films, query, p.profileId), 200)
  })
}

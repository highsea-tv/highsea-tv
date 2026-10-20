// SPDX-License-Identifier: AGPL-3.0-only
// TMDB over HTTP: Discover, media pages (a movie's metadata, recommendations, collections, people),
// the image cache, the metadata settings and setup's key check. Thin handlers over
// @highsea/metadata (ADR 0029, 0030); the library's side (`inLibrary`) comes from the movie service.
import { readFile } from 'node:fs/promises'
import { routes } from '@highsea/api-contract'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { actor, type Env, me } from './guard.ts'
import {
  collection,
  discoverMovies,
  discoverPage,
  type InLibrary,
  metadataSettings,
  movieMetadata,
  person,
} from './media-views.ts'
import { setupOpen } from './system.ts'

/**
 * Art never changes at an address: TMDB gives a changed image a new file name. So a year, and
 * `immutable` (RFC 8246) spares the revalidation; `private` keeps shared caches from holding art
 * that's served only to signed-in people (RFC 9111 § 5.2.2.7).
 */
export const IMAGE_CACHE_CONTROL = 'private, max-age=31536000, immutable'

export function registerMetadata(app: OpenAPIHono<Env>) {
  const md = (c: Context<Env>) => c.get('runtime').metadata
  const inLibrary =
    (c: Context<Env>): InLibrary =>
    (ids) =>
      c.get('runtime').movies.inLibrary(ids)
  const audit = (c: Context<Env>, action: string) =>
    c.get('runtime').auth.ctx.audit({
      action,
      actor: actor(me(c)),
      address: c.get('meta').address,
    })

  // ---------------------------------------------------------------- discover

  app.openapi(routes.movies.discover, async (c) => {
    const { query, list, page } = c.req.valid('query')
    const result = query?.trim()
      ? await md(c).discover.search(query, page)
      : await md(c).discover.list(list ?? 'trending', page)
    return c.json(discoverPage(result, inLibrary(c)), 200)
  })

  // ---------------------------------------------------------------- media pages

  app.openapi(routes.metadata.movie, async (c) => {
    const m = await md(c).movie(c.req.valid('param').id)
    return c.json(movieMetadata(m, inLibrary(c)), 200)
  })

  app.openapi(routes.metadata.recommendations, async (c) => {
    const list = await md(c).recommendations(c.req.valid('param').id)
    return c.json(discoverMovies(list, inLibrary(c)), 200)
  })

  app.openapi(routes.metadata.collection, async (c) => {
    const found = await md(c).collection(c.req.valid('param').id)
    return c.json(collection(found, inLibrary(c)), 200)
  })

  app.openapi(routes.metadata.person, async (c) => {
    const found = await md(c).person(c.req.valid('param').id)
    return c.json(person(found, inLibrary(c)), 200)
  })

  // bytes, not JSON: served directly, listed in the document from the contract. The parts are
  // checked by the metadata package (parseImageRef) before anything reaches the disk or TMDB.
  app.get(routes.metadata.image.path.replace(/\{(\w+)\}/g, ':$1'), async (c) => {
    const parts = {
      owner: c.req.param('owner') ?? '',
      ownerId: c.req.param('ownerId') ?? '',
      kind: c.req.param('kind') ?? '',
      size: c.req.param('size') ?? '',
      file: c.req.param('file') ?? '',
    }
    const image = await md(c).images.get(parts)
    // the address names the content (size and TMDB's file name), so it is the validator
    const etag = `"${parts.size}-${parts.file}-${image.bytes}"`
    const headers: Record<string, string> = {
      ETag: etag,
      'Cache-Control': IMAGE_CACHE_CONTROL,
      // MDN, X-Content-Type-Options: the browser keeps to the declared type
      'X-Content-Type-Options': 'nosniff',
    }
    // RFC 9110 § 13.1.2: a weak comparison against every tag the client lists
    const match = c.req.header('if-none-match')
    if (match?.split(',').some((t) => t.trim().replace(/^W\//, '') === etag))
      return c.body(null, 304, headers)
    const bytes = await readFile(image.path)
    return c.body(new Uint8Array(bytes), 200, { ...headers, 'Content-Type': image.contentType })
  })
  app.openAPIRegistry.registerPath(routes.metadata.image)

  // ---------------------------------------------------------------- settings › general › metadata

  app.openapi(routes.settings.metadata, (c) => c.json(metadataSettings(md(c).settings.get()), 200))

  app.openapi(routes.settings.saveMetadata, async (c) => {
    const { key, language, region } = c.req.valid('json')
    // the key first: TMDB refusing it saves nothing (the contract's "unless every field is")
    if (key !== undefined) await md(c).settings.setKey(key)
    if (language !== undefined || region !== undefined) md(c).settings.update({ language, region })
    audit(c, key !== undefined ? 'settings.metadata-key' : 'settings.metadata')
    return c.json(metadataSettings(md(c).settings.get()), 200)
  })

  app.openapi(routes.settings.removeMetadataKey, (c) => {
    const view = md(c).settings.clearKey()
    audit(c, 'settings.metadata-key-removed')
    return c.json(metadataSettings(view), 200)
  })

  // ---------------------------------------------------------------- setup's key step

  app.openapi(routes.setup.checkMetadataKey, async (c) => {
    setupOpen(c)
    await md(c).settings.checkKey(c.req.valid('json').key)
    return c.body(null, 204)
  })
}

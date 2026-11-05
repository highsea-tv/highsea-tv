// SPDX-License-Identifier: AGPL-3.0-only
// The drafted routes (one-client-platform-b.md › B3): shows, music, playlists and profiles are in
// the contract and the OpenAPI document, marked as drafts, and this server answers each 501 in the
// usual error body, after the guard; an episode's address on the films' routes answers the same,
// and public info lists none of their sources, so the apps hide them.
import { afterEach, describe, expect, test } from 'bun:test'
import { CLIENT_SOURCES, DRAFT_KEY, isDraft, routes } from '@highsea-tv/api-contract'
import { createApi } from '../src/api/app.ts'
import { draftRoutes } from '../src/api/drafts.ts'
import { bootRuntime, cleanup, withOwner } from './helpers.ts'

afterEach(cleanup)

const concrete = (path: string) => path.replace(/\{\w+\}/g, 'x1')

describe('drafted routes', () => {
  test('are the shows, music, playlists and profiles groups, and nothing else', () => {
    const groups = new Set(
      Object.entries(routes).flatMap(([group, rs]) =>
        Object.values(rs).some((r) => isDraft(r)) ? [group] : [],
      ),
    )
    expect([...groups].sort()).toEqual(['music', 'playlists', 'profiles', 'shows'])
    for (const g of groups)
      for (const r of Object.values(routes[g as keyof typeof routes]))
        expect(isDraft(r), `${g} ${r.path}`).toBe(true)
  })

  test('answer 501 with the error body, once past the guard', async () => {
    const runtime = await bootRuntime()
    const { token } = await withOwner(runtime)
    const app = createApi(runtime)
    for (const r of draftRoutes()) {
      const path = concrete(r.path)
      const method = r.method.toUpperCase()
      // signed out: the guard answers first
      expect((await app.request(path, { method })).status, `${method} ${path}`).toBe(401)
      const res = await app.request(`http://localhost${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: method === 'GET' ? undefined : '{}',
      })
      // a body the draft's schema refuses is 400 first, as on any route; 501 otherwise
      expect([400, 501], `${method} ${path}`).toContain(res.status)
      if (res.status === 501)
        expect(await res.json()).toEqual({
          error: {
            code: 'unavailable',
            message: 'This server doesn’t serve that yet.',
            details: { reason: 'draft' },
          },
        })
    }
  })

  test('an episode’s address on the films’ routes answers 501; a film’s is unchanged', async () => {
    const runtime = await bootRuntime()
    const { token } = await withOwner(runtime)
    const app = createApi(runtime)
    const get = (path: string) =>
      app.request(`http://localhost${path}`, { headers: { authorization: `Bearer ${token}` } })
    const episode = await get('/api/v1/items/episode/62085')
    expect(episode.status).toBe(501)
    expect(((await episode.json()) as { error: { details: unknown } }).error.details).toEqual({
      reason: 'draft',
    })
    expect((await get('/api/v1/items/episode/62085/prefs')).status).toBe(501)
    // a film that isn't here is still the films' 404
    expect((await get('/api/v1/items/movie/603')).status).toBe(404)
  })

  test('are marked in the OpenAPI document, and public info lists none of their sources', async () => {
    const runtime = await bootRuntime()
    const app = createApi(runtime)
    const doc = (await (await app.request('/api/v1/openapi.json')).json()) as {
      paths: Record<string, Record<string, Record<string, unknown>>>
    }
    for (const r of draftRoutes()) {
      const op = doc.paths[r.path]?.[r.method]
      expect(op?.[DRAFT_KEY], r.path).toBe(true)
      expect(Object.keys(op?.responses as object), r.path).toContain('501')
    }
    const info = (await (await app.request('/api/v1/system/info/public')).json()) as {
      sources: string[]
    }
    for (const s of CLIENT_SOURCES) expect(info.sources).not.toContain(s)
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
// Fakes for the import lists, answering through the fetch seam (ADR 0029) so tests and the dev
// server never reach the network:
// - Trakt: the routes highsea uses, in the shapes Trakt's API documentation gives
//   (https://trakt.docs.apiary.io/), the device flow included; its Client ID and secret are made up
//   here, never highsea's real application;
// - generic lists: any address registered on the fake answers its JSON.
// The movies are the recorded TMDB ones (the Blender films and the silent classics).
import type { Fetch } from '@highsea/core'

export const FAKE_TRAKT_CLIENT_ID = 'fake-trakt-client-id-0001'
export const FAKE_TRAKT_CLIENT_SECRET = 'fake-trakt-client-secret-0001'
export const FAKE_TRAKT_USER_CODE = '5055CC52'

type Movie = {
  title: string
  year: number
  ids: { trakt: number; slug: string; imdb: string | null; tmdb: number | null }
}

const movie = (title: string, year: number, tmdb: number | null, imdb: string | null): Movie => ({
  title,
  year,
  ids: { trakt: tmdb ?? 1, slug: title.toLowerCase().replace(/\W+/g, '-'), imdb, tmdb },
})

export const FAKE_MOVIES = {
  sintel: movie('Sintel', 2010, 45745, 'tt1727587'),
  bunny: movie('Big Buck Bunny', 2008, 10378, 'tt1254207'),
  tears: movie('Tears of Steel', 2012, 133701, 'tt2285752'),
  metropolis: movie('Metropolis', 1927, 19, 'tt0017136'),
  nosferatu: movie('Nosferatu', 1922, 653, 'tt0013442'),
  /** Only an IMDb id: matched through TMDB's Find. */
  sintelByImdb: movie('Sintel', 2010, null, 'tt1727587'),
  /** Neither id TMDB knows. */
  unknown: movie('A film nobody has heard of', 1999, null, 'tt0000000'),
}

export type FakeTraktState = {
  trending: Movie[]
  popular: Movie[]
  anticipated: Movie[]
  /** `user/list` → its movies; `private` lists answer only with the account's token. */
  lists: Map<string, { movies: Movie[]; private?: boolean }>
  watchlist: Movie[]
  username: string
  /** What the next device-token poll answers: 400 waiting, 200 entered, 418 denied. */
  device: 'pending' | 'approved' | 'denied'
  /** The tokens handed out and still valid. */
  tokens: Set<string>
  revoked: string[]
  /** Every request, `METHOD path`, for assertions. */
  requests: string[]
  /** Answer every request with this status, to test failures. */
  failWith: number | null
}

export function fakeTraktState(): FakeTraktState {
  const m = FAKE_MOVIES
  return {
    trending: [m.sintel, m.bunny],
    popular: [m.metropolis, m.nosferatu, m.sintel],
    anticipated: [m.tears],
    lists: new Map([
      ['sean/blender', { movies: [m.sintel, m.bunny, m.tears, m.sintelByImdb, m.unknown] }],
      ['highsea-owner/secret', { movies: [m.metropolis], private: true }],
    ]),
    watchlist: [m.nosferatu, m.metropolis],
    username: 'highsea-owner',
    device: 'pending',
    tokens: new Set(),
    revoked: [],
    requests: [],
    failWith: null,
  }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

/**
 * A fetch that answers `api.trakt.tv` and the generic lists registered in `generic`, and passes
 * everything else to `next` (the TMDB replay in tests), or fails.
 */
export function createFakeLists(options: { next?: Fetch } = {}) {
  const trakt = fakeTraktState()
  const generic = new Map<string, { status?: number; body: unknown }>()
  let issued = 0

  function paged(items: Movie[], url: URL, wrap: (m: Movie) => unknown) {
    const limit = Number(url.searchParams.get('limit') ?? '10')
    const page = Number(url.searchParams.get('page') ?? '1')
    const pages = Math.max(1, Math.ceil(items.length / limit))
    return json(items.slice((page - 1) * limit, page * limit).map(wrap), 200, {
      'x-pagination-page': String(page),
      'x-pagination-limit': String(limit),
      'x-pagination-page-count': String(pages),
      'x-pagination-item-count': String(items.length),
    })
  }

  async function answerTrakt(url: URL, init: RequestInit | undefined): Promise<Response> {
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = url.pathname
    trakt.requests.push(`${method} ${path}`)
    if (trakt.failWith) return json({ error: 'fake failure' }, trakt.failWith)
    const h = new Headers(init?.headers)
    if (h.get('trakt-api-key') !== FAKE_TRAKT_CLIENT_ID || h.get('trakt-api-version') !== '2')
      return json({ error: 'invalid api key' }, 403)
    const bearer = h.get('authorization')?.replace(/^Bearer /, '') ?? null
    const authed = !!bearer && trakt.tokens.has(bearer)
    const body =
      method === 'POST' ? (JSON.parse(String(init?.body ?? '{}')) as Record<string, string>) : {}
    const secretOk = body.client_secret === FAKE_TRAKT_CLIENT_SECRET
    const tokens = () => {
      issued++
      const access = `fake-access-${issued}`
      trakt.tokens.add(access)
      return json({
        access_token: access,
        token_type: 'bearer',
        expires_in: 7 * 24 * 60 * 60,
        refresh_token: `fake-refresh-${issued}`,
        scope: 'public',
        created_at: 0,
      })
    }

    if (method === 'POST' && path === '/oauth/device/code')
      return json({
        device_code: 'fake-device-code',
        user_code: FAKE_TRAKT_USER_CODE,
        verification_url: 'https://trakt.tv/activate',
        expires_in: 600,
        interval: 5,
      })
    if (method === 'POST' && path === '/oauth/device/token') {
      if (!secretOk || body.code !== 'fake-device-code') return json({}, 404)
      if (trakt.device === 'pending') return json({}, 400)
      if (trakt.device === 'denied') return json({}, 418)
      return tokens()
    }
    if (method === 'POST' && path === '/oauth/token') {
      if (!secretOk || !body.refresh_token?.startsWith('fake-refresh-')) return json({}, 401)
      return tokens()
    }
    if (method === 'POST' && path === '/oauth/revoke') {
      trakt.revoked.push(body.token ?? '')
      trakt.tokens.delete(body.token ?? '')
      return json({})
    }
    if (method !== 'GET') return json({ error: 'not found' }, 404)
    if (path === '/users/settings')
      return authed ? json({ user: { username: trakt.username } }) : json({}, 401)
    if (path === '/movies/popular') return paged(trakt.popular, url, (m) => m)
    if (path === '/movies/trending')
      return paged(trakt.trending, url, (m) => ({ watchers: 10, movie: m }))
    if (path === '/movies/anticipated')
      return paged(trakt.anticipated, url, (m) => ({ list_count: 10, movie: m }))
    if (path === '/sync/watchlist/movies')
      return authed
        ? paged(trakt.watchlist, url, (m) => ({ rank: 1, type: 'movie', movie: m }))
        : json({}, 401)
    const list = path.match(/^\/users\/([^/]+)\/lists\/([^/]+)\/items\/movies$/)
    if (list) {
      const found = trakt.lists.get(
        `${decodeURIComponent(list[1] ?? '')}/${decodeURIComponent(list[2] ?? '')}`,
      )
      if (!found || (found.private && !authed)) return json({}, 404)
      return paged(found.movies, url, (m) => ({ rank: 1, type: 'movie', movie: m }))
    }
    return json({ error: 'not found' }, 404)
  }

  const fetch: Fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.hostname === 'api.trakt.tv') return answerTrakt(url, init)
    const g = generic.get(url.toString())
    if (g) return json(g.body, g.status ?? 200)
    if (options.next) return options.next(input, init)
    throw new TypeError(`fetch failed: the fake lists have nothing at ${url.origin}`)
  }

  return { fetch, trakt, generic }
}

export type FakeLists = ReturnType<typeof createFakeLists>

/** A generic list in the StevenLu format, with the recorded movies. */
export const GENERIC_LIST = [
  { title: 'Sintel', imdb_id: 'tt1727587' },
  { title: 'Big Buck Bunny', imdb_id: 'tt1254207', tmdb_id: 10378 },
  { title: 'Not on TMDB', imdb_id: 'tt0000000' },
  { title: 'A show', imdb_id: 'tt0903747', mediatype: 'show' },
  { title: 'No ids at all' },
]

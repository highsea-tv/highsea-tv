// SPDX-License-Identifier: AGPL-3.0-only
// Trakt as an import list source (checkpoint 8a, the owner's answers 4 and 5), from Trakt's API
// documentation (https://trakt.docs.apiary.io/, now also at https://docs.trakt.tv):
// - every request carries highsea's application: `trakt-api-key` (its Client ID),
//   `trakt-api-version: 2`, JSON, and a `User-Agent` naming the app and its version, as the docs ask;
// - charts (trending, popular, anticipated) and public lists need only that; the owner's watchlist
//   and private lists need their account, connected once with the device flow (Authentication ›
//   Devices): a code to enter at trakt.tv/activate, polled at the interval Trakt gives until it's
//   entered (200), still waiting (400, 429), or no good (404, 409, 410, 418);
// - the account's tokens are sealed in one settings row, refreshed before they run out (`expires_in`;
//   the docs give 7 days) with the refresh token, and revoked when the owner disconnects.
// A build without highsea's Client ID offers Trakt as unavailable, with a line saying why.
import { AppError, type Clock, type Fetch, type Sealer } from '@highsea/core'
import { type Db, readSetting, schema, writeSetting } from '@highsea/db'
import { eq } from 'drizzle-orm'
import {
  CHART_SIZE,
  idOf,
  imdbIdOf,
  jsonOf,
  type ListEntry,
  MAX_PAGES,
  request,
} from '../shared/index.ts'

export const TRAKT_API = 'https://api.trakt.tv'
/** The settings row holding the connected account, its tokens sealed. */
export const TRAKT_ACCOUNT_SETTING = 'lists.trakt'
/** Trakt's out-of-band redirect, for apps without a web callback such as the device flow. */
const OOB = 'urn:ietf:wg:oauth:2.0:oob'
/** Tokens are refreshed when they have less than this left. */
const REFRESH_BEFORE_MS = 24 * 60 * 60 * 1000
/** Items per page when reading a list. */
const PAGE_SIZE = 100

export type TraktListSource = 'list' | 'trending' | 'popular' | 'anticipated' | 'watchlist'

type TraktMovie = {
  title?: string
  year?: number | null
  ids?: { trakt?: number; slug?: string; imdb?: string | null; tmdb?: number | null }
}

type Account = {
  username: string | null
  access: string | null
  refresh: string | null
  expiresAt: number
}

type TokenAnswer = {
  access_token: string
  refresh_token: string
  expires_in: number
  created_at?: number
}

type Pending = { deviceCode: string; expiresAt: number; interval: number }

export type TraktPollState = 'pending' | 'connected' | 'expired' | 'denied'

/**
 * A Trakt list's user and list from what the owner pasted:
 * `https://trakt.tv/users/sean/lists/star-wars-in-machete-order`, or `sean/star-wars-in-machete-order`.
 */
export function traktListRef(value: string): { user: string; list: string } | null {
  const s = value.trim()
  const short = s.match(/^([\w.-]+)\/([\w.-]+)$/)
  if (short?.[1] && short[2]) return { user: short[1], list: short[2] }
  try {
    const url = new URL(s)
    if (!/(^|\.)trakt\.tv$/i.test(url.hostname)) return null
    const m = url.pathname.match(/^\/users\/([^/]+)\/lists\/([^/?#]+)/)
    return m?.[1] && m[2]
      ? { user: decodeURIComponent(m[1]), list: decodeURIComponent(m[2]) }
      : null
  } catch {
    return null
  }
}

export function createTrakt(deps: {
  db: Db
  clock: Clock
  sealer: Sealer
  fetch: Fetch
  clientId: string | undefined
  clientSecret: string | undefined
  /** `highsea/0.1.0`, for the User-Agent. */
  userAgent: string
  baseUrl?: string
}) {
  const { db, clock, sealer, fetch } = deps
  const base = deps.baseUrl ?? TRAKT_API
  let pending: Pending | null = null

  const unavailable = () =>
    new AppError(
      'unavailable',
      'This build of highsea doesn’t have its Trakt application, so Trakt lists can’t be used.',
      { reason: 'trakt-unavailable' },
    )

  function clientId(): string {
    if (!deps.clientId) throw unavailable()
    return deps.clientId
  }

  function clientSecret(): string {
    if (!deps.clientSecret) throw unavailable()
    return deps.clientSecret
  }

  const empty: Account = { username: null, access: null, refresh: null, expiresAt: 0 }
  const account = () => readSetting<Account>(db, TRAKT_ACCOUNT_SETTING, empty)

  function save(a: Account) {
    writeSetting(db, TRAKT_ACCOUNT_SETTING, a, clock.now())
  }

  function headers(token?: string | null): Record<string, string> {
    return {
      'content-type': 'application/json',
      'user-agent': deps.userAgent,
      'trakt-api-key': clientId(),
      'trakt-api-version': '2',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    }
  }

  async function post(path: string, body: Record<string, unknown>) {
    return request(fetch, 'Trakt', `${base}${path}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    })
  }

  function keep(answer: TokenAnswer, username: string | null) {
    save({
      username,
      access: sealer.seal(answer.access_token),
      refresh: sealer.seal(answer.refresh_token),
      expiresAt: clock.now() + answer.expires_in * 1000,
    })
  }

  /** The connected account's access token, refreshed when it's nearly out; null when none is. */
  async function token(): Promise<string | null> {
    const a = account()
    if (!a.access || !a.refresh) return null
    if (a.expiresAt - clock.now() > REFRESH_BEFORE_MS) return sealer.open(a.access)
    const res = await post('/oauth/token', {
      refresh_token: sealer.open(a.refresh),
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: OOB,
      grant_type: 'refresh_token',
    })
    if (res.status === 400 || res.status === 401) {
      save(empty)
      throw new AppError(
        'unavailable',
        'Trakt no longer accepts highsea’s connection. Connect your account again.',
        { reason: 'trakt-disconnected' },
      )
    }
    if (!res.ok)
      throw new AppError('unavailable', `Trakt answered ${res.status}.`, { reason: 'bad-answer' })
    keep(await jsonOf<TokenAnswer>('Trakt', res), a.username)
    return sealer.open(account().access ?? '')
  }

  async function get<T>(path: string, auth: boolean) {
    const t = auth ? await token() : null
    const res = await request(fetch, 'Trakt', `${base}${path}`, { headers: headers(t) })
    if (res.status === 404)
      throw new AppError('invalid', 'Trakt has no such list, or it’s private.', {
        field: 'settings.list',
        reason: 'not-found',
      })
    if (res.status === 401)
      throw new AppError('unavailable', 'Trakt needs your account for this. Connect it first.', {
        reason: 'trakt-account',
      })
    if (!res.ok)
      throw new AppError('unavailable', `Trakt answered ${res.status}.`, { reason: 'bad-answer' })
    const pages = Number(res.headers.get('x-pagination-page-count') ?? '1')
    return { body: await jsonOf<T>('Trakt', res), pages: Number.isFinite(pages) ? pages : 1 }
  }

  /** Every page of a paginated list of `{ movie }` items. */
  async function paged(path: string, auth: boolean): Promise<TraktMovie[]> {
    const out: TraktMovie[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const { body, pages } = await get<{ movie?: TraktMovie }[]>(
        `${path}?page=${page}&limit=${PAGE_SIZE}`,
        auth,
      )
      for (const item of body) if (item.movie) out.push(item.movie)
      if (page >= pages || body.length === 0) break
    }
    return out
  }

  const toEntry = (m: TraktMovie): ListEntry | null => {
    const tmdbId = idOf(m.ids?.tmdb)
    const imdbId = imdbIdOf(m.ids?.imdb)
    if (!tmdbId && !imdbId) return null
    return { tmdbId, imdbId, title: m.title ?? imdbId ?? '', year: idOf(m.year) }
  }

  async function read(settings: {
    source: TraktListSource
    list?: string | undefined
  }): Promise<ListEntry[]> {
    let movies: TraktMovie[]
    switch (settings.source) {
      case 'popular':
        movies = (await get<TraktMovie[]>(`/movies/popular?limit=${CHART_SIZE}`, false)).body
        break
      case 'trending':
      case 'anticipated':
        movies = (
          await get<{ movie?: TraktMovie }[]>(
            `/movies/${settings.source}?limit=${CHART_SIZE}`,
            false,
          )
        ).body.flatMap((i) => (i.movie ? [i.movie] : []))
        break
      case 'watchlist':
        if (!account().access)
          throw new AppError('invalid', 'Connect your Trakt account to use your watchlist.', {
            field: 'settings.source',
            reason: 'trakt-account',
          })
        movies = await paged('/sync/watchlist/movies', true)
        break
      case 'list': {
        const ref = traktListRef(settings.list ?? '')
        if (!ref)
          throw new AppError('invalid', 'Use the list’s address on trakt.tv.', {
            field: 'settings.list',
            reason: 'bad-list',
          })
        // the account's token goes along when there is one, so its private lists work too
        movies = await paged(
          `/users/${encodeURIComponent(ref.user)}/lists/${encodeURIComponent(ref.list)}/items/movies`,
          !!account().access,
        )
        break
      }
    }
    return movies.flatMap((m) => toEntry(m) ?? [])
  }

  return {
    read,
    status() {
      return { available: !!deps.clientId, account: account().username }
    },
    /** Starts the device flow: the code the owner enters at Trakt's address. */
    async connect() {
      clientSecret()
      const res = await post('/oauth/device/code', { client_id: clientId() })
      if (!res.ok)
        throw new AppError('unavailable', `Trakt answered ${res.status}.`, { reason: 'bad-answer' })
      const code = await jsonOf<{
        device_code: string
        user_code: string
        verification_url: string
        expires_in: number
        interval: number
      }>('Trakt', res)
      const expiresAt = clock.now() + code.expires_in * 1000
      pending = { deviceCode: code.device_code, expiresAt, interval: code.interval }
      return {
        userCode: code.user_code,
        verificationUrl: code.verification_url,
        expiresAt: new Date(expiresAt).toISOString(),
        interval: code.interval,
      }
    },
    /** Whether the code has been entered; on success the account's tokens are kept. */
    async poll(): Promise<TraktPollState> {
      if (!pending)
        throw new AppError('not-found', 'There’s no Trakt code waiting. Start again.', {
          reason: 'no-code',
        })
      if (clock.now() >= pending.expiresAt) {
        pending = null
        return 'expired'
      }
      const res = await post('/oauth/device/token', {
        code: pending.deviceCode,
        client_id: clientId(),
        client_secret: clientSecret(),
      })
      if (res.status === 400 || res.status === 429) return 'pending'
      if (res.status === 418) {
        pending = null
        return 'denied'
      }
      if (!res.ok) {
        pending = null
        return 'expired'
      }
      const answer = await jsonOf<TokenAnswer>('Trakt', res)
      pending = null
      keep(answer, null)
      // the account's name, for Settings; a failure here leaves it connected without one
      try {
        const { body } = await get<{ user?: { username?: string } }>('/users/settings', true)
        save({ ...account(), username: body.user?.username ?? null })
      } catch {}
      return 'connected'
    },
    /** Forgets the account, revoking its token with Trakt where it can. */
    async disconnect() {
      const a = account()
      pending = null
      db.delete(schema.settings).where(eq(schema.settings.key, TRAKT_ACCOUNT_SETTING)).run()
      if (!a.access || !deps.clientId || !deps.clientSecret) return
      try {
        await post('/oauth/revoke', {
          token: sealer.open(a.access),
          client_id: deps.clientId,
          client_secret: deps.clientSecret,
        })
      } catch {}
    },
  }
}

export type Trakt = ReturnType<typeof createTrakt>

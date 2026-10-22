// SPDX-License-Identifier: AGPL-3.0-only
// The TMDB adapter (ADR 0029): every request goes through the `Fetch` it's given, with the owner's
// credential, a small concurrency limit, and retries on 429 and 5xx.
//
// - Credentials: TMDB issues an API key (v3, sent as the `api_key` query parameter) and an API
//   Read Access Token (sent as `Authorization: Bearer …`), and documents both
//   (https://developer.themoviedb.org/docs/authentication-application). The token is a JWT, so the
//   adapter tells them apart by shape.
// - Rate limits: TMDB's limit sits around 40 requests a second, and it answers 429 above it (https://developer.themoviedb.org/docs/rate-limiting). Four requests at a time stays
//   far below it. A 429 or 5xx is retried after `Retry-After` when TMDB sends one (the docs don't
//   say whether it does), otherwise with exponential backoff.
import { AppError, type Clock, type Fetch, type Logger, retryAfterMs } from '@highsea-tv/core'

export const TMDB_API = 'https://api.themoviedb.org'

/** TMDB's own error codes ([Errors](https://developer.themoviedb.org/docs/errors)). */
export const TMDB_STATUS = { invalidKey: 7, notFound: 34, overLimit: 25 } as const

export type Credential = { kind: 'api-key'; value: string } | { kind: 'token'; value: string }

/** A Read Access Token is a JWT: three base64url parts, the first a JSON header (`eyJ…`). */
export function credentialOf(raw: string): Credential {
  const value = raw.trim()
  return /^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(value)
    ? { kind: 'token', value }
    : { kind: 'api-key', value }
}

/** TMDB answered with an error status. `status` is HTTP's; `code` is TMDB's `status_code`. */
export class TmdbHttpError extends Error {
  readonly status: number
  readonly code: number | null
  constructor(status: number, code: number | null, message: string) {
    super(message)
    this.name = 'TmdbHttpError'
    this.status = status
    this.code = code
  }
}

export const isTmdbNotFound = (e: unknown) =>
  e instanceof TmdbHttpError && (e.status === 404 || e.code === TMDB_STATUS.notFound)

export type Query = Record<string, string | number | boolean | undefined>

export type TmdbClientOptions = {
  fetch: Fetch
  clock: Clock
  logger: Logger
  /** Waits `ms`; tests pass one that moves a fake clock. */
  sleep?: (ms: number) => Promise<void>
  /** Requests in flight at once. */
  concurrency?: number
  /** Tries per request, the first included. */
  attempts?: number
  /** Longest wait between tries, whatever `Retry-After` asks. */
  maxWaitMs?: number
}

export type TmdbClient = ReturnType<typeof createTmdbClient>

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createTmdbClient({
  fetch,
  clock,
  logger,
  sleep = realSleep,
  concurrency = 4,
  attempts = 4,
  maxWaitMs = 60_000,
}: TmdbClientOptions) {
  let active = 0
  const waiting: (() => void)[] = []

  async function slot<T>(work: () => Promise<T>): Promise<T> {
    if (active >= concurrency) await new Promise<void>((resolve) => waiting.push(resolve))
    active++
    try {
      return await work()
    } finally {
      active--
      waiting.shift()?.()
    }
  }

  /** A response worth trying again: rate limited, or TMDB's side failed. */
  const retryable = (status: number) => status === 429 || status >= 500

  async function send(url: URL, headers: Record<string, string>): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      let res: Response
      try {
        res = await slot(() => fetch(url, { headers, signal: AbortSignal.timeout(20_000) }))
      } catch (e) {
        // fetch rejects with a TypeError on network errors (WHATWG Fetch § 4.5), and a timeout
        // aborts it. Anything else (a replay with no recording) is a bug to surface, not to retry.
        const network =
          e instanceof TypeError || (e instanceof DOMException && e.name === 'TimeoutError')
        if (!network) throw e
        if (attempt >= attempts)
          throw new AppError('unavailable', 'TMDB isn’t answering. Try again in a moment.', {
            reason: 'tmdb-unreachable',
          })
        await sleep(backoff(attempt))
        continue
      }
      if (!retryable(res.status) || attempt >= attempts) return res
      const asked = retryAfterMs(res.headers.get('retry-after'), clock.now())
      const wait = Math.min(asked ?? backoff(attempt), maxWaitMs)
      logger.warn('TMDB asked to wait', { status: res.status, attempt, waitMs: wait })
      await res.body?.cancel()
      await sleep(wait)
    }
  }

  /** 1s, 2s, 4s… */
  const backoff = (attempt: number) => Math.min(1000 * 2 ** (attempt - 1), maxWaitMs)

  async function json<T>(credential: Credential, path: string, query: Query = {}): Promise<T> {
    const url = new URL(path, TMDB_API)
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, `${v}`)
    const headers: Record<string, string> = { accept: 'application/json' }
    if (credential.kind === 'token') headers.authorization = `Bearer ${credential.value}`
    else url.searchParams.set('api_key', credential.value)
    const res = await send(url, headers)
    const body = (await res.json().catch(() => null)) as
      | (T & { status_code?: number; status_message?: string })
      | null
    if (!res.ok) {
      const code = typeof body?.status_code === 'number' ? body.status_code : null
      if (res.status === 429)
        throw new AppError('rate-limited', 'TMDB is busy. Try again in a moment.', {
          reason: 'tmdb-rate-limited',
        })
      if (res.status >= 500)
        throw new AppError('unavailable', 'TMDB isn’t answering. Try again in a moment.', {
          reason: 'tmdb-unreachable',
        })
      throw new TmdbHttpError(res.status, code, body?.status_message ?? res.statusText)
    }
    if (body === null) throw new AppError('unavailable', 'TMDB sent something unreadable.')
    return body
  }

  /** An image from TMDB's image server. Images need no credential. */
  async function image(url: string): Promise<Response> {
    return send(new URL(url), { accept: 'image/*' })
  }

  return { json, image }
}

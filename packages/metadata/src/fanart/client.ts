// SPDX-License-Identifier: AGPL-3.0-only
// The fanart.tv adapter (HT-74, ADR 0070): every request goes through the `Fetch` the metadata
// service is given (ADR 0029's seam), never from a client. Following fanart.tv's API documentation
// (https://api.fanart.tv):
//
// - Version 3.2, the one it recommends, at `https://webservice.fanart.tv/v3.2/…`.
// - Keys as headers: the project key as `api-key`, the owner's personal key as `client-key`. "When
//   both keys are provided, the personal key determines the access tier"; a personal key alone
//   works too. Headers keep the keys out of addresses and logs.
// - A 404 means fanart.tv has nothing for the id (v3.1 and v3.2 answer 404, not v3's `{}`).
// - Rate limits are "very rarely applied"; a 429 carries `Retry-After`, which is honoured, with
//   exponential backoff otherwise, as the docs advise.
//
// fanart.tv is a second source, never a dependency: a request waits at most 10 seconds, is tried
// twice at most, and after a failure the adapter rests for a quarter of an hour, answering
// "unavailable" at once, so a film's metadata is never slowed by it. The rest is in memory only.
import { AppError, type Clock, type Fetch, type Logger, retryAfterMs } from '@highsea-tv/core'

export const FANART_API = 'https://webservice.fanart.tv'
export const FANART_VERSION = 'v3.2'
/** Where fanart.tv's images are (its docs' "Image URLs and Previews"). */
export const FANART_ASSETS = 'assets.fanart.tv'

/** The reason in an AppError's details when fanart.tv can't be asked now. */
export const FANART_UNAVAILABLE = 'fanart-unavailable'
/** fanart.tv refused the key (401). */
export const FANART_KEY_REJECTED = 'fanart-key-rejected'

export type FanartKeys = { project: string | null; personal: string | null }

const unavailable = () =>
  new AppError('unavailable', 'fanart.tv isn’t answering. Try again later.', {
    reason: FANART_UNAVAILABLE,
  })

export const keyRejected = () =>
  new AppError('invalid', 'fanart.tv didn’t accept that key. Copy it again from fanart.tv.', {
    reason: FANART_KEY_REJECTED,
  })

export type FanartClientOptions = {
  fetch: Fetch
  clock: Clock
  logger: Logger
  sleep?: (ms: number) => Promise<void>
  /** Requests in flight at once. */
  concurrency?: number
  /** How long one request may take. */
  timeoutMs?: number
  /** How long to leave fanart.tv alone after a failure. */
  restMs?: number
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function createFanartClient({
  fetch,
  clock,
  logger,
  sleep = realSleep,
  concurrency = 2,
  timeoutMs = 10_000,
  restMs = 15 * 60_000,
}: FanartClientOptions) {
  let active = 0
  const waiting: (() => void)[] = []
  let restingUntil = 0

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

  function rest(why: string) {
    restingUntil = clock.now() + restMs
    logger.warn('fanart.tv isn’t answering; leaving it for a while', { why, restMs })
  }

  const headersOf = (keys: FanartKeys) => {
    const h: Record<string, string> = { accept: 'application/json' }
    if (keys.project) h['api-key'] = keys.project
    if (keys.personal) h['client-key'] = keys.personal
    return h
  }

  /**
   * One title's images: the answer, or null when fanart.tv has nothing for it (404). Throws
   * `fanart-unavailable` when it can't be asked (resting, down, slow) and `fanart-key-rejected`
   * on a 401.
   */
  async function get<T>(path: string, keys: FanartKeys): Promise<T | null> {
    if (clock.now() < restingUntil) throw unavailable()
    const url = new URL(`/${FANART_VERSION}/${path}`, FANART_API)
    for (let attempt = 1; ; attempt++) {
      let res: Response
      try {
        res = await slot(() =>
          fetch(url, { headers: headersOf(keys), signal: AbortSignal.timeout(timeoutMs) }),
        )
      } catch (e) {
        // WHATWG Fetch rejects with a TypeError on network errors; a timeout aborts it. Anything
        // else (a replay with nothing for it) is a bug to surface.
        const network =
          e instanceof TypeError ||
          (e instanceof DOMException && (e.name === 'TimeoutError' || e.name === 'AbortError'))
        if (!network) throw e
        rest((e as Error).name)
        throw unavailable()
      }
      if (res.status === 404) {
        await res.body?.cancel()
        return null
      }
      if (res.status === 401) {
        await res.body?.cancel()
        throw keyRejected()
      }
      if (res.status === 429 || res.status >= 500) {
        await res.body?.cancel()
        if (attempt >= 2) {
          rest(`HTTP ${res.status}`)
          throw unavailable()
        }
        const asked = retryAfterMs(res.headers.get('retry-after'), clock.now())
        await sleep(Math.min(asked ?? 2_000, 30_000))
        continue
      }
      if (!res.ok) {
        await res.body?.cancel()
        logger.warn('fanart.tv answered with an error', { status: res.status })
        throw unavailable()
      }
      const body = (await res.json().catch(() => null)) as T | null
      if (body === null || typeof body !== 'object') throw unavailable()
      return body
    }
  }

  /** An image from fanart.tv's asset server, which needs no key; only its own host is asked. */
  async function image(url: string): Promise<Response> {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.hostname !== FANART_ASSETS)
      throw new AppError('not-found', 'There’s no image at that address.')
    return slot(() =>
      fetch(u, { headers: { accept: 'image/*' }, signal: AbortSignal.timeout(20_000) }),
    )
  }

  return { get, image, resting: () => clock.now() < restingUntil }
}

export type FanartClient = ReturnType<typeof createFanartClient>

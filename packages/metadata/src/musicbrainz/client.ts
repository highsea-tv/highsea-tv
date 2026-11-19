// SPDX-License-Identifier: AGPL-3.0-only
// MusicBrainz and the Cover Art Archive (Phase 5 D, ADR 0065): every request goes through the
// `Fetch` the metadata service is given (ADR 0029's seam), never from a client. Following their
// documentation:
//
// - MusicBrainz's web service is `https://musicbrainz.org/ws/2/`, a lookup being
//   `/<entity>/<mbid>?inc=…`, with `fmt=json` for JSON (https://musicbrainz.org/doc/MusicBrainz_API).
// - Its rate limit: "Currently that rate is (on average) 1 request per second" per address, and a
//   client should send a User-Agent of "Application name/<version> ( contact-url )"
//   (https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting). Over the limit it answers 503.
//   So requests go one at a time, a second apart, as `highsea/<version> ( https://highsea.tv )`:
//   the project's name and site, never the owner's details.
// - The Cover Art Archive's `/release-group/<mbid>` lists the cover its release group chose, with
//   `front`, `image` and `thumbnails`, and answers 404 when there's none
//   (https://musicbrainz.org/doc/Cover_Art_Archive/API). It names no rate limit; it's asked at the
//   same pace through its own queue.
//
// Like fanart.tv (ADR 0070), both are extras, never a dependency: a request waits at most 15
// seconds, and after a failure the client rests for a quarter of an hour, answering "unavailable"
// at once, so a scan from the tags is never slowed by them.
import { AppError, type Clock, type Fetch, type Logger, retryAfterMs } from '@highsea-tv/core'

export const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2/'
export const COVER_ART_API = 'https://coverartarchive.org/'
export const HIGHSEA_SITE = 'https://highsea.tv'

/** The reason in an AppError's details when MusicBrainz or the Cover Art Archive can't be asked. */
export const MUSICBRAINZ_UNAVAILABLE = 'musicbrainz-unavailable'

/** `highsea/0.4.7 ( https://highsea.tv )`: MusicBrainz's documented User-Agent shape. */
export const musicBrainzUserAgent = (version: string) => `highsea/${version} ( ${HIGHSEA_SITE} )`

/** A MusicBrainz id: a UUID, as MusicBrainz writes them. Anything else is never sent. */
export const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** What each lookup asks MusicBrainz to include (the API's `inc` per entity). */
export const MUSICBRAINZ_INC = {
  artist: 'genres',
  'release-group': 'genres+artist-credits',
  release: 'release-groups+labels+genres',
} as const
export type MusicBrainzEntity = keyof typeof MUSICBRAINZ_INC

/** The address of a lookup, as the client asks it and the recordings key it. */
export function musicBrainzUrl(entity: MusicBrainzEntity, mbid: string): URL {
  const url = new URL(`${entity}/${mbid}`, MUSICBRAINZ_API)
  url.searchParams.set('inc', MUSICBRAINZ_INC[entity])
  url.searchParams.set('fmt', 'json')
  return url
}

export const coverArtUrl = (releaseGroupId: string) =>
  new URL(`release-group/${releaseGroupId}`, COVER_ART_API)

const unavailable = () =>
  new AppError('unavailable', 'MusicBrainz isn’t answering. Try again later.', {
    reason: MUSICBRAINZ_UNAVAILABLE,
  })

export type MusicBrainzClientOptions = {
  fetch: Fetch
  clock: Clock
  logger: Logger
  /** highsea's version, for the User-Agent. */
  version: string
  sleep?: (ms: number) => Promise<void>
  /** The least time between two requests to one service: MusicBrainz's one a second. */
  spacingMs?: number
  timeoutMs?: number
  /** How long to leave both alone after a failure. */
  restMs?: number
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** One request at a time, `spacingMs` after the last one started. */
function pacer(clock: Clock, sleep: (ms: number) => Promise<void>, spacingMs: number) {
  let tail: Promise<unknown> = Promise.resolve()
  let last = Number.NEGATIVE_INFINITY
  return <T>(work: () => Promise<T>): Promise<T> => {
    const run = tail.then(async () => {
      const wait = last + spacingMs - clock.now()
      if (wait > 0) await sleep(wait)
      last = clock.now()
      return work()
    })
    tail = run.catch(() => undefined)
    return run
  }
}

export function createMusicBrainzClient({
  fetch,
  clock,
  logger,
  version,
  sleep = realSleep,
  spacingMs = 1_000,
  timeoutMs = 15_000,
  restMs = 15 * 60_000,
}: MusicBrainzClientOptions) {
  const queues = {
    musicbrainz: pacer(clock, sleep, spacingMs),
    coverart: pacer(clock, sleep, spacingMs),
  }
  let restingUntil = 0
  const headers = { accept: 'application/json', 'user-agent': musicBrainzUserAgent(version) }

  function rest(why: string) {
    restingUntil = clock.now() + restMs
    logger.warn('MusicBrainz isn’t answering; leaving it for a while', { why, restMs })
  }

  /** The answer, or null for a 404 (no such id, or no cover). Throws `musicbrainz-unavailable`. */
  async function get<T>(service: keyof typeof queues, url: URL): Promise<T | null> {
    if (clock.now() < restingUntil) throw unavailable()
    for (let attempt = 1; ; attempt++) {
      let res: Response
      try {
        res = await queues[service](() =>
          fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) }),
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
      // 503 is MusicBrainz's answer to too many requests; wait as asked, and try twice more
      if (res.status === 503 || res.status === 429 || res.status >= 500) {
        await res.body?.cancel()
        if (attempt >= 3) {
          rest(`HTTP ${res.status}`)
          throw unavailable()
        }
        const asked = retryAfterMs(res.headers.get('retry-after'), clock.now())
        await sleep(Math.min(asked ?? 2_000 * attempt, 30_000))
        continue
      }
      if (!res.ok) {
        await res.body?.cancel()
        logger.warn('MusicBrainz answered with an error', { status: res.status, service })
        throw unavailable()
      }
      const body = (await res.json().catch(() => null)) as T | null
      if (body === null || typeof body !== 'object') throw unavailable()
      return body
    }
  }

  return {
    lookup: <T>(entity: MusicBrainzEntity, mbid: string) =>
      get<T>('musicbrainz', musicBrainzUrl(entity, mbid)),
    coverArt: <T>(releaseGroupId: string) => get<T>('coverart', coverArtUrl(releaseGroupId)),
    resting: () => clock.now() < restingUntil,
  }
}

export type MusicBrainzClient = ReturnType<typeof createMusicBrainzClient>

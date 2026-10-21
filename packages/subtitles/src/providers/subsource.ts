// SPDX-License-Identifier: AGPL-3.0-only
// SubSource's API, v1, with the owner's own key. Its reference (https://subsource.net/api-docs)
// documents the base URL `https://api.subsource.net/api/v1`, the `X-API-Key` header, the endpoint
// list, the status codes (401 authentication, 403 denied, 429 rate limit) and the free limits (60
// requests a minute, 1,800 an hour, 7,200 a day, with rate-limit headers it doesn't name). It
// doesn't document parameters or response fields; those follow Bazarr's SubSource provider
// (https://github.com/morpheus65535/bazarr/blob/master/custom_libs/subliminal_patch/providers/subsource.py),
// read as a reference, not copied:
//
//   GET /movies/search?searchType=imdb&imdb=tt…      → { data: [{ movieId, title, releaseYear }] }
//   GET /subtitles?movieId=…&language=english&limit=100
//                                                    → { data: [{ subtitleId, language,
//                                                        releaseInfo: string[], hearingImpaired,
//                                                        foreignParts, commentary, link }] }
//                                                      one language per request
//   GET /subtitles/{subtitleId}/download             → a zip
//
// Languages are English names, lowercased in the query (`brazilian_portuguese`, `farsi_persian`),
// as Bazarr's SubSource converter has them. On a 429, `Retry-After` is read, then
// `X-RateLimit-Reset` (an ISO 8601 time, as Bazarr reads it), then the body's `retryAfter`.
import { languageName, toLanguageCode } from '../shared/languages.ts'
import {
  type Provider,
  type ProviderDeps,
  ProviderError,
  type ProviderResult,
} from '../shared/types.ts'
import { bool, maskKey, num, readBytes, readJson, record, send, statusError, str } from './http.ts'
import { readSubtitleZip } from './zip.ts'

export const SUBSOURCE_API = 'https://api.subsource.net/api/v1'
const NAME = 'SubSource'
/** Sintel, a title SubSource is sure to know: `account()` searches it to check the key. */
const CHECK_IMDB = 'tt1727587'

/** SubSource's names that aren't the language's English name (Bazarr's converter). */
const SPECIAL: Record<string, string> = {
  'pt-BR': 'brazilian_portuguese',
  fa: 'farsi_persian',
  zh: 'chinese_bg_code',
  'zh-Hans': 'chinese_bg_code',
  'zh-Hant': 'chinese_bg_code',
  eo: 'espranto',
  se: 'northen sami',
  ps: 'pushto',
  gd: 'gaelic',
  ms: 'malay',
  nb: 'norwegian',
  no: 'norwegian',
}

/** A profile code as SubSource's language name, lowercased. */
export function toSubSourceLanguage(code: string): string {
  return SPECIAL[code] ?? languageName(code).toLowerCase()
}

/** SubSource's language name back to a profile code. */
export function fromSubSourceLanguage(name: string): string | null {
  const lower = name.trim().toLowerCase()
  for (const [code, special] of Object.entries(SPECIAL)) if (special === lower) return code
  return toLanguageCode(lower.replace(/_/g, ' '))
}

function retryAfter(response: Response, body: unknown, now: number): number | null {
  const header = statusError(NAME, response, now)?.retryAfterMs ?? null
  if (header !== null) return header
  const reset = response.headers.get('x-ratelimit-reset')
  if (reset) {
    const trimmed = reset.trim()
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed)
      // An epoch in seconds, or a number of seconds to wait.
      return n > 1e9 ? Math.max(0, n * 1000 - now) : n * 1000
    }
    const at = Date.parse(trimmed)
    if (!Number.isNaN(at)) return Math.max(0, at - now)
  }
  const fromBody = num(record(body)?.retryAfter)
  return fromBody === null ? null : fromBody * 1000
}

export function createSubSource(deps: ProviderDeps): Provider {
  const { fetch, clock, store, userAgent } = deps

  function apiKey(): string {
    const key = store.credentials()?.apiKey
    if (!key) throw new ProviderError('no-account', 'Add your SubSource API key first.')
    return key
  }

  async function request(path: string, accept: string, signal?: AbortSignal): Promise<Response> {
    const response = await send(
      fetch,
      NAME,
      `${SUBSOURCE_API}${path}`,
      {
        method: 'GET',
        headers: { 'X-API-Key': apiKey(), Accept: accept, 'User-Agent': userAgent },
      },
      signal,
    )
    if (response.status === 429) {
      let body: unknown = null
      try {
        body = await response.json()
      } catch {
        // The body is optional.
      }
      throw new ProviderError('rate-limited', 'SubSource asked highsea to slow down.', {
        retryAfterMs: retryAfter(response, body, clock.now()),
      })
    }
    return response
  }

  async function getJson(path: string, signal?: AbortSignal): Promise<unknown[] | null> {
    const response = await request(path, 'application/json', signal)
    if (response.status === 404) return null
    const error = statusError(NAME, response, clock.now())
    if (error) throw error
    const body = record(await readJson(NAME, response))
    if (!body)
      throw new ProviderError('invalid', 'SubSource answered something highsea can’t read.')
    if (body.success === false) return null
    if (!Array.isArray(body.data))
      throw new ProviderError('invalid', 'SubSource answered something highsea can’t read.')
    return body.data
  }

  async function movieId(
    imdbId: string,
    year: number | null,
    signal?: AbortSignal,
  ): Promise<number | null> {
    const params = new URLSearchParams({ searchType: 'imdb', imdb: imdbId })
    const movies = (await getJson(`/movies/search?${params}`, signal)) ?? []
    const found = movies.map(record).filter((m) => num(m?.movieId) !== null)
    const pick = found.find((m) => year === null || num(m?.releaseYear) === year) ?? found[0]
    return pick ? num(pick.movieId) : null
  }

  return {
    id: 'subsource',

    async search(query, signal) {
      apiKey()
      if (!query.imdbId || query.languages.length === 0) return []
      const id = await movieId(query.imdbId, query.year, signal)
      if (id === null) return []
      // One language per request: each name once, answered in the first code that asked for it.
      const names = new Map<string, string>()
      for (const code of query.languages) {
        const name = toSubSourceLanguage(code)
        if (!names.has(name)) names.set(name, code)
      }
      const results: ProviderResult[] = []
      for (const [name, code] of names) {
        const params = new URLSearchParams({ movieId: String(id), language: name, limit: '100' })
        const items = (await getJson(`/subtitles?${params}`, signal)) ?? []
        for (const item of items) {
          const s = record(item)
          const subtitleId = num(s?.subtitleId)
          if (!s || subtitleId === null) continue
          const reported = fromSubSourceLanguage(str(s.language) ?? '')
          if (reported && reported !== code && toSubSourceLanguage(reported) !== name) continue
          const releases = Array.isArray(s.releaseInfo)
            ? s.releaseInfo.flatMap((r) => str(r) ?? [])
            : typeof s.releaseInfo === 'string'
              ? [s.releaseInfo]
              : []
          results.push({
            provider: 'subsource',
            ref: String(subtitleId),
            language: code,
            releaseName: releases[0] ?? '',
            releases,
            forced: bool(s.foreignParts),
            hi: bool(s.hearingImpaired),
            hashMatch: false,
            idMatch: true,
            format: null,
            downloads: num(s.downloads) ?? 0,
            rating: num(s.rating) ?? 0,
            translated: false,
          })
        }
      }
      return results
    },

    async download(result, signal) {
      apiKey()
      if (!/^\d+$/.test(result.ref))
        throw new ProviderError('invalid', 'That isn’t a SubSource subtitle.')
      const response = await request(`/subtitles/${result.ref}/download`, '*/*', signal)
      const error = statusError(NAME, response, clock.now())
      if (error) throw error
      return readSubtitleZip(await readBytes(NAME, response))
    },

    async account(signal) {
      const key = apiKey()
      await movieId(CHECK_IMDB, null, signal)
      return { account: maskKey(key), remaining: null, limit: 7200, resetsAt: null }
    },
  }
}

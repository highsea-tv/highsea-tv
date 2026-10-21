// SPDX-License-Identifier: AGPL-3.0-only
// OpenSubtitles.com's REST API, v1. Every shape here is from its OpenAPI document
// (https://stoplight.io/api/v1/projects/opensubtitles/opensubtitles-api/nodes/open_api.json) and
// its guides (https://opensubtitles.stoplight.io/docs/opensubtitles-api/e3750fd63a100-getting-started,
// https://opensubtitles.stoplight.io/docs/opensubtitles-api/6ef2e232095c7-best-practices):
//
//   POST /login {username, password}   → { token, base_url (a host), user: { allowed_downloads,
//                                          level, vip, … }, status }. Later requests go to
//                                          `https://{base_url}/api/v1` (vip-api for VIP members).
//                                          Limited to 1/s, 10/min, 30/h: a refused password is
//                                          never retried.
//   GET  /infos/user                   → { data: { allowed_downloads, remaining_downloads,
//                                          downloads_count, level, vip, … } }
//   GET  /subtitles?…                  → { data: [{ attributes: { language, release,
//                                          hearing_impaired, foreign_parts_only, ai_translated,
//                                          machine_translated, download_count, ratings,
//                                          moviehash_match, files: [{ file_id, file_name }],
//                                          feature_details: { tmdb_id, imdb_id, year, title } } }] }
//                                          Parameters sorted, values lowercase, or the API
//                                          redirects (Best practices).
//   POST /download {file_id}           → { link, file_name, requests, remaining, message,
//                                          reset_time, reset_time_utc }; 406 when the day's
//                                          downloads are spent. The link lasts 3 hours, and the
//                                          download is counted when it's requested, so the link
//                                          is stored before it's fetched.
//
// Headers: `Api-Key` (highsea's consumer key) always, `User-Agent: highsea v{version}` as required,
// `Authorization: Bearer {token}` once signed in. highsea keeps the token 12 hours (it's valid 24),
// as Bazarr does, and on a 401 signs in again once.

import { toLanguageCode } from '../shared/languages.ts'
import type { Provider, ProviderToken, SubtitleQuery } from '../shared/types.ts'
import { type ProviderDeps, ProviderError, type ProviderResult } from '../shared/types.ts'
import {
  baseName,
  bool,
  formatOf,
  nextMidnightUtc,
  num,
  readBytes,
  readJson,
  record,
  send,
  statusError,
  str,
  wantedCode,
} from './http.ts'

export const OPENSUBTITLES_API = 'https://api.opensubtitles.com/api/v1'
const NAME = 'OpenSubtitles.com'
const TOKEN_MS = 12 * 60 * 60 * 1000
const LINK_MS = 3 * 60 * 60 * 1000

/**
 * Profile codes to OpenSubtitles.com's: ISO 639-1, with Portuguese and Chinese split as `pt-pt`,
 * `pt-br`, `zh-cn` and `zh-tw` (`GET /infos/languages`). Plain `zh` asks for both scripts.
 */
export function toOpenSubtitlesLanguages(code: string): string[] {
  switch (code) {
    case 'pt':
      return ['pt-pt']
    case 'pt-BR':
      return ['pt-br']
    case 'zh-Hans':
      return ['zh-cn']
    case 'zh-Hant':
      return ['zh-tw']
    case 'zh':
      return ['zh-cn', 'zh-tw']
    default:
      return [code.toLowerCase()]
  }
}

/** OpenSubtitles.com's language back to a profile code (`pt-pt` is plain Portuguese). */
export function fromOpenSubtitlesLanguage(tag: string): string | null {
  return tag.toLowerCase() === 'pt-pt' ? 'pt' : toLanguageCode(tag)
}

/** `https://{host}/api/v1` from `base_url`, which is a host but is read with or without more. */
export function apiBase(baseUrl: string | null): string {
  if (!baseUrl) return OPENSUBTITLES_API
  const trimmed = baseUrl.trim()
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    if (!/(^|\.)opensubtitles\.com$/i.test(url.hostname)) return OPENSUBTITLES_API
    return `https://${url.hostname}/api/v1`
  } catch {
    return OPENSUBTITLES_API
  }
}

/** The `/subtitles` query string: keys sorted, values lowercase (Best practices). */
export function searchParams(query: SubtitleQuery): string {
  const languages = [...new Set(query.languages.flatMap(toOpenSubtitlesLanguages))].sort()
  const params: [string, string][] = [
    ['ai_translated', 'exclude'],
    ['foreign_parts_only', 'include'],
    ['hearing_impaired', 'include'],
    ['languages', languages.join(',')],
    ['machine_translated', 'exclude'],
    ['tmdb_id', String(query.tmdbId)],
    ['type', 'movie'],
  ]
  if (query.moviehash) params.push(['moviehash', query.moviehash])
  if (query.year) params.push(['year', String(query.year)])
  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return params
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v.toLowerCase())}`)
    .join('&')
    .replace(/%2C/g, ',')
}

function mapResult(item: unknown, query: SubtitleQuery): ProviderResult | null {
  const a = record(record(item)?.attributes)
  if (!a) return null
  const files = Array.isArray(a.files) ? a.files : []
  const file = record(files[0])
  const fileId = num(file?.file_id)
  if (!file || fileId === null) return null
  const language = wantedCode(fromOpenSubtitlesLanguage(str(a.language) ?? ''), query.languages)
  if (!language) return null
  const feature = record(a.feature_details)
  const release = str(a.release) ?? str(file.file_name) ?? ''
  return {
    provider: 'opensubtitles',
    ref: String(fileId),
    language,
    releaseName: release,
    releases: [release],
    forced: bool(a.foreign_parts_only),
    hi: bool(a.hearing_impaired),
    hashMatch: bool(a.moviehash_match),
    idMatch: num(feature?.tmdb_id) === query.tmdbId,
    format: formatOf(str(file.file_name)),
    downloads: num(a.download_count) ?? 0,
    rating: num(a.ratings) ?? 0,
    translated: bool(a.ai_translated) || bool(a.machine_translated),
  }
}

export function createOpenSubtitles(deps: ProviderDeps & { apiKey: string | null }): Provider {
  const { fetch, clock, store, userAgent, apiKey } = deps

  function credentials(): { username: string; password: string } {
    if (!apiKey)
      throw new ProviderError('no-account', 'highsea has no OpenSubtitles.com application key.')
    const c = store.credentials()
    if (!c?.username || !c.password)
      throw new ProviderError('no-account', 'Add your OpenSubtitles.com account first.')
    return { username: c.username, password: c.password }
  }

  function headers(token: string | null, json: boolean): Headers {
    const h = new Headers({
      'Api-Key': apiKey ?? '',
      'User-Agent': userAgent,
      Accept: 'application/json',
    })
    if (json) h.set('Content-Type', 'application/json')
    if (token) h.set('Authorization', `Bearer ${token}`)
    return h
  }

  async function login(signal?: AbortSignal): Promise<ProviderToken> {
    const { username, password } = credentials()
    const response = await send(
      fetch,
      NAME,
      `${OPENSUBTITLES_API}/login`,
      {
        method: 'POST',
        headers: headers(null, true),
        body: JSON.stringify({ username, password }),
      },
      signal,
    )
    if (response.status === 401 || response.status === 403) {
      store.saveToken(null)
      throw new ProviderError('auth', 'OpenSubtitles.com refused the username or password.')
    }
    const error = statusError(NAME, response, clock.now())
    if (error) throw error
    const body = record(await readJson(NAME, response))
    const value = str(body?.token)
    if (!value) throw new ProviderError('invalid', 'OpenSubtitles.com sent no sign-in token.')
    const token: ProviderToken = {
      value,
      expiresAt: clock.now() + TOKEN_MS,
      baseUrl: apiBase(str(body?.base_url)),
    }
    store.saveToken(token)
    // the allowance comes with the sign-in; what's left comes with each download
    const limit = num(record(body?.user)?.allowed_downloads)
    if (limit !== null) store.saveQuota({ remaining: null, limit, resetsAt: null })
    return token
  }

  async function currentToken(signal?: AbortSignal): Promise<ProviderToken> {
    credentials()
    const token = store.token()
    if (token && token.expiresAt > clock.now()) return token
    return login(signal)
  }

  /** A signed-in request; a 401 signs in again once and retries once. */
  async function call(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<Response> {
    const once = (token: ProviderToken) =>
      send(
        fetch,
        NAME,
        `${apiBase(token.baseUrl)}${path}`,
        {
          method,
          headers: headers(token.value, body !== undefined),
          body: body === undefined ? undefined : JSON.stringify(body),
        },
        signal,
      )
    let response = await once(await currentToken(signal))
    if (response.status === 401) {
      store.saveToken(null)
      response = await once(await login(signal))
      if (response.status === 401)
        throw new ProviderError('auth', 'OpenSubtitles.com refused the account.')
    }
    return response
  }

  return {
    id: 'opensubtitles',

    async search(query, signal) {
      credentials()
      if (query.languages.length === 0) return []
      const response = await call('GET', `/subtitles?${searchParams(query)}`, undefined, signal)
      const error = statusError(NAME, response, clock.now())
      if (error) throw error
      const data = record(await readJson(NAME, response))?.data
      if (!Array.isArray(data))
        throw new ProviderError(
          'invalid',
          'OpenSubtitles.com answered something highsea can’t read.',
        )
      return data.flatMap((item) => mapResult(item, query) ?? [])
    },

    async download(result, signal) {
      credentials()
      const key = `opensubtitles:${result.ref}`
      let link = store.link(key)
      if (!link) {
        const fileId = Number(result.ref)
        if (!Number.isSafeInteger(fileId))
          throw new ProviderError('invalid', 'That isn’t an OpenSubtitles.com file.')
        const response = await call('POST', '/download', { file_id: fileId }, signal)
        const now = clock.now()
        if (response.status === 406) {
          let resetsAt = nextMidnightUtc(now)
          try {
            const at = Date.parse(str(record(await response.json())?.reset_time_utc) ?? '')
            if (!Number.isNaN(at)) resetsAt = at
          } catch {
            // The body's optional; midnight UTC is the documented reset.
          }
          store.saveQuota({ remaining: 0, limit: null, resetsAt })
          throw new ProviderError('quota', 'No OpenSubtitles.com downloads are left today.', {
            resetsAt,
          })
        }
        const error = statusError(NAME, response, now)
        if (error) throw error
        const body = record(await readJson(NAME, response))
        link = str(body?.link)
        if (!link || !/^https:\/\//i.test(link))
          throw new ProviderError('invalid', 'OpenSubtitles.com sent no download link.')
        store.saveLink(key, link, now + LINK_MS)
        const remaining = num(body?.remaining)
        if (remaining !== null) {
          const at = Date.parse(str(body?.reset_time_utc) ?? '')
          store.saveQuota({
            remaining,
            limit: null,
            resetsAt: Number.isNaN(at) ? nextMidnightUtc(now) : at,
          })
        }
      }
      const response = await send(
        fetch,
        NAME,
        link,
        { method: 'GET', headers: { 'User-Agent': userAgent } },
        signal,
      )
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        // The link has expired or was refused: the next try asks for a new one.
        store.dropLink(key)
        throw new ProviderError('unavailable', 'The OpenSubtitles.com download link has expired.')
      }
      const error = statusError(NAME, response, clock.now())
      if (error) throw error
      const bytes = await readBytes(NAME, response)
      store.dropLink(key)
      // The link ends `/subfile/{file name}` (the OpenAPI document's example).
      const last = new URL(link).pathname.split('/').pop() ?? ''
      let name = last
      try {
        name = decodeURIComponent(last)
      } catch {
        // Keep it as sent.
      }
      return { name: baseName(name), bytes }
    },

    async account(signal) {
      const { username } = credentials()
      const response = await call('GET', '/infos/user', undefined, signal)
      const error = statusError(NAME, response, clock.now())
      if (error) throw error
      const data = record(record(await readJson(NAME, response))?.data)
      if (!data)
        throw new ProviderError(
          'invalid',
          'OpenSubtitles.com answered something highsea can’t read.',
        )
      const remaining = num(data.remaining_downloads)
      const limit = num(data.allowed_downloads)
      const resetsAt = nextMidnightUtc(clock.now())
      if (remaining !== null) store.saveQuota({ remaining, limit, resetsAt })
      return { account: username, remaining, limit, resetsAt }
    },
  }
}

// SPDX-License-Identifier: AGPL-3.0-only
// Recordings of TMDB's answers (ADR 0029): one JSON file per request, keyed by the method and the
// URL with its query sorted and the credential stripped. The replaying `fetch` and the record script
// share these rules, so a request has one key and one file name.
import { createHash } from 'node:crypto'

/** Whether the request carried a credential TMDB accepts: a bad key is recorded as `invalid`. */
export type RecordedCredential = 'valid' | 'invalid'

export type Recording = {
  request: { method: string; url: string; credential: RecordedCredential }
  response: { status: number; headers: Record<string, string>; body: unknown }
}

/** Query parameters that carry the credential, and never reach a recording. */
export const SECRET_PARAMS = ['api_key']

/** encodeURIComponent, the same as the record script and the fixtures' generator use. */
const enc = (s: string) => encodeURIComponent(s)

/** The URL without its credential, its query sorted by name, then value. */
export function canonicalUrl(input: string | URL): string {
  const url = new URL(input)
  const pairs = [...url.searchParams.entries()]
    .filter(([k]) => !SECRET_PARAMS.includes(k))
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : x > y ? 1 : 0) : a < b ? -1 : 1))
  const query = pairs.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&')
  return `${url.origin}${url.pathname}${query ? `?${query}` : ''}`
}

export const recordingKey = (method: string, url: string, credential: RecordedCredential) =>
  `${method.toUpperCase()} ${canonicalUrl(url)} ${credential}`

/** `get_3_movie_19.b46c0820.json`: the path to read, and a hash to keep queries apart. */
export function recordingName(method: string, url: string, credential: RecordedCredential) {
  const canonical = canonicalUrl(url)
  const hash = createHash('sha256')
    .update(`${method.toUpperCase()} ${canonical} ${credential}`)
    .digest('hex')
    .slice(0, 8)
  return `${method.toLowerCase()}${new URL(canonical).pathname.replaceAll('/', '_')}.${hash}.json`
}

/**
 * What a TMDB credential looks like: a v3 API key (32 hex characters) or a Read Access Token (a
 * JWT). The leak check refuses any recording with either in it.
 */
export const CREDENTIAL_PATTERNS = [/\b[0-9a-f]{32}\b/i, /eyJ[\w-]+\.[\w-]+\.[\w-]+/, /api_key=/i]

export function leaksCredential(text: string, secrets: string[] = []): boolean {
  return (
    CREDENTIAL_PATTERNS.some((p) => p.test(text)) ||
    secrets.some((s) => s.length >= 8 && text.includes(s)) ||
    /"authorization"/i.test(text)
  )
}

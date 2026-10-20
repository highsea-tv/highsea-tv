// SPDX-License-Identifier: AGPL-3.0-only
// Requests to indexers and what can go wrong with them. Every failure becomes an `IndexerError`
// of one kind, because the kind decides what health does next (ADR 0035): credentials fail at
// once, a 429 waits as long as it's told, everything else backs off on the schedule.
import { type Fetch, retryAfterMs } from '@highsea/core'

export type FailureKind =
  /** The indexer refused the credentials. Retrying never helps, so health fails at once. */
  | 'auth'
  /** The indexer asked us to slow down. */
  | 'rate-limited'
  /** A 5xx, or the host can't be reached. */
  | 'unavailable'
  | 'timeout'
  /** The answer isn't what the definition expects: a changed layout, or malformed XML or JSON. */
  | 'parse'
  /** The indexer's settings can't make a request: a missing setting, an address on another host. */
  | 'config'

export class IndexerError extends Error {
  override name = 'IndexerError'
  readonly kind: FailureKind
  /** From `Retry-After`, when the indexer sent one. */
  readonly retryAfterMs: number | null
  constructor(kind: FailureKind, message: string, retryAfter: number | null = null) {
    super(message)
    this.kind = kind
    this.retryAfterMs = retryAfter
  }
}

/** Never shorter than this, so a secret can't be a common word that redaction would mangle. */
const MIN_SECRET_LENGTH = 4

/** Replaces every secret in `text`, and any `apikey=`, `passkey=` or `password=` query value. */
export function redact(text: string, secrets: readonly string[]): string {
  let out = text
  for (const s of secrets) {
    if (s.length < MIN_SECRET_LENGTH) continue
    out = out.split(s).join('••••')
    const encoded = encodeURIComponent(s)
    if (encoded !== s) out = out.split(encoded).join('••••')
  }
  return out.replace(/((?:api_?key|passkey|password|token|auth)=)[^&\s"']+/gi, '$1••••')
}

/**
 * Joins a path to the base URL keeping the base's own path, so an indexer at
 * `https://host/prowlarr/1` answers `/api` at `https://host/prowlarr/1/api`. The result must stay
 * on the base's origin: a definition can't send a request, or the credentials, anywhere else.
 */
export function joinUrl(base: string, path: string, query: Record<string, string> = {}): URL {
  let root: URL
  try {
    root = new URL(base)
  } catch {
    throw new IndexerError('config', 'The indexer’s address isn’t a valid URL.')
  }
  if (root.protocol !== 'http:' && root.protocol !== 'https:')
    throw new IndexerError('config', 'The indexer’s address must start with http:// or https://.')
  const trimmed = root.href.replace(/[?#].*$/, '').replace(/\/+$/, '')
  const url = new URL(path === '' ? trimmed : `${trimmed}${path.startsWith('/') ? '' : '/'}${path}`)
  if (url.origin !== root.origin)
    throw new IndexerError('config', 'The definition asked for an address on another host.')
  for (const [k, v] of Object.entries(query)) if (v !== '') url.searchParams.set(k, v)
  return url
}

export type Answer = { status: number; headers: Headers; body: string; url: string; ms: number }

export type RequestOptions = {
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  form?: Record<string, string>
  redirect?: 'follow' | 'manual'
  timeoutMs: number
  now: () => number
}

/** Bigger answers are refused: no search result page should come near it. */
const MAX_BODY_BYTES = 10 * 1024 * 1024

/** One request with a timeout, read to text. Throws `IndexerError` for anything but an answer. */
export async function send(fetch: Fetch, url: URL, options: RequestOptions): Promise<Answer> {
  const started = options.now()
  const headers = new Headers({ 'user-agent': 'highsea', ...options.headers })
  let body: string | undefined
  if (options.form) {
    headers.set('content-type', 'application/x-www-form-urlencoded')
    body = new URLSearchParams(options.form).toString()
  }
  let response: Response
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body,
      redirect: options.redirect ?? 'follow',
      // AbortSignal.timeout is the documented way to bound a fetch
      // (https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)
      signal: AbortSignal.timeout(options.timeoutMs),
    })
  } catch (e) {
    const err = e as Error
    if (err.name === 'TimeoutError' || err.name === 'AbortError')
      throw new IndexerError(
        'timeout',
        `The indexer didn’t answer within ${Math.round(options.timeoutMs / 1000)} seconds.`,
      )
    // the platform's message can carry the address, and with it a passkey: only its code is kept
    const code = (err as Error & { code?: unknown }).code
    throw new IndexerError(
      'unavailable',
      `Couldn’t reach the indexer${typeof code === 'string' && /^[\w-]{1,40}$/.test(code) ? ` (${code})` : ''}.`,
    )
  }
  let text: string
  try {
    const length = Number(response.headers.get('content-length') ?? 0)
    if (length > MAX_BODY_BYTES) throw new Error('too large')
    text = await response.text()
    if (text.length > MAX_BODY_BYTES) throw new Error('too large')
  } catch (e) {
    const err = e as Error
    if (err.name === 'TimeoutError' || err.name === 'AbortError')
      throw new IndexerError(
        'timeout',
        `The indexer didn’t answer within ${Math.round(options.timeoutMs / 1000)} seconds.`,
      )
    throw new IndexerError('parse', 'The indexer’s answer was too large or cut short.')
  }
  return {
    status: response.status,
    headers: response.headers,
    body: text,
    url: response.url || url.href,
    ms: options.now() - started,
  }
}

/** Turns a status that isn't a success into the right failure. 3xx is left to the caller. */
export function checkStatus(answer: Answer, now: number): void {
  const { status } = answer
  if (status === 401)
    throw new IndexerError(
      'auth',
      'The indexer refused the credentials (HTTP 401). Check the API key or password.',
    )
  if (status === 429)
    throw new IndexerError(
      'rate-limited',
      'The indexer asked highsea to slow down (HTTP 429).',
      retryAfterMs(answer.headers.get('retry-after'), now),
    )
  if (status >= 500)
    throw new IndexerError('unavailable', `The indexer answered with an error (HTTP ${status}).`)
  if (status >= 400)
    throw new IndexerError('unavailable', `The indexer turned the request down (HTTP ${status}).`)
}

// SPDX-License-Identifier: AGPL-3.0-only
// What every adapter does with HTTP: send through the fetch seam it's given (ADR 0029) with the
// caller's signal, and turn what goes wrong into a ProviderError whose kind decides the throttle.
// A thrown fetch (a network error, an AbortError or TimeoutError from the signal) is `unavailable`,
// as Fetch's spec has it throw a TypeError for network errors
// (https://fetch.spec.whatwg.org/#fetch-method); statuses follow RFC 9110: 429 with `Retry-After`
// (§ 10.2.3, read by `retryAfterMs`), 5xx `unavailable`, 401 and 403 `auth`.
import { type Fetch, retryAfterMs } from '@highsea/core'
import { ProviderError } from '../shared/types.ts'

/** Nothing a subtitle provider answers is anywhere near this; more is refused unread. */
export const MAX_RESPONSE_BYTES = 16 * 1024 * 1024

const DAY_MS = 24 * 60 * 60 * 1000

/** The next midnight UTC after `now`: when OpenSubtitles.com's day (and highsea's count) resets. */
export function nextMidnightUtc(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS + DAY_MS
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return 'timed out'
    return error.message || error.name
  }
  return String(error)
}

/** Sends one request; a thrown fetch becomes `unavailable`. */
export async function send(
  fetch: Fetch,
  name: string,
  url: string | URL,
  init: RequestInit,
  signal: AbortSignal | undefined,
): Promise<Response> {
  try {
    return await fetch(url, signal ? { ...init, signal } : init)
  } catch (error) {
    if (error instanceof ProviderError) throw error
    throw new ProviderError('unavailable', `${name} didn't answer: ${describe(error)}.`)
  }
}

/** The error for a status that isn't a success, or null for a 2xx. */
export function statusError(name: string, response: Response, now: number): ProviderError | null {
  const { status } = response
  if (status >= 200 && status < 300) return null
  if (status === 429)
    return new ProviderError('rate-limited', `${name} asked highsea to slow down.`, {
      retryAfterMs: retryAfterMs(response.headers.get('retry-after'), now),
    })
  if (status >= 500) return new ProviderError('unavailable', `${name} answered ${status}.`)
  if (status === 401 || status === 403)
    return new ProviderError('auth', `${name} refused the account or key.`)
  return new ProviderError('invalid', `${name} answered ${status}.`)
}

/** Reads the body's text; a body cut off by the signal is `unavailable`. */
export async function readText(name: string, response: Response): Promise<string> {
  const bytes = await readBytes(name, response)
  return new TextDecoder().decode(bytes)
}

/** Reads a JSON body; one that isn't JSON is `invalid`. */
export async function readJson(name: string, response: Response): Promise<unknown> {
  const text = await readText(name, response)
  try {
    return JSON.parse(text)
  } catch {
    throw new ProviderError('invalid', `${name} answered something highsea can't read.`)
  }
}

/** Reads the body's bytes, at most MAX_RESPONSE_BYTES. */
export async function readBytes(name: string, response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > MAX_RESPONSE_BYTES)
    throw new ProviderError('invalid', `${name} sent a file larger than highsea takes.`)
  let buffer: ArrayBuffer
  try {
    buffer = await response.arrayBuffer()
  } catch (error) {
    throw new ProviderError('unavailable', `${name} didn't finish answering: ${describe(error)}.`)
  }
  if (buffer.byteLength > MAX_RESPONSE_BYTES)
    throw new ProviderError('invalid', `${name} sent a file larger than highsea takes.`)
  return new Uint8Array(buffer)
}

/** A record's field, when the value is an object. */
export function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export const str = (value: unknown): string | null =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null

export const num = (value: unknown): number | null => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

export const bool = (value: unknown): boolean =>
  value === true || value === 1 || value === '1' || value === 'true'

const TEXT_FORMATS = new Set(['srt', 'vtt', 'ass', 'ssa'])

/** The text format a file name's extension names, or null. */
export function formatOf(name: string | null): 'srt' | 'vtt' | 'ass' | 'ssa' | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name ?? '')?.[1]?.toLowerCase()
  return ext && TEXT_FORMATS.has(ext) ? (ext as 'srt' | 'vtt' | 'ass' | 'ssa') : null
}

/** A name reduced to its base name, with nothing a filesystem would read as a path. */
export function baseName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const cleaned = [...base]
    .filter((c) => c.charCodeAt(0) >= 0x20)
    .join('')
    .trim()
  return cleaned === '' || cleaned === '.' || cleaned === '..' ? 'subtitle' : cleaned
}

/** `••••` and the key's last four characters, for A10's Account column. */
export function maskKey(key: string): string {
  return `••••${key.slice(-4)}`
}

/**
 * Maps a provider's language back to a profile code for this query. Chinese is asked for by
 * script (`zh-cn`, `zh-tw`) where the provider tells them apart, so a query for plain `zh` takes
 * either script as `zh`. Portuguese isn't folded: a Brazilian track doesn't satisfy `pt`
 * (languages.ts › satisfies).
 */
export function wantedCode(code: string | null, wanted: string[]): string | null {
  if (!code) return null
  if (wanted.includes(code)) return code
  if ((code === 'zh-Hans' || code === 'zh-Hant') && wanted.includes('zh')) return 'zh'
  return code
}

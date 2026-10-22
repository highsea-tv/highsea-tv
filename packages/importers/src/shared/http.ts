// SPDX-License-Identifier: AGPL-3.0-only
// Talking to the program being migrated from, through the fetch seam (ADR 0029): a timeout on every
// request, and its failures in plain words as AppErrors the API passes on.
import { AppError, type Fetch } from '@highsea-tv/core'

export const TIMEOUT_MS = 30_000

/** An http(s) address with no trailing slash, or an AppError for the URL field. */
export function baseUrl(url: string): string {
  const s = url.trim().replace(/\/+$/, '')
  let parsed: URL
  try {
    parsed = new URL(s)
  } catch {
    throw new AppError('invalid', 'Use the full address, starting with http:// or https://.', {
      field: 'url',
      reason: 'bad-url',
    })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new AppError('invalid', 'Use the full address, starting with http:// or https://.', {
      field: 'url',
      reason: 'bad-url',
    })
  return s
}

export const unreachable = (what: string, url: string, why: string) =>
  new AppError('unavailable', `${what} didn’t answer at ${url}: ${why}`, {
    reason: 'unreachable',
  })

/** One request with a timeout; a network failure is `unreachable`. */
export async function request(
  fetch: Fetch,
  what: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    const err = e as Error
    const why =
      err.name === 'TimeoutError' ? 'it took longer than 30 seconds.' : err.message || 'no answer.'
    throw unreachable(what, new URL(url).origin, why)
  }
}

/** The response's JSON, or `unavailable` when it isn't JSON. */
export async function jsonOf<T>(what: string, res: Response): Promise<T> {
  try {
    return (await res.json()) as T
  } catch {
    throw new AppError('unavailable', `${what} answered with something that isn’t JSON.`, {
      reason: 'bad-answer',
    })
  }
}

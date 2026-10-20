// SPDX-License-Identifier: AGPL-3.0-only
// The one HTTP seam (ADR 0029): every adapter for an outside service takes a `Fetch` it's given.
// The runtime passes the platform's; tests pass one that replays recordings, so no test reaches the
// network. Browser-safe, so the SDK imports it too (`@highsea/core/fetch`).

/** Just the call: platforms' `fetch` types add extras (Bun's `preconnect`) a test double lacks. */
export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

/**
 * How long a `Retry-After` header asks the client to wait, in milliseconds, or `null` when it's
 * absent or unreadable. The value is either a number of seconds or an HTTP date
 * ([RFC 9110 § 10.2.3](https://www.rfc-editor.org/rfc/rfc9110#section-10.2.3)); a date in the past
 * means "now".
 */
export function retryAfterMs(value: string | null | undefined, now: number): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000
  const at = Date.parse(trimmed)
  if (Number.isNaN(at)) return null
  return Math.max(0, at - now)
}

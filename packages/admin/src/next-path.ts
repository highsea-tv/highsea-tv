// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Where to go after signing in: a path on this server, or the dashboard. `//host` and `/\host`
 * are other sites to a browser, so they're refused (OWASP Unvalidated Redirects and Forwards).
 */
export const safeNext = (next: string | null | undefined) =>
  next?.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/'

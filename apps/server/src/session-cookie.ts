// SPDX-License-Identifier: AGPL-3.0-only
// Names the API and the admin's server components share, kept free of server-only imports.

/**
 * The session cookie. Over HTTPS it carries the `__Host-` prefix, which browsers accept only with
 * Secure, Path=/ and no Domain (RFC 6265bis § 4.1.3.2); over plain HTTP on a LAN, where Secure
 * can't be set, it's the bare name. HttpOnly and SameSite=Lax either way (OWASP Session
 * Management Cheat Sheet).
 */
export const COOKIE = { secure: '__Host-highsea_session', plain: 'highsea_session' } as const

/**
 * The connection's own address, for the admin's server components, which see headers but not the
 * socket. The HTTP server sets it on every request it hands to Next and removes any copy the
 * client sent, so it can't be forged.
 */
export const PEER_HEADER = 'x-highsea-peer'

/**
 * The path and query a request asked for, set the same way, so the admin's gate can send someone
 * back to it after they sign in (layouts aren't given the URL).
 */
export const PATH_HEADER = 'x-highsea-path'

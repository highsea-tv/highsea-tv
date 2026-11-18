// SPDX-License-Identifier: AGPL-3.0-only
// What highsea does with a request before it reaches a handler, when a reverse proxy may be in
// front of it (ADR 0026, its 2026-11-18 section).
//
// HTTPS only: set for a proxy with an https:// External URL, a request that a trusted proxy says
// came over plain HTTP is sent to the External URL, and an HTTPS answer carries
// Strict-Transport-Security (RFC 6797). Only a trusted proxy's word counts (proxies.ts), so the
// LAN's plain HTTP address, which no proxy carries, keeps working.
//
// Noticing a proxy: a request carrying `Forwarded` (RFC 7239) or `X-Forwarded-Proto`/`-Host`, for a
// host name that isn't an address, while highsea isn't set for a proxy. That's only a hint: the
// headers aren't believed, nothing changes, and the admin is offered the setting to confirm.
import { isIP } from 'node:net'
import { plainAddress, type TrustedProxies } from './proxies.ts'
import type { NetworkSettings } from './settings.ts'

type Headers = Record<string, string | string[] | undefined>

const header = (h: Headers, name: string) => {
  const v = h[name]
  return Array.isArray(v) ? v.join(',') : v
}

/** The value the nearest proxy set: the rightmost of a comma-separated list. */
const last = (value: string | undefined) => value?.split(',').pop()?.trim() || undefined

/**
 * RFC 7239 § 4: `Forwarded: for=192.0.2.60;proto=http;host=example.com, for=…`. Each proxy appends
 * an element; the last is the nearest's. Values may be quoted strings (§ 4, RFC 9110 § 5.6.4).
 */
export function lastForwarded(value: string | undefined): { proto?: string; host?: string } {
  const element = last(value)
  if (!element) return {}
  const out: { proto?: string; host?: string } = {}
  for (const pair of element.split(';')) {
    const at = pair.indexOf('=')
    if (at < 0) continue
    const name = pair.slice(0, at).trim().toLowerCase()
    const raw = pair.slice(at + 1).trim()
    const v = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw
    if (name === 'proto') out.proto = v.toLowerCase()
    if (name === 'host') out.host = v
  }
  return out
}

/** Set for a reverse proxy: the proxy does TLS and its forwarded headers are read (Settings › Network). */
export const behindProxy = (s: NetworkSettings) => s.tls === 'proxy' && s.proxyHeaders

/**
 * One year, the OWASP HTTP Strict Transport Security Cheat Sheet's example and the least the
 * preload list asks for. RFC 6797 § 6.1.1 leaves the value to the host. No `includeSubDomains`,
 * since the owner's other names on the domain aren't highsea's, and no `preload`.
 */
export const HSTS = 'max-age=31536000'

export type HttpsOnly = { redirect: string } | { hsts: string } | null

/**
 * What HTTPS only asks of this request: a redirect to the External URL (when a trusted proxy says it
 * came over HTTP), the HSTS header (when it says HTTPS and the host is the External URL's), or
 * nothing. RFC 6797 § 7.2: the redirect is permanent and over HTTP carries no HSTS header.
 */
export function httpsOnly({
  settings,
  remoteAddress,
  headers,
  trusted,
  url,
}: {
  settings: NetworkSettings
  remoteAddress: string
  headers: Headers
  trusted: TrustedProxies
  /** The request's path and query, as Node's `req.url` has it. */
  url: string
}): HttpsOnly {
  if (!behindProxy(settings) || !trusted.has(plainAddress(remoteAddress))) return null
  let external: URL
  try {
    external = new URL(settings.externalUrl)
  } catch {
    return null
  }
  if (external.protocol !== 'https:') return null
  // only what the proxy says: a request without the header (the LAN, straight to the port) is left
  const proto = last(header(headers, 'x-forwarded-proto'))?.toLowerCase()
  if (proto === 'http') return { redirect: `${external.origin}${url.startsWith('/') ? url : '/'}` }
  if (proto !== 'https') return null
  const host = (last(header(headers, 'x-forwarded-host')) ?? header(headers, 'host') ?? '')
    .trim()
    .toLowerCase()
  return host === external.host ? { hsts: HSTS } : null
}

/** A proxy seen in front of highsea: the name people used, how, and the address it came from. */
export type ProxySighting = { host: string; secure: boolean; peer: string }

/**
 * A domain name, with an optional port: no address, no `localhost`, no mDNS `.local` name (RFC 6762),
 * which are this server's own addresses on the LAN. The URL parser normalises it and refuses
 * anything else (user info, a path, spaces).
 */
export function publicHost(value: string): string | null {
  const v = value.trim().toLowerCase()
  if (!v || v.length > 260) return null
  let url: URL
  try {
    url = new URL(`http://${v}`)
  } catch {
    return null
  }
  if (url.host !== v || url.username || url.password) return null
  const name = url.hostname
  if (isIP(name.replace(/^\[|\]$/g, ''))) return null
  if (!name.includes('.') || name.endsWith('.')) return null
  if (name === 'localhost' || name.endsWith('.localhost') || name.endsWith('.local')) return null
  return v
}

/** A sign of a reverse proxy, when highsea isn't set for one; null otherwise. */
export function sightProxy({
  settings,
  remoteAddress,
  headers,
}: {
  settings: NetworkSettings
  remoteAddress: string
  headers: Headers
}): ProxySighting | null {
  if (behindProxy(settings)) return null
  const forwarded = lastForwarded(header(headers, 'forwarded'))
  const xProto = last(header(headers, 'x-forwarded-proto'))?.toLowerCase()
  const xHost = last(header(headers, 'x-forwarded-host'))
  if (!forwarded.proto && !forwarded.host && !xProto && !xHost) return null
  const host = publicHost(xHost ?? forwarded.host ?? header(headers, 'host') ?? '')
  if (!host) return null
  return {
    host,
    secure: (xProto ?? forwarded.proto) === 'https',
    peer: plainAddress(remoteAddress),
  }
}

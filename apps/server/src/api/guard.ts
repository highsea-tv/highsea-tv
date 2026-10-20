// SPDX-License-Identifier: AGPL-3.0-only
// What runs before every API handler (ADR 0023):
// 1. who's asking: the client's address and scheme, through trusted proxies only;
// 2. who they are: a session cookie, a bearer token (device token or API key), or a trusted
//    forward-auth proxy's header;
// 3. cross-site request forgery: unsafe requests from a browser must come from this origin;
// 4. whether they may: the access each route declares in the contract.

import type { TLSSocket } from 'node:tls'
import { ACCESS_KEY, type Access, routes } from '@highsea/api-contract'
import { canManageUsers, isStaff, type Principal, type RequestMeta } from '@highsea/auth'
import { AppError } from '@highsea/core'
import { type ClientInfo, plainAddress, resolveClient } from '@highsea/network'
import type { Runtime } from '@highsea/runtime'
import type { HttpBindings } from '@hono/node-server'
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { COOKIE } from '../session-cookie.ts'

export { COOKIE }

export type Env = {
  Bindings: Partial<HttpBindings>
  Variables: {
    runtime: Runtime
    client: ClientInfo
    principal: Principal | null
    /** For the audit log, rate limits, passkeys and links. */
    meta: RequestMeta
    /** How the request authenticated, for the CSRF rule. */
    via: 'cookie' | 'bearer' | 'proxy' | null
  }
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

/** `/api/v1/users/{id}` as a matcher, with the route's access. */
const matchers = Object.values(routes).flatMap((group) =>
  Object.values(group).map((r) => ({
    method: r.method.toUpperCase(),
    pattern: new RegExp(`^${r.path.replace(/\{\w+\}/g, '[^/]+')}$`),
    access: (r as Record<string, unknown>)[ACCESS_KEY] as Access,
  })),
)

export function accessFor(method: string, path: string): Access | null {
  const m = method === 'HEAD' ? 'GET' : method
  return matchers.find((r) => r.method === m && r.pattern.test(path))?.access ?? null
}

/** The connection's own address and whether it's TLS, from Node's socket. */
function connection(c: Context<Env>) {
  const socket = c.env?.incoming?.socket as TLSSocket | undefined
  return { remoteAddress: socket?.remoteAddress ?? '127.0.0.1', encrypted: !!socket?.encrypted }
}

const bearer = (c: Context) => {
  const h = c.req.header('authorization')
  return h?.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : null
}

export function ownOrigin(client: ClientInfo) {
  return `${client.secure ? 'https' : 'http'}://${client.host}`
}

/**
 * OWASP CSRF Prevention Cheat Sheet: Fetch Metadata first (`Sec-Fetch-Site` must be
 * `same-origin`), then the Origin header against our own origin. A browser request carries one
 * or the other; an app's request carries neither and no cookie, so it can't be forged this way.
 * A cookie-authenticated request with neither is refused, as the cheat sheet recommends.
 */
export function crossSite(c: Context<Env>, client: ClientInfo, cookieAuth: boolean): boolean {
  if (SAFE.has(c.req.method)) return false
  const site = c.req.header('sec-fetch-site')
  if (site) return site !== 'same-origin' && site !== 'none'
  const origin = c.req.header('origin')
  if (origin) return origin !== ownOrigin(client)
  return cookieAuth
}

export function guard(runtime: Runtime): MiddlewareHandler<Env> {
  return async (c, next) => {
    c.set('runtime', runtime)
    const net = runtime.network.settings()
    const trusted = runtime.network.trusted()
    const conn = connection(c)
    const client = resolveClient({
      ...conn,
      // HTTP/1.1 requires Host (RFC 9112 § 3.2); the request URL carries it where a header doesn't
      headers: { host: new URL(c.req.url).host, ...Object.fromEntries(c.req.raw.headers) },
      trusted,
      useForwardedHeaders: net.proxyHeaders,
    })
    c.set('client', client)
    const origin = c.req.header('origin') ?? ownOrigin(client)
    const meta: RequestMeta = {
      address: client.address,
      userAgent: c.req.header('user-agent'),
      origin,
    }
    c.set('meta', meta)

    const token = bearer(c)
    const cookie = token ? undefined : (getCookie(c, COOKIE.secure) ?? getCookie(c, COOKIE.plain))
    const principal = runtime.auth.authenticate({
      secret: token ?? cookie ?? null,
      headers: { get: (name) => c.req.header(name) },
      fromTrustedProxy: trusted.has(plainAddress(conn.remoteAddress)),
      meta,
    })
    c.set('principal', principal)
    c.set('via', principal ? (token ? 'bearer' : cookie ? 'cookie' : 'proxy') : null)

    if (crossSite(c, client, !!cookie && !token))
      throw new AppError('forbidden', 'That request came from another site.', {
        reason: 'cross-site',
      })

    const access = accessFor(c.req.method, c.req.path)
    if (access && access !== 'public') {
      if (!principal) throw new AppError('unauthorized', 'Sign in first.', { reason: 'signed-out' })
      if (principal.scope === 'read' && !SAFE.has(c.req.method))
        throw new AppError('forbidden', 'This key is read-only.', { reason: 'read-only-key' })
      if (!allowed(principal, access))
        throw new AppError('forbidden', 'You don’t have access to that.')
    }
    await next()
  }
}

export function allowed(p: Principal, access: Access): boolean {
  switch (access) {
    case 'public':
    case 'user':
      return true
    case 'people':
      return canManageUsers(p.user.role, p.user.permissions)
    case 'library':
      return isStaff(p.user.role) || p.user.permissions.includes('manageLibrary')
    case 'staff':
      return isStaff(p.user.role)
    case 'owner':
      return p.user.role === 'owner'
  }
}

/** The signed-in person, for handlers behind a non-public route. */
export function me(c: Context<Env>): Principal {
  const p = c.get('principal')
  if (!p) throw new AppError('unauthorized', 'Sign in first.', { reason: 'signed-out' })
  return p
}

export const actor = (p: Principal) => ({ id: p.user.id, name: p.user.username })

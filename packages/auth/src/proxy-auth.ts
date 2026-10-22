// SPDX-License-Identifier: AGPL-3.0-only
// Sign-in by a forward-auth proxy (Authelia, Authentik, oauth2-proxy): the proxy authenticates
// the person and passes their username in a header, `Remote-User` by default. Off unless the
// owner turns it on, and believed only from a trusted proxy's address; anyone else could send the
// header themselves (Authelia's and Authentik's proxy docs both rest on this). It maps to an
// existing account and never creates one.
import { schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'
import type { Ctx } from './context.ts'
import type { Principal } from './sessions.ts'

/**
 * The person the proxy vouches for, or null. `fromTrustedProxy` is the server's check of the
 * connection's address against the trusted proxies.
 */
export function authenticateProxy(
  ctx: Ctx,
  headers: { get(name: string): string | null | undefined },
  fromTrustedProxy: boolean,
): Principal | null {
  const { proxyAuth } = ctx.security()
  if (!proxyAuth.enabled || !fromTrustedProxy) return null
  const username = headers.get(proxyAuth.header)?.trim().toLowerCase()
  if (!username) return null
  const row = ctx.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .get()
  if (!row) return null
  const user = ctx.userViews([row.id])[0]
  if (!user || user.invited) return null
  return { user, deviceId: null, via: 'proxy', scope: 'full', method: 'proxy', expiresAt: null }
}

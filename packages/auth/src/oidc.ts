// SPDX-License-Identifier: AGPL-3.0-only
// Single sign-on with an OpenID Connect provider (Authelia, Authentik, Keycloak, Google) through
// openid-client, which is OpenID Certified. The authorization code flow with PKCE (S256), state
// and nonce, as OAuth 2.0 Security Best Current Practice (RFC 9700 § 2.1.1) and openid-client's
// own examples do it. The redirect URI is fixed to the external URL, never taken from a request.
//
// Accounts are matched by the ID token's issuer and subject (OIDC Core § 5.7: "the sub and iss
// Claims, used together, are the only Claims that an RP can rely upon as a stable identifier").
// Email and username aren't used, since a provider may let people change them. An unknown
// identity is refused; following an invite link and signing in with the provider links it.
//
// The apps sign in the same way, in the system browser as RFC 8252 asks of native apps (§ 8.12),
// and come back through their own scheme, `highsea://oidc` (§ 7.1). Any app could claim that
// scheme, so what comes back is a one-time code, not a token: the app sent the S256 challenge of
// a verifier only it holds when it started (RFC 7636, as RFC 8252 § 8.1 asks), and exchanges the
// code with the verifier for its device token (ADR 0024's 4.4 section).
import { createHash, timingSafeEqual } from 'node:crypto'
import { AppError } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { and, eq } from 'drizzle-orm'
import * as client from 'openid-client'
import { createChallenge, deleteChallenge, findChallenge } from './challenges.ts'
import type { Ctx, DeviceInput, RequestMeta } from './context.ts'
import { verifier } from './secrets.ts'
import { type Issued, issueDevice } from './sessions.ts'

export const CALLBACK_PATH = '/api/v1/auth/oidc/callback'

/** Where an app's sign-in comes back to: `highsea://oidc?code=` or `?error=`. */
export const APP_RETURN = 'highsea://oidc'

/** An S256 challenge: 32 bytes of SHA-256 in base64url without padding (RFC 7636 § 4.2). */
const S256 = /^[A-Za-z0-9_-]{43}$/

/** How long an app has to exchange its code once the browser hands it over. */
const APP_CODE_TTL = 2 * 60_000

type Round = {
  codeVerifier: string
  nonce: string
  /** Following an invite: the invite's token, so the identity is linked to that account. */
  invite: string | null
  /** An app signing in: its PKCE challenge, which its code is exchanged against. */
  app?: { challenge: string } | null
}

/** A signed-in app's one-time code, waiting for the app to exchange it. */
type AppCode = { userId: string; challenge: string }

/** What a callback ends in: the admin's session, or a code to hand back to the app. */
export type Callback = { kind: 'session'; issued: Issued } | { kind: 'app'; code: string }

export function redirectUri(ctx: Ctx): string | null {
  const external = ctx.addresses().externalUrl
  return external ? `${external.replace(/\/$/, '')}${CALLBACK_PATH}` : null
}

/** Whether the sign-in screen offers single sign-on, and its button's provider name. */
export function oidcOffered(ctx: Ctx): { name: string } | null {
  const { oidc } = ctx.security()
  return oidc.enabled && oidc.issuer && oidc.clientId && redirectUri(ctx)
    ? { name: oidc.name || 'single sign-on' }
    : null
}

const oidcError = (
  reason: string,
  message: string,
  status: 'unauthorized' | 'forbidden' | 'unavailable' = 'unauthorized',
  app = false,
) => new AppError(status, message, app ? { reason, app } : { reason })

export function createOidc(ctx: Ctx) {
  // discovery once per provider configuration
  let cached: { key: string; config: Promise<client.Configuration> } | null = null

  function configuration(): Promise<client.Configuration> {
    const { oidc } = ctx.security()
    if (!oidcOffered(ctx))
      throw oidcError('oidc-off', 'Single sign-on isn’t set up on this server.', 'forbidden')
    const key = `${oidc.issuer}|${oidc.clientId}|${oidc.clientSecretSealed ?? ''}`
    if (cached?.key !== key) {
      const secret = oidc.clientSecretSealed ? ctx.sealer.open(oidc.clientSecretSealed) : undefined
      const options: client.DiscoveryRequestOptions = {}
      if (ctx.fetch) options[client.customFetch] = ctx.fetch as client.CustomFetch
      const config = client
        .discovery(
          new URL(oidc.issuer),
          oidc.clientId,
          undefined,
          secret ? client.ClientSecretPost(secret) : client.None(),
          options,
        )
        .catch((e: Error) => {
          cached = null
          ctx.logger.warn('Single sign-on discovery failed', {
            issuer: oidc.issuer,
            error: e.message,
          })
          throw oidcError(
            'oidc-unreachable',
            `Couldn’t reach ${oidc.name || 'the provider'}. Try again in a moment.`,
            'unavailable',
          )
        })
      cached = { key, config }
    }
    return cached.config
  }

  return {
    /** Where to send the browser: the provider's authorization endpoint. */
    async start(input: { invite?: string; challenge?: string } = {}): Promise<URL> {
      if (input.challenge !== undefined && !S256.test(input.challenge))
        throw new AppError('invalid', 'That sign-in can’t start: its challenge isn’t S256.')
      const config = await configuration()
      const codeVerifier = client.randomPKCECodeVerifier()
      const nonce = client.randomNonce()
      const state = client.randomState()
      createChallenge<Round>(ctx, 'oidc', {
        secret: state,
        data: {
          codeVerifier,
          nonce,
          invite: input.invite ?? null,
          app: input.challenge ? { challenge: input.challenge } : null,
        },
        ttl: 10 * 60_000,
      })
      return client.buildAuthorizationUrl(config, {
        redirect_uri: redirectUri(ctx) as string,
        scope: 'openid profile',
        code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: 'S256',
        state,
        nonce,
      })
    },

    /**
     * The provider sent the browser back with `query` (the callback's search string). Exchanges
     * the code, checks the ID token, and signs in the linked account; for an app, hands back a
     * code to exchange instead. Errors after the round is found say whether it was an app's.
     */
    async callback(query: string, meta: RequestMeta): Promise<Callback> {
      const params = new URLSearchParams(query)
      const state = params.get('state') ?? ''
      const round = state ? findChallenge<Round>(ctx, 'oidc', state) : null
      if (!round)
        throw oidcError(
          'challenge-expired',
          'That sign-in took too long or was already used. Start again.',
        )
      deleteChallenge(ctx, round.id)
      const app = round.data.app ?? null
      const fail = (
        reason: string,
        message: string,
        status?: 'unauthorized' | 'forbidden' | 'unavailable',
      ) => oidcError(reason, message, status, app !== null)
      if (params.get('error'))
        throw fail(
          'oidc-denied',
          'The provider didn’t sign you in. Try again, or sign in with a password.',
        )
      const config = await configuration().catch((e: AppError) => {
        throw fail(
          (e.details as { reason: string }).reason,
          e.message,
          e.code as 'forbidden' | 'unavailable',
        )
      })
      // the URL the provider redirected to, rebuilt from the configured redirect URI
      const current = new URL(redirectUri(ctx) as string)
      current.search = query
      let claims: client.IDToken | undefined
      try {
        const tokens = await client.authorizationCodeGrant(config, current, {
          pkceCodeVerifier: round.data.codeVerifier,
          expectedState: state,
          expectedNonce: round.data.nonce,
          idTokenExpected: true,
        })
        claims = tokens.claims()
      } catch (e) {
        ctx.logger.warn('Single sign-on was refused', { error: (e as Error).message })
        throw fail('oidc-invalid', 'The provider’s answer couldn’t be checked. Try again.')
      }
      if (!claims?.sub)
        throw fail('oidc-invalid', 'The provider’s answer couldn’t be checked. Try again.')
      const { iss: issuer, sub: subject } = claims
      const t = schema.oidcIdentities
      let userId = ctx.db
        .select({ userId: t.userId })
        .from(t)
        .where(and(eq(t.issuer, issuer), eq(t.subject, subject)))
        .get()?.userId

      if (!userId && round.data.invite)
        userId = acceptInvite(round.data.invite, issuer, subject, meta)
      if (!userId) {
        ctx.audit({
          action: 'auth.sign-in-failed',
          address: meta.address,
          detail: { reason: 'oidc-unknown', issuer, subject },
        })
        throw fail(
          'oidc-unknown',
          'There’s no account here for you yet. Ask the server’s owner for an invite.',
          'forbidden',
        )
      }
      if (app) {
        const code = createChallenge<AppCode>(ctx, 'oidc-app', {
          userId,
          data: { userId, challenge: app.challenge },
          ttl: APP_CODE_TTL,
        }).secret
        return { kind: 'app', code }
      }
      return { kind: 'session', issued: issueDevice(ctx, userId, 'oidc', meta) }
    },

    /**
     * An app exchanges the code it got back for its device token, proving with the verifier that
     * it's the app that started the sign-in (RFC 7636 § 4.6). A code works once.
     */
    exchange(
      input: { code: string; verifier: string; device: DeviceInput },
      meta: RequestMeta,
    ): Issued {
      const expired = () =>
        oidcError(
          'challenge-expired',
          'That sign-in took too long or was already used. Start again.',
        )
      const found = findChallenge<AppCode>(ctx, 'oidc-app', input.code)
      if (!found) throw expired()
      deleteChallenge(ctx, found.id)
      const sent = Buffer.from(createHash('sha256').update(input.verifier).digest('base64url'))
      const kept = Buffer.from(found.data.challenge)
      if (sent.length !== kept.length || !timingSafeEqual(sent, kept)) {
        ctx.audit({
          action: 'auth.sign-in-failed',
          address: meta.address,
          detail: { reason: 'oidc-verifier' },
        })
        throw expired()
      }
      return issueDevice(ctx, found.data.userId, 'oidc', meta, input.device)
    },
  }

  /** Links the identity to the invited account and finishes it; returns its id. */
  function acceptInvite(
    token: string,
    issuer: string,
    subject: string,
    meta: RequestMeta,
  ): string | undefined {
    const link = ctx.db
      .select()
      .from(schema.accountLinks)
      .where(eq(schema.accountLinks.tokenHash, verifier(token)))
      .get()
    if (link?.kind !== 'invite' || link.expiresAt <= ctx.now()) return undefined
    const now = ctx.now()
    ctx.db.delete(schema.accountLinks).where(eq(schema.accountLinks.id, link.id)).run()
    ctx.db
      .insert(schema.oidcIdentities)
      .values({ issuer, subject, userId: link.userId, createdAt: now })
      .run()
    ctx.db
      .update(schema.users)
      .set({ invited: false, updatedAt: now })
      .where(eq(schema.users.id, link.userId))
      .run()
    const user = ctx.userView(link.userId)
    ctx.audit({
      action: 'user.join',
      actor: { id: user.id, name: user.username },
      targetType: 'user',
      targetId: user.id,
      address: meta.address,
      detail: { method: 'oidc', issuer },
    })
    ctx.events.emit({ topic: 'users.updated', ids: [user.id] })
    return user.id
  }
}

export type OidcService = ReturnType<typeof createOidc>

// SPDX-License-Identifier: AGPL-3.0-only
// Single sign-on against a fake provider, through openid-client's documented customFetch hook:
// discovery, the JWKS, and a token endpoint that checks PKCE and signs ID tokens with RS256.
import { describe, expect, test } from 'bun:test'
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { isAppError } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import type { Fetch } from '../src/index.ts'
import { meta, withOwner } from './helpers.ts'

const ISSUER = 'https://auth.example.net/application/o/highsea/'
const CLIENT = 'highsea'

function fakeProvider() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }
  const codes = new Map<string, { nonce: string; challenge: string; sub: string }>()
  const requests: string[] = []
  let overrides: Record<string, unknown> = {}

  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
  const idToken = (claims: Record<string, unknown>) => {
    const input = `${b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' })}.${b64(claims)}`
    return `${input}.${sign('sha256', Buffer.from(input), privateKey).toString('base64url')}`
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  const fetch: Fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    requests.push(url.pathname)
    if (url.href === `${ISSUER}.well-known/openid-configuration`)
      return json({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}authorize`,
        token_endpoint: `${ISSUER}token`,
        jwks_uri: `${ISSUER}jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
      })
    if (url.href === `${ISSUER}jwks`) return json({ keys: [jwk] })
    if (url.href === `${ISSUER}token`) {
      const body = new URLSearchParams(String(init?.body))
      const grant = codes.get(body.get('code') ?? '')
      if (!grant) return json({ error: 'invalid_grant' }, 400)
      codes.delete(body.get('code') as string)
      const verifier = body.get('code_verifier') ?? ''
      if (createHash('sha256').update(verifier).digest('base64url') !== grant.challenge)
        return json({ error: 'invalid_grant', error_description: 'PKCE' }, 400)
      if (body.get('redirect_uri') !== 'https://harbor.example.net/api/v1/auth/oidc/callback')
        return json({ error: 'invalid_grant' }, 400)
      const now = Math.floor(Date.now() / 1000)
      return json({
        access_token: 'at',
        token_type: 'Bearer',
        expires_in: 300,
        id_token: idToken({
          iss: ISSUER,
          sub: grant.sub,
          aud: CLIENT,
          iat: now,
          exp: now + 300,
          nonce: grant.nonce,
          ...overrides,
        }),
      })
    }
    return json({ error: 'not found' }, 404)
  }

  return {
    fetch,
    requests,
    tamper(claims: Record<string, unknown>) {
      overrides = claims
    },
    /** The person signs in at the provider; it redirects back with a code. */
    authorize(url: URL, sub: string): string {
      expect(url.origin + url.pathname).toBe(`${ISSUER}authorize`)
      expect(url.searchParams.get('code_challenge_method')).toBe('S256')
      expect(url.searchParams.get('client_id')).toBe(CLIENT)
      const code = randomBytes(8).toString('hex')
      codes.set(code, {
        nonce: url.searchParams.get('nonce') as string,
        challenge: url.searchParams.get('code_challenge') as string,
        sub,
      })
      return `?code=${code}&state=${url.searchParams.get('state')}&iss=${encodeURIComponent(ISSUER)}`
    },
  }
}

async function configured() {
  const provider = fakeProvider()
  const env = await withOwner({ fetch: provider.fetch })
  env.auth.security.save(
    {
      twoFactor: false,
      passkeys: true,
      sessionDays: 30,
      oidc: {
        enabled: true,
        name: 'Authentik',
        issuer: ISSUER,
        clientId: CLIENT,
        clientSecret: 'shh',
      },
      proxyAuth: { enabled: false, header: 'Remote-User' },
    },
    env.actor,
    meta,
  )
  return { ...env, provider }
}

async function reason(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn()
  } catch (e) {
    if (isAppError(e)) return (e.details as { reason?: string })?.reason
    throw e
  }
  throw new Error('expected a failure')
}

describe('single sign-on', () => {
  test('an unknown identity is refused and told to ask for an invite', async () => {
    const env = await configured()
    const url = await env.auth.oidc.start()
    const query = env.provider.authorize(url, 'subject-1')
    expect(await reason(() => env.auth.oidc.callback(query, meta))).toBe('oidc-unknown')
  })

  test('following an invite links the identity; later sign-ins match issuer and subject', async () => {
    const env = await configured()
    const invite = env.auth.users.invite(
      { displayName: 'Mara', email: null, role: 'user', libraries: 'all' },
      env.actor,
      meta,
    )
    const token = invite.link.split('/').pop() as string
    let url = await env.auth.oidc.start({ invite: token })
    const joined = await env.auth.oidc.callback(env.provider.authorize(url, 'mara-sub'), meta)
    expect(joined.session.user).toMatchObject({
      id: invite.user.id,
      invited: false,
      hasPassword: false,
    })
    expect(joined.session.method).toBe('oidc')
    expect(env.db.select().from(schema.oidcIdentities).all()).toMatchObject([
      { issuer: ISSUER, subject: 'mara-sub' },
    ])
    // the invite is used up
    expect(await reason(() => env.auth.links.info(token))).toBe('link-expired')
    url = await env.auth.oidc.start()
    const again = await env.auth.oidc.callback(env.provider.authorize(url, 'mara-sub'), meta)
    expect(again.session.user.id).toBe(invite.user.id)
    // discovery ran once
    expect(env.provider.requests.filter((p) => p.endsWith('openid-configuration'))).toHaveLength(1)
  })

  test('state is single use and must match', async () => {
    const env = await configured()
    const url = await env.auth.oidc.start()
    const query = env.provider.authorize(url, 'subject-1')
    expect(
      await reason(() =>
        env.auth.oidc.callback(query.replace(/state=[^&]+/, 'state=forged'), meta),
      ),
    ).toBe('challenge-expired')
    await reason(() => env.auth.oidc.callback(query, meta))
    expect(await reason(() => env.auth.oidc.callback(query, meta))).toBe('challenge-expired')
  })

  test('an ID token with the wrong nonce or audience is refused', async () => {
    const env = await configured()
    for (const claims of [
      { nonce: 'other' },
      { aud: 'someone-else' },
      { iss: 'https://evil.example.net/' },
    ]) {
      env.provider.tamper(claims)
      const url = await env.auth.oidc.start()
      expect(
        await reason(() => env.auth.oidc.callback(env.provider.authorize(url, 'x'), meta)),
      ).toBe('oidc-invalid')
    }
  })

  test('the provider saying no is reported, not retried', async () => {
    const env = await configured()
    const url = await env.auth.oidc.start()
    const state = url.searchParams.get('state')
    expect(
      await reason(() => env.auth.oidc.callback(`?error=access_denied&state=${state}`, meta)),
    ).toBe('oidc-denied')
  })

  test('not offered until it’s set up', async () => {
    const env = await withOwner()
    expect(env.auth.methods().oidc).toBeNull()
    expect(await reason(() => env.auth.oidc.start())).toBe('oidc-off')
  })
})

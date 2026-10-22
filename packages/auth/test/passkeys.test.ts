// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { isAppError } from '@highsea-tv/core'
import { createAuthenticator, FLAGS } from './authenticator.ts'
import { codeFor, meta, OWNER, withOwner } from './helpers.ts'

const ORIGIN = 'https://harbor.example.net'
const at = (origin: string) => ({ ...meta, origin })

async function reason(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn()
  } catch (e) {
    if (isAppError(e)) return (e.details as { reason?: string })?.reason ?? e.code
    throw e
  }
  throw new Error('expected a failure')
}

async function registered() {
  const env = await withOwner()
  const authenticator = createAuthenticator()
  const { challenge, options } = await env.auth.passkeys.registrationOptions(
    env.owner.id,
    at(ORIGIN),
  )
  const passkey = await env.auth.passkeys.register(
    env.owner.id,
    { challenge, response: authenticator.create(options, ORIGIN), name: 'MacBook' },
    at(ORIGIN),
  )
  return { ...env, authenticator, passkey }
}

describe('where passkeys work', () => {
  test('the external HTTPS address and localhost, never an IP address', async () => {
    const { auth, setExternalUrl } = await withOwner()
    expect(auth.passkeys.relyingParty(ORIGIN)).toEqual({
      origin: ORIGIN,
      rpID: 'harbor.example.net',
    })
    expect(auth.passkeys.relyingParty('http://localhost:3000')).toEqual({
      origin: 'http://localhost:3000',
      rpID: 'localhost',
    })
    expect(auth.passkeys.relyingParty('http://192.168.1.10:3000')).toBeNull()
    expect(auth.passkeys.relyingParty('https://evil.example.net')).toBeNull()
    setExternalUrl('http://harbor.example.net')
    expect(auth.passkeys.relyingParty('http://harbor.example.net')).toBeNull()
    expect(auth.methods('http://192.168.1.10:3000').passkeys).toBe(false)
  })

  test('turned off in Security, nowhere', async () => {
    const env = await withOwner()
    env.security({ passkeys: false })
    expect(env.auth.passkeys.relyingParty(ORIGIN)).toBeNull()
    expect(await reason(() => env.auth.passkeys.signInOptions(at(ORIGIN)))).toBe(
      'passkeys-unavailable',
    )
  })
})

describe('passkeys', () => {
  test('registration asks for a discoverable, user-verified credential with no attestation', async () => {
    const { auth, owner } = await withOwner()
    const { options } = await auth.passkeys.registrationOptions(owner.id, at(ORIGIN))
    expect(options.rp.id).toBe('harbor.example.net')
    expect(options.attestation).toBe('none')
    expect(options.authenticatorSelection).toMatchObject({
      residentKey: 'required',
      userVerification: 'required',
    })
    // the user handle is random, not the user id (WebAuthn L3 § 14.6.1)
    expect(options.user.id).not.toContain(owner.id)
  })

  test('registers, signs in without a username, and skips the code step', async () => {
    const env = await registered()
    expect(env.passkey.name).toBe('MacBook')
    expect(env.auth.users.get(env.owner.id).passkeys).toBe(1)
    // turn on two-step: a passkey still signs straight in
    const { secret } = await env.auth.twoFactor.start(env.owner.id, OWNER.password)
    env.auth.twoFactor.enable(env.owner.id, codeFor(secret, env.clock.now()), meta)
    const { challenge, options } = await env.auth.passkeys.signInOptions(at(ORIGIN))
    expect(options.allowCredentials ?? []).toEqual([])
    const issued = await env.auth.passkeys.signIn(
      { challenge, response: env.authenticator.get(options, ORIGIN) },
      at(ORIGIN),
    )
    expect(issued.session).toMatchObject({ method: 'passkey' })
    expect(issued.session.user.id).toBe(env.owner.id)
  })

  test('each challenge works once', async () => {
    const env = await registered()
    const { challenge, options } = await env.auth.passkeys.signInOptions(at(ORIGIN))
    await env.auth.passkeys.signIn(
      { challenge, response: env.authenticator.get(options, ORIGIN) },
      at(ORIGIN),
    )
    expect(
      await reason(() =>
        env.auth.passkeys.signIn(
          { challenge, response: env.authenticator.get(options, ORIGIN) },
          at(ORIGIN),
        ),
      ),
    ).toBe('challenge-expired')
  })

  test('refuses another origin, a missing verification flag, and an unknown credential', async () => {
    const env = await registered()
    let o = await env.auth.passkeys.signInOptions(at(ORIGIN))
    expect(
      await reason(() =>
        env.auth.passkeys.signIn(
          {
            challenge: o.challenge,
            response: env.authenticator.get(o.options, 'https://evil.example.net'),
          },
          at(ORIGIN),
        ),
      ),
    ).toBe('passkey-invalid')
    o = await env.auth.passkeys.signInOptions(at(ORIGIN))
    expect(
      await reason(() =>
        env.auth.passkeys.signIn(
          { challenge: o.challenge, response: env.authenticator.get(o.options, ORIGIN, FLAGS.UP) },
          at(ORIGIN),
        ),
      ),
    ).toBe('passkey-invalid')
    o = await env.auth.passkeys.signInOptions(at(ORIGIN))
    const stranger = createAuthenticator()
    expect(
      await reason(() =>
        env.auth.passkeys.signIn(
          { challenge: o.challenge, response: stranger.get(o.options, ORIGIN) },
          at(ORIGIN),
        ),
      ),
    ).toBe('passkey-invalid')
  })

  test('registration without user verification is refused', async () => {
    const { auth, owner } = await withOwner()
    const { challenge, options } = await auth.passkeys.registrationOptions(owner.id, at(ORIGIN))
    const response = createAuthenticator().create(options, ORIGIN, FLAGS.UP)
    expect(
      await reason(() => auth.passkeys.register(owner.id, { challenge, response }, at(ORIGIN))),
    ).toBe('passkey-invalid')
  })

  test('renames and removes; a removed passkey no longer signs in', async () => {
    const env = await registered()
    expect(env.auth.passkeys.rename(env.owner.id, env.passkey.id, 'Work laptop').name).toBe(
      'Work laptop',
    )
    env.auth.passkeys.remove(env.owner.id, env.passkey.id, meta)
    const o = await env.auth.passkeys.signInOptions(at(ORIGIN))
    expect(
      await reason(() =>
        env.auth.passkeys.signIn(
          { challenge: o.challenge, response: env.authenticator.get(o.options, ORIGIN) },
          at(ORIGIN),
        ),
      ),
    ).toBe('passkey-invalid')
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { isAppError } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'
import type { SignInOutcome } from '../src/index.ts'
import { addMember, codeFor, meta, OWNER, setup, tv, withOwner } from './helpers.ts'

/** The error's code and details.reason, for matching. */
async function failure(
  fn: () => unknown,
): Promise<{ code: string; reason?: string; message: string }> {
  try {
    await fn()
  } catch (e) {
    if (!isAppError(e)) throw e
    return {
      code: e.code,
      reason: (e.details as { reason?: string } | undefined)?.reason,
      message: e.message,
    }
  }
  throw new Error('expected a failure')
}

function signedIn(outcome: SignInOutcome) {
  if (outcome.status !== 'signed-in') throw new Error(`expected signed-in, got ${outcome.status}`)
  return outcome
}

describe('owner and setup', () => {
  test('makes one owner with all libraries, whose powers come from the role', async () => {
    const { owner, auth } = await withOwner()
    expect(owner.role).toBe('owner')
    expect(owner.permissions).toEqual([])
    expect(owner.libraries).toBe('all')
    expect(auth.hasOwner()).toBe(true)
    expect((await failure(() => auth.createOwner({ ...OWNER, username: 'mara' }, meta))).code).toBe(
      'conflict',
    )
  })

  test('checks the username and password rules from the setup spec', async () => {
    const { auth } = setup()
    expect(
      (await failure(() => auth.createOwner({ ...OWNER, username: 'Ines!' }, meta))).reason,
    ).toBe('username-invalid')
    expect(
      (await failure(() => auth.createOwner({ ...OWNER, password: 'short' }, meta))).reason,
    ).toBe('password-short')
  })

  test('stores the password as argon2id, never plain', async () => {
    const { db, owner } = await withOwner()
    const row = db.select().from(schema.users).where(eq(schema.users.id, owner.id)).get()
    expect(row?.passwordHash).toStartWith('$argon2id$')
    expect(JSON.stringify(row)).not.toContain(OWNER.password)
  })
})

describe('password sign-in', () => {
  test('signs in as an admin session with a cookie secret, stored only as a verifier', async () => {
    const { auth, db } = await withOwner()
    const out = signedIn(
      await auth.signIn.password({ username: 'Ines', password: OWNER.password }, meta),
    )
    expect(out.secret).toStartWith('hss_')
    expect(out.session.user.username).toBe('ines')
    expect(out.session.expiresAt).toBe((out.session.user.lastSeenAt as number) + 30 * 86_400_000)
    const device = db.select().from(schema.devices).get()
    expect(device?.client).toBe('admin')
    expect(device?.name).toBe('Firefox on macOS')
    expect(JSON.stringify(device)).not.toContain(out.secret)
    expect(
      auth.authenticate({ secret: out.secret, headers: new Headers(), fromTrustedProxy: false })
        ?.user.id,
    ).toBe(out.session.user.id)
  })

  test('an app gets a token that doesn’t expire', async () => {
    const { auth } = await withOwner()
    const out = signedIn(await auth.signIn.password({ ...OWNER, device: tv }, meta))
    expect(out.secret).toStartWith('hst_')
    expect(out.session.expiresAt).toBeNull()
    expect(auth.devices.list()[0]?.client).toBe('tvos')
  })

  test('one generic error for an unknown user, a wrong password or a pending invite', async () => {
    const env = await withOwner()
    const invite = env.auth.users.invite(
      { displayName: 'Mara', email: null, role: 'user', libraries: 'all' },
      env.actor,
      meta,
    )
    for (const attempt of [
      { username: 'nobody', password: 'whatever whatever' },
      { username: 'ines', password: 'wrong password' },
      { username: invite.user.username, password: 'whatever whatever' },
    ]) {
      const f = await failure(() => env.auth.signIn.password(attempt, meta))
      expect(f).toEqual({
        code: 'unauthorized',
        reason: 'invalid-credentials',
        message: 'That username and password don’t match.',
      })
    }
  })

  test('sessions end after the configured days', async () => {
    const { auth, clock } = await withOwner()
    const out = signedIn(await auth.signIn.password(OWNER, meta))
    clock.advance(30 * 86_400_000 + 1)
    expect(
      auth.authenticate({ secret: out.secret, headers: new Headers(), fromTrustedProxy: false }),
    ).toBeNull()
  })

  test('ten failures block the account for five minutes, passkeys and codes aside', async () => {
    const { auth, clock } = await withOwner()
    for (let i = 0; i < 10; i++)
      await failure(() =>
        auth.signIn.password({ username: 'ines', password: 'wrong password' }, meta),
      )
    const blocked = await failure(() => auth.signIn.password(OWNER, { address: '10.0.0.9' }))
    expect(blocked.code).toBe('rate-limited')
    clock.advance(5 * 60_000)
    signedIn(await auth.signIn.password(OWNER, meta))
  })

  test('fifty failures from one address block it for any account', async () => {
    const { auth } = await withOwner()
    for (let i = 0; i < 50; i++)
      await failure(() =>
        auth.signIn.password({ username: `nobody${i}`, password: 'wrong password' }, meta),
      )
    expect((await failure(() => auth.signIn.password(OWNER, meta))).code).toBe('rate-limited')
    signedIn(await auth.signIn.password(OWNER, { address: '10.0.0.9' }))
  })

  test('failed sign-ins are audited without the password', async () => {
    const { auth } = await withOwner()
    await failure(() =>
      auth.signIn.password({ username: 'ines', password: 'wrong password' }, meta),
    )
    const [entry] = auth.audit({}).items
    expect(entry?.action).toBe('auth.sign-in-failed')
    expect(JSON.stringify(entry)).not.toContain('wrong password')
  })
})

describe('two-step verification', () => {
  async function enrolled() {
    const env = await withOwner()
    const { secret } = await env.auth.twoFactor.start(env.owner.id, OWNER.password)
    const codes = env.auth.twoFactor.enable(env.owner.id, codeFor(secret, env.clock.now()), meta)
    env.clock.advance(30_000)
    return { ...env, secret, codes }
  }

  test('enrolment needs the password, a code, and gives ten recovery codes', async () => {
    const env = await withOwner()
    expect(
      (await failure(() => env.auth.twoFactor.start(env.owner.id, 'wrong password'))).reason,
    ).toBe('invalid-credentials')
    const { secret, uri } = await env.auth.twoFactor.start(env.owner.id, OWNER.password)
    expect(uri).toStartWith('otpauth://totp/')
    expect(
      (await failure(() => env.auth.twoFactor.enable(env.owner.id, '000000', meta))).reason,
    ).toBe('invalid-code')
    const codes = env.auth.twoFactor.enable(env.owner.id, codeFor(secret, env.clock.now()), meta)
    expect(codes).toHaveLength(10)
    expect(env.auth.users.get(env.owner.id).twoFactor).toBe(true)
  })

  test('the seed is sealed at rest', async () => {
    const { db, secret } = await enrolled()
    const row = db.select().from(schema.totp).get()
    expect(row?.secretSealed).toStartWith('v1.')
    expect(row?.secretSealed).not.toContain(secret)
  })

  test('a password then a code; the same code never works twice', async () => {
    const { auth, secret, clock } = await enrolled()
    const step = await auth.signIn.password(OWNER, meta)
    if (step.status !== 'two-factor') throw new Error(step.status)
    const code = codeFor(secret, clock.now())
    signedIn(auth.signIn.twoFactor({ challenge: step.challenge, code }, meta))
    const again = await auth.signIn.password(OWNER, meta)
    if (again.status !== 'two-factor') throw new Error(again.status)
    expect(
      (await failure(() => auth.signIn.twoFactor({ challenge: again.challenge, code }, meta)))
        .reason,
    ).toBe('invalid-code')
  })

  test('five wrong codes end the step', async () => {
    const { auth } = await enrolled()
    const step = await auth.signIn.password(OWNER, meta)
    if (step.status !== 'two-factor') throw new Error(step.status)
    for (let i = 0; i < 4; i++)
      expect(
        (
          await failure(() =>
            auth.signIn.twoFactor({ challenge: step.challenge, code: '000000' }, meta),
          )
        ).reason,
      ).toBe('invalid-code')
    expect(
      (
        await failure(() =>
          auth.signIn.twoFactor({ challenge: step.challenge, code: '000000' }, meta),
        )
      ).reason,
    ).toBe('challenge-expired')
    expect(
      (
        await failure(() =>
          auth.signIn.twoFactor({ challenge: step.challenge, code: '000000' }, meta),
        )
      ).reason,
    ).toBe('challenge-expired')
  })

  test('the step expires after five minutes', async () => {
    const { auth, clock, secret } = await enrolled()
    const step = await auth.signIn.password(OWNER, meta)
    if (step.status !== 'two-factor') throw new Error(step.status)
    clock.advance(5 * 60_000 + 1)
    const f = await failure(() =>
      auth.signIn.twoFactor(
        { challenge: step.challenge, code: codeFor(secret, clock.now()) },
        meta,
      ),
    )
    expect(f.reason).toBe('challenge-expired')
  })

  test('a recovery code works once, in any case or spacing', async () => {
    const { auth, codes } = await enrolled()
    const code = (codes[0] as string).toLowerCase().replaceAll('-', ' ')
    const step = await auth.signIn.password(OWNER, meta)
    if (step.status !== 'two-factor') throw new Error(step.status)
    signedIn(auth.signIn.twoFactor({ challenge: step.challenge, code }, meta))
    const again = await auth.signIn.password(OWNER, meta)
    if (again.status !== 'two-factor') throw new Error(again.status)
    expect(
      (await failure(() => auth.signIn.twoFactor({ challenge: again.challenge, code }, meta)))
        .reason,
    ).toBe('invalid-code')
    expect(
      auth.twoFactor.status((auth.users.list()[0] as { id: string }).id).recoveryCodesLeft,
    ).toBe(9)
  })

  test('a new server requires two-step for the owner from the start', async () => {
    const env = setup({}, { fresh: true })
    await env.auth.createOwner(OWNER, meta)
    expect(env.auth.security.get().twoFactor).toBe(true)
    expect((await env.auth.signIn.password(OWNER, meta)).status).toBe('two-factor-setup')
  })

  test('a TV signing in with a password sees the code step only if the person turned it on', async () => {
    const env = await withOwner()
    env.security({ twoFactor: true })
    // required by policy, not turned on: the TV signs straight in
    signedIn(await env.auth.signIn.password({ ...OWNER, device: tv }, meta))
    // the admin, though, is asked to enrol
    const admin = await env.auth.signIn.password(OWNER, meta)
    expect(admin.status).toBe('two-factor-setup')
  })

  test('the policy makes the admin enrol during sign-in, then signs in with recovery codes', async () => {
    const env = await withOwner()
    env.security({ twoFactor: true })
    const member = await addMember(env, 'Mara')
    // users aren't staff
    signedIn(
      await env.auth.signIn.password(
        { username: member.username, password: 'a long enough password' },
        meta,
      ),
    )
    const step = await env.auth.signIn.password(OWNER, meta)
    if (step.status !== 'two-factor-setup') throw new Error(step.status)
    const out = signedIn(
      env.auth.signIn.twoFactor(
        { challenge: step.challenge, code: codeFor(step.secret, env.clock.now()) },
        meta,
      ),
    )
    expect(out.recoveryCodes).toHaveLength(10)
    expect(env.auth.users.get(env.owner.id).twoFactor).toBe(true)
  })

  test('someone who lost the app and the codes gets it turned off by the owner', async () => {
    const env = await withOwner()
    const password = 'a long enough password'
    const enrol = async (id: string, pw = password) => {
      const { secret } = await env.auth.twoFactor.start(id, pw)
      env.auth.twoFactor.enable(id, codeFor(secret, env.clock.now()), meta)
    }
    const ruth = await addMember(env, 'Ruth', 'admin')
    const tess = await addMember(env, 'Tess', 'admin')
    const asRuth = { id: ruth.id, name: ruth.username }
    await enrol(ruth.id)
    await enrol(tess.id)

    env.auth.users.resetTwoFactor(tess.id, env.actor, meta)
    expect(env.auth.users.get(tess.id).twoFactor).toBe(false)
    expect(env.auth.audit({}).items[0]).toMatchObject({
      action: 'two-factor.reset',
      targetId: tess.id,
    })
    const recovery = env.db
      .select()
      .from(schema.recoveryCodes)
      .where(eq(schema.recoveryCodes.userId, tess.id))
      .all()
    expect(recovery).toEqual([])
    signedIn(await env.auth.signIn.password({ username: tess.username, password }, meta))
    // the policy has them set it up again at the next sign-in
    env.security({ twoFactor: true })
    expect(
      (await env.auth.signIn.password({ username: tess.username, password }, meta)).status,
    ).toBe('two-factor-setup')

    expect(
      (await failure(() => env.auth.users.resetTwoFactor(tess.id, env.actor, meta))).code,
    ).toBe('conflict')
    // admins see people but don't manage them (ADR 0032)
    await enrol(tess.id)
    expect((await failure(() => env.auth.users.resetTwoFactor(tess.id, asRuth, meta))).reason).toBe(
      'not-owner',
    )
    await enrol(env.owner.id, OWNER.password)
    expect(
      (await failure(() => env.auth.users.resetTwoFactor(env.owner.id, asRuth, meta))).code,
    ).toBe('forbidden')
  })

  test('can’t be turned off while the policy requires it', async () => {
    const env = await enrolled()
    env.security({ twoFactor: true })
    expect(
      (await failure(() => env.auth.twoFactor.disable(env.owner.id, OWNER.password, meta))).reason,
    ).toBe('two-factor-required')
    env.security({ twoFactor: false })
    await env.auth.twoFactor.disable(env.owner.id, OWNER.password, meta)
    expect(env.auth.users.get(env.owner.id).twoFactor).toBe(false)
    signedIn(await env.auth.signIn.password(OWNER, meta))
  })
})

describe('people', () => {
  test('an invite is a pending person with a week-long, single-use link', async () => {
    const env = await withOwner()
    const invite = env.auth.users.invite(
      { displayName: 'Mara Jensen', email: null, role: 'user', libraries: 'all' },
      env.actor,
      meta,
    )
    expect(invite.user.invited).toBe(true)
    expect(invite.user.username).toBe('mara.jensen')
    expect(invite.link).toStartWith('https://harbor.example.net/invite/')
    expect(invite.expiresAt - env.clock.now()).toBe(7 * 86_400_000)
    const token = invite.link.split('/').pop() as string
    expect(env.auth.links.info(token)).toMatchObject({
      kind: 'invite',
      displayName: 'Mara Jensen',
      serverName: 'Harbor',
    })
    const joined = await env.auth.links.accept(
      token,
      { password: 'a long enough password', username: 'mara' },
      meta,
    )
    expect(joined.session.user).toMatchObject({
      username: 'mara',
      invited: false,
      role: 'user',
      permissions: ['request'],
    })
    expect(
      (
        await failure(() =>
          env.auth.links.accept(token, { password: 'a long enough password' }, meta),
        )
      ).reason,
    ).toBe('link-expired')
  })

  test('names must be unique, and invites expire', async () => {
    const env = await withOwner()
    const invite = env.auth.users.invite(
      { displayName: 'Mara', email: null, role: 'user', libraries: 'all' },
      env.actor,
      meta,
    )
    expect(
      (
        await failure(() =>
          env.auth.users.invite(
            { displayName: 'Mara', email: null, role: 'user', libraries: 'all' },
            env.actor,
            meta,
          ),
        )
      ).message,
    ).toBe('There’s already someone called Mara.')
    env.clock.advance(7 * 86_400_000)
    const token = invite.link.split('/').pop() as string
    expect((await failure(() => env.auth.links.info(token))).reason).toBe('link-expired')
    // copying the link again makes a fresh one
    const again = env.auth.users.inviteLink(invite.user.id, env.actor)
    expect(env.auth.links.info(again.link.split('/').pop() as string).kind).toBe('invite')
  })

  test('a user’s permissions and libraries are theirs; staff hold neither', async () => {
    const env = await withOwner()
    const mara = await addMember(env, 'Mara')
    let updated = env.auth.users.update(
      mara.id,
      { permissions: ['request', 'download'], libraries: ['movies'] },
      env.actor,
      meta,
    )
    expect(updated.permissions.sort()).toEqual(['download', 'request'])
    expect(updated.libraries).toEqual(['movies'])
    expect(
      (await failure(() => env.auth.users.update(mara.id, { libraries: [] }, env.actor, meta)))
        .reason,
    ).toBe('no-libraries')
    // an admin's powers come from the role: no permissions, every library
    updated = env.auth.users.update(mara.id, { role: 'admin' }, env.actor, meta)
    expect(updated.permissions).toEqual([])
    expect(updated.libraries).toBe('all')
    updated = env.auth.users.update(
      mara.id,
      { permissions: ['download'], libraries: ['movies'] },
      env.actor,
      meta,
    )
    expect(updated.permissions).toEqual([])
    expect(updated.libraries).toBe('all')
    // back to a user: the role's default, Ask for titles
    updated = env.auth.users.update(mara.id, { role: 'user' }, env.actor, meta)
    expect(updated.permissions).toEqual(['request'])
  })

  test('the refusals in the spec', async () => {
    const env = await withOwner()
    const admin = await addMember(env, 'Ruth', 'admin')
    const actor = { id: admin.id, name: admin.username }
    expect(
      (await failure(() => env.auth.users.update(env.owner.id, { role: 'admin' }, env.actor, meta)))
        .message,
    ).toBe('The owner stays the owner. Hand ownership over in Security first.')
    expect((await failure(() => env.auth.users.remove(env.owner.id, actor, meta))).message).toBe(
      'The owner can’t be removed.',
    )
    expect((await failure(() => env.auth.users.remove(admin.id, actor, meta))).message).toBe(
      'You can’t remove yourself.',
    )
    // only the owner invites and manages people; an admin sees them read-only (ADR 0032)
    const mara = await addMember(env, 'Mara')
    const pending = env.auth.users.invite(
      { displayName: 'Uma', email: null, role: 'user', libraries: 'all' },
      env.actor,
      meta,
    )
    const refusals = [
      () =>
        env.auth.users.invite(
          { displayName: 'Vic', email: null, role: 'user', libraries: 'all' },
          actor,
          meta,
        ),
      () => env.auth.users.update(mara.id, { permissions: ['download'] }, actor, meta),
      () => env.auth.users.remove(mara.id, actor, meta),
      () => env.auth.users.resetLink(mara.id, actor, meta),
      () => env.auth.users.inviteLink(pending.user.id, actor),
      () => env.auth.users.resetTwoFactor(mara.id, actor, meta),
    ]
    for (const refused of refusals) {
      const f = await failure(refused)
      expect(f.code).toBe('forbidden')
      expect(f.reason).toBe('not-owner')
    }
    expect(env.auth.users.list().map((u) => u.displayName)).toContain('Mara')
    // nor can a user
    expect(
      (
        await failure(() =>
          env.auth.users.update(
            admin.id,
            { role: 'user' },
            { id: mara.id, name: mara.username },
            meta,
          ),
        )
      ).code,
    ).toBe('forbidden')
  })

  test('making an admin a user ends their admin sessions and keys, not their apps', async () => {
    const env = await withOwner()
    const password = 'a long enough password'
    const ruth = await addMember(env, 'Ruth', 'admin')
    const browser = signedIn(
      await env.auth.signIn.password({ username: ruth.username, password }, meta),
    )
    const app = signedIn(
      await env.auth.signIn.password({ username: ruth.username, password, device: tv }, meta),
    )
    const key = env.auth.apiKeys.create(
      { name: 'Scripts', scope: 'full' },
      { id: ruth.id, name: ruth.username },
      meta,
    )
    const auth = (secret: string) =>
      env.auth.authenticate({ secret, headers: new Headers(), fromTrustedProxy: false })
    expect(auth(browser.secret)?.user.role).toBe('admin')

    env.auth.users.update(ruth.id, { role: 'user' }, env.actor, meta)
    expect(auth(browser.secret)).toBeNull()
    expect(auth(key.secret)).toBeNull()
    expect(env.auth.apiKeys.list(env.actor)).toEqual([])
    // the TV keeps working, as a user's
    expect(auth(app.secret)?.user).toMatchObject({ role: 'user', permissions: ['request'] })
    expect(env.auth.audit({}).items[0]).toMatchObject({
      action: 'user.update',
      targetId: ruth.id,
      detail: { role: 'user', endedStaffAccess: true },
    })
  })

  test('removing someone signs them out everywhere', async () => {
    const env = await withOwner()
    const mara = await addMember(env, 'Mara')
    const out = signedIn(
      await env.auth.signIn.password(
        { username: mara.username, password: 'a long enough password', device: tv },
        meta,
      ),
    )
    env.auth.users.remove(mara.id, env.actor, meta)
    expect(
      env.auth.authenticate({
        secret: out.secret,
        headers: new Headers(),
        fromTrustedProxy: false,
      }),
    ).toBeNull()
    expect(env.auth.devices.list(mara.id)).toEqual([])
  })

  test('a reset link sets a new password and ends admin sessions, but not the TV', async () => {
    const env = await withOwner()
    const mara = await addMember(env, 'Mara')
    const login = { username: mara.username, password: 'a long enough password' }
    const browser = signedIn(await env.auth.signIn.password(login, meta))
    const living = signedIn(await env.auth.signIn.password({ ...login, device: tv }, meta))
    const { link } = env.auth.users.resetLink(mara.id, env.actor, meta)
    expect(link).toContain('/reset/')
    await env.auth.links.accept(
      link.split('/').pop() as string,
      { password: 'a brand new password' },
      meta,
    )
    const check = (secret: string) =>
      env.auth.authenticate({ secret, headers: new Headers(), fromTrustedProxy: false })
    expect(check(browser.secret)).toBeNull()
    expect(check(living.secret)?.user.id).toBe(mara.id)
    signedIn(await env.auth.signIn.password({ ...login, password: 'a brand new password' }, meta))
  })

  test('changing your password needs the current one and ends your other admin sessions', async () => {
    const { auth, owner } = await withOwner()
    const here = signedIn(await auth.signIn.password(OWNER, meta))
    const there = signedIn(await auth.signIn.password(OWNER, meta))
    expect(
      (
        await failure(() =>
          auth.me.changePassword(
            owner.id,
            { current: 'wrong one', password: 'a brand new password' },
            here.session.deviceId,
            meta,
          ),
        )
      ).reason,
    ).toBe('invalid-credentials')
    await auth.me.changePassword(
      owner.id,
      { current: OWNER.password, password: 'a brand new password' },
      here.session.deviceId,
      meta,
    )
    const check = (secret: string) =>
      auth.authenticate({ secret, headers: new Headers(), fromTrustedProxy: false })
    expect(check(here.secret)).not.toBeNull()
    expect(check(there.secret)).toBeNull()
  })

  test('announces users.updated', async () => {
    const env = await withOwner()
    await addMember(env, 'Mara')
    expect(env.seen.some((e) => e.topic === 'users.updated')).toBe(true)
  })
})

describe('devices and API keys', () => {
  test('signing a device out stops its token at once', async () => {
    const env = await withOwner()
    const out = signedIn(await env.auth.signIn.password({ ...OWNER, device: tv }, meta))
    env.auth.devices.revoke(out.session.deviceId as string, env.actor, meta)
    expect(
      env.auth.authenticate({
        secret: out.secret,
        headers: new Headers(),
        fromTrustedProxy: false,
      }),
    ).toBeNull()
  })

  test('a key shows once, acts for its maker, and never as the owner', async () => {
    const env = await withOwner()
    const key = env.auth.apiKeys.create({ name: 'Home Assistant', scope: 'read' }, env.actor, meta)
    expect(key.secret).toStartWith('hs_')
    expect(key.prefix).toBe(key.secret.slice(0, 7))
    expect(JSON.stringify(env.auth.apiKeys.list(env.actor))).not.toContain(key.secret)
    const p = env.auth.authenticate({
      secret: key.secret,
      headers: new Headers(),
      fromTrustedProxy: false,
    })
    expect(p).toMatchObject({ via: 'key', scope: 'read' })
    expect(p?.user.role).toBe('admin')
    expect(p?.user.permissions).toEqual([])
    env.auth.apiKeys.revoke(key.id, env.actor, meta)
    expect(
      env.auth.authenticate({
        secret: key.secret,
        headers: new Headers(),
        fromTrustedProxy: false,
      }),
    ).toBeNull()
  })

  test('keys are for staff: an admin sees their own, the owner sees everyone’s', async () => {
    const env = await withOwner()
    const ruth = await addMember(env, 'Ruth', 'admin')
    const tess = await addMember(env, 'Tess', 'admin')
    const mara = await addMember(env, 'Mara')
    const asRuth = { id: ruth.id, name: ruth.username }
    const asTess = { id: tess.id, name: tess.username }
    const mine = env.auth.apiKeys.create({ name: 'Owner’s', scope: 'read' }, env.actor, meta)
    const ruths = env.auth.apiKeys.create({ name: 'Ruth’s', scope: 'read' }, asRuth, meta)
    expect(
      (
        await failure(() =>
          env.auth.apiKeys.create(
            { name: 'Mara’s', scope: 'read' },
            { id: mara.id, name: mara.username },
            meta,
          ),
        )
      ).code,
    ).toBe('forbidden')
    expect(env.auth.apiKeys.list(asRuth).map((k) => k.id)).toEqual([ruths.id])
    expect(env.auth.apiKeys.list(asTess)).toEqual([])
    expect(
      env.auth.apiKeys
        .list(env.actor)
        .map((k) => k.id)
        .sort(),
    ).toEqual([mine.id, ruths.id].sort())
    // someone else's key is not there for an admin, and is for the owner
    expect((await failure(() => env.auth.apiKeys.revoke(ruths.id, asTess, meta))).code).toBe(
      'not-found',
    )
    expect((await failure(() => env.auth.apiKeys.revoke(mine.id, asRuth, meta))).code).toBe(
      'not-found',
    )
    env.auth.apiKeys.revoke(ruths.id, env.actor, meta)
    expect(env.auth.apiKeys.list(asRuth)).toEqual([])
  })

  test('random strings authenticate as nobody', async () => {
    const { auth } = await withOwner()
    for (const secret of ['', 'hss_nope', 'hst_nope', 'hs_nope', 'Bearer x'])
      expect(
        auth.authenticate({ secret, headers: new Headers(), fromTrustedProxy: false }),
      ).toBeNull()
  })
})

describe('TV pairing', () => {
  test('the TV shows a code, a signed-in person approves it, the TV collects a token', async () => {
    const env = await withOwner()
    const pairing = env.auth.pairing.start(tv, { address: '192.168.1.40' })
    expect(pairing.code).toMatch(/^[2-9A-Z]{3}-[2-9A-Z]{3}$/)
    expect(pairing.url).toBe(`https://harbor.example.net/link?code=${pairing.code}`)
    expect(pairing.expiresAt - env.clock.now()).toBe(10 * 60_000)
    expect(env.auth.pairing.poll(pairing.pollToken, meta)).toEqual({ status: 'pending' })
    expect(env.auth.pairing.describe(pairing.code.toLowerCase()).device.name).toBe('Living room TV')
    env.auth.pairing.approve(pairing.code, env.actor, meta)
    const done = env.auth.pairing.poll(pairing.pollToken, { address: '192.168.1.40' })
    if (done.status !== 'signed-in') throw new Error(done.status)
    expect(done.secret).toStartWith('hst_')
    expect(done.session).toMatchObject({ method: 'pairing', expiresAt: null })
    expect(env.auth.devices.list()[0]).toMatchObject({
      client: 'tvos',
      method: 'pairing',
      address: '192.168.1.40',
    })
    // single use
    expect((await failure(() => env.auth.pairing.poll(pairing.pollToken, meta))).reason).toBe(
      'pairing-expired',
    )
    expect((await failure(() => env.auth.pairing.describe(pairing.code))).reason).toBe(
      'pairing-expired',
    )
  })

  test('two-step verification never reaches the TV', async () => {
    const env = await withOwner()
    env.security({ twoFactor: true })
    const { secret } = await env.auth.twoFactor.start(env.owner.id, OWNER.password)
    env.auth.twoFactor.enable(env.owner.id, codeFor(secret, env.clock.now()), meta)
    const pairing = env.auth.pairing.start(tv, meta)
    env.auth.pairing.approve(pairing.code, env.actor, meta)
    expect(env.auth.pairing.poll(pairing.pollToken, meta).status).toBe('signed-in')
  })

  test('the code alone can’t collect the token, and expires after ten minutes', async () => {
    const env = await withOwner()
    const pairing = env.auth.pairing.start(tv, meta)
    expect((await failure(() => env.auth.pairing.poll(pairing.code, meta))).reason).toBe(
      'pairing-expired',
    )
    env.clock.advance(10 * 60_000)
    expect(
      (await failure(() => env.auth.pairing.approve(pairing.code, env.actor, meta))).reason,
    ).toBe('pairing-expired')
  })
})

describe('forward-auth proxy', () => {
  test('believed only when on, from a trusted proxy, for an existing account', async () => {
    const env = await withOwner()
    const headers = new Headers({ 'Remote-User': 'ines' })
    expect(env.auth.authenticate({ secret: null, headers, fromTrustedProxy: true })).toBeNull()
    env.security({ proxyAuth: { enabled: true, header: 'Remote-User' } })
    expect(env.auth.authenticate({ secret: null, headers, fromTrustedProxy: false })).toBeNull()
    expect(env.auth.authenticate({ secret: null, headers, fromTrustedProxy: true })).toMatchObject({
      via: 'proxy',
      method: 'proxy',
    })
    expect(
      env.auth.authenticate({
        secret: null,
        headers: new Headers({ 'Remote-User': 'stranger' }),
        fromTrustedProxy: true,
      }),
    ).toBeNull()
  })
})

describe('security settings and the audit log', () => {
  test('the client secret is write-only and sealed', async () => {
    const env = await withOwner()
    const saved = env.auth.security.save(
      {
        twoFactor: true,
        passkeys: true,
        sessionDays: 7,
        oidc: {
          enabled: true,
          name: 'Authentik',
          issuer: 'https://auth.example.net/application/o/highsea/',
          clientId: 'highsea',
          clientSecret: 's3cret',
        },
        proxyAuth: { enabled: false, header: 'Remote-User' },
      },
      env.actor,
      meta,
    )
    expect(saved.oidc.clientSecretSet).toBe(true)
    expect(JSON.stringify(saved)).not.toContain('s3cret')
    expect(JSON.stringify(env.db.select().from(schema.settings).all())).not.toContain('s3cret')
    expect(env.auth.methods().oidc).toEqual({ name: 'Authentik' })
    expect(env.seen.some((e) => e.topic === 'settings.updated')).toBe(true)
  })

  test('single sign-on needs an https issuer and the external URL', async () => {
    const env = await withOwner()
    const input = {
      twoFactor: false,
      passkeys: true,
      sessionDays: 30,
      oidc: { enabled: true, name: 'Authentik', issuer: 'http://auth.local', clientId: 'highsea' },
      proxyAuth: { enabled: false, header: 'Remote-User' },
    }
    expect((await failure(() => env.auth.security.save(input, env.actor, meta))).code).toBe(
      'invalid',
    )
    env.setExternalUrl(null)
    const f = await failure(() =>
      env.auth.security.save(
        { ...input, oidc: { ...input.oidc, issuer: 'https://auth.local' } },
        env.actor,
        meta,
      ),
    )
    expect(f.reason).toBe('external-url-missing')
  })

  test('pages newest first', async () => {
    const env = await withOwner()
    for (let i = 0; i < 5; i++) {
      env.clock.advance(1000)
      await failure(() =>
        env.auth.signIn.password({ username: `u${i}`, password: 'wrong password' }, meta),
      )
    }
    const first = env.auth.audit({ limit: 2 })
    expect(first.items.map((e) => (e.detail as { username: string }).username)).toEqual([
      'u4',
      'u3',
    ])
    const second = env.auth.audit({ limit: 2, cursor: first.next as string })
    expect(second.items.map((e) => (e.detail as { username: string }).username)).toEqual([
      'u2',
      'u1',
    ])
  })
})

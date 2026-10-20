// SPDX-License-Identifier: AGPL-3.0-only
// The checkpoint 2 routes through the SDK, as the admin and the apps call them: the happy path,
// and who may not.
import { afterEach, describe, expect, test } from 'bun:test'
import { base32Decode, hotp, totpStep } from '@highsea/auth'
import type { Fetch } from '@highsea/core'
import { createFakeIndexer } from '@highsea/indexers/fake'
import { createReplayFetch } from '@highsea/metadata/replay'
import type { Runtime } from '@highsea/runtime'
import { createApi } from '../src/api/app.ts'
import {
  addMember,
  bootRuntime,
  cleanup,
  clientFor,
  failure,
  ORIGIN,
  OWNER,
  tokenFor,
  tv,
  withOwner,
} from './helpers.ts'

afterEach(cleanup)

async function start() {
  const runtime = await bootRuntime()
  const app = createApi(runtime)
  return { runtime, app, anon: clientFor(app) }
}

async function started() {
  const env = await start()
  const { owner, token } = await withOwner(env.runtime)
  return { ...env, owner, ownerApi: clientFor(env.app, { token }) }
}

const sessionCookie = (res: Response) =>
  res.headers.get('set-cookie')?.match(/highsea_session=([^;]+)/)?.[1]

const codeFor = (runtime: Runtime, secret: string) =>
  hotp(base32Decode(secret), totpStep(runtime.clock.now()))

describe('setup', () => {
  test('makes the owner, signs them in with a cookie, then closes', async () => {
    const { app, anon, runtime } = await start()
    const defaults = await anon.setup.defaults()
    expect(defaults.serverName).toBe('highsea')
    expect((await anon.system.publicInfo()).setupComplete).toBe(false)

    const res = await app.request(`${ORIGIN}/api/v1/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({
        serverName: 'Harbor',
        owner: OWNER,
        folders: defaults.folders,
        remoteAccess: { kind: 'local-only' },
        cloudLink: false,
      }),
    })
    expect(res.status).toBe(200)
    // plain HTTP: the bare name, HttpOnly and Lax; never the secret in the body
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('highsea_session=hss_')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain('hss_')
    expect(body.server.name).toBe('Harbor')
    expect(body.session.method).toBe('setup')
    expect(runtime.setupComplete()).toBe(true)

    expect(await failure(anon.setup.defaults())).toEqual({ code: 'not-found', reason: undefined })
    const me = clientFor(app, { cookie: `highsea_session=${sessionCookie(res)}` })
    expect((await me.auth.session()).user.username).toBe(OWNER.username)
  })
})

describe('setup’s indexer step', () => {
  test('lists the starter pack until setup ends, and Finish adds what was chosen', async () => {
    // the Internet Archive goes to the fake indexer, TMDB to its recordings: no network
    const fake = createFakeIndexer()
    const replay = createReplayFetch()
    const fetch: Fetch = (input, init) =>
      new URL(String(input instanceof Request ? input.url : input)).hostname === 'archive.org'
        ? fake.fetch(input, init)
        : replay(input, init)
    const runtime = await bootRuntime({ fetch })
    const app = createApi(runtime)
    const anon = clientFor(app)
    const pack = await anon.setup.starterPack()
    expect(pack.map((d) => d.id)).toEqual(['internet-archive'])
    expect(pack.every((d) => d.privacy === 'public' && d.starter)).toBe(true)

    const res = await app.request(`${ORIGIN}/api/v1/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({
        serverName: 'Harbor',
        owner: OWNER,
        folders: (await anon.setup.defaults()).folders,
        remoteAccess: { kind: 'local-only' },
        cloudLink: false,
        // one not in the pack is ignored, not an error
        indexers: ['internet-archive', 'generic-torznab'],
      }),
    })
    expect(res.status).toBe(200)
    expect(await failure(anon.setup.starterPack())).toEqual({
      code: 'not-found',
      reason: undefined,
    })
    // each is tested and added after Finish answers
    for (let i = 0; i < 100 && runtime.indexers.list().length === 0; i++) await Bun.sleep(10)
    expect(runtime.indexers.list().map((i) => i.definitionId)).toEqual(['internet-archive'])
  })

  test('an indexer that fails its test is skipped, and setup still finishes', async () => {
    const replay = createReplayFetch()
    const fetch: Fetch = (input, init) =>
      new URL(String(input instanceof Request ? input.url : input)).hostname === 'archive.org'
        ? Promise.resolve(new Response('down', { status: 503 }))
        : replay(input, init)
    const runtime = await bootRuntime({ fetch })
    const app = createApi(runtime)
    const res = await app.request(`${ORIGIN}/api/v1/setup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({
        serverName: 'Harbor',
        owner: OWNER,
        folders: (await clientFor(app).setup.defaults()).folders,
        remoteAccess: { kind: 'local-only' },
        cloudLink: false,
        indexers: ['internet-archive'],
      }),
    })
    expect(res.status).toBe(200)
    expect(runtime.setupComplete()).toBe(true)
    const warned = () =>
      runtime.logs.entries().find((l) => l.message === 'couldn’t add an indexer at setup')
    for (let i = 0; i < 100 && !warned(); i++) await Bun.sleep(10)
    expect(warned()?.fields).toMatchObject({ definition: 'internet-archive' })
    expect(runtime.indexers.list()).toEqual([])
  })
})

describe('sign-in', () => {
  test('the admin gets a cookie; an app gets a token in the body', async () => {
    const { app } = await started()
    const signIn = (device?: typeof tv) =>
      app.request(`${ORIGIN}/api/v1/auth/sign-in`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
        body: JSON.stringify({ username: OWNER.username, password: OWNER.password, device }),
      })
    const admin = await signIn()
    expect(sessionCookie(admin)).toStartWith('hss_')
    expect((await admin.json()).token).toBeUndefined()

    const app_ = await signIn(tv)
    expect(app_.headers.get('set-cookie')).toBeNull()
    const out = await app_.json()
    expect(out.token).toStartWith('hst_')
    expect(out.session.user.username).toBe(OWNER.username)
  })

  test('two-step verification adds the code step for apps too, and a code completes it', async () => {
    const { runtime, ownerApi, anon } = await started()
    const { secret } = await ownerApi.me.startTwoFactor({ body: { password: OWNER.password } })
    const { recoveryCodes } = await ownerApi.me.enableTwoFactor({
      body: { code: codeFor(runtime, secret) },
    })
    expect(recoveryCodes).toHaveLength(10)

    const first = await anon.auth.signIn({
      body: { username: OWNER.username, password: OWNER.password, device: tv },
    })
    if (first.status !== 'two-factor') throw new Error(first.status)
    expect(
      await failure(anon.auth.twoFactor({ body: { challenge: first.challenge, code: '000000' } })),
    ).toMatchObject({
      code: 'unauthorized',
    })
    // the code that enabled it was this 30 s step's, and a code can't be used twice: use a recovery code
    const done = await anon.auth.twoFactor({
      body: { challenge: first.challenge, code: recoveryCodes[0] as string },
    })
    expect(done.status).toBe('signed-in')
  })

  test('a cookie-authenticated write from another site is refused', async () => {
    const { app } = await started()
    const signIn = await app.request(`${ORIGIN}/api/v1/auth/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ username: OWNER.username, password: OWNER.password }),
    })
    const cookie = `highsea_session=${sessionCookie(signIn)}`
    const write = (headers: Record<string, string>) =>
      app.request(`${ORIGIN}/api/v1/me`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', cookie, ...headers },
        body: JSON.stringify({ displayName: 'Ines R.' }),
      })
    expect((await write({ 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await write({ origin: 'https://evil.example' })).status).toBe(403)
    // neither header: a cookie alone isn't enough (OWASP CSRF cheat sheet)
    expect((await write({})).status).toBe(403)
    expect((await write({ 'sec-fetch-site': 'same-origin' })).status).toBe(200)
  })

  test('signing out ends the session', async () => {
    const { runtime, owner, app } = await started()
    const api = clientFor(app, { token: tokenFor(runtime, owner.id) })
    await api.auth.signOut()
    expect(await failure(api.auth.session())).toEqual({
      code: 'unauthorized',
      reason: 'signed-out',
    })
  })
})

describe('access', () => {
  test('signed out, members and read-only keys get only what they may', async () => {
    const { runtime, owner, app, anon, ownerApi } = await started()
    const member = clientFor(app, {
      token: (await addMember(runtime, owner.id, 'Mara Jensen')).token,
    })

    expect(await failure(anon.users.list())).toEqual({ code: 'unauthorized', reason: 'signed-out' })
    expect((await failure(member.users.list())).code).toBe('forbidden')
    expect((await failure(member.system.status())).code).toBe('forbidden')
    expect((await failure(member.apiKeys.list())).code).toBe('forbidden')
    expect((await failure(member.settings.security())).code).toBe('forbidden')
    expect((await member.system.server()).name).toBe('highsea')

    const admin = clientFor(app, {
      token: (await addMember(runtime, owner.id, 'Theo Park', 'admin')).token,
    })
    expect((await admin.users.list()).length).toBe(3)
    expect((await failure(admin.settings.security())).code).toBe('forbidden')
    expect(
      (
        await failure(
          admin.settings.saveNetwork({ body: (await admin.settings.network()) as never }),
        )
      ).code,
    ).toBe('forbidden')

    const key = await ownerApi.apiKeys.create({ body: { name: 'Homepage', scope: 'read' } })
    expect(key.secret).toStartWith('hs_')
    const reader = clientFor(app, { token: key.secret })
    expect((await reader.users.list()).length).toBe(3)
    expect(await failure(reader.me.update({ body: { displayName: 'x' } }))).toEqual({
      code: 'forbidden',
      reason: 'read-only-key',
    })
  })
})

describe('people', () => {
  test('invite, accept the link, change the role, reset, remove', async () => {
    const { app, anon, ownerApi } = await started()
    const invite = await ownerApi.users.invite({
      body: { displayName: 'Mara Jensen', email: null, role: 'user', libraries: 'all' },
    })
    expect(invite.user.invited).toBe(true)
    expect(invite.link).toContain('/invite/')
    const token = invite.link.split('/').pop() as string

    const info = await anon.links.get({ params: { token } })
    expect(info).toMatchObject({ kind: 'invite', username: 'mara.jensen' })
    const accepted = await app.request(`${ORIGIN}/api/v1/links/${token}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({ password: 'a long enough password' }),
    })
    expect(accepted.status).toBe(200)
    expect(sessionCookie(accepted)).toStartWith('hss_')

    const id = invite.user.id
    expect((await ownerApi.users.update({ params: { id }, body: { role: 'admin' } })).role).toBe(
      'admin',
    )
    const reset = await ownerApi.users.resetPassword({ params: { id } })
    expect(reset.link).toContain('/reset/')
    await ownerApi.users.remove({ params: { id } })
    expect((await ownerApi.users.list()).map((u) => u.username)).toEqual([OWNER.username])
  })

  test('the owner stays the owner', async () => {
    const { owner, ownerApi } = await started()
    expect((await failure(ownerApi.users.remove({ params: { id: owner.id } }))).code).toBe(
      'forbidden',
    )
  })
})

describe('devices and keys', () => {
  test('your own current device signs out instead; others can be revoked', async () => {
    const { runtime, owner, app, ownerApi } = await started()
    const session = await ownerApi.auth.session()
    expect(
      await failure(ownerApi.devices.revoke({ params: { id: session.deviceId as string } })),
    ).toEqual({
      code: 'forbidden',
      reason: 'self',
    })
    const other = clientFor(app, { token: tokenFor(runtime, owner.id) })
    const otherId = (await other.auth.session()).deviceId as string
    expect((await ownerApi.me.devices()).length).toBe(2)
    await ownerApi.devices.revoke({ params: { id: otherId } })
    expect(await failure(other.auth.session())).toMatchObject({ code: 'unauthorized' })
  })

  test('only the owner revokes someone else’s device', async () => {
    const { runtime, owner, app, ownerApi } = await started()
    const ownerDevice = (await ownerApi.auth.session()).deviceId as string
    for (const role of ['user', 'admin'] as const) {
      const someone = clientFor(app, {
        token: (await addMember(runtime, owner.id, `Mara ${role}`, role)).token,
      })
      expect((await failure(someone.devices.revoke({ params: { id: ownerDevice } }))).code).toBe(
        'forbidden',
      )
    }
  })

  test('API keys: listed without the secret, revoked, and can’t make keys', async () => {
    const { app, ownerApi } = await started()
    const key = await ownerApi.apiKeys.create({ body: { name: 'Scripts', scope: 'full' } })
    const list = await ownerApi.apiKeys.list()
    expect(list).toHaveLength(1)
    expect(JSON.stringify(list)).not.toContain(key.secret)
    const viaKey = clientFor(app, { token: key.secret })
    expect(
      (await failure(viaKey.apiKeys.create({ body: { name: 'More', scope: 'full' } }))).code,
    ).toBe('forbidden')
    await ownerApi.apiKeys.revoke({ params: { id: key.id } })
    expect(await failure(viaKey.auth.session())).toMatchObject({ code: 'unauthorized' })
  })
})

describe('pairing', () => {
  test('a TV shows a code, someone approves it, the TV collects its token', async () => {
    const { anon, ownerApi } = await started()
    const pairing = await anon.auth.startPairing({ body: { device: tv } })
    expect(pairing.code).toMatch(/^[A-Z0-9-]+$/)
    expect((await anon.auth.pollPairing({ body: { pollToken: pairing.pollToken } })).status).toBe(
      'pending',
    )

    // the code alone tells a stranger nothing and gets them no token
    expect(
      await failure(anon.auth.pairingRequest({ params: { code: pairing.code } })),
    ).toMatchObject({
      code: 'unauthorized',
    })
    expect(
      (await ownerApi.auth.pairingRequest({ params: { code: pairing.code } })).device.name,
    ).toBe(tv.name)
    await ownerApi.auth.approvePairing({ params: { code: pairing.code } })

    const done = await anon.auth.pollPairing({ body: { pollToken: pairing.pollToken } })
    if (done.status !== 'signed-in') throw new Error(done.status)
    expect(done.token).toStartWith('hst_')
    expect(done.session.user.username).toBe(OWNER.username)
  })
})

describe('system and settings', () => {
  test('status, jobs, health checks and the audit log', async () => {
    const { ownerApi } = await started()
    const status = await ownerApi.system.status()
    expect(status.memory.total).toBeGreaterThan(0)
    expect(Array.isArray(await ownerApi.system.jobs())).toBe(true)
    expect(Array.isArray(await ownerApi.system.healthChecks())).toBe(true)
    await ownerApi.apiKeys.create({ body: { name: 'Homepage', scope: 'read' } })
    const audit = await ownerApi.audit.list()
    expect(audit.items.map((e) => e.action)).toContain('api-key.create')
  })

  test('network and security settings round-trip for the owner', async () => {
    const { ownerApi } = await started()
    const network = await ownerApi.settings.network()
    expect(network.discoveryPort).toBe(7368)
    const { localAddresses: _, discoveryPort: __, tlsProblem: ___, ...settings } = network
    const saved = await ownerApi.settings.saveNetwork({
      body: {
        ...settings,
        remoteAccess: 'reverse-proxy',
        externalUrl: 'https://harbor.example.net/',
      },
    })
    expect(saved.externalUrl).toBe('https://harbor.example.net')

    const security = await ownerApi.settings.security()
    const { clientSecretSet: ____, ...oidc } = security.oidc
    const next = await ownerApi.settings.saveSecurity({
      body: { ...security, oidc, sessionDays: 7 },
    })
    expect(next.sessionDays).toBe(7)
  })

  test('OIDC that isn’t set up sends the browser back to sign-in with the reason', async () => {
    const { app } = await started()
    const res = await app.request(`${ORIGIN}/api/v1/auth/oidc/callback?state=x&code=y`)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toStartWith('/login?error=')
  })
})

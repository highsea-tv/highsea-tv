// SPDX-License-Identifier: AGPL-3.0-only
// The admin's flows through the mock's transport (one-client-platform-d.md › D3): first-run setup
// (what highsea found, the folder browser, the starter pack, Finish signing the owner in) and the
// account sheet (name and email, the password, two-step verification, passkeys), in the
// contract's shapes, with the server's refusals.
import { describe, expect, test } from 'bun:test'
import { routes } from '@highsea-tv/api-contract'
import { createMockFetch, memoryStorage } from '@highsea-tv/mock/transport'
import { type ApiError, createClient } from '@highsea-tv/sdk'

const LAN = 'http://192.168.1.20:3000'
const device = { name: 'Ines’s Mac', client: 'web' as const, appVersion: '0.4.0' }

const anonymous = () => {
  const fetch = createMockFetch({ latency: 0, storage: memoryStorage() })
  return createClient({ baseUrl: LAN, fetch })
}

const signedIn = async (username = 'ines') => {
  const fetch = createMockFetch({ latency: 0, storage: memoryStorage() })
  const c = createClient({ baseUrl: LAN, fetch })
  let r = await c.auth.signIn({ body: { username, password: 'x', device } })
  if (r.status === 'two-factor')
    r = await c.auth.twoFactor({ body: { challenge: r.challenge, code: '123456' } })
  if (r.status !== 'signed-in' || !r.token) throw new Error('not signed in')
  return createClient({ baseUrl: LAN, fetch, token: r.token })
}

const caught = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as ApiError
  }
  throw new Error('it answered')
}

type Schema = { parse(value: unknown): unknown }
const shaped = (route: { responses: Record<number, unknown> }, value: unknown) => {
  const ok = route.responses[200] as { content: { 'application/json': { schema: Schema } } }
  return ok.content['application/json'].schema.parse(value)
}

describe('setup', () => {
  test('what highsea found, in the contract’s shape', async () => {
    const c = anonymous()
    const found = await c.setup.detect()
    expect(shaped(routes.setup.detect, found)).toEqual(found)
    expect(found.folders).toEqual({ movies: '/data/media/movies', downloads: '/data/downloads' })
    expect(found.graphics?.path).toBe('vaapi')
    expect((await c.setup.defaults()).dataDir).toBe('/data')
  })

  test('the folder browser, the hardlink check, and a folder that isn’t there', async () => {
    const c = anonymous()
    const folders = await c.setup.listFolders({ query: { path: '/data' } })
    expect(folders.map((f) => f.path)).toEqual(['/data/downloads', '/data/media'])
    const same = await c.setup.checkHardlinks({
      query: { a: '/data/downloads', b: '/data/media/movies' },
    })
    expect(same.sameDevice).toBe(true)
    const apart = await c.setup.checkHardlinks({
      query: { a: '/data/downloads', b: '/mnt/nas/movies' },
    })
    expect(apart.sameDevice).toBe(false)
    expect((await caught(c.setup.listFolders({ query: { path: '/nowhere' } }))).status).toBe(404)
  })

  test('the starter pack needs no settings; the languages are the subtitles’', async () => {
    const c = anonymous()
    const pack = await c.setup.starterPack()
    expect(pack.length).toBeGreaterThan(0)
    for (const d of pack) {
      expect(d.starter).toBe(true)
      expect(d.settings.every((f) => !f.required)).toBe(true)
    }
    expect(shaped(routes.setup.starterPack, pack)).toEqual(pack)
    const languages = await c.setup.languages()
    expect(languages.some((l) => l.code === 'en')).toBe(true)
  })

  test('Finish names the server and signs the owner in', async () => {
    const c = anonymous()
    const result = await c.setup.complete({
      body: {
        serverName: 'Lighthouse',
        owner: { username: 'ines', displayName: 'Ines', password: 'correct horse battery' },
        folders: { movies: '/data/media/movies', downloads: '/data/downloads' },
        remoteAccess: { kind: 'local-only' },
      },
    })
    expect(shaped(routes.setup.complete, result)).toEqual(result)
    expect(result.server.name).toBe('Lighthouse')
    expect(result.session.user.role).toBe('owner')
    expect((await c.auth.session()).user.role).toBe('owner')
  })
})

describe('the account sheet', () => {
  test('name and email', async () => {
    const c = await signedIn()
    const you = await c.me.update({ body: { displayName: 'Inês', email: 'ines@example.org' } })
    expect(shaped(routes.me.update, you)).toEqual(you)
    expect(you.displayName).toBe('Inês')
    expect(you.email).toBe('ines@example.org')
    expect((await c.auth.session()).user.displayName).toBe('Inês')
  })

  test('the password: a wrong current one is refused', async () => {
    const c = await signedIn()
    await c.me.changePassword({ body: { current: 'x', password: 'correct horse battery' } })
    const e = await caught(
      c.me.changePassword({ body: { current: 'wrong', password: 'correct horse battery' } }),
    )
    expect(e.status).toBe(401)
  })

  test('two-step verification: on, new codes, then off', async () => {
    const c = await signedIn('ruth')
    expect(await c.me.twoFactor()).toEqual({
      enabled: false,
      required: false,
      recoveryCodesLeft: 0,
    })
    expect((await caught(c.me.startTwoFactor({ body: { password: 'wrong' } }))).status).toBe(401)
    const seed = await c.me.startTwoFactor({ body: { password: 'x' } })
    expect(seed.uri).toStartWith('otpauth://totp/')
    expect((await caught(c.me.enableTwoFactor({ body: { code: '000000' } }))).status).toBe(401)
    const on = await c.me.enableTwoFactor({ body: { code: '123456' } })
    expect(on.recoveryCodes).toHaveLength(10)
    expect((await c.me.twoFactor()).enabled).toBe(true)
    expect((await caught(c.me.startTwoFactor({ body: { password: 'x' } }))).status).toBe(409)
    const fresh = await c.me.recoveryCodes({ body: { password: 'x' } })
    expect(fresh.recoveryCodes).toHaveLength(10)
    await c.me.disableTwoFactor({ body: { password: 'x' } })
    expect((await c.me.twoFactor()).enabled).toBe(false)
  })

  test('passkeys: none to start, and one that isn’t there is refused', async () => {
    const c = await signedIn()
    expect(await c.me.passkeys()).toEqual([])
    const e = await caught(c.me.renamePasskey({ params: { id: 'pk-1' }, body: { name: 'Mac' } }))
    expect(e.status).toBe(404)
    // adding one needs the browser's WebAuthn ceremony, which the mock doesn't answer
    expect((await caught(c.me.passkeyOptions())).status).toBe(501)
  })
})

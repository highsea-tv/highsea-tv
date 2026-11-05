// SPDX-License-Identifier: AGPL-3.0-only
// The mock as the SDK's transport, through the SDK's own client: answers in the contract's shapes,
// errors as ApiError, the event stream, the toolbar's states, discovery, and no DOM on import.
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { routes } from '@highsea-tv/api-contract'
import { unparsable } from '@highsea-tv/i18n'
import { DISCOVERY_MS } from '@highsea-tv/mock/timing'
import {
  createMockFetch,
  memoryStorage,
  type NearbySnapshot,
  type TransportOptions,
  transportMessages,
} from '@highsea-tv/mock/transport'
import { ApiError, createClient } from '@highsea-tv/sdk'

const LAN = 'http://192.168.1.20:3000'
const PUBLIC = 'https://harbor.example.net'
const device = { name: 'Ines’s iPhone', client: 'ios' as const, appVersion: '0.3.0' }

const setup = (options: TransportOptions = {}) => {
  const fetch = createMockFetch({ latency: 0, storage: memoryStorage(), ...options })
  const anon = (baseUrl = LAN) => createClient({ baseUrl, fetch })
  /** An app signed in as the username typed; the toolbar's role follows that person's. */
  const app = async (baseUrl = LAN, as = 'ruth') => {
    const r = await anon(baseUrl).auth.signIn({ body: { username: as, password: 'x', device } })
    if (r.status !== 'signed-in' || !r.token) throw new Error('not signed in')
    return createClient({ baseUrl, fetch, token: r.token })
  }
  return { fetch, anon, app }
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
const schemaOf = (route: { responses: Record<number, unknown> }) =>
  (
    route.responses as Record<number, { content?: { 'application/json'?: { schema: Schema } } }>
  )[200]?.content?.['application/json']?.schema

const until = async (check: () => boolean, ms = 1000) => {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 5))
  }
}

describe('answers', () => {
  test('every covered route answers in its response schema', async () => {
    const { anon, app, fetch } = setup()
    const a = await app()
    // every route here answers 200 with a body; the 204s are checked for no body below
    const parse = (route: Parameters<typeof schemaOf>[0], value: unknown) => {
      const schema = schemaOf(route)
      if (!schema) throw new Error('a route without a 200 schema')
      schema.parse(value)
    }
    const r = routes
    parse(r.system.health, await anon().system.health())
    parse(r.system.publicInfo, await anon().system.publicInfo())
    parse(r.system.server, await a.system.server())
    parse(r.auth.session, await a.auth.session())
    parse(r.me.devices, await a.me.devices())
    parse(r.preferences.get, await a.preferences.get())
    parse(
      r.preferences.save,
      await a.preferences.save({ body: { layer: 'user', values: { volume: 0.5 } } }),
    )
    parse(r.home.layout, await a.home.layout())
    parse(r.home.saveLayout, await a.home.saveLayout({ body: { order: ['next-up'], hidden: [] } }))
    parse(r.appearance.get, await a.appearance.get())
    const active = await a.announcements.active({ query: { client: 'ios' } })
    parse(r.announcements.active, active)
    expect(active.length).toBeGreaterThan(0)
    expect(await a.announcements.seen({ params: { id: active[0]?.id as string } })).toBeUndefined()

    parse(r.auth.signIn, await anon().auth.signIn({ body: { username: 'ruth', password: 'x' } }))
    const twoStep = await anon().auth.signIn({ body: { username: 'ines', password: 'x', device } })
    parse(r.auth.signIn, twoStep)
    if (twoStep.status !== 'two-factor') throw new Error('no second step')
    parse(
      r.auth.twoFactor,
      await anon().auth.twoFactor({ body: { challenge: twoStep.challenge, code: '123456' } }),
    )
    const sso = await fetch.oidc(
      `${LAN}/api/v1/auth/oidc/start?app=ios&challenge=${'c'.repeat(43)}`,
    )
    const code = new URL(sso.url).searchParams.get('code') as string
    parse(
      r.auth.oidcExchange,
      await anon().auth.oidcExchange({ body: { code, verifier: 'v'.repeat(43), device } }),
    )
    const pairing = await anon().auth.startPairing({
      body: { device: { ...device, client: 'tvos' } },
    })
    parse(r.auth.startPairing, pairing)
    parse(
      r.auth.pollPairing,
      await anon().auth.pollPairing({ body: { pollToken: pairing.pollToken } }),
    )
    parse(r.auth.pairingRequest, await a.auth.pairingRequest({ params: { code: pairing.code } }))
    parse(r.auth.approvePairing, await a.auth.approvePairing({ params: { code: pairing.code } }))

    const ipad = await anon().auth.signIn({
      body: { username: 'ruth', password: 'x', device: { ...device, name: 'Ruth’s iPad' } },
    })
    if (ipad.status !== 'signed-in') throw new Error('not signed in')
    const other = (await a.me.devices()).find((d) => d.id === ipad.session.deviceId)
    expect(other?.name).toBe('Ruth’s iPad')
    expect(await a.devices.revoke({ params: { id: other?.id as string } })).toBeUndefined()
    expect(await a.auth.signOut()).toBeUndefined()
  })

  test('signing in gives a session, by token for an app and by cookie for the browser', async () => {
    const { anon, app, fetch } = setup({ state: { role: 'user' } })
    const a = await app()
    const session = await a.auth.session()
    expect(session.user.username).toBe('ruth')
    expect(session.method).toBe('password')
    expect(session.expiresAt).toBeNull()
    expect(session.away).toBe(false)
    expect(
      (await a.me.devices()).some((d) => d.id === session.deviceId && d.client === 'ios'),
    ).toBe(true)

    // no token: the browser's session cookie, which lasts a month
    const browser = createClient({ baseUrl: '', fetch })
    const signed = await browser.auth.signIn({ body: { username: 'ruth', password: 'x' } })
    expect(signed.status === 'signed-in' && signed.token).toBeFalsy()
    expect((await browser.auth.session()).expiresAt).not.toBeNull()
    await browser.auth.signOut()
    expect((await caught(browser.auth.session())).status).toBe(401)

    // a token outlives the mock's memory, as a native app's keychain does
    const token = (await anon().auth.signIn({
      body: { username: 'ruth', password: 'x', device },
    })) as {
      token: string
    }
    const later = createMockFetch({ latency: 0, storage: memoryStorage(), state: { role: 'user' } })
    const again = createClient({ baseUrl: LAN, fetch: later, token: token.token })
    expect((await again.auth.session()).user.username).toBe('ruth')
  })

  test('a TV signs in by code once the phone approves it', async () => {
    const { anon, app } = setup({ approveAfterMs: 60_000 })
    const tv = anon()
    const start = await tv.auth.startPairing({
      body: { device: { ...device, name: 'Den TV', client: 'tvos' } },
    })
    expect(start.code).toBe('KQ7-4PM')
    expect(start.url).toContain('/link?code=')
    expect(await tv.auth.pollPairing({ body: { pollToken: start.pollToken } })).toEqual({
      status: 'pending',
    })
    const phone = await app()
    expect((await phone.auth.pairingRequest({ params: { code: 'kq74pm' } })).device.name).toBe(
      'Den TV',
    )
    await phone.auth.approvePairing({ params: { code: start.code } })
    const done = await tv.auth.pollPairing({ body: { pollToken: start.pollToken } })
    expect(done.status).toBe('signed-in')
    if (done.status !== 'signed-in') return
    expect(done.session.method).toBe('pairing')
    expect(
      (await caught(tv.auth.pollPairing({ body: { pollToken: start.pollToken } }))).status,
    ).toBe(404)
    // the prototype's waiting TV answers until it's approved, once
    await phone.auth.approvePairing({ params: { code: 'KQ7-4PM' } })
    const twice = await caught(phone.auth.approvePairing({ params: { code: 'KQ7-4PM' } }))
    expect(twice.status).toBe(404)
    expect(twice.details).toEqual({ reason: 'pairing-expired' })
  })
})

describe('errors', () => {
  test('arrive as ApiError with their status, code and details', async () => {
    const { anon, app } = setup()
    const wrong = await caught(
      anon().auth.signIn({ body: { username: 'ruth', password: 'wrong' } }),
    )
    expect(wrong).toBeInstanceOf(ApiError)
    expect([wrong.status, wrong.code]).toEqual([401, 'unauthorized'])
    expect(wrong.details).toEqual({ field: 'password', reason: 'invalid-credentials' })

    const locked = await caught(
      anon().auth.signIn({ body: { username: 'ruth', password: 'locked' } }),
    )
    expect([locked.status, locked.code]).toEqual([429, 'rate-limited'])

    const signedOut = await caught(anon().auth.session())
    expect([signedOut.status, signedOut.code, signedOut.details]).toEqual([
      401,
      'unauthorized',
      { reason: 'signed-out' },
    ])

    const invalid = await caught(
      anon().auth.signIn({ body: { username: 'x'.repeat(65), password: 'x' } }),
    )
    expect([invalid.status, invalid.code]).toEqual([400, 'invalid'])

    const a = await app()
    const own = (await a.auth.session()).deviceId as string
    const self = await caught(a.devices.revoke({ params: { id: own } }))
    expect([self.status, self.code, self.details]).toEqual([403, 'forbidden', { reason: 'self' }])
    expect((await caught(a.devices.revoke({ params: { id: 'd-nowhere' } }))).status).toBe(404)
    expect((await caught(a.announcements.seen({ params: { id: 'a-nowhere' } }))).status).toBe(404)
    const theme = await caught(
      a.preferences.save({ body: { layer: 'user', values: { theme: 'nope' } } }),
    )
    expect(theme.details).toEqual({ reason: 'theme' })
    const expired = await caught(
      anon().auth.twoFactor({ body: { challenge: 'ch-old', code: '123456' } }),
    )
    expect(expired.details).toEqual({ reason: 'challenge-expired' })
  })

  test('an uncovered route answers 501, naming it', async () => {
    const { app } = setup({ state: { role: 'admin' } })
    const e = await caught((await app(LAN, 'theo')).system.tasks())
    expect(e.status).toBe(501)
    expect(e.message).toContain('system.tasks')
    expect(e.details).toEqual({
      route: 'system.tasks',
      method: 'GET',
      path: '/api/v1/system/tasks',
    })
  })

  test('System › Status and its catalog answer in the contract’s shapes (D1)', async () => {
    const { app } = setup({ state: { role: 'admin' } })
    const c = await app(LAN, 'theo')
    const status = await c.system.status()
    expect(status.disks.length).toBeGreaterThan(0)
    expect(Object.keys(status.disks[0]?.usedBy ?? {})).toEqual(['movies', 'downloads', 'other'])
    expect(status.uptime).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(await c.system.healthChecks())).toBe(true)
    expect((await c.system.jobs()).some((j) => j.name === 'Catalog sync')).toBe(true)
    const before = await c.catalog.status()
    expect(before.version).toBe(status.catalogVersion)
    const after = await c.catalog.check()
    expect(after.lastCheck?.ok).toBe(true)
  })

  test('a path outside the contract is the server’s 404, and an unknown host doesn’t answer', async () => {
    const { fetch } = setup()
    const res = await fetch(`${LAN}/api/v1/nowhere`)
    expect(res.status).toBe(404)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('not-found')
    await expect(fetch('http://10.0.0.9:3000/api/health')).rejects.toBeInstanceOf(TypeError)
  })

  test('a malformed escape in a path is a 400, not a throw', async () => {
    const { fetch } = setup()
    const res = await fetch(`${LAN}/api/v1/auth/pairing/%E0%A4%A`)
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid')
  })
})

describe('events', () => {
  test('reach the SDK’s event stream, personal ones only for their person', async () => {
    const { app } = setup()
    const a = await app()
    const topics: string[] = []
    const stop = a.events.subscribe((e) => topics.push(e.topic))
    await until(() => a.events.connected())
    await a.preferences.save({ body: { layer: 'user', values: { volume: 0.4 } } })
    await a.home.saveLayout({ body: { order: [], hidden: ['next-up'] } })
    await until(() => topics.includes('home.updated'))
    expect(topics).toContain('preferences.updated')
    stop()
  })

  test('Last-Event-ID replays what was missed', async () => {
    const { fetch, app } = setup({ state: { role: 'user' } })
    const a = await app()
    await a.preferences.save({ body: { layer: 'user', values: { volume: 0.3 } } })
    const controller = new AbortController()
    const signedIn = await createClient({ baseUrl: LAN, fetch }).auth.signIn({
      body: { username: 'ruth', password: 'x', device },
    })
    const res = await fetch(`${LAN}/api/v1/events`, {
      headers: {
        authorization: `Bearer ${(signedIn as { token: string }).token}`,
        'last-event-id': '0',
      },
      signal: controller.signal,
    })
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()
    const { value } = await reader.read()
    expect(new TextDecoder().decode(value)).toMatch(/^id: \d+\ndata: \{.*"topic":"users.updated"/)
    controller.abort()
  })
})

describe('the toolbar', () => {
  test('role, data and connection change the answers', async () => {
    const { fetch, app, anon } = setup()
    const a = await app()
    expect((await a.auth.session()).user.username).toBe('ruth')
    fetch.setState({ role: 'owner' })
    expect((await a.auth.session()).user.username).toBe('ines')

    fetch.setState({ data: 'empty' })
    expect((await a.system.server()).clientsConnected).toBe(1)
    expect(await a.announcements.active()).toEqual([])

    fetch.setState({ data: 'error' })
    const down = await caught(a.system.server())
    expect([down.status, down.code]).toEqual([503, 'unavailable'])
    expect((await anon().system.publicInfo()).name).toBe('Harbor')

    fetch.setState({ data: 'loading' })
    let answered = false
    const held = a.system.server().then(() => {
      answered = true
    })
    await new Promise((r) => setTimeout(r, 20))
    expect(answered).toBe(false)
    fetch.setState({ data: 'populated' })
    await held
    expect(answered).toBe(true)

    fetch.setState({ connection: 'remote' })
    expect((await caught(a.system.server())).code).toBe('unavailable')
    const away = await app(PUBLIC)
    expect((await away.auth.session()).away).toBe(true)

    fetch.setState({ connection: 'offline' })
    expect((await caught(away.system.server())).message).toBe('Can’t reach the server.')
  })

  test('theme and sound become the server’s defaults, and the apps hear of it', async () => {
    const { fetch, app } = setup()
    const a = await app()
    const topics: string[] = []
    const stop = a.events.subscribe((e) => topics.push(e.topic))
    await until(() => a.events.connected())
    fetch.setState({ theme: 'harbor', sound: { admin: false, web: true, mobile: true, tv: true } })
    const appearance = await a.appearance.get()
    expect(appearance.defaultTheme).toBe('harbor')
    expect(appearance.sound.phone).toBe(true)
    const prefs = await a.preferences.get()
    expect([prefs.values.theme, prefs.values.sound, prefs.from.theme]).toEqual([
      'harbor',
      true,
      'server',
    ])
    await until(() => topics.includes('settings.updated'))
    expect(topics).toContain('server.updated')
    stop()
  })
})

describe('discovery', () => {
  const scan = (fetch: ReturnType<typeof createMockFetch>, permission = true) => {
    const seen: NearbySnapshot[] = []
    const stop = fetch.nearby((s) => seen.push(s), { permission })
    return { seen, stop, last: () => seen[seen.length - 1] as NearbySnapshot }
  }

  test('servers answer over time, each with public info the SDK’s probe reads', async () => {
    const { fetch } = setup()
    const s = scan(fetch)
    expect(s.last()).toEqual({ found: [], lan: 'allowed', scanning: true })
    await new Promise((r) => setTimeout(r, DISCOVERY_MS + 50))
    s.stop()
    const { found, scanning } = s.last()
    expect(scanning).toBe(false)
    expect(found.map((f) => f.info.name)).toEqual(['Harbor', 'Attic', 'Den'])
    for (const f of found) {
      const info = await createClient({ baseUrl: f.base, fetch }).system.publicInfo()
      expect(info.id).toBe(f.info.id)
    }
  }, 10_000)

  test('the local network’s permission: asking waits, refused finds nothing, the TV never asks', () => {
    const { fetch } = setup({ state: { lan: 'asking' } })
    const phone = scan(fetch)
    const tv = scan(fetch, false)
    expect(phone.last()).toEqual({ found: [], lan: 'asking', scanning: true })
    expect(tv.last().lan).toBe('allowed')
    fetch.setState({ lan: 'refused' })
    expect(phone.last()).toEqual({ found: [], lan: 'refused', scanning: false })
    phone.stop()
    tv.stop()
    fetch.dispose()
  })
})

describe('who is signed in', () => {
  test('the typed username decides, and the toolbar’s role follows theirs', async () => {
    const roles: string[] = []
    const { fetch, app } = setup({ onRole: (role) => roles.push(role) })
    const sam = await app(LAN, 'sam')
    expect((await sam.auth.session()).user.username).toBe('sam')
    expect([fetch.state().role, roles]).toEqual(['user', ['user']])
    // the chrome's echo of that role keeps Sam; another role is another person
    fetch.setState({ role: 'user' })
    expect((await sam.auth.session()).user.username).toBe('sam')
    fetch.setState({ role: 'admin' })
    expect((await sam.auth.session()).user.username).toBe('theo')
  })

  test('the browser’s cookie is its own origin’s, and only with credentials', async () => {
    const { fetch, anon } = setup()
    const browser = createClient({ baseUrl: '', fetch })
    await browser.auth.signIn({ body: { username: 'ruth', password: 'x' } })
    expect((await browser.auth.session()).user.username).toBe('ruth')
    // an app at Harbor's own address has no cookie of the page's
    expect((await caught(anon().auth.session())).status).toBe(401)
    const omit = await fetch('/api/v1/auth/session', { credentials: 'omit' })
    expect(omit.status).toBe(401)
    // `same-origin`, fetch's default, sends it to the page's own origin only
    expect((await fetch('/api/v1/auth/session')).status).toBe(200)
    const plain = await fetch(`${LAN}/api/v1/auth/session`, { credentials: 'same-origin' })
    expect(plain.status).toBe(401)
  })

  test('a page on the host’s own origin sends its cookie with `same-origin`', async () => {
    const signIn = async (origin?: string) => {
      const { fetch } = setup({ origin })
      const browser = createClient({ baseUrl: LAN, fetch })
      await browser.auth.signIn({ body: { username: 'ruth', password: 'x' } })
      return (await fetch(`${LAN}/api/v1/auth/session`)).status
    }
    expect([await signIn(LAN), await signIn()]).toEqual([200, 401])
  })

  test('a username the server doesn’t know is refused, and no one changes', async () => {
    const roles: string[] = []
    const { fetch, anon } = setup({ onRole: (role) => roles.push(role) })
    const before = fetch.state().role
    const error = await caught(
      anon().auth.signIn({ body: { username: 'nobody', password: 'x', device } }),
    )
    expect([error.status, error.code, error.details]).toEqual([
      401,
      'unauthorized',
      { field: 'password', reason: 'invalid-credentials' },
    ])
    expect([fetch.state().role, roles]).toEqual([before, []])
  })

  test('the session lasts as long as Settings › Security says', async () => {
    const { fetch } = setup()
    fetch.mock.servers.populated.state.settings.security.sessionDays = 7
    const browser = createClient({ baseUrl: '', fetch })
    await browser.auth.signIn({ body: { username: 'ruth', password: 'x' } })
    const { expiresAt } = await browser.auth.session()
    const days = (Date.parse(expiresAt as string) - Date.now()) / 86_400_000
    expect(Math.round(days)).toBe(7)
  })
})

describe('single sign-on', () => {
  const start = (base = LAN) => `${base}/api/v1/auth/oidc/start?app=ios&challenge=${'c'.repeat(43)}`

  test('is offered as Settings › Security has it, and an app’s code works once', async () => {
    const { fetch, anon } = setup()
    const info = await anon().system.publicInfo()
    expect(info.auth).toEqual({ local: true, oidc: { name: 'Authentik' }, passkeys: true })
    const back = new URL((await fetch.oidc(start())).url)
    expect(back.protocol).toBe('highsea:')
    const code = back.searchParams.get('code') as string
    const body = { code, verifier: 'v'.repeat(43), device }
    const done = await anon().auth.oidcExchange({ body })
    expect(done.status === 'signed-in' && done.session.method).toBe('oidc')
    const again = await caught(anon().auth.oidcExchange({ body }))
    expect([again.status, again.details]).toEqual([401, { reason: 'challenge-expired' }])

    fetch.mock.servers.populated.state.settings.security.oidc.enabled = false
    expect((await anon().system.publicInfo()).auth.oidc).toBeNull()
    await expect(fetch.oidc(start())).rejects.toMatchObject({ code: 'invalid' })
  })

  test('the browser’s is signed in by cookie, and a server without it refuses', async () => {
    const { fetch } = setup()
    expect((await fetch.oidc('/api/v1/auth/oidc/start')).url).toBe('/')
    const browser = createClient({ baseUrl: '', fetch })
    expect((await browser.auth.session()).method).toBe('oidc')
    // Attic, found nearby, has a password only
    const attic = fetch.mock.servers.populated.state.discovered[1]?.address
    await expect(fetch.oidc(start(`http://${attic}`))).rejects.toMatchObject({ code: 'invalid' })
  })
})

describe('responses', () => {
  test('a stream’s reader stops at cancel, and its body counts as used', async () => {
    const { fetch, app } = setup()
    const a = await app()
    await a.preferences.save({ body: { layer: 'user', values: { volume: 0.3 } } })
    const signedIn = (await createClient({ baseUrl: LAN, fetch }).auth.signIn({
      body: { username: 'ruth', password: 'x', device },
    })) as { token: string }
    const res = await fetch(`${LAN}/api/v1/events`, {
      headers: { authorization: `Bearer ${signedIn.token}`, 'last-event-id': '0' },
    })
    expect(res.bodyUsed).toBe(false)
    expect(() => res.clone()).toThrow(TypeError)
    const reader = (res.body as ReadableStream<Uint8Array>).getReader()
    expect(() => (res.body as ReadableStream<Uint8Array>).getReader()).toThrow(TypeError)
    expect((await reader.read()).done).toBe(false)
    expect(res.bodyUsed).toBe(true)
    await reader.cancel()
    // events were still queued: none come through after cancel
    expect((await reader.read()).done).toBe(true)
    await expect(res.text()).rejects.toBeInstanceOf(TypeError)
  })

  test('a whole body reads through text() or its reader, once, and clones', async () => {
    const { fetch } = setup()
    const res = await fetch(`${LAN}/api/health`)
    const copy = res.clone()
    expect(JSON.parse(await res.text()).status).toBe('ok')
    expect(res.bodyUsed).toBe(true)
    await expect(res.text()).rejects.toBeInstanceOf(TypeError)
    const reader = (copy.body as ReadableStream<Uint8Array>).getReader()
    const { value } = await reader.read()
    expect(JSON.parse(new TextDecoder().decode(value)).status).toBe('ok')
    expect(copy.bodyUsed).toBe(true)
  })
})

describe('dispose', () => {
  test('fails held requests, ends streams and stops discovery', async () => {
    const { fetch, app } = setup()
    const a = await app()
    const s: NearbySnapshot[] = []
    fetch.nearby((snapshot) => s.push(snapshot))
    fetch.setState({ data: 'loading' })
    const seen = s.length
    const held = a.system.server()
    await new Promise((r) => setTimeout(r, 10))
    fetch.dispose()
    expect((await caught(held)).message).toBe('Can’t reach the server.')
    await new Promise((r) => setTimeout(r, DISCOVERY_MS + 50))
    expect(s.length).toBe(seen)
    expect((await caught(a.system.health())).message).toBe('Can’t reach the server.')
  }, 10_000)
})

describe('events and roles', () => {
  test('staff topics go out by the role signed in as each event is sent', async () => {
    const { fetch, app } = setup()
    const a = await app()
    const topics: string[] = []
    const stop = a.events.subscribe((e) => topics.push(e.topic))
    await until(() => a.events.connected())
    const [first, second] = await a.announcements.active({ query: { client: 'ios' } })
    await a.announcements.seen({ params: { id: first?.id as string } })
    await until(() => topics.includes('announcements.updated'))
    expect(topics).not.toContain('curation.updated')
    fetch.setState({ role: 'owner' })
    await a.announcements.seen({ params: { id: (second ?? first)?.id as string } })
    await until(() => topics.includes('curation.updated'))
    stop()
  })
})

describe('everywhere', () => {
  test('its messages parse', () => {
    expect(unparsable(transportMessages)).toEqual([])
  })

  test('importing it needs no DOM: it runs with every browser global throwing', async () => {
    const entry = resolve(import.meta.dir, '../src/transport.ts')
    // navigator is only taken away, not made to throw: zod looks for it, guarded, at import (to spot
    // Cloudflare's workers), and React Native has one without a DOM
    const script = `
      for (const name of ['window', 'document', 'localStorage', 'sessionStorage', 'location'])
        Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error('touched ' + name) } })
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: undefined })
      const { createMockFetch } = await import(${JSON.stringify(entry)})
      const fetch = createMockFetch({ latency: 0 })
      const res = await fetch('${LAN}/api/v1/system/info/public')
      console.log(res.status)
      fetch.dispose()
    `
    const run = Bun.spawnSync(['bun', '-e', script], { stderr: 'pipe' })
    expect(run.stderr.toString()).toBe('')
    expect(run.stdout.toString().trim()).toBe('200')
  })

  test('nothing it imports uses Node or a bundler’s own API', () => {
    const root = resolve(import.meta.dir, '../../..')
    const pkgDir = (name: string) =>
      ['packages', 'apps', 'design']
        .map((base) => join(root, base, name.replace('@highsea-tv/', '')))
        .find((dir) => existsSync(join(dir, 'package.json')))
    const seen = new Set<string>()
    const found: string[] = []
    // Node's own modules, by `node:` or their bare names (`fs`, `path`), are what Metro and the
    // browser lack (https://nodejs.org/api/module.html#modulebuiltinmodules)
    const builtIn = (spec: string) =>
      spec.startsWith('node:') || builtinModules.includes(spec.split('/')[0] as string)
    const resolveSpec = (from: string, spec: string) => {
      if (spec.startsWith('.')) return resolve(dirname(from), spec)
      if (!spec.startsWith('@highsea-tv/')) return null
      const [scope, name, ...sub] = spec.split('/')
      const dir = pkgDir(`${scope}/${name}`)
      const exports = dir
        ? (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).exports ?? {})
        : {}
      const target = exports[sub.length ? `./${sub.join('/')}` : '.']
      // an export by condition could hand Metro or the browser another file than the one walked
      if (dir && typeof target === 'string') return join(dir, target)
      found.push(`${from}: ${spec} ${target ? 'exports by condition' : 'isn’t exported'}`)
      return null
    }
    const walk = (file: string) => {
      if (seen.has(file) || !/\.tsx?$/.test(file)) return
      seen.add(file)
      const src = readFileSync(file, 'utf8')
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
      if (/\bimport\.meta\b|['"][^'"]*\?(?:raw|url|inline|worker)['"]/.test(code)) found.push(file)
      for (const m of src.matchAll(
        /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
      )) {
        if (m[2]) continue
        if (builtIn(m[3] as string)) found.push(`${file}: ${m[3]}`)
        const target = resolveSpec(file, m[3] as string)
        if (target) walk(target)
      }
    }
    walk(resolve(import.meta.dir, '../src/transport.ts'))
    expect(seen.size).toBeGreaterThan(20)
    expect(found).toEqual([])
  })
})

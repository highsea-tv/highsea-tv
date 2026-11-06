// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Users and devices, Network, Security and VPN through the mock's transport
// (one-client-platform-d.md › D3): the contract's shapes, the writes showing on the next read,
// and the server's refusals with their fields.
import { describe, expect, test } from 'bun:test'
import { routes } from '@highsea-tv/api-contract'
import { createMockFetch, memoryStorage } from '@highsea-tv/mock/transport'
import { type ApiError, createClient } from '@highsea-tv/sdk'

const LAN = 'http://192.168.1.20:3000'
const device = { name: 'Ruth’s Mac', client: 'web' as const, appVersion: '0.4.0' }

const setup = async (role: 'owner' | 'admin' | 'user' = 'owner') => {
  const fetch = createMockFetch({ latency: 0, storage: memoryStorage() })
  const r = await createClient({ baseUrl: LAN, fetch }).auth.signIn({
    body: { username: 'ruth', password: 'x', device },
  })
  if (r.status !== 'signed-in' || !r.token) throw new Error('not signed in')
  fetch.setState({ role })
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
  const ok = (route.responses[200] ?? route.responses[201]) as {
    content: { 'application/json': { schema: Schema } }
  }
  return ok.content['application/json'].schema.parse(value)
}

describe('users and devices', () => {
  test('invites, edits, resets and removes someone, with links to copy', async () => {
    const c = await setup()
    const invite = await c.users.invite({
      body: { displayName: 'Mara', email: 'mara@example.com', role: 'user', libraries: 'all' },
    })
    shaped(routes.users.invite, invite)
    expect(invite.user.invited).toBe(true)
    expect(invite.emailedTo).toBeNull()

    const again = await c.users.inviteLink({ params: { id: invite.user.id } })
    shaped(routes.users.inviteLink, again)

    const edited = await c.users.update({
      params: { id: invite.user.id },
      body: { displayName: 'Mara K', permissions: ['request', 'download'] },
    })
    shaped(routes.users.update, edited)
    expect(edited.displayName).toBe('Mara K')

    const reset = await c.users.resetPassword({ params: { id: 'u-ruth' } })
    shaped(routes.users.resetPassword, reset)
    expect((await caught(c.users.inviteLink({ params: { id: 'u-ruth' } }))).code).toBe('invalid')

    await c.users.resetTwoFactor({ params: { id: 'u-theo' } })
    await c.users.remove({ params: { id: invite.user.id } })
    const people = await c.users.list()
    expect(people.find((u) => u.id === invite.user.id)).toBeUndefined()
    expect(people.find((u) => u.id === 'u-theo')?.twoFactor).toBe(false)
  })

  test('lists the devices, by person too', async () => {
    const c = await setup()
    const all = await c.devices.list()
    shaped(routes.devices.list, all)
    expect(all.length).toBeGreaterThan(1)
    const ruths = await c.devices.list({ query: { userId: 'u-ruth' } })
    expect(ruths.every((d) => d.userId === 'u-ruth')).toBe(true)
  })

  test('makes an API key, shows its secret once and revokes it', async () => {
    const c = await setup()
    const key = await c.apiKeys.create({ body: { name: 'Home Assistant', scope: 'read' } })
    shaped(routes.apiKeys.create, key)
    expect(key.secret.startsWith(key.prefix)).toBe(true)
    const keys = await c.apiKeys.list()
    shaped(routes.apiKeys.list, keys)
    expect(keys.find((k) => k.id === key.id)).not.toHaveProperty('secret')
    await c.apiKeys.revoke({ params: { id: key.id } })
    expect((await c.apiKeys.list()).some((k) => k.id === key.id)).toBe(false)
  })

  test('an admin can’t invite anyone', async () => {
    const c = await setup('admin')
    const e = await caught(
      c.users.invite({ body: { displayName: 'X', email: null, role: 'user', libraries: 'all' } }),
    )
    expect(e.code).toBe('forbidden')
  })
})

describe('network', () => {
  test('reads with what the server adds, and saves what the mock never kept', async () => {
    const c = await setup()
    const before = await c.settings.network()
    shaped(routes.settings.network, before)
    expect(before.localAddresses.length).toBeGreaterThan(0)
    const { localAddresses: _a, discoveryPort: _d, tlsProblem: _t, ...input } = before
    const saved = await c.settings.saveNetwork({
      body: { ...input, remoteAccess: 'port-forward', httpsPort: 9443 },
    })
    expect(saved.remoteAccess).toBe('port-forward')
    expect((await c.settings.network()).httpsPort).toBe(9443)
  })

  test('an admin reads it but can’t save it', async () => {
    const c = await setup('admin')
    const s = await c.settings.network()
    const { localAddresses: _a, discoveryPort: _d, tlsProblem: _t, ...input } = s
    expect((await caught(c.settings.saveNetwork({ body: input }))).code).toBe('forbidden')
  })
})

describe('security', () => {
  const input = async (c: Awaited<ReturnType<typeof setup>>) => {
    const s = await c.settings.security()
    shaped(routes.settings.security, s)
    const { clientSecretSet: _s, ...oidc } = s.oidc
    return { ...s, oidc }
  }

  test('saves, keeping or removing the client secret', async () => {
    const c = await setup()
    const body = await input(c)
    const kept = await c.settings.saveSecurity({ body: { ...body, sessionDays: 7 } })
    expect(kept.sessionDays).toBe(7)
    expect(kept.oidc.clientSecretSet).toBe(true)
    const removed = await c.settings.saveSecurity({
      body: { ...body, oidc: { ...body.oidc, clientSecret: null } },
    })
    expect(removed.oidc.clientSecretSet).toBe(false)
  })

  test('refuses what the server refuses, naming the field', async () => {
    const c = await setup()
    const body = await input(c)
    const issuer = await caught(
      c.settings.saveSecurity({ body: { ...body, oidc: { ...body.oidc, issuer: 'http://x' } } }),
    )
    expect(issuer.details).toMatchObject({ field: 'oidc.issuer' })
    const header = await caught(
      c.settings.saveSecurity({ body: { ...body, proxyAuth: { enabled: true, header: 'a b' } } }),
    )
    expect(header.details).toMatchObject({ field: 'proxyAuth.header' })
  })

  test('is the owner’s alone', async () => {
    const c = await setup('admin')
    expect((await caught(c.settings.security())).code).toBe('forbidden')
  })
})

describe('vpn', () => {
  test('reads the settings, providers and interfaces, and saves the echo address', async () => {
    const c = await setup()
    const s = await c.vpn.settings()
    shaped(routes.vpn.settings, s)
    shaped(routes.vpn.providers, await c.vpn.providers())
    shaped(routes.vpn.interfaces, await c.vpn.interfaces())
    const saved = await c.vpn.save({ body: { echoUrl: 'https://ifconfig.me/all.json' } })
    shaped(routes.vpn.save, saved)
    expect(saved.echoUrl).toBe('https://ifconfig.me/all.json')
    const bad = await caught(c.vpn.save({ body: { echoUrl: 'ifconfig' } }))
    expect(bad.details).toMatchObject({ field: 'echoUrl' })
  })

  test('checks and reconnects', async () => {
    const c = await setup()
    shaped(routes.vpn.check, await c.vpn.check())
    shaped(routes.vpn.reconnect, await c.vpn.reconnect())
  })

  test('writes the compose block as the server does, and refuses a provider it doesn’t know', async () => {
    const c = await setup()
    const out = await c.vpn.compose({ body: { provider: 'proton' } })
    shaped(routes.vpn.compose, out)
    expect(out.yaml).toContain('VPN_SERVICE_PROVIDER: protonvpn')
    const bad = await caught(c.vpn.compose({ body: { provider: 'nowhere' } }))
    expect(bad.details).toMatchObject({ field: 'provider' })
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
// The VPN provider format: what an entry must say, and the rules a shape can't express.
import { describe, expect, test } from 'bun:test'
import {
  formatProviderIssues,
  type ProviderValidation,
  readAnswerPath,
  validateVpnProvider,
  vpnEngineSupports,
} from '../../src/vpn/index.ts'

const errors = (r: ProviderValidation) =>
  r.ok ? [] : r.errors.map((e) => `${e.path}: ${e.message}`)

const proton = {
  id: 'proton',
  version: '1.0.0',
  minEngineVersion: '1.0.0',
  name: 'Proton VPN',
  connect: 'config',
  steps: ['Download a WireGuard configuration.'],
  portForwarding: { method: 'natpmp', gateway: '10.2.0.1', lifetimeSeconds: 60, renewSeconds: 45 },
  ipv6: true,
  sources: ['https://protonvpn.com/support/port-forwarding-manual-setup'],
}

describe('The VPN provider format', () => {
  test('a complete entry validates, with links defaulting to none', () => {
    const r = validateVpnProvider(proton)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.definition.links).toEqual([])
  })

  test('refuses unknown fields, mechanisms that don’t exist, and plain-http sources', () => {
    expect(errors(validateVpnProvider({ ...proton, script: 'curl | sh' }))).toEqual([
      ': Unrecognized key: "script"',
    ])
    expect(validateVpnProvider({ ...proton, connect: 'openvpn' }).ok).toBe(false)
    expect(validateVpnProvider({ ...proton, portForwarding: { method: 'upnp' } }).ok).toBe(false)
    expect(validateVpnProvider({ ...proton, sources: ['http://example.com'] }).ok).toBe(false)
    expect(validateVpnProvider({ ...proton, id: 'Proton VPN' }).ok).toBe(false)
    expect(
      validateVpnProvider({
        ...proton,
        portForwarding: { ...proton.portForwarding, gateway: 'gateway.local' },
      }).ok,
    ).toBe(false)
  })

  test('PIA’s API connects and forwards together, and needs regions to fall back on', () => {
    expect(errors(validateVpnProvider({ ...proton, portForwarding: { method: 'pia' } }))).toEqual([
      'portForwarding.method: PIA’s port forwarding needs connect: pia.',
    ])
    expect(
      errors(validateVpnProvider({ ...proton, connect: 'pia', portForwarding: { method: 'pia' } })),
    ).toEqual(['regions: connect: pia needs a list of regions to fall back on.'])
  })

  test('a NAT-PMP mapping renews before it lapses', () => {
    const r = validateVpnProvider({
      ...proton,
      portForwarding: { ...proton.portForwarding, renewSeconds: 60 },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(formatProviderIssues(r.errors)).toContain('renewSeconds must be less')
  })

  test('an entry for a newer server is recognised as such', () => {
    expect(vpnEngineSupports('1.0.0')).toBe(true)
    expect(vpnEngineSupports('1.1.0')).toBe(true)
    expect(vpnEngineSupports('2.0.0')).toBe(false)
    // a server from before connect: token (engine 1.0.0) skips an entry that needs it
    expect(vpnEngineSupports('1.1.0', '1.0.0')).toBe(false)
  })

  const tokenEntry = {
    ...proton,
    id: 'nordvpn',
    name: 'NordVPN',
    minEngineVersion: '1.1.0',
    connect: 'token',
    portForwarding: { method: 'none' },
    token: {
      auth: { scheme: 'basic', username: 'token' },
      key: { url: 'https://api.example.com/v1/credentials', field: 'nordlynx_private_key' },
      servers: {
        url: 'https://api.example.com/v1/servers?limit=1',
        host: 'station',
        publicKey: 'technologies[id=35].metadata[name=public_key].value',
        country: 'filters[country_id]',
      },
      countries: { url: 'https://api.example.com/v1/countries', id: 'id', name: 'name' },
      tunnel: { address: '10.5.0.2/32', port: 51820, dns: ['103.86.96.100'] },
    },
    regions: ['Netherlands'],
  }

  test('an access token connects with a token block, described as data', () => {
    expect(errors(validateVpnProvider(tokenEntry))).toEqual([])
    const { token: _t, regions: _r, ...noBlock } = tokenEntry
    expect(errors(validateVpnProvider(noBlock))).toEqual([
      'token: connect: token needs a token block.',
    ])
    expect(errors(validateVpnProvider({ ...tokenEntry, connect: 'config' }))).toEqual([
      'token: A token block needs connect: token.',
    ])
    const { countries: _c, ...noCountries } = tokenEntry.token
    expect(errors(validateVpnProvider({ ...tokenEntry, token: noCountries }))).toEqual([
      'token.countries: A country filter needs the countries list to find the id.',
    ])
    // no code in a path, no plain http, and a tunnel address with its prefix
    for (const token of [
      { ...tokenEntry.token, key: { ...tokenEntry.token.key, field: 'a; rm -rf /' } },
      { ...tokenEntry.token, key: { ...tokenEntry.token.key, url: 'http://api.example.com' } },
      { ...tokenEntry.token, tunnel: { ...tokenEntry.token.tunnel, address: '10.5.0.2' } },
      { ...tokenEntry.token, auth: { scheme: 'query' } },
    ])
      expect(validateVpnProvider({ ...tokenEntry, token }).ok).toBe(false)
  })

  test('a path reads fields, and picks an item from a list by one of its fields', () => {
    const server = {
      station: '194.127.167.108',
      technologies: [
        { id: 3, metadata: [] },
        { id: 35, metadata: [{ name: 'public_key', value: 'key=' }] },
      ],
    }
    expect(readAnswerPath(server, 'station')).toBe('194.127.167.108')
    expect(readAnswerPath(server, 'technologies[id=35].metadata[name=public_key].value')).toBe(
      'key=',
    )
    expect(readAnswerPath(server, 'technologies[id=51].metadata')).toBeUndefined()
    expect(readAnswerPath(server, 'station.nothing')).toBeUndefined()
    expect(readAnswerPath(null, 'station')).toBeUndefined()
  })
})

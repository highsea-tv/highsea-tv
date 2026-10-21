// SPDX-License-Identifier: AGPL-3.0-only
// The VPN provider format: what an entry must say, and the rules a shape can't express.
import { describe, expect, test } from 'bun:test'
import {
  formatProviderIssues,
  type ProviderValidation,
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
    expect(vpnEngineSupports('2.0.0')).toBe(false)
  })
})

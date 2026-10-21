// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { composeFor, gluetunProviders } from '../src/index.ts'
import { seedProviders } from './helpers.ts'

describe('Compose for your provider', () => {
  test('Proton VPN’s block, as the prototype shows it', () => {
    expect(composeFor({ provider: 'proton' })).toBe(
      [
        'services:',
        '  gluetun:',
        '    image: qmcgaw/gluetun',
        '    cap_add: [NET_ADMIN]',
        '    devices: [/dev/net/tun:/dev/net/tun]',
        '    ports:',
        '      - "3000:3000"   # highsea’s admin, published here',
        '    environment:',
        '      VPN_SERVICE_PROVIDER: protonvpn',
        '      VPN_TYPE: wireguard',
        '      WIREGUARD_PRIVATE_KEY: <from your Proton configuration>',
        '      SERVER_COUNTRIES: Netherlands',
        '      VPN_PORT_FORWARDING: "on"',
        `      HTTP_CONTROL_SERVER_AUTH_DEFAULT_ROLE: '{"auth":"apikey","apikey":"<the API key>"}'`,
        '  highsea:',
        '    network_mode: "service:gluetun"',
      ].join('\n'),
    )
  })

  test('providers that don’t forward leave out VPN_PORT_FORWARDING', () => {
    const mullvad = composeFor({ provider: 'mullvad' })
    expect(mullvad).toContain('VPN_SERVICE_PROVIDER: mullvad')
    expect(mullvad).toContain('WIREGUARD_ADDRESSES: <from your Mullvad configuration>')
    expect(mullvad).not.toContain('VPN_PORT_FORWARDING')
    expect(composeFor({ provider: 'pia' })).toContain(
      'VPN_SERVICE_PROVIDER: private internet access\n      VPN_TYPE: openvpn',
    )
  })

  test('an unknown provider gets Proton’s block; every listed provider but other has its own', () => {
    expect(composeFor({ provider: 'nope' })).toBe(composeFor({ provider: 'proton' }))
    for (const p of seedProviders().filter((p) => p.id !== 'other'))
      expect(gluetunProviders[p.id]).toBeDefined()
  })

  test('an API key is written in only when it’s safe in the YAML', () => {
    expect(composeFor({ provider: 'proton', apiKey: 'Kx7f2Qm9Rw3Tz8Yp4Vn6Bc' })).toContain(
      `'{"auth":"apikey","apikey":"Kx7f2Qm9Rw3Tz8Yp4Vn6Bc"}'`,
    )
    expect(composeFor({ provider: 'proton', apiKey: `a'b"c` })).toContain('<the API key>')
  })
})

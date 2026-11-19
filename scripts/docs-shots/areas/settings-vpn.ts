// SPDX-License-Identifier: AGPL-3.0-only
// The VPN guide's screenshots (apps/docs/content/settings/vpn/). The seeded server has no VPN and no
// network, so each mode is shown as its form before saving; nothing here connects.
import type { Page } from 'playwright-core'
import type { Area } from '../shot.ts'

const mode = (name: RegExp) => (p: Page) => p.getByRole('radio', { name }).click()
// The built-in VPN’s fields wait for the provider list; the shot waits for them
const connects = async (p: Page) => {
  await mode(/Built-in VPN/)(p)
  await p.getByText('WireGuard configuration', { exact: true }).first().waitFor()
}
const provider = (name: string) => async (p: Page) => {
  await mode(/Built-in VPN/)(p)
  await p.getByRole('button', { name: 'Provider', exact: true }).click()
  await p.getByRole('menuitemradio', { name, exact: true }).click()
}
// a made-up NordVPN file in the shape the guide shows: example keys, no real server
const KEY = (n: number) => Buffer.alloc(32, n).toString('base64')
const NORD_EXAMPLE = `[Interface]
PrivateKey = ${KEY(1)}
Address = 10.5.0.2/32
DNS = 103.86.96.100, 103.86.99.100

[Peer]
PublicKey = ${KEY(2)}
AllowedIPs = 0.0.0.0/0
Endpoint = nl1.example.test:51820
`
// tall enough that the save bar sits below the form rather than over it
const connection = (p: Page) => p.getByRole('region', { name: 'Connection' })

export default {
  shots: [
    { name: 'overview', path: '/settings/vpn' },
    {
      name: 'connects',
      path: '/settings/vpn',
      act: connects,
      crop: connection,
      height: 1400,
    },
    {
      name: 'connects-compose',
      path: '/settings/vpn',
      act: async (p) => {
        await connects(p)
        await p.getByText('Compose for the built-in VPN').click()
        await p.getByText('cap_add: [NET_ADMIN]').first().waitFor()
      },
      crop: connection,
      height: 1400,
    },
    {
      name: 'connects-pia',
      path: '/settings/vpn',
      act: provider('Private Internet Access'),
      crop: connection,
      height: 1400,
    },
    {
      // the form only: nothing is saved or tested, so no token leaves the machine
      name: 'connects-nordvpn',
      path: '/settings/vpn',
      act: async (p) => {
        await provider('NordVPN')(p)
        await p.getByText('Access token', { exact: true }).first().waitFor()
      },
      crop: connection,
      height: 1400,
    },
    {
      name: 'forwarded-port',
      path: '/settings/vpn',
      act: provider('AirVPN'),
      crop: connection,
      height: 1400,
    },
    {
      // Test on the shot's machine: the seeded server isn't on Linux, so the tunnel line says so
      // before any command runs or anything leaves the machine. A pasted file, not a token: a
      // token would be sent to NordVPN before the tunnel is tried
      name: 'test',
      path: '/settings/vpn',
      act: async (p) => {
        await provider('NordVPN')(p)
        await p.getByRole('button', { name: 'Paste instead' }).click()
        await p.getByLabel('Paste the configuration').fill(NORD_EXAMPLE)
        await p.getByRole('button', { name: 'Test', exact: true }).click()
        await p.getByRole('list', { name: 'Test results' }).waitFor()
      },
      crop: connection,
      height: 1600,
    },
    {
      name: 'container',
      path: '/settings/vpn',
      act: async (p) => {
        await mode(/A VPN container/)(p)
        await p.getByText('Compose for your provider').click()
        await p.getByText('VPN_SERVICE_PROVIDER').first().waitFor()
      },
      crop: connection,
      height: 1400,
    },
    {
      name: 'interface',
      path: '/settings/vpn',
      act: mode(/An interface on this machine/),
      crop: connection,
      height: 1400,
    },
    {
      name: 'behaviour',
      path: '/settings/vpn',
      act: mode(/Built-in VPN/),
      crop: (p) => p.getByRole('region', { name: 'Behaviour' }),
      height: 1400,
    },
  ],
} satisfies Area

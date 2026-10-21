// SPDX-License-Identifier: AGPL-3.0-only
// The providers Settings › VPN offers at launch (checkpoint 6, answer V4), as the approved
// prototype lists them. 6b moves these facts into the catalog's `vpn-providers` kind
// (docs/plans/phase-3-checkpoint-6.md › Providers); until then they live here.
import type { VpnProvider } from './types.ts'

/** The catalog's `vpn-providers` entries at launch (checkpoint 6, answer V4). */
export const vpnProviders: VpnProvider[] = [
  {
    id: 'proton',
    name: 'Proton VPN',
    connect: 'config',
    steps: [
      'Sign in at account.protonvpn.com and open Downloads › WireGuard configuration.',
      'Choose a server marked P2P, and turn on NAT-PMP (port forwarding).',
      'Download the file and upload it here.',
    ],
    portForwarding: 'natpmp',
    ipv6: true,
  },
  {
    id: 'pia',
    name: 'Private Internet Access',
    connect: 'account',
    steps: [
      'Use the username and password you sign in to PIA with. The username starts with p.',
      'Pick a region. highsea registers its own WireGuard key with PIA, so there’s no file.',
    ],
    portForwarding: 'pia',
    ipv6: false,
    regions: ['CA Montreal', 'CA Toronto', 'Netherlands', 'Sweden', 'Switzerland', 'DE Frankfurt'],
  },
  {
    id: 'airvpn',
    name: 'AirVPN',
    connect: 'config',
    steps: [
      'Sign in at airvpn.org and open Client Area › Config Generator.',
      'Choose Linux and WireGuard, pick a country or server, and generate the file.',
      'Upload it here. To forward a port, reserve one under Client Area › Ports and type it below.',
    ],
    portForwarding: 'static',
    ipv6: true,
  },
  {
    id: 'mullvad',
    name: 'Mullvad',
    connect: 'config',
    steps: [
      'Sign in at mullvad.net and open WireGuard configuration.',
      'Generate a key, pick a country and server, and download the file.',
      'Upload it here.',
    ],
    portForwarding: 'none',
    ipv6: true,
  },
  ...(['IVPN', 'Windscribe', 'Surfshark'] as const).map(
    (name): VpnProvider => ({
      id: name.toLowerCase(),
      name,
      connect: 'config',
      steps: [
        `In your ${name} account, open the WireGuard configuration page and generate a file for a server.`,
        'Upload it here. If they reserved a port for you, type it below.',
      ],
      portForwarding: 'static',
      ipv6: false,
    }),
  ),
  {
    id: 'other',
    name: 'Another WireGuard provider',
    connect: 'config',
    steps: [
      'Download a WireGuard configuration file from your provider.',
      'Upload it here. If they reserved a port for you, type it below.',
    ],
    portForwarding: 'static',
    ipv6: false,
  },
]

export const providerById = (id: string) => vpnProviders.find((p) => p.id === id)

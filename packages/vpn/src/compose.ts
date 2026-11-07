// SPDX-License-Identifier: AGPL-3.0-only
// The compose lines Settings › VPN writes (docs/product/vpn.md), one writer for each mode that
// needs them, so the screen and the guides draw on the same text (one-compose-file.md, part B).
//
// Compose for your provider (A VPN container): the gluetun service block, from gluetun's documented
// variables (https://github.com/qdm12/gluetun-wiki/tree/main/setup/providers, and the control
// server's `HTTP_CONTROL_SERVER_AUTH_DEFAULT_ROLE`,
// https://github.com/qdm12/gluetun-wiki/blob/main/setup/advanced/control-server.md), beside
// highsea's `network_mode` line. The same text the approved prototype shows, so the page reads it
// from the API.
//
// Compose for highsea connects (proposed, one-compose-file.md part B): the lines highsea's own
// service needs to run the tunnel. `cap_add: [NET_ADMIN]` lets the container make its interface and
// routes (https://docs.docker.com/reference/compose-file/services/#cap_add, and
// https://docs.docker.com/engine/containers/run/#runtime-privilege-and-linux-capabilities); the
// published ports take the place of `network_mode: host`, so the interface and its rule stay in the
// container's own network namespace rather than the host's (ADR 0042;
// https://docs.docker.com/reference/compose-file/services/#network_mode and
// https://docs.docker.com/reference/compose-file/services/#ports), and they're the ports the Docker
// guide's macOS and Windows tab publishes (ADR 0020, 0037). The TUN device is for wireguard-go, on
// kernels before Linux 5.6, the first with WireGuard built in (https://www.wireguard.com/install/),
// so it's left commented (https://docs.docker.com/reference/compose-file/services/#devices).

/** gluetun's names and variables per provider, from its provider pages. */
export type GluetunProvider = { name: string; env: string[]; forwards: boolean }

export const gluetunProviders: Record<string, GluetunProvider> = {
  proton: {
    name: 'protonvpn',
    env: ['VPN_TYPE: wireguard', 'WIREGUARD_PRIVATE_KEY: <from your Proton configuration>'],
    forwards: true,
  },
  pia: {
    name: 'private internet access',
    env: [
      'VPN_TYPE: openvpn',
      'OPENVPN_USER: <your PIA username>',
      'OPENVPN_PASSWORD: <your PIA password>',
    ],
    forwards: true,
  },
  airvpn: {
    name: 'airvpn',
    env: [
      'VPN_TYPE: wireguard',
      'WIREGUARD_PRIVATE_KEY: <from the Config Generator>',
      'WIREGUARD_PRESHARED_KEY: <from the Config Generator>',
      'WIREGUARD_ADDRESSES: <from the Config Generator>',
      'FIREWALL_VPN_INPUT_PORTS: <your reserved port>',
    ],
    forwards: false,
  },
  mullvad: {
    name: 'mullvad',
    env: [
      'VPN_TYPE: wireguard',
      'WIREGUARD_PRIVATE_KEY: <from your Mullvad configuration>',
      'WIREGUARD_ADDRESSES: <from your Mullvad configuration>',
    ],
    forwards: false,
  },
  ivpn: {
    name: 'ivpn',
    env: ['VPN_TYPE: wireguard', 'WIREGUARD_PRIVATE_KEY: <…>', 'WIREGUARD_ADDRESSES: <…>'],
    forwards: false,
  },
  windscribe: {
    name: 'windscribe',
    env: [
      'VPN_TYPE: wireguard',
      'WIREGUARD_PRIVATE_KEY: <…>',
      'WIREGUARD_PRESHARED_KEY: <…>',
      'WIREGUARD_ADDRESSES: <…>',
    ],
    forwards: false,
  },
  surfshark: {
    name: 'surfshark',
    env: ['VPN_TYPE: wireguard', 'WIREGUARD_PRIVATE_KEY: <…>', 'WIREGUARD_ADDRESSES: <…>'],
    forwards: false,
  },
}
export type ComposeInput =
  | {
      /** Compose for your provider, the container mode's block (the default). */
      mode?: 'container'
      /** A provider's id; an unknown one gets Proton VPN's block, as the prototype does. */
      provider: string
      /**
       * An API key to write in, such as one gluetun's `genkey` made; else the placeholder. Never
       * the stored key: the page shows this text.
       */
      apiKey?: string
    }
  /** Compose for highsea connects: highsea's own service, which needs no provider. */
  | { mode: 'builtin' }

/** Characters an API key can hold here without breaking the YAML's single-quoted JSON. */
const SAFE_KEY = /^[A-Za-z0-9_\-.~+/=]{1,128}$/

/** The ports highsea publishes off host networking, as the Docker guide's macOS tab has them. */
export const publishedPorts = [
  '"3000:3000"   # the admin and the apps',
  '"6881:6881/tcp"',
  '"6881:6881/udp"',
  '"7368:7368/udp"   # the apps find the server here',
]

export function composeFor(input: ComposeInput): string {
  if (input.mode === 'builtin')
    return [
      'services:',
      '  highsea:',
      '    cap_add: [NET_ADMIN]',
      '    # in place of network_mode: host, which would put the tunnel in the host’s network',
      '    ports:',
      ...publishedPorts.map((p) => `      - ${p}`),
      '    # only on a kernel before Linux 5.6, which has no WireGuard of its own:',
      '    # devices: [/dev/net/tun:/dev/net/tun]',
    ].join('\n')
  const g = gluetunProviders[input.provider] ?? (gluetunProviders.proton as GluetunProvider)
  const key = input.apiKey && SAFE_KEY.test(input.apiKey) ? input.apiKey : '<the API key>'
  return [
    'services:',
    '  gluetun:',
    '    image: qmcgaw/gluetun',
    '    cap_add: [NET_ADMIN]',
    '    devices: [/dev/net/tun:/dev/net/tun]',
    '    ports:',
    '      - "3000:3000"   # highsea’s admin, published here',
    '    environment:',
    `      VPN_SERVICE_PROVIDER: ${g.name}`,
    ...g.env.map((e) => `      ${e}`),
    '      SERVER_COUNTRIES: Netherlands',
    ...(g.forwards ? ['      VPN_PORT_FORWARDING: "on"'] : []),
    `      HTTP_CONTROL_SERVER_AUTH_DEFAULT_ROLE: '{"auth":"apikey","apikey":"${key}"}'`,
    '  highsea:',
    '    network_mode: "service:gluetun"',
  ].join('\n')
}

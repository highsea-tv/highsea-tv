// SPDX-License-Identifier: AGPL-3.0-only
// Compose for your provider (docs/product/vpn.md › A VPN container): the gluetun service block,
// from gluetun's documented variables (https://github.com/qdm12/gluetun-wiki/tree/main/setup/providers,
// and the control server's `HTTP_CONTROL_SERVER_AUTH_DEFAULT_ROLE`,
// https://github.com/qdm12/gluetun-wiki/blob/main/setup/advanced/control-server.md), beside
// highsea's `network_mode` line. The same text the approved prototype shows
// (design/prototypes/src/admin/settings/vpn.tsx), so the page reads it from the API.

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
export type ComposeInput = {
  /** A provider's id; an unknown one gets Proton VPN's block, as the prototype does. */
  provider: string
  /**
   * An API key to write in, such as one gluetun's `genkey` made; else the placeholder. Never the
   * stored key: the page shows this text.
   */
  apiKey?: string
}

/** Characters an API key can hold here without breaking the YAML's single-quoted JSON. */
const SAFE_KEY = /^[A-Za-z0-9_\-.~+/=]{1,128}$/

export function composeFor(input: ComposeInput): string {
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

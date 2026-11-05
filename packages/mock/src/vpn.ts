// SPDX-License-Identifier: AGPL-3.0-only
// VPN connections (docs/product/vpn.md): the settings, the providers the catalog will carry, and
// the status the server works out from both. The mock opens no tunnel; it plays the states:
// connecting, connected, down and reconnecting, and the ways a connection fails.

export type VpnMode = 'builtin' | 'container' | 'interface' | 'off'

export type VpnSettings = {
  mode: VpnMode
  /** A provider's id from `vpnProviders`. */
  provider: string
  /** The uploaded WireGuard configuration's file name; its keys stay on the server. */
  configName: string | null
  /** Write-only: a new configuration's text, sent once and never read back. */
  config?: string
  piaUsername: string
  piaPasswordSet: boolean
  /** Write-only, like `config`. */
  piaPassword?: string
  piaRegion: string
  /** A port the provider reserved for the owner, typed in (AirVPN, and others that offer one). */
  staticPort: number | null
  containerUrl: string
  containerKeySet: boolean
  /** Write-only, like `config`. */
  containerKey?: string
  interface: string
  useForwardedPort: boolean
  indexersThroughVpn: boolean
}

export type VpnProvider = {
  id: string
  name: string
  connect: 'config' | 'account'
  /** Where to find what highsea needs in the provider's account, in order. */
  steps: string[]
  portForwarding: 'natpmp' | 'pia' | 'static' | 'none'
  /** Whether the provider's tunnels carry IPv6. */
  ipv6: boolean
  regions?: string[]
}

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

export const defaultVpnSettings = (kind: 'populated' | 'empty'): VpnSettings => ({
  mode: kind === 'empty' ? 'off' : 'builtin',
  provider: 'proton',
  configName: kind === 'empty' ? null : 'harbor-NL-FREE-P2P-21.conf',
  piaUsername: '',
  piaPasswordSet: false,
  piaRegion: 'Netherlands',
  staticPort: null,
  containerUrl: 'http://127.0.0.1:8000',
  containerKeySet: false,
  interface: 'wg0',
  useForwardedPort: true,
  indexersThroughVpn: false,
})

/** What the server knows about the tunnel, apart from the settings. */
export type VpnRuntime = {
  /** Whether highsea's container was given NET_ADMIN (the empty server's wasn't). */
  capability: boolean
  phase: 'connected' | 'connecting' | 'down' | 'failed'
  /** Why the last connection failed, in the spec's copy. */
  failure: string | null
  /** Simulated ms when the current phase ends (connecting, down). */
  until: number
  connectedAt: number
  checkedAt: number
}

export type VpnState = 'off' | 'connecting' | 'connected' | 'down' | 'failed'

export type VpnCheck = {
  id: 'tunnel' | 'exit' | 'names' | 'killSwitch' | 'portForwarding' | 'ipv6'
  label: string
  result: 'pass' | 'warn' | 'fail' | 'info' | 'pending'
  /** The headline before the dot, then what it means. */
  title: string
  detail?: string
}

export type VpnStatus = {
  mode: VpnMode
  provider: string | null
  state: VpnState
  /** The failing step's copy, when `state` is failed. */
  message: string | null
  /** Failed for want of NET_ADMIN: the page shows the compose lines to add. */
  needsCapability: boolean
  exitIp: string | null
  country: string | null
  forwardedPort: number | null
  checks: VpnCheck[]
  checkedAt: string | null
}

/** Exit addresses per provider, for the mock (documentation ranges stand in for the rest). */
const exits: Record<string, [string, string]> = {
  proton: ['185.159.157.4', 'Netherlands'],
  pia: ['181.214.206.17', 'Netherlands'],
  airvpn: ['213.152.161.29', 'Netherlands'],
  mullvad: ['193.32.249.66', 'Netherlands'],
  container: ['198.51.100.23', 'Switzerland'],
  interface: ['203.0.113.40', 'Netherlands'],
}

const labels: Record<VpnCheck['id'], string> = {
  tunnel: 'Tunnel',
  exit: 'Exit address',
  names: 'Names',
  killSwitch: 'Kill switch',
  portForwarding: 'Port forwarding',
  ipv6: 'IPv6',
}

const check = (
  id: VpnCheck['id'],
  result: VpnCheck['result'],
  title: string,
  detail?: string,
): VpnCheck => ({ id, label: labels[id], result, title, detail })

export function vpnStatus(
  s: VpnSettings,
  rt: VpnRuntime,
  now: number,
  listeningPort: number,
): VpnStatus {
  const p = providerById(s.provider)
  const name =
    s.mode === 'builtin'
      ? (p?.name ?? 'your provider')
      : s.mode === 'container'
        ? 'gluetun'
        : s.interface
  const base: VpnStatus = {
    mode: s.mode,
    provider: s.mode === 'off' ? null : name,
    state: 'off',
    message: null,
    needsCapability: false,
    exitIp: null,
    country: null,
    forwardedPort: null,
    checks: [],
    checkedAt: s.mode === 'off' ? null : new Date(rt.checkedAt).toISOString(),
  }
  if (s.mode === 'off') return base
  if (s.mode === 'builtin' && !rt.capability)
    return {
      ...base,
      state: 'failed',
      needsCapability: true,
      message:
        'highsea needs the NET_ADMIN capability to run the tunnel. Add it to highsea’s service in your compose file, then restart.',
    }
  if (rt.phase === 'failed') return { ...base, state: 'failed', message: rt.failure }

  const ids: VpnCheck['id'][] = ['tunnel', 'exit', 'names', 'killSwitch', 'portForwarding', 'ipv6']
  if (rt.phase === 'connecting')
    return {
      ...base,
      state: 'connecting',
      checks: ids.map((id) => check(id, 'pending', 'Waiting for the tunnel.')),
    }
  if (rt.phase === 'down')
    return {
      ...base,
      state: 'down',
      checks: [
        check(
          'tunnel',
          'fail',
          'No handshake for 3 minutes',
          'Reconnecting. Torrents are stopped until it’s back.',
        ),
        check(
          'killSwitch',
          'pass',
          'Torrents are stopped',
          'Nothing leaks onto your own connection.',
        ),
        ...ids
          .filter((id) => id !== 'tunnel' && id !== 'killSwitch')
          .map((id) => check(id, 'pending', 'Checked again once the tunnel is back.')),
      ],
    }

  const key = s.mode === 'builtin' ? s.provider : s.mode
  const [exitIp, country] = exits[key] ?? ['198.51.100.7', 'Netherlands']
  const handshake = 5 + Math.round(((now - rt.connectedAt) / 1000) % 110)
  const forwardedPort =
    s.mode === 'container'
      ? s.useForwardedPort
        ? 41822
        : null
      : s.mode === 'builtin' && s.useForwardedPort
        ? p?.portForwarding === 'natpmp' || p?.portForwarding === 'pia'
          ? 53186
          : p?.portForwarding === 'static'
            ? s.staticPort
            : null
        : null
  const peersIn = forwardedPort ? 14 : 0

  const tunnel =
    s.mode === 'builtin'
      ? check('tunnel', 'pass', `Connected to ${name}`, `Last handshake ${handshake} seconds ago.`)
      : s.mode === 'container'
        ? check('tunnel', 'pass', 'gluetun reports the tunnel running')
        : check('tunnel', 'pass', `${s.interface} is up`, `Its address is 10.2.0.15.`)
  const exit =
    s.mode === 'container'
      ? check(
          'exit',
          'pass',
          `Torrents leave from ${exitIp} (${country})`,
          'From inside the container, highsea can’t see your own address to compare.',
        )
      : check(
          'exit',
          'pass',
          `Torrents leave from ${exitIp} (${country})`,
          'Not from your own address.',
        )
  const names =
    s.mode === 'container'
      ? check(
          'names',
          'pass',
          'Names are looked up through the tunnel',
          'Like everything else in the container.',
        )
      : check('names', 'pass', 'Tracker names are looked up through the tunnel')
  const killSwitch =
    s.mode === 'interface'
      ? check(
          'killSwitch',
          'warn',
          `Bound to ${s.interface}`,
          'Your system’s routing decides the path; a VPN container or highsea connects guarantees it.',
        )
      : s.mode === 'container'
        ? check(
            'killSwitch',
            'pass',
            'Nothing can leave outside the tunnel',
            'The container has no other route.',
          )
        : check(
            'killSwitch',
            'pass',
            'If the tunnel drops, torrents stop',
            'Nothing can leave outside it.',
          )
  const portForwarding =
    s.mode === 'interface'
      ? check(
          'portForwarding',
          'info',
          `Torrents listen on port ${listeningPort}`,
          'Forward it through your tunnel yourself, if your provider allows it.',
        )
      : forwardedPort
        ? check(
            'portForwarding',
            'pass',
            `Port ${forwardedPort} is forwarded`,
            `${peersIn} peers have connected in.`,
          )
        : !s.useForwardedPort
          ? check(
              'portForwarding',
              'info',
              'Not using a forwarded port',
              'Downloads still work; fewer peers can reach you.',
            )
          : s.mode === 'builtin' && p?.portForwarding === 'static'
            ? check(
                'portForwarding',
                'warn',
                'No forwarded port set',
                'Downloads still work; fewer peers can reach you.',
              )
            : check(
                'portForwarding',
                'warn',
                `${name} doesn’t forward ports`,
                'Downloads still work; fewer peers can reach you.',
              )
  const ipv6 =
    s.mode === 'builtin' && p?.ipv6
      ? check('ipv6', 'pass', 'IPv6 goes through the tunnel too')
      : check(
          'ipv6',
          'info',
          'IPv4 only',
          'The tunnel has no IPv6 address, so torrents use IPv4 only.',
        )
  return {
    ...base,
    state: 'connected',
    exitIp,
    country,
    forwardedPort,
    checks: [tunnel, exit, names, killSwitch, portForwarding, ipv6],
  }
}

/**
 * Checks new settings the way the server would before connecting: the spec's copy for each
 * failure, or null. PIA's password `wrong` and gluetun's key `wrong` play a refusal.
 */
export function connectionFailure(s: VpnSettings): string | null {
  if (s.mode === 'builtin') {
    const p = providerById(s.provider)
    if (p?.connect === 'account') {
      if (!s.piaUsername) return 'Enter your PIA username.'
      if (s.piaPassword === 'wrong') return 'PIA didn’t accept that username and password.'
      if (!s.piaPasswordSet && !s.piaPassword) return 'Enter your PIA password.'
      return null
    }
    if (s.config !== undefined && !/^\s*\[Interface\]/m.test(s.config))
      return 'That file isn’t a WireGuard configuration: it has no [Interface] section.'
    if (!s.configName && s.config === undefined)
      return `Upload a WireGuard configuration from ${p?.name ?? 'your provider'}.`
  }
  if (s.mode === 'container') {
    if (s.containerKey === 'wrong')
      return `gluetun’s control server at ${s.containerUrl} refused that API key.`
    if (!/^https?:\/\/[^\s/]+/.test(s.containerUrl))
      return `Couldn’t reach the VPN container’s control server at ${s.containerUrl}.`
    if (!s.containerKeySet && !s.containerKey) return 'Enter the control server’s API key.'
  }
  return null
}

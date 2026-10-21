// SPDX-License-Identifier: AGPL-3.0-only
// VPN connections' shapes (docs/product/vpn.md), as the Settings › VPN prototype drew them
// (design/prototypes/src/mock/vpn.ts): the settings the admin reads and writes, and the status
// worked out from them and the tunnel.

export type VpnMode = 'builtin' | 'container' | 'interface' | 'off'

/** The settings as the API returns them: secrets are only ever said to be set. */
export type VpnSettings = {
  mode: VpnMode
  /** A provider's id from `vpnProviders`. */
  provider: string
  /** The uploaded WireGuard configuration's file name; its keys stay on the server. */
  configName: string | null
  piaUsername: string
  piaPasswordSet: boolean
  piaRegion: string
  /** A port the provider reserved for the owner, typed in (AirVPN, and others that offer one). */
  staticPort: number | null
  containerUrl: string
  containerKeySet: boolean
  interface: string
  useForwardedPort: boolean
  indexersThroughVpn: boolean
  /** The IP echo service the exit check asks (judgement call 16). */
  echoUrl: string
}

/**
 * What the admin sends. The secrets are write-only: sent once, never read back, and an absent or
 * empty one keeps what's stored.
 */
export type VpnSettingsInput = Partial<Omit<VpnSettings, 'piaPasswordSet' | 'containerKeySet'>> & {
  /** A new WireGuard configuration's text. */
  config?: string
  piaPassword?: string
  containerKey?: string
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

/**
 * Where torrent traffic leaves from, the same shape as `@highsea/torrent`'s `Binding`: an address
 * to bind every socket to (null for any), and DNS servers (empty for the system's). `null` in its
 * place means the tunnel is down and nothing may leave.
 */
export type VpnBinding = { address: string | null; dns: string[] }

/** An interface the owner can pick in the interface mode. */
export type VpnInterface = { name: string; ipv4: string | null; ipv6: string | null }

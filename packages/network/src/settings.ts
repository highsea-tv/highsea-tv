// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Network and remote access (settings.md), stored in the `network` settings row.

export type RemoteAccess = 'local-only' | 'reverse-proxy' | 'port-forward'

export type NetworkSettings = {
  /** How setup left remote access; Settings edits the fields below directly. */
  remoteAccess: RemoteAccess
  /** The address people use from outside (`https://harbor.example.net`), or empty. */
  externalUrl: string
  /** Addresses and CIDR ranges whose forwarded headers are believed. */
  trustedProxies: string
  /** Read X-Forwarded-For, X-Forwarded-Proto and X-Forwarded-Host from trusted proxies. */
  proxyHeaders: boolean
  /** Who does TLS: a reverse proxy, the server itself, or nobody (LAN only). */
  tls: 'proxy' | 'built-in' | 'off'
  /** Where built-in TLS listens: the port forwarded on the router. */
  httpsPort: number
  /** Answer UDP discovery and advertise over mDNS. */
  discovery: boolean
}

export const NETWORK_KEY = 'network'

export const defaultNetworkSettings: NetworkSettings = {
  remoteAccess: 'local-only',
  externalUrl: '',
  trustedProxies: '',
  proxyHeaders: false,
  tls: 'off',
  httpsPort: 8443,
  discovery: true,
}

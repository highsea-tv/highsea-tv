// SPDX-License-Identifier: AGPL-3.0-only
// WireGuard configuration files, in the format wg(8) and wg-quick(8) document
// (https://git.zx2c4.com/wireguard-tools/about/src/man/wg.8,
// https://git.zx2c4.com/wireguard-tools/about/src/man/wg-quick.8): INI-style `[Interface]` and
// `[Peer]` sections of `Key = Value` lines, `#` comments. wg(8)'s keys are PrivateKey, ListenPort
// and FwMark on the interface; PublicKey, PresharedKey, AllowedIPs, Endpoint and
// PersistentKeepalive on a peer. wg-quick(8) adds Address, DNS, MTU, Table, the Pre/Post Up/Down
// hooks and SaveConfig to the interface. Keys are base64 of 32 bytes ("base64 encoding of 32
// bytes", wg(8) › CONFIGURATION FILE FORMAT). Key names match without regard to case, as
// wireguard-tools' config.c compares them with strcasecmp. highsea never runs the hooks: it reads
// the file and sets the interface itself (the plan's "highsea connects", 6b).
import { isIP } from 'node:net'
import { wireGuardFailures as fail } from './copy.ts'

export type WireGuardPeer = {
  publicKey: string
  presharedKey: string | null
  /** `host:port`, with an IPv6 host in brackets. */
  endpoint: { host: string; port: number } | null
  allowedIps: string[]
  persistentKeepalive: number | null
}

export type WireGuardConfig = {
  privateKey: string
  /** CIDR addresses (wg-quick's Address); a bare address is a /32 or /128. */
  addresses: string[]
  /** Resolver addresses from wg-quick's DNS; its non-address entries are search domains. */
  dns: string[]
  listenPort: number | null
  mtu: number | null
  peers: WireGuardPeer[]
}

export class WireGuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WireGuardError'
  }
}

/** A WireGuard key: 44 base64 characters that decode to exactly 32 bytes. */
export function isWireGuardKey(value: string): boolean {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return false
  const bytes = Buffer.from(value, 'base64')
  return bytes.length === 32 && bytes.toString('base64') === value
}

const list = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

function cidr(key: string, value: string): string {
  const [address, prefix, ...rest] = value.split('/')
  const family = isIP(address ?? '')
  if (!family || rest.length) throw new WireGuardError(fail.badValue(key, value))
  if (prefix === undefined) return `${address}/${family === 4 ? 32 : 128}`
  const n = Number(prefix)
  if (!/^\d{1,3}$/.test(prefix) || n > (family === 4 ? 32 : 128))
    throw new WireGuardError(fail.badValue(key, value))
  return `${address}/${n}`
}

function port(key: string, value: string, min = 1): number {
  const n = Number(value)
  if (!/^\d{1,5}$/.test(value) || n < min || n > 65535)
    throw new WireGuardError(fail.badValue(key, value))
  return n
}

function endpoint(value: string): { host: string; port: number } {
  // wg(8): "an IP address or a hostname, followed by a colon, and then a port number"; an IPv6
  // address goes in brackets
  const m = /^(?:\[([^\]]+)\]|([^:[\]]+)):(\d+)$/.exec(value)
  const host = m?.[1] ?? m?.[2]
  if (!m || !host || (m[1] && isIP(m[1]) !== 6))
    throw new WireGuardError(fail.badValue('Endpoint', value))
  return { host, port: port('Endpoint', m[3] as string) }
}

function key(name: string, value: string): string {
  if (!isWireGuardKey(value)) throw new WireGuardError(fail.badKey(name))
  return value
}

/** Parses a configuration file, or throws a `WireGuardError` with the copy to show. */
export function parseWireGuard(text: string): WireGuardConfig {
  let section: 'interface' | 'peer' | 'other' | null = null
  let sawInterface = false
  const config: WireGuardConfig = {
    privateKey: '',
    addresses: [],
    dns: [],
    listenPort: null,
    mtu: null,
    peers: [],
  }
  let peer: WireGuardPeer | null = null
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  for (const [i, raw] of lines.entries()) {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) continue
    const header = /^\[([^\]]+)\]$/.exec(line)
    if (header) {
      const name = (header[1] as string).trim().toLowerCase()
      if (name === 'interface') {
        section = 'interface'
        sawInterface = true
      } else if (name === 'peer') {
        section = 'peer'
        peer = {
          publicKey: '',
          presharedKey: null,
          endpoint: null,
          allowedIps: [],
          persistentKeepalive: null,
        }
        config.peers.push(peer)
      } else section = 'other'
      continue
    }
    // anything before the first section isn't WireGuard's: an OpenVPN file, say
    if (section === null) throw new WireGuardError(fail.noInterface)
    const eq = line.indexOf('=')
    if (eq < 1) throw new WireGuardError(fail.badLine(i + 1))
    const name = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    const k = name.toLowerCase()
    if (section === 'interface') {
      if (k === 'privatekey') config.privateKey = key('PrivateKey', value)
      else if (k === 'address') config.addresses.push(...list(value).map((a) => cidr(name, a)))
      else if (k === 'dns') config.dns.push(...list(value).filter((d) => isIP(d)))
      else if (k === 'listenport') config.listenPort = port('ListenPort', value)
      else if (k === 'mtu') {
        const n = Number(value)
        if (!/^\d{3,5}$/.test(value) || n < 576 || n > 65535)
          throw new WireGuardError(fail.badValue('MTU', value))
        config.mtu = n
      }
      // FwMark, Table, the hooks and SaveConfig shape how wg-quick routes the host; highsea sets
      // its own routes and never runs a hook, so they're read past
    } else if (section === 'peer' && peer) {
      if (k === 'publickey') peer.publicKey = key('PublicKey', value)
      else if (k === 'presharedkey') peer.presharedKey = key('PresharedKey', value)
      else if (k === 'endpoint') peer.endpoint = endpoint(value)
      else if (k === 'allowedips') peer.allowedIps.push(...list(value).map((a) => cidr(name, a)))
      else if (k === 'persistentkeepalive')
        // wg(8): "a seconds interval, between 1 and 65535 inclusive" or "off"
        peer.persistentKeepalive = value.toLowerCase() === 'off' ? null : port(name, value)
    }
  }
  if (!sawInterface) throw new WireGuardError(fail.noInterface)
  if (!config.privateKey) throw new WireGuardError(fail.noPrivateKey)
  if (!config.peers.length) throw new WireGuardError(fail.noPeer)
  if (config.peers.some((p) => !p.publicKey)) throw new WireGuardError(fail.noPublicKey)
  return config
}

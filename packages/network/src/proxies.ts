// SPDX-License-Identifier: AGPL-3.0-only
// Who's asking, behind a reverse proxy. X-Forwarded-For and X-Forwarded-Proto are believed only
// when the connection comes from a trusted proxy (OWASP: headers set by the client can't be
// trusted). The client is the rightmost X-Forwarded-For address that isn't a trusted proxy, since
// each proxy appends the address it received from and anything to the left can be forged.
// Addresses are matched with Node's built-in net.BlockList.
import { BlockList, isIP } from 'node:net'

/** Express's named ranges, for the common case of a proxy on the same host or a Docker network. */
export const PRIVATE_RANGES = [
  '127.0.0.0/8',
  '::1/128',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  'fc00::/7',
]

export type TrustedProxies = {
  /** The entries as written, for display. */
  entries: string[]
  has(address: string): boolean
}

/** Strips `::ffff:` from IPv4-mapped IPv6 addresses (Node reports IPv4 clients that way on `::`). */
export const plainAddress = (address: string) =>
  address.startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address

/** Parses "10.0.0.0/8, 192.168.1.2" into a matcher. Returns the bad entries too. */
export function parseTrustedProxies(list: string): { trusted: TrustedProxies; invalid: string[] } {
  const entries = list
    .split(/[\s,]+/)
    .map((e) => e.trim())
    .filter(Boolean)
  const block = new BlockList()
  const invalid: string[] = []
  for (const entry of entries) {
    const [address = '', bits] = entry.split('/')
    const family = isIP(address)
    if (!family) {
      invalid.push(entry)
      continue
    }
    const type = family === 4 ? 'ipv4' : 'ipv6'
    if (bits === undefined) block.addAddress(address, type)
    else {
      const prefix = Number(bits)
      if (!Number.isInteger(prefix) || prefix < 0 || prefix > (family === 4 ? 32 : 128)) {
        invalid.push(entry)
        continue
      }
      block.addSubnet(address, prefix, type)
    }
  }
  return {
    trusted: {
      entries,
      has(address) {
        const a = plainAddress(address)
        const family = isIP(a)
        return family !== 0 && block.check(a, family === 4 ? 'ipv4' : 'ipv6')
      },
    },
    invalid,
  }
}

export type ClientInfo = {
  /** The client's address, through trusted proxies. */
  address: string
  /** Whether the client's connection is HTTPS (directly, or to a trusted proxy that says so). */
  secure: boolean
  /** The host the client asked for. */
  host: string
  /** Whether a trusted proxy carried the request. */
  proxied: boolean
}

type Headers = Record<string, string | string[] | undefined>

const header = (h: Headers, name: string) => {
  const v = h[name]
  return Array.isArray(v) ? v.join(',') : v
}

export function resolveClient({
  remoteAddress,
  encrypted,
  headers,
  trusted,
  useForwardedHeaders,
}: {
  remoteAddress: string
  encrypted: boolean
  headers: Headers
  trusted: TrustedProxies
  useForwardedHeaders: boolean
}): ClientInfo {
  const peer = plainAddress(remoteAddress)
  const host = header(headers, 'host') ?? ''
  if (!useForwardedHeaders || !trusted.has(peer))
    return { address: peer, secure: encrypted, host, proxied: false }
  const chain = (header(headers, 'x-forwarded-for') ?? '')
    .split(',')
    .map((a) => plainAddress(a.trim()))
    .filter((a) => isIP(a))
  let address = peer
  for (let i = chain.length - 1; i >= 0; i--) {
    address = chain[i] as string
    if (!trusted.has(address)) break
  }
  // the proxy nearest us speaks last: the rightmost value is the one it set
  const proto = (header(headers, 'x-forwarded-proto') ?? '').split(',').pop()?.trim().toLowerCase()
  const forwardedHost = header(headers, 'x-forwarded-host')?.split(',').pop()?.trim()
  return {
    address,
    secure: proto ? proto === 'https' : encrypted,
    host: forwardedHost || host,
    proxied: true,
  }
}

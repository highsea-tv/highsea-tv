// SPDX-License-Identifier: AGPL-3.0-only
// The servers a native app knows (connectivity.md, ADR 0055): what the desktop app does in Rust
// (apps/desktop/src-tauri/src/servers.rs), for the phone and the TV. Names and addresses are plain
// app data; each server's device token is kept apart, in the keychain. Pure: the apps keep the
// list where their platform keeps app data.
import type { PublicInfo } from '@highsea-tv/api-contract'
import type { Address, KnownServer } from '@highsea-tv/sdk'

export type Known = Omit<KnownServer, 'token'> & {
  /** When this app last reached it, in milliseconds since 1970. */
  lastSeen: number
}

/** An IPv4 address, `localhost` or a `.local` name: reached on the LAN, usually without TLS. */
export function looksLocal(hostAndPort: string) {
  const host = hostAndPort.startsWith('[') ? hostAndPort : (hostAndPort.split(':')[0] ?? '')
  return (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.startsWith('[') ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  )
}

/**
 * What someone typed, as an address: `harbor.example.net` is https, `192.168.1.20:3000` http.
 * Null when it can't be one.
 */
export function normalize(input: string): string | null {
  const t = input.trim().replace(/\/+$/, '')
  if (!t || /^https?:$/.test(t)) return null
  const scheme = /^https?:\/\//.test(t)
  const rest = t.replace(/^https?:\/\//, '')
  if (!rest || rest.startsWith(':') || /\s/.test(rest)) return null
  const url = scheme ? t : `${looksLocal(rest) ? 'http' : 'https'}://${rest}`
  try {
    if (!new URL(url).hostname) return null
  } catch {
    return null
  }
  return url
}

const kindOf = (url: string): Address['kind'] =>
  looksLocal(url.replace(/^https?:\/\//, '').split('/')[0] ?? '') ? 'local' : 'remote'

/** A server's addresses from its public info: every LAN address, its remote one, then the one used. */
export function addressesOf(
  info: Pick<PublicInfo, 'localAddresses' | 'publicUrl'>,
  reached: string,
) {
  const out: Address[] = []
  const push = (raw: string, kind: Address['kind']) => {
    const url = raw.replace(/\/+$/, '')
    if (!out.some((a) => a.url === url)) out.push({ url, kind })
  }
  for (const a of info.localAddresses) push(a, 'local')
  if (info.publicUrl) push(info.publicUrl, 'remote')
  push(reached, kindOf(reached))
  return out
}

/** The list with this server added or brought up to date, most recently reached first. */
export function remember(list: Known[], server: Known): Known[] {
  return [server, ...list.filter((k) => k.id !== server.id)]
}

export const forget = (list: Known[], id: string) => list.filter((k) => k.id !== id)

/** The keychain's key for a server's device token. */
export const tokenKey = (id: string) => `highsea.token.${id.replace(/[^A-Za-z0-9._-]/g, '_')}`

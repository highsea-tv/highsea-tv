// SPDX-License-Identifier: AGPL-3.0-only
// `connect: token` (HT-87): the owner pastes an access token, and highsea asks the provider's API
// for the WireGuard private key it unlocks and for a recommended server, then builds the tunnel
// from them and the entry's fixed facts. Everything provider-specific is in the entry's `token`
// block (`@highsea-tv/schemas/vpn`): the addresses, how the token is sent, and where the key, the
// server's address and its public key are in the answers. NordVPN's is the first such entry.
//
// How it differs from PIA (pia.ts): PIA signs in with a username and password for a short-lived
// token, then registers a key highsea makes with one region's server. Here the token is long-lived
// and the key is the account's own, fetched rather than registered; the server comes from a list
// of recommendations, asked again on every connect, so a server that goes away is replaced by the
// next reconnect. Like PIA's, these requests go out before the tunnel is up, since there's no
// tunnel without them; nothing else does.
//
// The token goes only in the Authorization header, never in an address, a log or an error.
import type { Fetch } from '@highsea-tv/core'
import { readAnswerPath, type TokenConnect } from '@highsea-tv/schemas/vpn'
import { tokenFailures } from './copy.ts'
import type { TunnelSpec } from './tunnel.ts'
import { isWireGuardKey } from './wireguard.ts'

export class TokenError extends Error {
  readonly kind: 'refused' | 'unreachable' | 'answer' | 'noCountry' | 'noServers'
  constructor(kind: TokenError['kind'], message: string) {
    super(message)
    this.name = 'TokenError'
    this.kind = kind
  }
}

export type TokenCountry = { id: string; name: string; code: string | null }

const TIMEOUT_MS = 20_000

function authorization(auth: TokenConnect['auth'], token: string): string {
  return auth.scheme === 'basic'
    ? `Basic ${Buffer.from(`${auth.username}:${token}`).toString('base64')}`
    : `Bearer ${token}`
}

const listAt = (answer: unknown, path: string | undefined): unknown[] | null => {
  const v = path ? readAnswerPath(answer, path) : answer
  return Array.isArray(v) ? v : null
}

const text = (v: unknown) =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''

/** The provider's API, through `fetch` (the server's outside fetch; a fake one in tests). */
export function createTokenApi(fetch: Fetch) {
  async function get(name: string, url: string, headers: Record<string, string> = {}) {
    let res: Response
    try {
      res = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'highsea', ...headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      // the cause can carry the address; the message stays plain
      throw new TokenError('unreachable', tokenFailures.unreachable(name))
    }
    return res
  }

  async function json(name: string, res: Response): Promise<unknown> {
    try {
      return await res.json()
    } catch {
      throw new TokenError('answer', tokenFailures.answer(name))
    }
  }

  return {
    /** The account's WireGuard private key; a refused token throws `refused`. */
    async key(name: string, api: TokenConnect, token: string): Promise<string> {
      const res = await get(name, api.key.url, { authorization: authorization(api.auth, token) })
      if (res.status === 401 || res.status === 403)
        throw new TokenError('refused', tokenFailures.refused(name))
      if (res.status !== 200) throw new TokenError('answer', tokenFailures.status(name, res.status))
      const key = text(readAnswerPath(await json(name, res), api.key.field))
      if (!isWireGuardKey(key)) throw new TokenError('answer', tokenFailures.noKey(name))
      return key
    },

    /** The countries the provider lists, or an empty list when its entry names none. */
    async countries(name: string, api: TokenConnect): Promise<TokenCountry[]> {
      const c = api.countries
      if (!c) return []
      const res = await get(name, c.url)
      if (res.status !== 200) throw new TokenError('answer', tokenFailures.status(name, res.status))
      const list = listAt(await json(name, res), c.list)
      if (!list) throw new TokenError('answer', tokenFailures.answer(name))
      const out: TokenCountry[] = []
      for (const item of list) {
        const id = text(readAnswerPath(item, c.id))
        const label = text(readAnswerPath(item, c.name))
        if (id && label)
          out.push({
            id,
            name: label,
            code: c.code ? text(readAnswerPath(item, c.code)) || null : null,
          })
      }
      return out
    },

    /** The first recommended server with an address and a WireGuard key, in `countryId` if given. */
    async server(
      name: string,
      api: TokenConnect,
      countryId: string | null,
    ): Promise<{ host: string; publicKey: string } | null> {
      const url = new URL(api.servers.url)
      if (countryId && api.servers.country) url.searchParams.set(api.servers.country, countryId)
      const res = await get(name, url.toString())
      if (res.status !== 200) throw new TokenError('answer', tokenFailures.status(name, res.status))
      const list = listAt(await json(name, res), api.servers.list)
      if (!list) throw new TokenError('answer', tokenFailures.answer(name))
      for (const item of list) {
        const host = text(readAnswerPath(item, api.servers.host))
        const publicKey = text(readAnswerPath(item, api.servers.publicKey))
        if (host && /^[A-Za-z0-9.-]{1,253}$/.test(host) && isWireGuardKey(publicKey))
          return { host, publicKey }
      }
      return null
    },
  }
}

export type TokenApi = ReturnType<typeof createTokenApi>

/** A country by the name the owner picked, or its code; any case. */
export function findCountry(list: readonly TokenCountry[], wanted: string) {
  const w = wanted.trim().toLowerCase()
  return (
    list.find((c) => c.name.toLowerCase() === w) ?? list.find((c) => c.code?.toLowerCase() === w)
  )
}

/**
 * The tunnel for a token: the key it unlocks, a recommended server (in the owner's country, when
 * they picked one), and the entry's address, port and DNS servers.
 */
export async function connectWithToken(
  api: TokenApi,
  provider: { name: string; token: TokenConnect },
  token: string,
  country: string,
): Promise<{ spec: TunnelSpec; dns: string[]; server: string }> {
  const t = provider.token
  const name = provider.name
  const privateKey = await api.key(name, t, token)
  let countryId: string | null = null
  if (country.trim() && t.servers.country) {
    const found = findCountry(await api.countries(name, t), country)
    if (!found) throw new TokenError('noCountry', tokenFailures.noCountry(name, country.trim()))
    countryId = found.id
  }
  const server = await api.server(name, t, countryId)
  if (!server)
    throw new TokenError(
      'noServers',
      countryId ? tokenFailures.noServersIn(name, country.trim()) : tokenFailures.noServers(name),
    )
  return {
    spec: {
      privateKey,
      addresses: [t.tunnel.address],
      peers: [
        {
          publicKey: server.publicKey,
          presharedKey: null,
          endpoint: { host: server.host, port: t.tunnel.port },
          allowedIps: ['0.0.0.0/0'],
          persistentKeepalive: 25,
        },
      ],
      mtu: null,
    },
    dns: [...t.tunnel.dns],
    server: server.host,
  }
}

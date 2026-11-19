// SPDX-License-Identifier: AGPL-3.0-only
// A fake of NordVPN's API as a `fetch`, answering the three calls `connect: token` makes in the
// shapes NordVPN's own clients read (facts from libtelio's tcli nord.rs and nordvpn-linux's
// core/models.go; no code from either): GET /v1/users/services/credentials with HTTP Basic
// `token:<token>` gives `nordlynx_private_key`, 401 for a token it doesn't know; GET
// /v1/servers/recommendations gives a list of servers with `hostname`, `station` and
// `technologies[]` (`id` 35 is WireGuard, its key in `metadata[]` as `public_key`), narrowed by
// `filters[country_id]`; GET /v1/servers/countries gives `id`, `name` and `code`. Nothing leaves
// the machine: it's a function, not a server.
import type { Fetch } from '@highsea-tv/core'

export type FakeNordServer = {
  hostname: string
  station: string
  publicKey: string
  country: number
}

export type FakeNordState = {
  token: string
  privateKey: string
  countries: { id: number; name: string; code: string }[]
  servers: FakeNordServer[]
  /** How many recommendations to skip, so a later ask lands on another server. */
  offset: number
  reachable: boolean
  requests: { url: string; authorization: string | null }[]
}

const server = (s: FakeNordServer) => ({
  id: 1,
  name: s.hostname.split('.')[0],
  hostname: s.hostname,
  station: s.station,
  load: 12,
  status: 'online',
  technologies: [
    {
      id: 3,
      name: 'OpenVPN UDP',
      identifier: 'openvpn_udp',
      metadata: [],
      pivot: { status: 'online' },
    },
    {
      id: 35,
      name: 'Wireguard',
      identifier: 'wireguard_udp',
      metadata: [{ name: 'public_key', value: s.publicKey }],
      pivot: { status: 'online' },
    },
  ],
})

export function createFakeNordVpn(initial: Partial<FakeNordState> = {}) {
  const state: FakeNordState = {
    token: 'e9f2ab7c0d1e4f5a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c',
    privateKey: Buffer.alloc(32, 9).toString('base64'),
    countries: [
      { id: 153, name: 'Netherlands', code: 'NL' },
      { id: 208, name: 'Sweden', code: 'SE' },
      { id: 228, name: 'United States', code: 'US' },
    ],
    servers: [
      {
        hostname: 'nl930.nordvpn.com',
        station: '194.127.167.108',
        publicKey: Buffer.alloc(32, 3).toString('base64'),
        country: 153,
      },
      {
        hostname: 'nl931.nordvpn.com',
        station: '194.127.167.109',
        publicKey: Buffer.alloc(32, 4).toString('base64'),
        country: 153,
      },
      {
        hostname: 'us8020.nordvpn.com',
        station: '185.203.218.10',
        publicKey: Buffer.alloc(32, 5).toString('base64'),
        country: 228,
      },
    ],
    offset: 0,
    reachable: true,
    requests: [],
    ...initial,
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  const fetch: Fetch = async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    const authorization = new Headers(init?.headers).get('authorization')
    state.requests.push({ url: url.toString(), authorization })
    if (!state.reachable) throw new TypeError('fetch failed')
    if (url.host !== 'api.nordvpn.com') return new Response('not found', { status: 404 })
    if (url.pathname === '/v1/users/services/credentials') {
      const expected = `Basic ${Buffer.from(`token:${state.token}`).toString('base64')}`
      if (authorization !== expected) return json({ errors: { message: 'Unauthorized' } }, 401)
      return json({
        id: 1,
        created_at: '2026-01-01 00:00:00',
        updated_at: '2026-01-01 00:00:00',
        username: 'service-user',
        password: 'service-password',
        nordlynx_private_key: state.privateKey,
      })
    }
    if (url.pathname === '/v1/servers/countries')
      return json(state.countries.map((c) => ({ ...c, cities: [] })))
    if (url.pathname === '/v1/servers/recommendations') {
      if (url.searchParams.get('filters[servers_technologies][identifier]') !== 'wireguard_udp')
        return json([])
      const country = url.searchParams.get('filters[country_id]')
      const list = state.servers.filter((s) => !country || String(s.country) === country)
      const limit = Number(url.searchParams.get('limit') ?? 10)
      const from = list.length ? state.offset % list.length : 0
      return json([...list.slice(from), ...list.slice(0, from)].slice(0, limit).map(server))
    }
    return new Response('not found', { status: 404 })
  }
  return { state, fetch }
}

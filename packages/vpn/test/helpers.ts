// SPDX-License-Identifier: AGPL-3.0-only
// Test helpers: a VPN service on its own in-memory database, with a fake clock and timers, a
// recorded event bus and binding, and an echo service that answers per address. Nothing leaves
// 127.0.0.1.
import type os from 'node:os'
import { join } from 'node:path'
import { createVpnProviderCatalog, SEED_DIR } from '@highsea/catalog'
import { createFakeClock, createSealer, type Fetch, silentLogger } from '@highsea/core'
import { migrate, openDatabase } from '@highsea/db'
import {
  createVpn,
  type Runner,
  type VpnBinding,
  type VpnDeps,
  type VpnProviderDefinition,
} from '../src/index.ts'
import { createFakeTimers } from './fake/index.ts'

export const KEY_A = Buffer.alloc(32, 1).toString('base64')
export const KEY_B = Buffer.alloc(32, 2).toString('base64')

export const sealer = createSealer(Buffer.alloc(32, 7))

export const wgConfig = (extra = '') => `[Interface]
PrivateKey = ${KEY_A}
Address = 10.2.0.2/32
DNS = 10.2.0.1
${extra}
[Peer]
PublicKey = ${KEY_B}
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = 185.159.157.4:51820
`

let seeded: VpnProviderDefinition[] | null = null

/** The providers in the catalog's signed seed, as the runtime reads them. */
export function seedProviders(): VpnProviderDefinition[] {
  if (!seeded) {
    const reader = createVpnProviderCatalog({
      logger: silentLogger,
      clock: createFakeClock(),
      fetch: async () => new Response(null, { status: 404 }),
      configDir: join(SEED_DIR, 'no-cache-here'),
      trustedKeys: [],
      seedDir: join(SEED_DIR, 'vpn-providers'),
      mainUrl: null,
      settings: () => ({ channel: 'stable', autoUpdate: true }),
    })
    reader.start()
    seeded = reader.providers()
  }
  return seeded
}

/** A runner that refuses everything, so a test that reaches it by mistake runs nothing. */
export const refusingRunner: Runner = async (cmd) => ({
  code: 1,
  stdout: '',
  stderr: `not in tests: ${cmd.program}`,
})

export function testDb() {
  const database = openDatabase(':memory:')
  migrate(database.raw)
  return database.db
}

/** An echo service answering JSON, by the address a request leaves from (null: unbound). */
export function echoes(answers: Map<string | null, string | Error>) {
  const answer =
    (from: string | null): Fetch =>
    async () => {
      const a = answers.get(from) ?? new Error('no route')
      if (a instanceof Error) throw a
      return new Response(JSON.stringify({ ip: a, country: 'Netherlands' }))
    }
  return { fetch: answer(null), boundFetch: (address: string) => answer(address) }
}

export const iface = (address: string, family: 'IPv4' | 'IPv6' = 'IPv4'): os.NetworkInterfaceInfo =>
  ({
    address,
    netmask: family === 'IPv4' ? '255.255.255.255' : 'ffff:ffff:ffff:ffff::',
    family,
    mac: '00:00:00:00:00:00',
    internal: false,
    cidr: null,
    ...(family === 'IPv6' ? { scopeid: 0 } : {}),
  }) as os.NetworkInterfaceInfo

export function testVpn(overrides: Partial<VpnDeps> = {}) {
  const clock = createFakeClock()
  const timers = createFakeTimers(clock)
  const events: string[] = []
  const bindings: (VpnBinding | null)[] = []
  const db = overrides.db ?? testDb()
  const vpn = createVpn({
    db,
    sealer,
    logger: silentLogger,
    clock,
    timers,
    events: {
      emit: (e) => {
        events.push(e.topic)
        return { id: events.length, topic: e.topic, at: clock.now() }
      },
    },
    fetch: globalThis.fetch,
    onBinding: (b) => {
      bindings.push(b)
    },
    listeningPort: () => 51413,
    peersIn: () => 3,
    providers: seedProviders,
    runner: refusingRunner,
    ...overrides,
  })
  return { vpn, clock, timers, events, bindings, db, last: () => bindings.at(-1) }
}

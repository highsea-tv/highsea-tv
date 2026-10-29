// SPDX-License-Identifier: AGPL-3.0-only
// Remote access by a forwarded port (install-simplicity B, 4.3c): the router is asked for the
// HTTPS port only once the owner chooses it, let go when they don't, and Health hears how it went.
// The mapper is a fake, so nothing opens a socket.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEventBus, createFakeClock, type ServerEvent, silentLogger } from '@highsea-tv/core'
import { migrate, openDatabase, writeSetting } from '@highsea-tv/db'
import { defaultNetworkSettings, NETWORK_KEY, type NetworkSettings } from '@highsea-tv/network'
import { createNetworkService, loadConfig, type PortMapper } from '../src/index.ts'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function setup(answers: boolean) {
  const database = openDatabase(':memory:')
  migrate(database.raw)
  const clock = createFakeClock()
  const events = createEventBus({ now: clock.now })
  const seen: ServerEvent[] = []
  events.subscribe((e) => seen.push(e))
  const dir = mkdtempSync(join(tmpdir(), 'highsea-network-'))
  dirs.push(dir)
  const calls: string[] = []
  const portMapper = (): PortMapper => {
    let mapped: number | null = null
    return {
      async start(port) {
        calls.push(`start ${port}`)
        if (answers) mapped = port
      },
      async stop() {
        calls.push('stop')
        mapped = null
      },
      status: () =>
        mapped === null ? null : { via: 'upnp', externalPort: mapped, externalAddress: null },
    }
  }
  const network = createNetworkService({
    db: database.db,
    config: loadConfig({ HIGHSEA_CONFIG_DIR: dir, HIGHSEA_DATA_DIR: dir }),
    clock,
    events,
    logger: silentLogger,
    answer: () => ({}),
    mdnsInfo: () => ({ name: 'Harbor', id: 'srv_1', version: '0.2.0' }),
    discovery: true,
    portMapper,
  })
  const set = (patch: Partial<NetworkSettings>) =>
    writeSetting(database.db, NETWORK_KEY, { ...defaultNetworkSettings, ...patch }, clock.now())
  return { network, calls, seen, set }
}

describe('the router’s forwarding', () => {
  test('nothing is asked until remote access is by a forwarded port with highsea’s HTTPS', async () => {
    const { network, calls } = setup(true)
    await network.applyRouter()
    expect(calls).toEqual([])
    expect(network.router()).toBeNull()
  })

  test('the port is asked for once, Health hears it, and it’s let go when the choice changes', async () => {
    const { network, calls, seen, set } = setup(true)
    set({ remoteAccess: 'port-forward', tls: 'built-in', httpsPort: 8484 })
    await network.applyRouter()
    expect(network.router()).toEqual({ port: 8484, state: 'open', via: 'upnp' })
    expect(seen.some((e) => e.topic === 'health.updated')).toBe(true)
    // the same port again asks nothing more
    await network.applyRouter()
    expect(calls).toEqual(['start 8484'])

    set({ remoteAccess: 'port-forward', tls: 'built-in', httpsPort: 8485 })
    await network.applyRouter()
    expect(calls).toEqual(['start 8484', 'stop', 'start 8485'])

    set({ remoteAccess: 'local-only' })
    await network.applyRouter()
    expect(network.router()).toBeNull()
    expect(calls.at(-1)).toBe('stop')
  })

  test('a router that doesn’t answer is reported as failed, and shutdown lets go', async () => {
    const { network, calls, set } = setup(false)
    set({ remoteAccess: 'port-forward', tls: 'built-in', httpsPort: 8484 })
    await network.applyRouter()
    expect(network.router()).toEqual({ port: 8484, state: 'failed', via: null })
    await network.close()
    expect(calls.at(-1)).toBe('stop')
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
// The VPN container mode against the fake gluetun: running, stopped, a wrong key, unreachable.
import { afterEach, describe, expect, test } from 'bun:test'
import { startFakeGluetun } from './fake/index.ts'
import { testVpn } from './helpers.ts'

let close: (() => Promise<void>) | null = null
afterEach(async () => {
  await close?.()
  close = null
})

async function setup(state: Parameters<typeof startFakeGluetun>[0] = {}) {
  const gluetun = await startFakeGluetun(state)
  close = gluetun.close
  const t = testVpn()
  await t.vpn.save({
    mode: 'container',
    containerUrl: gluetun.url,
    containerKey: gluetun.state.apiKey,
  })
  return { ...t, gluetun }
}

describe('A VPN container', () => {
  test('running: any address, and the checks read gluetun', async () => {
    const { vpn, timers, events, last, gluetun } = await setup()
    vpn.start()
    expect(vpn.status().state).toBe('connecting')
    expect(last()).toBeNull()
    await vpn.settled()
    expect(last()).toEqual({ address: null, dns: [] })
    const s = vpn.status()
    expect(s).toMatchObject({
      mode: 'container',
      provider: 'gluetun',
      state: 'connected',
      exitIp: '198.51.100.23',
      country: 'Switzerland',
      forwardedPort: 41822,
      checkedAt: '2026-10-17T20:15:00.000Z',
    })
    expect(s.checks.map((c) => [c.id, c.result, c.title, c.detail])).toEqual([
      ['tunnel', 'pass', 'gluetun reports the tunnel running', undefined],
      [
        'exit',
        'pass',
        'Torrents leave from 198.51.100.23 (Switzerland)',
        'From inside the container, highsea can’t see your own address to compare.',
      ],
      [
        'names',
        'pass',
        'Names are looked up through the tunnel',
        'Like everything else in the container.',
      ],
      [
        'killSwitch',
        'pass',
        'Nothing can leave outside the tunnel',
        'The container has no other route.',
      ],
      ['portForwarding', 'pass', 'Port 41822 is forwarded', '3 peers have connected in.'],
      ['ipv6', 'info', 'IPv4 only', 'The tunnel has no IPv6 address, so torrents use IPv4 only.'],
    ])
    expect(events).toContain('vpn.updated')
    expect(gluetun.requests.every((r) => r.method === 'GET')).toBe(true)
    timers.advance(5_000)
    await vpn.settled()
    expect(vpn.status().state).toBe('connected')
    vpn.stop()
  })

  test('no country in gluetun’s answer leaves it out of the line', async () => {
    const { vpn } = await setup({ country: null, port: 0 })
    vpn.start()
    await vpn.settled()
    const s = vpn.status()
    expect(s.country).toBeNull()
    expect(s.checks[1]?.title).toBe('Torrents leave from 198.51.100.23')
    expect(s.checks[4]).toMatchObject({ result: 'warn', title: 'gluetun doesn’t forward ports' })
    vpn.stop()
  })

  test('stopped: torrents stop, and highsea restarts the tunnel', async () => {
    const { vpn, timers, last, gluetun } = await setup()
    vpn.start()
    await vpn.settled()
    gluetun.state.status = 'stopped'
    timers.advance(5_000)
    await vpn.settled()
    expect(last()).toBeNull()
    const s = vpn.status()
    expect(s.state).toBe('down')
    expect(s.checks.slice(0, 2).map((c) => [c.result, c.title])).toEqual([
      ['fail', 'gluetun reports the tunnel stopped'],
      ['pass', 'Torrents are stopped'],
    ])
    timers.advance(5_000)
    await vpn.settled()
    expect(gluetun.requests.filter((r) => r.method === 'PUT').map((r) => r.body)).toEqual([
      '{"status":"stopped"}',
      '{"status":"running"}',
    ])
    expect(vpn.status().state).toBe('connected')
    expect(last()).toEqual({ address: null, dns: [] })
    vpn.stop()
  })

  test('a wrong key fails with the spec’s copy, and nothing leaves', async () => {
    const { vpn, gluetun, last } = await setup()
    gluetun.state.apiKey = 'rotated'
    vpn.start()
    await vpn.settled()
    expect(vpn.status()).toMatchObject({
      state: 'failed',
      message: `gluetun’s control server at ${gluetun.url} refused that API key.`,
    })
    expect(last()).toBeNull()
    vpn.stop()
  })

  test('unreachable: failed before it connected, down after', async () => {
    const { vpn, gluetun, last } = await setup()
    await gluetun.close()
    vpn.start()
    await vpn.settled()
    expect(vpn.status()).toMatchObject({
      state: 'failed',
      message: `Couldn’t reach the VPN container’s control server at ${gluetun.url}.`,
    })
    expect(last()).toBeNull()
    vpn.stop()

    const again = await setup()
    again.vpn.start()
    await again.vpn.settled()
    expect(again.last()).toEqual({ address: null, dns: [] })
    await again.gluetun.close()
    again.timers.advance(5_000)
    await again.vpn.settled()
    expect(again.vpn.status().state).toBe('down')
    expect(again.vpn.status().checks[0]?.title).toBe(
      `Couldn’t reach gluetun at ${again.gluetun.url}`,
    )
    expect(again.last()).toBeNull()
    again.vpn.stop()
  })

  test('reconnect restarts the tunnel on request', async () => {
    const { vpn, gluetun } = await setup()
    vpn.start()
    await vpn.settled()
    const s = await vpn.reconnect()
    expect(s.state).toBe('connected')
    expect(gluetun.requests.filter((r) => r.method === 'PUT')).toHaveLength(2)
    vpn.stop()
  })
})

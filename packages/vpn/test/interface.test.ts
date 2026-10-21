// SPDX-License-Identifier: AGPL-3.0-only
// The interface mode with an injected interface list: it appears, it's removed, it's back.
import { describe, expect, test } from 'bun:test'
import type os from 'node:os'
import { echoes, iface, testVpn } from './helpers.ts'

function setup() {
  const list: NodeJS.Dict<os.NetworkInterfaceInfo[]> = {
    lo0: [{ ...iface('127.0.0.1'), internal: true }],
    en0: [iface('192.168.1.20')],
  }
  const answers = new Map<string | null, string | Error>([
    [null, '81.2.69.160'],
    ['10.2.0.15', '203.0.113.40'],
  ])
  const t = testVpn({ interfaces: () => list, ...echoes(answers) })
  return { ...t, list, answers }
}

describe('An interface on this machine', () => {
  test('appears, is removed, and comes back', async () => {
    const { vpn, list, timers, last, bindings } = setup()
    await vpn.save({ mode: 'interface', interface: 'wg0' })
    vpn.start()
    expect(last()).toBeNull()
    expect(vpn.status().state).toBe('down')
    expect(vpn.status().checks[0]?.title).toBe('wg0 has no address')
    // System's health says so
    expect(vpn.issues()).toMatchObject([
      {
        id: 'vpn-down',
        level: 'error',
        message: 'The VPN is down. Torrents are stopped until it’s back.',
      },
    ])

    list.wg0 = [iface('10.2.0.15'), iface('fe80::1', 'IPv6')]
    timers.advance(2_000)
    await vpn.settled()
    expect(last()).toEqual({ address: '10.2.0.15', dns: [] })
    const s = vpn.status()
    expect(s).toMatchObject({ state: 'connected', provider: 'wg0', exitIp: '203.0.113.40' })
    expect(vpn.issues()).toEqual([])
    expect(s.checks.map((c) => [c.id, c.result, c.title, c.detail])).toEqual([
      ['tunnel', 'pass', 'wg0 is up', 'Its address is 10.2.0.15.'],
      [
        'exit',
        'pass',
        'Torrents leave from 203.0.113.40 (Netherlands)',
        'Not from your own address.',
      ],
      ['names', 'pass', 'Tracker names are looked up through the tunnel', undefined],
      [
        'killSwitch',
        'warn',
        'Bound to wg0',
        'Your system’s routing decides the path; a VPN container or highsea connects guarantees it.',
      ],
      [
        'portForwarding',
        'info',
        'Torrents listen on port 51413',
        'Forward it through your tunnel yourself, if your provider allows it.',
      ],
      ['ipv6', 'info', 'IPv4 only', 'The tunnel has no IPv6 address, so torrents use IPv4 only.'],
    ])

    delete list.wg0
    timers.advance(2_000)
    expect(last()).toBeNull()
    expect(vpn.status().state).toBe('down')

    list.wg0 = [iface('10.2.0.15'), iface('fd00::15', 'IPv6')]
    timers.advance(2_000)
    expect(last()).toBeNull()
    await vpn.settled()
    expect(last()).toEqual({ address: '10.2.0.15', dns: [] })
    expect(vpn.status().checks[5]).toMatchObject({
      result: 'pass',
      title: 'IPv6 goes through the tunnel too',
    })
    expect(bindings.filter((b) => b === null).length).toBeGreaterThanOrEqual(2)
    vpn.stop()
  })

  test('a new address is checked before torrents use it', async () => {
    const { vpn, list, timers, last, answers } = setup()
    list.wg0 = [iface('10.2.0.15')]
    await vpn.save({ mode: 'interface', interface: 'wg0' })
    vpn.start()
    await vpn.settled()
    answers.set('10.2.0.16', '203.0.113.41')
    list.wg0 = [iface('10.2.0.16')]
    timers.advance(2_000)
    expect(last()).toBeNull()
    await vpn.settled()
    expect(last()).toEqual({ address: '10.2.0.16', dns: [] })
    vpn.stop()
  })

  test('lists the interfaces the owner can pick, without loopback', () => {
    const { vpn, list } = setup()
    list.wg0 = [iface('10.2.0.15'), iface('fd00::15', 'IPv6')]
    expect(vpn.interfaces()).toEqual([
      { name: 'en0', ipv4: '192.168.1.20', ipv6: null },
      { name: 'wg0', ipv4: '10.2.0.15', ipv6: 'fd00::15' },
    ])
  })
})

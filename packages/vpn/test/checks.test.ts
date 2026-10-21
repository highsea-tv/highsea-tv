// SPDX-License-Identifier: AGPL-3.0-only
// The checks' state machine on a fake clock: when they run, that failing checks only warn, and
// the reconnect backoff.
import { afterEach, describe, expect, test } from 'bun:test'
import type os from 'node:os'
import { VPN_TIMINGS } from '../src/index.ts'
import { startFakeGluetun } from './fake/index.ts'
import { echoes, iface, testVpn, wgConfig } from './helpers.ts'

let close: (() => Promise<void>) | null = null
afterEach(async () => {
  await close?.()
  close = null
})

function interfaceVpn(answers: Map<string | null, string | Error>) {
  const list: NodeJS.Dict<os.NetworkInterfaceInfo[]> = { wg0: [iface('10.2.0.15')] }
  let asked = 0
  const e = echoes(answers)
  const t = testVpn({
    interfaces: () => list,
    fetch: (...args) => {
      asked++
      return e.fetch(...args)
    },
    boundFetch: e.boundFetch,
  })
  return { ...t, list, asked: () => asked }
}

describe('The checks', () => {
  test('run on connect, every 5 minutes, and on Check now', async () => {
    const answers = new Map<string | null, string | Error>([
      [null, '81.2.69.160'],
      ['10.2.0.15', '203.0.113.40'],
    ])
    const { vpn, timers, asked, clock } = interfaceVpn(answers)
    await vpn.save({ mode: 'interface' })
    vpn.start()
    await vpn.settled()
    expect(asked()).toBe(1)
    const first = vpn.status().checkedAt
    timers.advance(VPN_TIMINGS.checkMs - 2_000)
    await vpn.settled()
    expect(asked()).toBe(1)
    timers.advance(2_000)
    await vpn.settled()
    expect(asked()).toBe(2)
    expect(vpn.status().checkedAt).not.toBe(first)
    clock.advance(1_000)
    await vpn.check()
    expect(asked()).toBe(3)
    vpn.stop()
  })

  test('matching exit answers in the interface mode only warn, and the binding stays', async () => {
    const answers = new Map<string | null, string | Error>([
      [null, '81.2.69.160'],
      ['10.2.0.15', '81.2.69.160'],
    ])
    const { vpn, timers, last } = interfaceVpn(answers)
    await vpn.save({ mode: 'interface' })
    vpn.start()
    await vpn.settled()
    expect(last()).toEqual({ address: '10.2.0.15', dns: [] })
    const s = vpn.status()
    expect(s).toMatchObject({ state: 'connected', message: null, exitIp: '81.2.69.160' })
    expect(s.checks[1]).toMatchObject({
      result: 'warn',
      title: 'Both answers came from the same address',
      detail:
        'So highsea can’t compare them. That’s expected if your whole machine uses the VPN. Torrents still leave only through wg0.',
    })
    timers.advance(VPN_TIMINGS.checkMs)
    await vpn.settled()
    expect(last()).toEqual({ address: '10.2.0.15', dns: [] })

    answers.set('10.2.0.15', '203.0.113.40')
    await vpn.check()
    expect(vpn.status().checks[1]).toMatchObject({ result: 'pass' })
    vpn.stop()
  })

  test('an echo service that doesn’t answer only warns', async () => {
    const answers = new Map<string | null, string | Error>([['10.2.0.15', '203.0.113.40']])
    const { vpn, last } = interfaceVpn(answers)
    await vpn.save({ mode: 'interface' })
    vpn.start()
    await vpn.settled()
    expect(last()).toEqual({ address: '10.2.0.15', dns: [] })
    expect(vpn.status().checks[1]).toMatchObject({
      result: 'warn',
      title: 'Couldn’t check your own address to compare',
    })

    answers.delete('10.2.0.15')
    await vpn.check()
    expect(last()).toEqual({ address: '10.2.0.15', dns: [] })
    expect(vpn.status()).toMatchObject({ state: 'connected', exitIp: null })
    expect(vpn.status().checks[1]).toMatchObject({
      result: 'warn',
      title: 'Couldn’t check the exit address',
    })
    vpn.stop()
  })

  test('reconnects wait longer after each try, up to 5 minutes', async () => {
    const gluetun = await startFakeGluetun()
    close = gluetun.close
    const { vpn, timers } = testVpn()
    await vpn.save({
      mode: 'container',
      containerUrl: gluetun.url,
      containerKey: gluetun.state.apiKey,
    })
    vpn.start()
    await vpn.settled()
    // gluetun takes the restart, but the tunnel never comes up
    const original = gluetun.state
    Object.defineProperty(original, 'status', { get: () => 'stopped', set: () => {} })
    const puts = () => gluetun.requests.filter((r) => r.body === '{"status":"running"}').length
    timers.advance(VPN_TIMINGS.containerMs)
    await vpn.settled()
    expect(vpn.status().state).toBe('down')

    const waits = [5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000]
    for (const [i, wait] of waits.entries()) {
      timers.advance(wait - 1)
      await vpn.settled()
      expect(puts()).toBe(i)
      timers.advance(1)
      await vpn.settled()
      expect(puts()).toBe(i + 1)
    }
    vpn.stop()
    expect(timers.pending()).toBe(0)
  })

  test('off hands over an unbound binding, and highsea connects waits for the next update', async () => {
    const { vpn, last } = testVpn()
    vpn.start()
    expect(last()).toEqual({ address: null, dns: [] })
    expect(vpn.status()).toMatchObject({ state: 'off', provider: null, checks: [] })
    await vpn.save({
      mode: 'builtin',
      provider: 'airvpn',
      config: wgConfig(),
    })
    expect(last()).toBeNull()
    expect(vpn.status()).toMatchObject({
      state: 'failed',
      provider: 'AirVPN',
      message:
        'highsea connects arrives in the next update. Use a VPN container or an interface on this machine for now.',
    })
    vpn.stop()
  })
})

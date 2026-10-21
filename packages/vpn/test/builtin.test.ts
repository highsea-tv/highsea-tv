// SPDX-License-Identifier: AGPL-3.0-only
// highsea connects' state machine on a fake clock, with a fake `ip` and `wg`, a fake PIA and a
// fake NAT-PMP: connecting until the first handshake, the binding only once the checks pass, the
// checks that stop torrents, the handshake lost and the reconnect, port forwarding and its
// renewals, and the indexers' fetch. Nothing runs and nothing leaves the machine.
import { describe, expect, test } from 'bun:test'
import { AppError, type Fetch } from '@highsea/core'
import {
  CommandFailed,
  createPia,
  type Mapping,
  type NatPmpOptions,
  VPN_TIMINGS,
} from '../src/index.ts'
import { createFakePia, createFakeWireGuard } from './fake/index.ts'
import { echoes, KEY_A, KEY_B, testVpn, wgConfig } from './helpers.ts'

const OWN = '81.2.69.160'
const EXIT = '185.159.157.4'

function builtin(
  options: {
    answers?: [string | null, string | Error][]
    natPmp?: (o: NatPmpOptions, lifetime: number, current: number | null) => Promise<Mapping>
    pia?: ReturnType<typeof createFakePia>
  } = {},
) {
  const wg = createFakeWireGuard()
  const answers = new Map<string | null, string | Error>(
    options.answers ?? [
      [null, OWN],
      ['10.2.0.2', EXIT],
      ['10.13.128.7', EXIT],
    ],
  )
  const e = echoes(answers)
  const boundCalls: { address: string; dns: readonly string[] | undefined }[] = []
  const forwarded: (number | null)[] = []
  const nat: { options: NatPmpOptions; lifetime: number; current: number | null }[] = []
  const t = testVpn({
    runner: wg.runner,
    fetch: e.fetch,
    boundFetch: (address, o) => {
      boundCalls.push({ address, dns: o?.dns })
      return e.boundFetch(address)
    },
    natPmp:
      options.natPmp ??
      (async (o, lifetime, current) => {
        nat.push({ options: o, lifetime, current })
        return { externalPort: 53186, lifetime, epoch: 1 }
      }),
    ...(options.pia ? { pia: createPia(options.pia.transport) } : {}),
    onForwardedPort: (p) => {
      forwarded.push(p)
    },
  })
  /** Moves time on in 5-second steps, letting each step's work finish. */
  async function step(ms: number, handshake = true) {
    for (let done = 0; done < ms; done += 5_000) {
      if (handshake && wg.kernel.link) wg.kernel.handshake = Math.floor(t.clock.now() / 1000)
      t.timers.advance(Math.min(5_000, ms - done))
      await t.vpn.settled()
    }
  }
  const rows = () => t.vpn.status().checks.map((c) => [c.id, c.result, c.title, c.detail])
  return { ...t, wg, answers, boundCalls, forwarded, nat, step, rows }
}

describe('highsea connects', () => {
  test('connects, waits for a handshake, checks, then hands torrents the tunnel’s address', async () => {
    const b = builtin()
    await b.vpn.save({ mode: 'builtin', provider: 'proton', config: wgConfig() })
    b.vpn.start()
    await b.vpn.settled()
    expect(b.wg.kernel).toMatchObject({ link: true, rule: true, unreachable: true })
    // no handshake yet: connecting, and nothing may leave
    expect(b.vpn.status().state).toBe('connecting')
    expect(b.last()).toBeNull()

    await b.step(5_000)
    expect(b.last()).toEqual({ address: '10.2.0.2', dns: ['10.2.0.1'] })
    expect(b.boundCalls[0]).toEqual({ address: '10.2.0.2', dns: ['10.2.0.1'] })
    const s = b.vpn.status()
    expect(s).toMatchObject({
      state: 'connected',
      provider: 'Proton VPN',
      exitIp: EXIT,
      forwardedPort: 53186,
    })
    expect(b.rows()).toEqual([
      ['tunnel', 'pass', 'Connected to Proton VPN', 'Last handshake 5 seconds ago.'],
      ['exit', 'pass', `Torrents leave from ${EXIT} (Netherlands)`, 'Not from your own address.'],
      ['names', 'pass', 'Tracker names are looked up through the tunnel', undefined],
      ['killSwitch', 'pass', 'If the tunnel drops, torrents stop', 'Nothing can leave outside it.'],
      ['portForwarding', 'pass', 'Port 53186 is forwarded', '3 peers have connected in.'],
      [
        'ipv6',
        'info',
        'IPv4 only',
        'highsea connects carries IPv4 for now, so torrents use IPv4 only.',
      ],
    ])
    expect(b.vpn.issues()).toEqual([])

    // NAT-PMP from the tunnel's address to Proton's gateway, renewed every 45 seconds
    expect(b.nat[0]).toEqual({
      options: { gateway: '10.2.0.1', localAddress: '10.2.0.2' },
      lifetime: 60,
      current: null,
    })
    expect(b.forwarded).toEqual([53186])
    await b.step(45_000)
    expect(b.nat.length).toBe(2)
    expect(b.nat[1]?.current).toBe(53186)
    expect(b.forwarded).toEqual([53186])

    await b.vpn.stop()
    expect(b.wg.kernel.link).toBe(false)
    expect(b.timers.pending()).toBe(0)
  })

  test('no handshake for 3 minutes is down: torrents stop, the tunnel goes, and it reconnects', async () => {
    const b = builtin()
    await b.vpn.save({ mode: 'builtin', provider: 'airvpn', config: wgConfig() })
    b.vpn.start()
    await b.vpn.settled()
    await b.step(5_000)
    expect(b.vpn.status().state).toBe('connected')

    // the last handshake was 5 seconds before connecting
    await b.step(VPN_TIMINGS.handshakeTimeoutMs - 5_000, false)
    expect(b.last()).toBeNull()
    expect(b.wg.kernel.link).toBe(false)
    const s = b.vpn.status()
    expect(s.state).toBe('down')
    expect(s.checks[0]).toMatchObject({
      result: 'fail',
      title: 'No handshake for 3 minutes',
      detail: 'Reconnecting. Torrents are stopped until it’s back.',
    })
    expect(b.vpn.issues()[0]?.id).toBe('vpn-down')

    // the backoff's first wait, then up again
    await b.step(VPN_TIMINGS.backoffMs)
    expect(b.wg.kernel.link).toBe(true)
    await b.step(5_000)
    expect(b.vpn.status().state).toBe('connected')
    expect(b.last()).toEqual({ address: '10.2.0.2', dns: ['10.2.0.1'] })
    await b.vpn.stop()
  })

  test('an exit address that’s your own is a leak, and torrents stop', async () => {
    const b = builtin({
      answers: [
        [null, OWN],
        ['10.2.0.2', OWN],
      ],
    })
    await b.vpn.save({ mode: 'builtin', provider: 'proton', config: wgConfig() })
    b.vpn.start()
    await b.vpn.settled()
    await b.step(5_000)
    expect(b.vpn.status().state).toBe('connected')
    expect(b.last()).toBeNull()
    expect(b.rows()[1]).toEqual([
      'exit',
      'fail',
      'The exit address is your own',
      'Torrents are stopped.',
    ])
    expect(b.vpn.issues()).toMatchObject([
      {
        id: 'vpn-exit',
        level: 'error',
        message: 'VPN: The exit address is your own. Open Settings › VPN to see why.',
      },
    ])
    // fixed: the next check hands the binding back
    b.answers.set('10.2.0.2', EXIT)
    await b.vpn.check()
    expect(b.last()).toEqual({ address: '10.2.0.2', dns: ['10.2.0.1'] })
    await b.vpn.stop()
  })

  test('a configuration without DNS would look names up outside the tunnel, so torrents stop', async () => {
    const b = builtin()
    const noDns = `[Interface]\nPrivateKey = ${KEY_A}\nAddress = 10.2.0.2/32\n[Peer]\nPublicKey = ${KEY_B}\nAllowedIPs = 0.0.0.0/0\nEndpoint = 185.159.157.4:51820\n`
    await b.vpn.save({ mode: 'builtin', provider: 'other', config: noDns })
    b.vpn.start()
    await b.vpn.settled()
    await b.step(5_000)
    expect(b.last()).toBeNull()
    expect(b.rows()[2]).toEqual([
      'names',
      'fail',
      'Names are being looked up outside the tunnel',
      'The WireGuard configuration has no DNS line, so torrents are stopped. Upload one that has it.',
    ])
    // Another WireGuard provider: a port typed in, and none set
    expect(b.rows()[4]).toEqual([
      'portForwarding',
      'warn',
      'No forwarded port set',
      'Downloads still work; fewer peers can reach you.',
    ])
    await b.vpn.stop()
  })

  test('a missing routing rule is put back; one that can’t be stops torrents', async () => {
    const b = builtin()
    await b.vpn.save({ mode: 'builtin', provider: 'mullvad', config: wgConfig() })
    b.vpn.start()
    await b.vpn.settled()
    await b.step(5_000)
    expect(b.last()).not.toBeNull()

    b.wg.kernel.rule = false
    await b.vpn.check()
    expect(b.wg.kernel.rule).toBe(true)
    expect(b.rows()[3]?.[1]).toBe('pass')

    b.wg.kernel.rule = false
    b.wg.fail(/rule add/, 'RTNETLINK answers: Invalid argument', 5)
    await b.vpn.check()
    expect(b.rows()[3]).toEqual([
      'killSwitch',
      'fail',
      'The routing rule is missing',
      'Torrents are stopped until highsea puts it back.',
    ])
    expect(b.last()).toBeNull()
    // Mullvad doesn't forward ports
    expect(b.rows()[4]?.slice(0, 3)).toEqual([
      'portForwarding',
      'warn',
      'Mullvad doesn’t forward ports',
    ])
    await b.vpn.stop()
  })

  test('without NET_ADMIN, off Linux, or without WireGuard, says so with vpn.md’s copy', async () => {
    const b = builtin()
    b.wg.fail(/^ip link add/, 'RTNETLINK answers: Operation not permitted')
    await b.vpn.save({ mode: 'builtin', provider: 'proton', config: wgConfig() })
    b.vpn.start()
    await b.vpn.settled()
    expect(b.vpn.status()).toMatchObject({
      state: 'failed',
      needsCapability: true,
      message:
        'highsea needs the NET_ADMIN capability to run the tunnel. Add it to highsea’s service in your compose file, then restart.',
    })
    expect(b.last()).toBeNull()
    await b.vpn.stop()

    const mac = testVpn({
      runner: async (cmd) => {
        throw new CommandFailed(cmd.op, 'platform', 'highsea connects runs on Linux.')
      },
    })
    await mac.vpn.save({ mode: 'builtin', provider: 'proton', config: wgConfig() })
    mac.vpn.start()
    await mac.vpn.settled()
    expect(mac.vpn.status()).toMatchObject({
      state: 'failed',
      needsCapability: false,
      message:
        'highsea connects runs on Linux, as highsea’s Docker image does. Use a VPN container or an interface on this machine here.',
    })
    await mac.vpn.stop()

    const noTun = builtin()
    noTun.wg.fail(/^ip link add/, 'Error: Unknown device type.')
    noTun.wg.fail(/^wireguard-go/, 'ERROR: Failed to create TUN device: no such file or directory')
    await noTun.vpn.save({ mode: 'builtin', provider: 'proton', config: wgConfig() })
    noTun.vpn.start()
    await noTun.vpn.settled()
    expect(noTun.vpn.status().message).toStartWith(
      'highsea couldn’t create the WireGuard interface',
    )
    await noTun.vpn.stop()
  })

  test('port forwarding failing only warns, says so in System, and tries again in a minute', async () => {
    let fail = true
    const b = builtin({
      natPmp: async (_o, lifetime) => {
        if (fail) throw new Error('The gateway at 10.2.0.1 didn’t answer.')
        return { externalPort: 41000, lifetime, epoch: 1 }
      },
    })
    await b.vpn.save({ mode: 'builtin', provider: 'proton', config: wgConfig() })
    b.vpn.start()
    await b.vpn.settled()
    await b.step(5_000)
    expect(b.last()).not.toBeNull()
    expect(b.rows()[4]).toEqual([
      'portForwarding',
      'warn',
      'Proton VPN didn’t forward a port',
      'Downloads still work; fewer peers can reach you. Trying again in a minute.',
    ])
    expect(b.vpn.issues()).toEqual([
      expect.objectContaining({
        id: 'vpn-portForwarding',
        level: 'warning',
        message:
          'VPN: Proton VPN didn’t forward a port. Downloads still work; fewer peers can reach you.',
      }),
    ])
    fail = false
    await b.step(VPN_TIMINGS.forwardRetryMs)
    expect(b.forwarded).toEqual([41000])
    expect(b.vpn.issues()).toEqual([])
    await b.vpn.stop()
  })

  test('PIA: signs in, registers a key, connects, and binds its forwarded port every 15 minutes', async () => {
    const pia = createFakePia()
    const b = builtin({ pia })
    const refused = await b.vpn
      .save({
        mode: 'builtin',
        provider: 'pia',
        piaUsername: 'p1234567',
        piaPassword: 'wrong',
        piaRegion: 'Netherlands',
      })
      .catch((e) => e)
    expect(refused).toBeInstanceOf(AppError)
    expect(refused).toMatchObject({
      message: 'PIA didn’t accept that username and password.',
      details: { field: 'piaPassword' },
    })

    await b.vpn.save({
      mode: 'builtin',
      provider: 'pia',
      piaUsername: 'p1234567',
      piaPassword: 'correct horse',
      piaRegion: 'Netherlands',
    })
    expect(b.vpn.settings()).toMatchObject({ piaPasswordSet: true })
    b.vpn.start()
    await b.vpn.settled()
    expect(b.wg.lines()).toContain('ip -4 address add 10.13.128.7/32 dev hswg0')
    // highsea's own key went on standard input, as every key does
    const key = b.wg.commands.find((c) => c.args.includes('private-key'))?.stdin?.trim() ?? ''
    expect(key).toHaveLength(44)
    expect(b.wg.lines().join('\n')).not.toContain(key)
    await b.step(5_000)
    expect(b.last()).toEqual({ address: '10.13.128.7', dns: ['10.0.0.243', '10.0.0.242'] })
    expect(b.forwarded).toEqual([47123])
    expect(pia.state).toMatchObject({ signatures: 1, binds: 1 })
    await b.step(15 * 60_000)
    expect(pia.state).toMatchObject({ signatures: 1, binds: 2 })
    await b.vpn.stop()
  })

  test('PIA refusing later fails without retrying; an unknown region says so', async () => {
    const pia = createFakePia()
    const b = builtin({ pia })
    await b.vpn.save({
      mode: 'builtin',
      provider: 'pia',
      piaUsername: 'p1234567',
      piaPassword: 'correct horse',
      piaRegion: 'Atlantis',
    })
    b.vpn.start()
    await b.vpn.settled()
    expect(b.vpn.status()).toMatchObject({
      state: 'failed',
      message: 'PIA has no WireGuard server in Atlantis. Pick another region.',
    })
    pia.state.password = 'changed'
    await b.vpn.save({ piaRegion: 'Netherlands' })
    await b.vpn.settled()
    expect(b.vpn.status().message).toBe('PIA didn’t accept that username and password.')
    expect(b.timers.pending()).toBe(0)
    await b.vpn.stop()
  })

  test('indexers go through the tunnel when the switch is on, and wait while it’s down', async () => {
    const b = builtin()
    const outside: string[] = []
    const fetchSpy: Fetch = async (input) => {
      outside.push(String(input))
      return new Response(JSON.stringify({ ip: OWN }))
    }
    const t = testVpn({
      runner: b.wg.runner,
      fetch: fetchSpy,
      boundFetch: (address) => async () =>
        new Response(JSON.stringify({ ip: EXIT, from: address })),
    })
    await t.vpn.save({
      mode: 'builtin',
      provider: 'proton',
      config: wgConfig(),
      indexersThroughVpn: true,
    })
    t.vpn.start()
    await t.vpn.settled()
    await expect(t.vpn.indexerFetch('https://indexer.example/api')).rejects.toThrow(
      'Indexer searches go through the VPN, and it’s down. They work again once it’s back.',
    )
    b.wg.kernel.handshake = Math.floor(t.clock.now() / 1000)
    t.timers.advance(5_000)
    await t.vpn.settled()
    const res = await t.vpn.indexerFetch('https://indexer.example/api')
    expect(await res.json()).toMatchObject({ from: '10.2.0.2' })
    expect(outside).not.toContain('https://indexer.example/api')

    await t.vpn.save({ indexersThroughVpn: false })
    await t.vpn.indexerFetch('https://indexer.example/api')
    expect(outside).toContain('https://indexer.example/api')
    await t.vpn.stop()
  })

  test('saving refuses a configuration highsea connects can’t build', async () => {
    const { vpn } = testVpn()
    const v6only = `[Interface]\nPrivateKey = ${KEY_A}\nAddress = fd00::2/128\n[Peer]\nPublicKey = ${KEY_B}\nAllowedIPs = ::/0\nEndpoint = 185.159.157.4:51820\n`
    await expect(
      vpn.save({ mode: 'builtin', provider: 'other', config: v6only }),
    ).rejects.toMatchObject({
      message:
        'highsea connects needs an IPv4 Address in the WireGuard configuration’s [Interface] section.',
    })
    const noEndpoint = `[Interface]\nPrivateKey = ${KEY_A}\nAddress = 10.2.0.2/32\n[Peer]\nPublicKey = ${KEY_B}\nAllowedIPs = 0.0.0.0/0\n`
    await expect(
      vpn.save({ mode: 'builtin', provider: 'other', config: noEndpoint }),
    ).rejects.toMatchObject({
      message:
        'A [Peer] in that WireGuard configuration has no Endpoint, so highsea can’t reach it.',
    })
    await expect(
      vpn.save({ mode: 'builtin', provider: 'nordvpn', config: wgConfig() }),
    ).rejects.toMatchObject({
      message: 'Choose a provider.',
    })
  })
})

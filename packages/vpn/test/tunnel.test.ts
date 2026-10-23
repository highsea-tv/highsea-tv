// SPDX-License-Identifier: AGPL-3.0-only
// The command wrapper and the tunnel, on a fake runner: every operation's arguments, hostile input
// refused before anything runs, keys only on standard input, the routing plan, and how a failure
// reads. Nothing here runs `ip` or `wg`.
import { describe, expect, test } from 'bun:test'
import {
  CommandRefused,
  createTunnel,
  failureKind,
  ops,
  parseWireGuard,
  routingPlan,
  spawnRunner,
  TunnelError,
  type TunnelSpec,
  teardownPlan,
} from '../src/index.ts'
import { createFakeWireGuard } from './fake/index.ts'
import { KEY_A, KEY_B, wgConfig } from './helpers.ts'

const args = (c: { program: string; args: string[] }) => `${c.program} ${c.args.join(' ')}`

function spec(): TunnelSpec {
  const c = parseWireGuard(wgConfig())
  return { privateKey: c.privateKey, addresses: c.addresses, peers: c.peers, mtu: c.mtu }
}

describe('The command wrapper', () => {
  test('builds each operation from typed values', () => {
    expect(
      [
        ops.linkAddKernel(),
        ops.linkAddUserspace(),
        ops.linkDelete(),
        ops.addressAdd('10.2.0.2/32'),
        ops.addressAdd('fd00::2/128'),
        ops.linkUp(1420),
        ops.routeAdd('0.0.0.0/0'),
        ops.routeUnreachable(4),
        ops.routeFlush(6),
        ops.routeShow(4),
        ops.ruleAdd('10.2.0.2'),
        ops.ruleDelete(4),
        ops.ruleShow(4),
        ops.handshakes(),
      ].map(args),
    ).toEqual([
      'ip link add dev hswg0 type wireguard',
      'wireguard-go hswg0',
      'ip link del dev hswg0',
      'ip -4 address add 10.2.0.2/32 dev hswg0',
      'ip -6 address add fd00::2/128 dev hswg0',
      'ip link set dev hswg0 mtu 1420 up',
      'ip -4 route add 0.0.0.0/0 dev hswg0 table 51821',
      'ip -4 route add unreachable default table 51821 metric 4278198272',
      'ip -6 route flush table 51821',
      'ip -4 route show table 51821',
      'ip -4 rule add from 10.2.0.2 table 51821 priority 10821',
      'ip -4 rule del priority 10821',
      'ip -4 rule show',
      'wg show hswg0 latest-handshakes',
    ])
  })

  test('keys go on standard input, never in the arguments', () => {
    const key = ops.privateKey(KEY_A)
    expect(args(key)).toBe('wg set hswg0 private-key /dev/stdin')
    expect(key.stdin).toBe(`${KEY_A}\n`)
    const peer = ops.peer({
      publicKey: KEY_B,
      presharedKey: KEY_A,
      endpoint: { host: '185.159.157.4', port: 51820 },
      allowedIps: ['0.0.0.0/0'],
      keepalive: 25,
    })
    expect(args(peer)).toBe(
      `wg set hswg0 peer ${KEY_B} preshared-key /dev/stdin endpoint 185.159.157.4:51820 allowed-ips 0.0.0.0/0 persistent-keepalive 25`,
    )
    expect(peer.stdin).toBe(`${KEY_A}\n`)
    expect(args(peer)).not.toContain(KEY_A)
    expect(
      args(
        ops.peer({
          publicKey: KEY_B,
          presharedKey: null,
          endpoint: { host: '2001:db8::1', port: 51820 },
          allowedIps: ['0.0.0.0/0', '::/0'],
          keepalive: 25,
        }),
      ),
    ).toContain('endpoint [2001:db8::1]:51820 allowed-ips 0.0.0.0/0,::/0')
  })

  test('refuses hostile values before a command exists', () => {
    const refused = (fn: () => unknown) => expect(fn).toThrow(CommandRefused)
    refused(() => ops.addressAdd('10.2.0.2/32; reboot'))
    refused(() => ops.addressAdd('-6'))
    refused(() => ops.addressAdd('10.2.0.2/33'))
    refused(() => ops.addressAdd('10.2.0.2'))
    refused(() => ops.ruleAdd('10.2.0.0/24'))
    refused(() => ops.ruleAdd('$(id)'))
    refused(() => ops.linkUp(70_000))
    refused(() => ops.linkUp(1.5))
    refused(() => ops.privateKey('not a key'))
    refused(() => ops.privateKey(`${KEY_A}\nlisten-port 1`))
    const peer = {
      publicKey: KEY_B,
      presharedKey: null,
      endpoint: { host: 'vpn.example.net', port: 51820 },
      allowedIps: ['0.0.0.0/0'],
      keepalive: 25,
    }
    refused(() => ops.peer({ ...peer, endpoint: { host: '-oProxyCommand=x', port: 1 } }))
    refused(() => ops.peer({ ...peer, endpoint: { host: 'a b', port: 1 } }))
    refused(() => ops.peer({ ...peer, endpoint: { host: 'vpn.example.net', port: 0 } }))
    refused(() => ops.peer({ ...peer, allowedIps: [] }))
    refused(() => ops.peer({ ...peer, allowedIps: ['0.0.0.0/0,10.0.0.0/8'] }))
    refused(() => ops.peer({ ...peer, keepalive: 0 }))
    expect(args(ops.peer(peer))).toContain('endpoint vpn.example.net:51820')
  })

  test('reads what a failure means from iproute2’s and wg’s messages', () => {
    expect(failureKind('RTNETLINK answers: Operation not permitted')).toBe('permission')
    expect(failureKind('Error: Unknown device type.')).toBe('unsupported')
    expect(failureKind('RTNETLINK answers: File exists')).toBe('exists')
    expect(failureKind('Cannot find device "hswg0"')).toBe('missing')
    expect(failureKind('something else')).toBe('other')
  })

  test.skipIf(process.platform === 'linux')('runs nothing off Linux', async () => {
    await expect(spawnRunner()(ops.ruleShow(4))).rejects.toMatchObject({ kind: 'platform' })
  })
})

describe('The routing plan', () => {
  test('addresses, keys and peers, the link, then the table, its unreachable default and the rule', () => {
    expect(routingPlan(spec()).map(args)).toEqual([
      'ip -4 address add 10.2.0.2/32 dev hswg0',
      'wg set hswg0 private-key /dev/stdin',
      `wg set hswg0 peer ${KEY_B} endpoint 185.159.157.4:51820 allowed-ips 0.0.0.0/0,::/0 persistent-keepalive 25`,
      'ip link set dev hswg0 mtu 1420 up',
      'ip -4 route add 0.0.0.0/0 dev hswg0 table 51821',
      'ip -4 route add unreachable default table 51821 metric 4278198272',
      'ip -4 rule add from 10.2.0.2 table 51821 priority 10821',
    ])
  })

  test('an IPv6 address gets its own table routes and rule', () => {
    const s = { ...spec(), addresses: ['10.2.0.2/32', 'fd00::2/128'], mtu: 1380 }
    const plan = routingPlan(s).map(args)
    expect(plan).toContain('ip link set dev hswg0 mtu 1380 up')
    expect(plan.slice(-3)).toEqual([
      'ip -6 route add ::/0 dev hswg0 table 51821',
      'ip -6 route add unreachable default table 51821 metric 4278198272',
      'ip -6 rule add from fd00::2 table 51821 priority 10821',
    ])
  })

  test('the teardown removes the rules, the tables and the link', () => {
    expect(teardownPlan().map(args)).toEqual([
      'ip -4 rule del priority 10821',
      'ip -6 rule del priority 10821',
      'ip -4 route flush table 51821',
      'ip -6 route flush table 51821',
      'ip link del dev hswg0',
    ])
  })
})

describe('The tunnel', () => {
  test('comes up on kernel WireGuard after clearing what was left', async () => {
    const wg = createFakeWireGuard()
    const tunnel = createTunnel(wg.runner)
    expect(await tunnel.up(spec())).toBe('kernel')
    expect(wg.lines().slice(0, 6)).toEqual([
      ...teardownPlan().map(args),
      'ip link add dev hswg0 type wireguard',
    ])
    expect(wg.kernel).toMatchObject({ link: true, rule: true, unreachable: true })
    expect(await tunnel.killSwitch(4, '10.2.0.2')).toBe(true)
    wg.kernel.handshake = 1_700_000_000
    expect(await tunnel.handshakes()).toEqual(new Map([[wg.kernel.peerKey, 1_700_000_000]]))
  })

  test('falls back to wireguard-go when the kernel has no WireGuard', async () => {
    const wg = createFakeWireGuard()
    wg.fail(/^ip link add/, 'Error: Unknown device type.')
    expect(await createTunnel(wg.runner).up(spec())).toBe('userspace')
    expect(wg.lines()).toContain('wireguard-go hswg0')
  })

  test('without NET_ADMIN, says the capability is missing', async () => {
    const wg = createFakeWireGuard()
    wg.fail(/^ip link add/, 'RTNETLINK answers: Operation not permitted')
    const e = await createTunnel(wg.runner)
      .up(spec())
      .catch((x) => x)
    expect(e).toBeInstanceOf(TunnelError)
    expect(e.failure).toEqual({ kind: 'capability' })
  })

  test('without the kernel module or /dev/net/tun, says so', async () => {
    const wg = createFakeWireGuard()
    wg.fail(/^ip link add/, 'Error: Unknown device type.')
    wg.fail(/^wireguard-go/, 'ERROR: Failed to create TUN device: no such file or directory')
    const e = await createTunnel(wg.runner)
      .up(spec())
      .catch((x) => x)
    expect(e.failure).toEqual({ kind: 'no-device' })
  })

  test('a failure halfway takes everything down again', async () => {
    const wg = createFakeWireGuard()
    wg.fail(/rule add/, 'RTNETLINK answers: Invalid argument')
    await expect(createTunnel(wg.runner).up(spec())).rejects.toBeInstanceOf(TunnelError)
    expect(wg.kernel.link).toBe(false)
    expect(wg.lines().at(-1)).toBe('ip link del dev hswg0')
  })

  test('a hostile configuration runs no command at all', async () => {
    const wg = createFakeWireGuard()
    const bad = { ...spec(), addresses: ['10.2.0.2/32 dev eth0'] }
    await expect(createTunnel(wg.runner).up(bad)).rejects.toBeInstanceOf(TunnelError)
    expect(wg.commands).toEqual([])
  })

  test('finds the kill switch gone, and puts it back', async () => {
    const wg = createFakeWireGuard()
    const tunnel = createTunnel(wg.runner)
    await tunnel.up(spec())
    wg.kernel.rule = false
    expect(await tunnel.killSwitch(4, '10.2.0.2')).toBe(false)
    await tunnel.restoreKillSwitch(4, '10.2.0.2')
    expect(await tunnel.killSwitch(4, '10.2.0.2')).toBe(true)
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
// The leak test: highsea connects' real tunnel and routing, on a real kernel, against a second
// WireGuard peer in its own network namespace (ip-netns(8); WireGuard's own netns walkthrough,
// https://www.wireguard.com/netns/). It proves the kill switch rather than describing it:
//
// 1. a socket bound to the tunnel's address reaches the peer through the tunnel, and the peer sees
//    the tunnel's address;
// 2. the same socket can't reach an address outside the tunnel, though the main table has a route
//    to it: the rule sends it to highsea's table, which ends in `unreachable`;
// 3. with the interface down, nothing from the tunnel's address leaves at all;
// 4. a socket that isn't bound (the admin, TMDB) still uses the main table.
//
// It needs Linux, root (or NET_ADMIN), kernel WireGuard and wireguard-tools, so it runs only when
// HIGHSEA_LEAK_TEST=1 says the machine is meant for it: CI's leak job, under sudo. Anywhere else it
// skips and says why. It changes the host's network while it runs, and removes everything after.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTunnel, generateWireGuardKeys, spawnRunner, type TunnelSpec } from '../src/index.ts'

const enabled =
  process.platform === 'linux' && process.getuid?.() === 0 && process.env.HIGHSEA_LEAK_TEST === '1'

if (!enabled)
  console.info(
    'The leak test skips: it needs Linux, root and HIGHSEA_LEAK_TEST=1 (CI’s leak job runs it).',
  )

const NS = 'hs-leak-peer'
const HOST_VETH = 'hs-leak0'
const PEER_VETH = 'hs-leak1'
const HOST_OUTSIDE = '172.31.99.1'
const PEER_OUTSIDE = '172.31.99.2'
const PEER_TUNNEL = '10.99.0.1'
const OWN_TUNNEL = '10.99.0.2'
const PORT = 8080

/** Setup only: the peer side is the test's, never highsea's code. */
function sh(program: string, args: string[], input?: string) {
  const r = spawnSync(program, args, { input, encoding: 'utf8' })
  if (r.status !== 0)
    throw new Error(`${program} ${args.join(' ')}: ${r.stderr || r.error?.message || r.status}`)
  return r.stdout
}
const inNs = (program: string, args: string[], input?: string) =>
  sh('ip', ['netns', 'exec', NS, program, ...args], input)

/** Connects from `localAddress` (or none) and reads the line the peer's server answers. */
function ask(host: string, localAddress?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port: PORT, ...(localAddress ? { localAddress } : {}) })
    let data = ''
    socket.setTimeout(4_000, () => socket.destroy(new Error('ETIMEDOUT')))
    socket.on('data', (c) => {
      data += c.toString()
    })
    socket.on('end', () => resolve(data.trim()))
    socket.on('error', reject)
  })
}

describe.skipIf(!enabled)('The kill switch, on a real kernel', () => {
  const tunnel = createTunnel(spawnRunner())
  const dir = enabled ? mkdtempSync(join(tmpdir(), 'hs-leak-')) : ''
  let server: ReturnType<typeof spawn> | null = null

  beforeAll(async () => {
    const own = generateWireGuardKeys()
    const peer = generateWireGuardKeys()
    // the peer: a namespace joined to the host by a veth pair, with its own WireGuard interface
    sh('ip', ['netns', 'add', NS])
    sh('ip', ['link', 'add', HOST_VETH, 'type', 'veth', 'peer', 'name', PEER_VETH])
    sh('ip', ['link', 'set', PEER_VETH, 'netns', NS])
    sh('ip', ['address', 'add', `${HOST_OUTSIDE}/30`, 'dev', HOST_VETH])
    sh('ip', ['link', 'set', HOST_VETH, 'up'])
    inNs('ip', ['address', 'add', `${PEER_OUTSIDE}/30`, 'dev', PEER_VETH])
    inNs('ip', ['link', 'set', PEER_VETH, 'up'])
    inNs('ip', ['link', 'set', 'lo', 'up'])
    inNs('ip', ['link', 'add', 'wgpeer', 'type', 'wireguard'])
    const keyFile = join(dir, 'peer.key')
    writeFileSync(keyFile, `${peer.privateKey}\n`, { mode: 0o600 })
    inNs('wg', [
      'set',
      'wgpeer',
      'listen-port',
      '51820',
      'private-key',
      keyFile,
      'peer',
      own.publicKey,
      'allowed-ips',
      `${OWN_TUNNEL}/32`,
    ])
    inNs('ip', ['address', 'add', `${PEER_TUNNEL}/24`, 'dev', 'wgpeer'])
    inNs('ip', ['link', 'set', 'wgpeer', 'up'])
    // a server in the peer's namespace that answers with the address a connection came from
    server = spawn(
      'ip',
      [
        'netns',
        'exec',
        NS,
        process.execPath,
        '-e',
        `require('node:net').createServer((s) => s.end(s.remoteAddress + '\\n')).listen(${PORT}, '0.0.0.0', () => console.log('ready'))`,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    )
    await new Promise<void>((resolve) => server?.stdout?.once('data', () => resolve()))

    // highsea's side, by highsea's own code: only the tunnel's /24 goes through it
    const spec: TunnelSpec = {
      privateKey: own.privateKey,
      addresses: [`${OWN_TUNNEL}/24`],
      peers: [
        {
          publicKey: peer.publicKey,
          presharedKey: null,
          endpoint: { host: PEER_OUTSIDE, port: 51820 },
          allowedIps: ['10.99.0.0/24'],
          persistentKeepalive: 25,
        },
      ],
      mtu: null,
    }
    await tunnel.up(spec)
  })

  afterAll(async () => {
    server?.kill()
    await tunnel.teardown()
    spawnSync('ip', ['netns', 'del', NS])
    spawnSync('ip', ['link', 'del', HOST_VETH])
    rmSync(dir, { recursive: true, force: true })
  })

  test('a socket bound to the tunnel’s address goes through the tunnel', async () => {
    expect(await ask(PEER_TUNNEL, OWN_TUNNEL)).toBe(OWN_TUNNEL)
    expect(await tunnel.killSwitch(4, OWN_TUNNEL)).toBe(true)
    const shakes = await tunnel.handshakes()
    expect([...shakes.values()].some((at) => at > 0)).toBe(true)
  }, 20_000)

  test('it can’t reach outside the tunnel, though the main table could', async () => {
    // unbound, the main table reaches the peer's outside address over the veth
    expect(await ask(PEER_OUTSIDE)).toBe(HOST_OUTSIDE)
    // bound to the tunnel's address, the rule's table has no route there but unreachable
    await expect(ask(PEER_OUTSIDE, OWN_TUNNEL)).rejects.toMatchObject({
      code: expect.stringMatching(/^(ENETUNREACH|EHOSTUNREACH)$/),
    })
  }, 20_000)

  test('with the interface down, nothing from the tunnel’s address leaves', async () => {
    sh('ip', ['link', 'set', 'dev', 'hswg0', 'down'])
    try {
      await expect(ask(PEER_TUNNEL, OWN_TUNNEL)).rejects.toMatchObject({
        code: expect.stringMatching(/^(ENETUNREACH|EHOSTUNREACH|EADDRNOTAVAIL)$/),
      })
      await expect(ask(PEER_OUTSIDE, OWN_TUNNEL)).rejects.toMatchObject({
        code: expect.stringMatching(/^(ENETUNREACH|EHOSTUNREACH|EADDRNOTAVAIL)$/),
      })
    } finally {
      sh('ip', ['link', 'set', 'dev', 'hswg0', 'up'])
    }
  }, 20_000)
})

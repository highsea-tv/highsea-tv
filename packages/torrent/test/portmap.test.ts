// SPDX-License-Identifier: AGPL-3.0-only
// Port mapping (6b): a fake NAT-PMP gateway on loopback that speaks RFC 6886 (the external address,
// mappings, renewals and deletions), and the UPnP path with `@achingbrain/nat-port-mapper` stood in
// for. A fake SSDP and IGD would be most of a router; the library's own UPnP is its authors' to
// test, and what highsea owns is calling it right.
import { afterEach, describe, expect, test } from 'bun:test'
import dgram from 'node:dgram'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defaultGateway, type UpnpClient, type UpnpGateway } from '../src/portmap.ts'
import { LOOPBACK, tempDir, testEngine, until } from './helpers.ts'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c()
})

type Request = { op: 0 } | { op: 1 | 2; internal: number; external: number; lifetime: number }

/** RFC 6886 §3.2 and §3.3, as a gateway answers them: `lifetime` caps what it grants. */
async function fakeGateway(options: { lifetime?: number; refuse?: boolean } = {}) {
  const requests: Request[] = []
  const socket = dgram.createSocket('udp4')
  const started = Date.now()
  socket.on('message', (msg, from) => {
    if (msg[0] !== 0) return
    const op = msg[1] as number
    const head = (size: number, code: number) => {
      const out = Buffer.alloc(size)
      out.writeUInt8(0, 0)
      out.writeUInt8(128 + op, 1)
      out.writeUInt16BE(code, 2)
      out.writeUInt32BE(Math.floor((Date.now() - started) / 1000), 4)
      return out
    }
    if (op === 0) {
      requests.push({ op: 0 })
      const out = head(12, 0)
      Buffer.from([203, 0, 113, 7]).copy(out, 8)
      socket.send(out, from.port, from.address)
      return
    }
    if (op !== 1 && op !== 2) return
    const internal = msg.readUInt16BE(4)
    const external = msg.readUInt16BE(6)
    const lifetime = msg.readUInt32BE(8)
    requests.push({ op, internal, external, lifetime })
    if (options.refuse) {
      // 2: Not Authorized/Refused
      socket.send(head(16, 2), from.port, from.address)
      return
    }
    const out = head(16, 0)
    out.writeUInt16BE(internal, 8)
    // §3.4: a deletion answers with external port 0 and lifetime 0
    out.writeUInt16BE(lifetime === 0 ? 0 : internal, 10)
    out.writeUInt32BE(Math.min(lifetime, options.lifetime ?? lifetime), 12)
    socket.send(out, from.port, from.address)
  })
  await new Promise<void>((r) => socket.bind(0, '127.0.0.1', r))
  cleanups.push(() => {
    socket.close()
  })
  return { port: socket.address().port, requests }
}

const maps = (rs: Request[], lifetime: (n: number) => boolean) =>
  rs.filter((r): r is Extract<Request, { op: 1 | 2 }> => r.op !== 0 && lifetime(r.lifetime))

describe('NAT-PMP against a fake gateway', () => {
  test('TCP and UDP mapped for the listening port, renewed halfway, deleted on shutdown', async () => {
    // the gateway grants 2 seconds, so the renewal comes after 1
    const gw = await fakeGateway({ lifetime: 2 })
    const t = testEngine({
      portMapping: { wanted: () => true, gateway: () => '127.0.0.1', pmpPort: gw.port, upnp: null },
    })
    cleanups.push(() => t.engine.close())
    await t.engine.start()
    await t.engine.setBinding(LOOPBACK)
    await until(() => t.engine.status().portMapping !== null, 5_000, 'the mapping')
    expect(t.engine.status().portMapping).toEqual({
      via: 'nat-pmp',
      externalPort: t.port,
      externalAddress: '203.0.113.7',
    })
    const first = maps(gw.requests, (l) => l > 0)
    expect(first.map((r) => r.op).sort()).toEqual([1, 2])
    expect(first.every((r) => r.internal === t.port && r.external === t.port)).toBe(true)
    // the recommended 7200 seconds asked for (RFC 6886 §3.3)
    expect(first.every((r) => r.lifetime === 7200)).toBe(true)
    await until(() => maps(gw.requests, (l) => l > 0).length >= 4, 4_000, 'the renewal')

    await t.engine.close()
    const deletions = maps(gw.requests, (l) => l === 0)
    expect(deletions.map((r) => r.op).sort()).toEqual([1, 2])
    expect(deletions.every((r) => r.internal === t.port && r.external === 0)).toBe(true)
    // the engine's own UDP socket carried it, bound to the binding's address
    expect(
      t.sockets.filter((s) => s.kind === 'udp').every((s) => s.localAddress === '127.0.0.1'),
    ).toBe(true)
  }, 15_000)

  test('nothing is asked while it isn’t wanted (the switch is off, or a VPN is set)', async () => {
    const gw = await fakeGateway()
    let wanted = false
    const t = testEngine({
      portMapping: {
        wanted: () => wanted,
        gateway: () => '127.0.0.1',
        pmpPort: gw.port,
        upnp: null,
      },
    })
    cleanups.push(() => t.engine.close())
    await t.engine.start()
    await t.engine.setBinding(LOOPBACK)
    await new Promise((r) => setTimeout(r, 300))
    expect(gw.requests).toHaveLength(0)
    wanted = true
    await t.engine.refreshPortMapping()
    expect(t.engine.status().portMapping?.via).toBe('nat-pmp')
    wanted = false
    await t.engine.refreshPortMapping()
    expect(t.engine.status().portMapping).toBeNull()
    expect(maps(gw.requests, (l) => l === 0)).toHaveLength(2)
  }, 10_000)

  test('a router that refuses NAT-PMP falls through to UPnP', async () => {
    const gw = await fakeGateway({ refuse: true })
    const upnp = fakeUpnp()
    const t = testEngine({
      portMapping: {
        wanted: () => true,
        gateway: () => '127.0.0.1',
        pmpPort: gw.port,
        upnp: () => upnp.client,
      },
    })
    cleanups.push(() => t.engine.close())
    await t.engine.start()
    await t.engine.setBinding(LOOPBACK)
    await until(() => t.engine.status().portMapping !== null, 5_000, 'the mapping')
    expect(t.engine.status().portMapping?.via).toBe('upnp')
    expect(gw.requests.length).toBeGreaterThan(0)
  }, 10_000)
})

function fakeUpnp() {
  const calls: { port: number; host: string; protocol: string; description: string }[] = []
  let stopped = 0
  const gateway: UpnpGateway = {
    host: '127.0.0.1',
    async map(port, host, o) {
      calls.push({ port, host, protocol: o.protocol, description: o.description })
      return { externalPort: port, externalHost: '198.51.100.20' }
    },
    async stop() {
      stopped++
    },
  }
  const client: UpnpClient = {
    async *findGateways() {
      yield gateway
    },
  }
  return { client, calls, stopped: () => stopped }
}

describe('UPnP, with the library stood in for', () => {
  test('both protocols mapped on the gateway found, and stopped on shutdown', async () => {
    const upnp = fakeUpnp()
    const t = testEngine({
      portMapping: { wanted: () => true, gateway: () => null, upnp: () => upnp.client },
    })
    cleanups.push(() => t.engine.close())
    await t.engine.start()
    await t.engine.setBinding(LOOPBACK)
    await until(() => t.engine.status().portMapping !== null, 5_000, 'the mapping')
    expect(t.engine.status().portMapping).toEqual({
      via: 'upnp',
      externalPort: t.port,
      externalAddress: '198.51.100.20',
    })
    expect(upnp.calls.map((c) => c.protocol).sort()).toEqual(['TCP', 'UDP'])
    expect(upnp.calls.every((c) => c.port === t.port && c.description === 'highsea')).toBe(true)
    // the binding went (the VPN came up): the mapping goes with it
    await t.engine.setBinding(null)
    expect(upnp.stopped()).toBe(1)
    expect(t.engine.status().portMapping).toBeNull()
  })
})

test('the default gateway from a Linux routing table (proc(5))', () => {
  const dir = tempDir('route')
  const path = join(dir, 'route')
  writeFileSync(
    path,
    [
      'Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT',
      'eth0\t0000A8C0\t00000000\t0001\t0\t0\t0\t00FFFFFF\t0\t0\t0',
      'eth0\t00000000\t0101A8C0\t0003\t0\t0\t0\t00000000\t0\t0\t0',
      '',
    ].join('\n'),
  )
  expect(defaultGateway(path)).toBe('192.168.1.1')
  expect(defaultGateway(join(dir, 'missing'))).toBeNull()
})

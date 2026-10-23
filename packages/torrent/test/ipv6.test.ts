// SPDX-License-Identifier: AGPL-3.0-only
// IPv6: which families a binding allows, a download between two engines on ::1 over a tracker's
// `peers6` (BEP 7), over uTP and over TCP, PEX's `added6` (BEP 11) and the IPv6 DHT (BEP 32).
// Loopback only; the tests that need ::1 are skipped, with a note, on a host without it.
import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Wire from 'bittorrent-protocol'
import utPex from 'ut_pex'
import { type Dht, startDht } from '../src/dht.ts'
import { createSocketFactory, isGlobalIPv6 } from '../src/sockets.ts'
import { createUdpMux } from '../src/udp.ts'
import {
  hasLoopback6,
  LOOPBACK6,
  makeTorrent,
  randomData,
  startTracker,
  tempDir,
  testEngine,
  until,
  writeFiles,
} from './helpers.ts'

const cleanups: (() => Promise<void> | void)[] = []
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c()
})

const v6 = await hasLoopback6()
if (!v6) console.warn('This host can’t bind ::1, so the IPv6 tests on loopback are skipped.')

describe('the binding’s families', () => {
  const iface = (address: string) => ({
    en0: [
      {
        address,
        family: 'IPv6' as const,
        internal: false,
        netmask: 'ffff:ffff:ffff:ffff::',
        mac: '00:00:00:00:00:00',
        cidr: null,
        scopeid: 0,
      },
    ],
  })

  test('a VPN binding uses IPv6 only when it has an IPv6 address', () => {
    const f = createSocketFactory({ interfaces: () => iface('2001:db8::5') })
    f.rebind({ address: '10.2.0.2', dns: [] })
    expect(f.locals()).toEqual([{ family: 4, address: '10.2.0.2' }])
    expect(f.reachable('2001:db8::1')).toBe(false)
    expect(() => f.connect('2001:db8::1', 6881)).toThrow('IPv6 isn’t available.')
    f.rebind({ address: '10.2.0.2', address6: 'fd00::2', dns: [] })
    expect(f.locals()).toEqual([
      { family: 4, address: '10.2.0.2' },
      { family: 6, address: 'fd00::2' },
    ])
    expect(f.reachable('2001:db8::1')).toBe(true)
    f.rebind(null)
  })

  test('the "any" binding uses IPv6 when the host has a global IPv6 address', () => {
    const global = createSocketFactory({ interfaces: () => iface('2a01:4f8::1') })
    global.rebind({ address: null, dns: [] })
    expect(global.locals()).toEqual([
      { family: 4, address: null },
      { family: 6, address: null },
    ])
    global.rebind(null)
    // link-local and Teredo don't count (RFC 4291 § 2.4, BEP 32)
    for (const a of ['fe80::1', '2001:0:4136:e378::1', 'fd00::1']) {
      const f = createSocketFactory({ interfaces: () => iface(a) })
      f.rebind({ address: null, dns: [] })
      expect(f.locals()).toEqual([{ family: 4, address: null }])
      f.rebind(null)
    }
    expect(isGlobalIPv6('2001:db8::1')).toBe(true)
    expect(isGlobalIPv6('::1')).toBe(false)
  })
})

describe('PEX over IPv6 (BEP 11)', () => {
  test('a peer added with addPeer6 arrives as added6, with its uTP flag', async () => {
    // two wires joined back to back, as two peers on one connection
    const a = new Wire()
    const b = new Wire()
    a.pipe(b).pipe(a)
    a.use(utPex())
    b.use(utPex())
    const hash = 'aa'.repeat(20)
    const handshaken = new Promise<void>((r) => b.once('extended', () => r()))
    a.handshake(hash, 'a1'.repeat(20))
    b.handshake(hash, 'b1'.repeat(20))
    await handshaken
    const heard: { peer: string; utp: boolean }[] = []
    b.ut_pex?.on('peer', (peer, flags) => heard.push({ peer, utp: flags.supportsUtp }))
    a.ut_pex?.addPeer6('[2001:db8::7]:51413', { supportsUtp: true })
    a.ut_pex?.addPeer('192.0.2.7:6881')
    // ut_pex sends every 65 s; this sends the next message now
    ;(a.ut_pex as unknown as { _sendMessage(): void })._sendMessage()
    await until(() => heard.length === 2, 2_000, 'the PEX message')
    expect(heard).toContainEqual({ peer: '[2001:db8::7]:51413', utp: true })
    expect(heard).toContainEqual({ peer: '192.0.2.7:6881', utp: false })
    a.destroy()
    b.destroy()
  })
})

async function swarm6(options: { utp: boolean; udp: boolean }) {
  const tracker = await startTracker({ host: '::1' })
  cleanups.push(() => tracker.close())
  const data = randomData(500_000)
  const files = [{ path: 'Sintel.mkv', data }]
  const t = makeTorrent({
    name: 'Sintel.mkv',
    files,
    announce: [options.udp ? tracker.udpUrl : tracker.httpUrl],
  })
  const seedDir = tempDir('seed')
  writeFiles(seedDir, files)
  const a = testEngine({ utp: options.utp })
  cleanups.push(() => a.engine.close())
  await a.engine.start()
  await a.engine.setBinding(LOOPBACK6)
  const seed = await a.engine.add({
    source: { torrent: t.torrent },
    savePath: seedDir,
    category: 'x',
  })
  await until(() => a.engine.get(seed.id).state === 'seeding', 10_000, 'the seeder')
  const b = testEngine({ utp: options.utp })
  cleanups.push(() => b.engine.close())
  await b.engine.start()
  await b.engine.setBinding(LOOPBACK6)
  const dir = tempDir('leech')
  const { id } = await b.engine.add({
    source: { torrent: t.torrent },
    savePath: dir,
    category: 'x',
  })
  let peer: { address: string; flags: string } | null = null
  await until(
    () => {
      peer = b.engine.peers(id)[0] ?? peer
      return b.engine.get(id).state === 'seeding'
    },
    20_000,
    'the download over IPv6',
  )
  expect(readFileSync(join(dir, 'Sintel.mkv')).equals(Buffer.from(data))).toBe(true)
  // every socket left from ::1
  expect(b.sockets.every((s) => s.localAddress === '::1')).toBe(true)
  return { peer: peer as unknown as { address: string; flags: string }, tracker }
}

describe('a download on ::1', () => {
  test.skipIf(!v6)(
    'over uTP, with the seeder from the tracker’s peers6',
    async () => {
      const { peer } = await swarm6({ utp: true, udp: false })
      expect(peer.address).toMatch(/^\[::1\]:\d+$/)
      expect(peer.flags).toContain('P')
    },
    30_000,
  )

  test.skipIf(!v6)(
    'over TCP, with a UDP tracker answering in 18-byte peers',
    async () => {
      const { peer, tracker } = await swarm6({ utp: false, udp: true })
      expect(peer.address).toMatch(/^\[::1\]:\d+$/)
      expect(peer.flags).not.toContain('P')
      expect(tracker.announces.every((x) => x.via === 'udp')).toBe(true)
    },
    30_000,
  )
})

describe('the IPv6 DHT (BEP 32)', () => {
  test.skipIf(!v6)(
    'starts on ::1, bootstraps, and finds a peer another node announced',
    async () => {
      const node = async (
        bootstrap: string[],
        onPeer: (h: string, a: string) => void = () => {},
      ) => {
        const sockets = createSocketFactory()
        sockets.rebind(LOOPBACK6)
        const mux = createUdpMux(await sockets.udp(0, 6))
        const dht = (await startDht({
          socket: mux.krpc(),
          family: 6,
          resolve: (h) => sockets.resolve(h, 6),
          bootstrap,
          onPeer,
        })) as Dht
        cleanups.push(async () => {
          await dht.destroy()
          sockets.rebind(null)
        })
        return { dht, port: mux.port() }
      }
      const first = await node([])
      expect(first.dht.family).toBe(6)
      const router = `[::1]:${first.port}`
      const found: string[] = []
      const hash = 'cd'.repeat(20)
      const seeker = await node([router], (h, address) => {
        if (h === hash) found.push(address)
      })
      const announcer = await node([router])
      await until(() => announcer.dht.nodes() > 0 && seeker.dht.nodes() > 0, 5_000, 'bootstrap')
      // the saved nodes are IPv6 addresses, never the stand-ins the libraries see
      expect(seeker.dht.saved()).toContain(router)
      announcer.dht.announce(hash, 51413)
      await new Promise((r) => setTimeout(r, 300))
      seeker.dht.lookup(hash)
      await until(() => found.length > 0, 5_000, 'the announced peer')
      expect(found).toContain('[::1]:51413')
    },
    20_000,
  )
})

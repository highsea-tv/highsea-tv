// SPDX-License-Identifier: AGPL-3.0-only
// IP blocklists (6b): the three formats qBittorrent reads, written here by hand from their
// descriptions, parsed into one range set; then an engine that refuses a blocked peer, coming and
// going.
import { afterEach, describe, expect, test } from 'bun:test'
import { gzipSync } from 'node:zlib'
import { ipv4, ipv6, parseBlocklist } from '../src/blocklist.ts'
import {
  LOOPBACK,
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

const P2P = `# PeerGuardian text: description, a colon, a range
// a comment of the other kind

Some ISP:1.2.3.0-1.2.3.255
Overlapping it:1.2.3.128-1.2.4.10
Name: with: colons:010.000.000.001-010.000.000.010
Documentation v6:2001:db8::-2001:db8::ffff
this line isn't a range
`

const DAT = `# eMule ipfilter.dat: range, access level, description
001.002.004.000 - 001.002.004.255 , 000 , Blocked range
005.006.007.008 - 005.006.007.008 , 200 , Allowed: above 127
2001:0db8:0001:0000:0000:0000:0000:0000 - 2001:0db8:0001:ffff:ffff:ffff:ffff:ffff , 100 , v6
9.9.9.0 - 9.9.9.9
`

const u32 = (n: number) => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n >>> 0)
  return b
}
const addr = (a: string) => u32(ipv4(a) as number)
const MAGIC = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x50, 0x32, 0x42])

/** P2B 1 or 2: a NUL-terminated name, then two addresses, repeated. */
function p2b12(version: 1 | 2, ranges: [string, string, string][]) {
  return Buffer.concat([
    MAGIC,
    Buffer.from([version]),
    ...ranges.flatMap(([name, a, b]) => [
      Buffer.from(name, version === 1 ? 'latin1' : 'utf8'),
      Buffer.from([0]),
      addr(a),
      addr(b),
    ]),
  ])
}

/** P2B 3: the names counted up front, then counted records of a name index and two addresses. */
function p2b3(names: string[], ranges: [number, string, string][]) {
  return Buffer.concat([
    MAGIC,
    Buffer.from([3]),
    u32(names.length),
    ...names.flatMap((n) => [Buffer.from(n, 'utf8'), Buffer.from([0])]),
    u32(ranges.length),
    ...ranges.flatMap(([i, a, b]) => [u32(i), addr(a), addr(b)]),
  ])
}

describe('addresses', () => {
  test('leading zeros are decimal, and IPv6 in its shortened forms', () => {
    expect(ipv4('010.000.000.001')).toBe(10 * 2 ** 24 + 1)
    expect(ipv4('256.0.0.1')).toBeNull()
    expect(ipv4('1.2.3')).toBeNull()
    expect(ipv6('::1')).toBe(1n)
    expect(ipv6('2001:db8::ffff')).toBe((0x20010db8n << 96n) | 0xffffn)
    expect(ipv6('::ffff:1.2.3.4')).toBe((0xffffn << 32n) | 0x01020304n)
    expect(ipv6('1.2.3.4')).toBeNull()
  })
})

describe('the formats', () => {
  test('PeerGuardian P2P text: colons in names, comments, overlaps merged, IPv6', () => {
    const { set, format, skipped } = parseBlocklist(Buffer.from(P2P))
    expect(format).toBe('p2p')
    expect(skipped).toBe(1)
    // 1.2.3.0–1.2.4.10 is one range after merging, plus 10.0.0.1–10 and the IPv6 one
    expect(set.size).toBe(3)
    expect(set.has('1.2.3.0')).toBe(true)
    expect(set.has('1.2.4.10')).toBe(true)
    expect(set.has('1.2.4.11')).toBe(false)
    expect(set.has('10.0.0.5')).toBe(true)
    expect(set.has('10.0.0.11')).toBe(false)
    expect(set.has('2001:db8::abc')).toBe(true)
    expect(set.has('2001:db8::1:0')).toBe(false)
    // an IPv4-mapped address is its IPv4 address
    expect(set.has('::ffff:1.2.3.4')).toBe(true)
  })

  test('eMule DAT: access above 127 is allowed, a missing level blocks', () => {
    const { set, format } = parseBlocklist(Buffer.from(DAT))
    expect(format).toBe('dat')
    expect(set.has('1.2.4.200')).toBe(true)
    expect(set.has('5.6.7.8')).toBe(false)
    expect(set.has('9.9.9.9')).toBe(true)
    expect(set.has('2001:db8:1:abcd::1')).toBe(true)
    expect(set.has('2001:db8:2::1')).toBe(false)
  })

  test('P2B versions 1, 2 and 3', () => {
    const v1 = parseBlocklist(p2b12(1, [['Café ISP', '20.0.0.0', '20.0.0.255']]))
    expect(v1.format).toBe('p2b')
    expect(v1.set.has('20.0.0.7')).toBe(true)
    expect(v1.set.has('20.0.1.0')).toBe(false)
    const v2 = parseBlocklist(
      p2b12(2, [
        ['名前', '30.0.0.0', '30.0.0.9'],
        ['second', '31.0.0.1', '31.0.0.1'],
      ]),
    )
    expect(v2.set.has('30.0.0.9')).toBe(true)
    expect(v2.set.has('31.0.0.1')).toBe(true)
    expect(v2.set.has('31.0.0.2')).toBe(false)
    const v3 = parseBlocklist(
      p2b3(
        ['first', 'second'],
        [
          [0, '40.0.0.0', '40.0.0.255'],
          [1, '41.1.1.1', '41.1.1.2'],
        ],
      ),
    )
    expect(v3.set.size).toBe(2)
    expect(v3.set.has('40.0.0.128')).toBe(true)
    expect(v3.set.has('41.1.1.2')).toBe(true)
    expect(v3.set.has('41.1.1.3')).toBe(false)
  })

  test('gzipped lists are unpacked first, whatever the format', () => {
    expect(parseBlocklist(gzipSync(Buffer.from(P2P))).set.has('10.0.0.1')).toBe(true)
    expect(
      parseBlocklist(gzipSync(p2b3(['x'], [[0, '50.0.0.0', '50.0.0.1']]))).set.has('50.0.0.1'),
    ).toBe(true)
  })

  test('what isn’t a list is refused, with a reason', () => {
    expect(() => parseBlocklist(Buffer.from('# only a comment\n'))).toThrow('no ranges')
    expect(() => parseBlocklist(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0]))).toThrow(
      'isn’t P2P, DAT or P2B',
    )
    expect(() => parseBlocklist(Buffer.concat([MAGIC, Buffer.from([9])]))).toThrow('version 9')
    const cut = p2b12(1, [['a', '1.1.1.1', '1.1.1.2']])
    expect(() => parseBlocklist(cut.subarray(0, cut.length - 3))).toThrow('ends partway')
  })
})

describe('an engine with a blocklist', () => {
  test('a blocked peer is never connected to, nor let in; lifting the list lets it through', async () => {
    const tracker = await startTracker()
    cleanups.push(() => tracker.close())
    const data = randomData(200_000)
    const files = [{ path: 'Sintel.mkv', data }]
    const t = makeTorrent({ name: 'Sintel.mkv', files, announce: [tracker.httpUrl] })
    const seedDir = tempDir('seed')
    writeFiles(seedDir, files)
    const loopback = parseBlocklist(Buffer.from('Loopback:127.0.0.0-127.255.255.255\n')).set

    const a = testEngine()
    cleanups.push(() => a.engine.close())
    await a.engine.start()
    await a.engine.setBinding(LOOPBACK)
    a.engine.setBlocklist(loopback)
    const seed = await a.engine.add({
      source: { torrent: t.torrent },
      savePath: seedDir,
      category: 'movies',
    })
    await until(() => a.engine.get(seed.id).state === 'seeding', 10_000, 'the seeder')

    const b = testEngine()
    cleanups.push(() => b.engine.close())
    await b.engine.start()
    await b.engine.setBinding(LOOPBACK)
    b.engine.setBlocklist(loopback)
    expect(b.engine.status().blocklistRanges).toBe(1)
    const leech = await b.engine.add({
      source: { torrent: t.torrent },
      savePath: tempDir('leech'),
      category: 'movies',
    })
    // both have heard of each other from the tracker, and neither connects
    await until(() => tracker.swarm(t.infoHash).length === 2, 10_000, 'both announces')
    await new Promise((r) => setTimeout(r, 2_500))
    // over TCP or uTP: uTP is tried first (6b)
    const toPeer = (s: { kind: string; remote: string | null }, port: number) =>
      (s.kind === 'connect' || s.kind === 'utp') && s.remote === `127.0.0.1:${port}`
    expect(b.sockets.some((s) => toPeer(s, a.port))).toBe(false)
    expect(a.sockets.some((s) => toPeer(s, b.port))).toBe(false)
    expect(b.engine.get(leech.id).progress).toBe(0)

    // the downloader drops its list; the seeder still refuses it coming in, so it can only work
    // when the seeder's list goes too
    b.engine.setBlocklist(null)
    b.engine.reannounce(leech.id)
    await new Promise((r) => setTimeout(r, 2_500))
    expect(b.sockets.some((s) => toPeer(s, a.port))).toBe(true)
    expect(a.engine.peers(seed.id)).toHaveLength(0)
    expect(b.engine.get(leech.id).progress).toBe(0)

    a.engine.setBlocklist(null)
    a.engine.reannounce(seed.id)
    await until(() => b.engine.get(leech.id).state === 'seeding', 20_000, 'the download')
  }, 40_000)
})

// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import dgram from 'node:dgram'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import bencode from 'bencode'
import { Bitfield } from '../src/bitfield.ts'
import { startDht } from '../src/dht.ts'
import { createBucket } from '../src/limits.ts'
import { parseMagnet, parseTorrentFile, safeComponent, toMagnet } from '../src/metainfo.ts'
import { BLOCK, createPicker } from '../src/picker.ts'
import { createSocketFactory, Unbound } from '../src/sockets.ts'
import { createStorage, type Priority } from '../src/storage.ts'
import { clientOf } from '../src/torrent.ts'
import { compactPeers, createTrackerSet, escapeBytes, TrackerError } from '../src/trackers.ts'
import { createUdpMux } from '../src/udp.ts'
import { makeTorrent, randomData, sha1, tempDir } from './helpers.ts'

describe('metainfo', () => {
  test('a path component can’t climb out of the save folder', () => {
    expect(safeComponent('..')).toBe('_')
    expect(safeComponent('.')).toBe('_')
    expect(safeComponent('a/b\\c')).toBe('a_b_c')
    expect(safeComponent('nul\u0000here')).toBe('nul_here')
    expect(safeComponent('Sintel (2010).mkv')).toBe('Sintel (2010).mkv')
  })

  test('a torrent whose paths try `..` lands inside its folder', () => {
    const data = randomData(1000)
    const info = {
      name: 'Sintel',
      'piece length': 16384,
      pieces: Buffer.from(sha1(data), 'hex'),
      files: [{ length: 1000, path: ['..', '..', 'etc', 'passwd'] }],
    }
    const m = parseTorrentFile(bencode.encode({ info, announce: 'http://t.example/a' }))
    expect(m.files[0]?.path).toBe('Sintel/_/_/etc/passwd')
    expect(m.infoHash).toBe(sha1(bencode.encode(info)))
    expect(m.trackers).toEqual([['http://t.example/a']])
  })

  test('tiers, the private flag, and what’s refused', () => {
    const t = makeTorrent({
      name: 'Sintel.mkv',
      files: [{ path: 'Sintel.mkv', data: randomData(40_000) }],
      announce: ['udp://a.example:80', 'https://b.example/announce'],
      private: true,
    })
    const m = parseTorrentFile(t.torrent)
    expect(m.private).toBe(true)
    expect(m.trackers).toEqual([['udp://a.example:80'], ['https://b.example/announce']])
    expect(m.pieceCount).toBe(2)
    expect(() => parseTorrentFile(new TextEncoder().encode('not bencode'))).toThrow(
      'That isn’t a valid torrent',
    )
    const bad = bencode.encode({
      info: { name: 'x', 'piece length': 16384, pieces: Buffer.alloc(40), length: 10 },
    })
    expect(() => parseTorrentFile(bad)).toThrow('its size doesn’t match its pieces')
  })

  test('magnets: the v1 hash, trackers each in a tier, and back again', () => {
    const hash = 'c9e15763f722f23e98a29decdfae341b98d53056'
    const m = parseMagnet(
      `magnet:?xt=urn:btih:${hash.toUpperCase()}&dn=Sintel&tr=udp%3A%2F%2Ft.example%3A80&tr=wss%3A%2F%2Fw.example`,
    )
    expect(m).toEqual({
      infoHash: hash,
      name: 'Sintel',
      trackers: [['udp://t.example:80']],
      peers: [],
    })
    expect(parseMagnet(toMagnet(m)).infoHash).toBe(hash)
    expect(() => parseMagnet('http://example.com')).toThrow('That isn’t a magnet link.')
  })
})

describe('bitfield', () => {
  test('BEP 3 bit order, and spare bits from a peer are cleared', () => {
    const b = new Bitfield(10, Uint8Array.from([0b1000_0001, 0b1111_1111]))
    expect(b.get(0)).toBe(true)
    expect(b.get(7)).toBe(true)
    expect(b.get(9)).toBe(true)
    expect(b.count()).toBe(4)
    b.set(1)
    expect(b.buffer[0]).toBe(0b1100_0001)
    expect(b.full()).toBe(false)
  })
})

describe('the piece picker', () => {
  const m = { pieceCount: 8, pieceLength: BLOCK * 2, length: BLOCK * 2 * 8 }
  const peer = (key: string, pieces: number[]) => ({ key, has: (p: number) => pieces.includes(p) })

  test('rarest first once a few pieces are in, and only what the peer has', () => {
    const have = new Bitfield(8)
    for (const p of [0, 1, 2, 3]) have.set(p)
    const picker = createPicker(m, {
      have,
      priority: () => 1,
      sequential: () => false,
      random: () => 0.99,
    })
    const common = peer('a', [4, 5, 6, 7])
    picker.addPeer(common.has)
    picker.addPeer(peer('b', [4, 5, 6]).has)
    // piece 7 is the rarest
    expect(picker.next(common, 2).map((b) => b.piece)).toEqual([7, 7])
    expect(picker.next(peer('c', [0]), 4)).toEqual([])
  })

  test('skipped files’ pieces are never asked for, high priority first', () => {
    const have = new Bitfield(8)
    for (const p of [0, 1, 2, 3]) have.set(p)
    const picker = createPicker(m, {
      have,
      priority: (p) => (p === 4 ? 0 : p === 6 ? 2 : 1),
      sequential: () => false,
    })
    const all = peer('a', [4, 5, 6, 7])
    picker.addPeer(all.has)
    const asked = picker.next(all, 6).map((b) => b.piece)
    expect(asked.slice(0, 2)).toEqual([6, 6])
    expect(asked).not.toContain(4)
  })

  test('endgame asks a second peer for what’s in flight, and a bad piece blames who sent it', () => {
    const have = new Bitfield(8)
    for (let p = 0; p < 7; p++) have.set(p)
    const picker = createPicker(m, { have, priority: () => 1, sequential: () => false })
    const a = peer('a', [7])
    const b = peer('b', [7])
    expect(picker.next(a, 10)).toHaveLength(2)
    expect(picker.endgame()).toBe(true)
    expect(picker.next(b, 10)).toHaveLength(2)
    const first = picker.arrived('a', 7, 0, new Uint8Array(BLOCK))
    expect(first?.cancel).toEqual(['b'])
    const done = picker.arrived('b', 7, BLOCK, new Uint8Array(BLOCK))
    expect(done?.piece?.length).toBe(BLOCK * 2)
    expect([...picker.checked(7, false)]).toEqual([
      ['a', 0.5],
      ['b', 0.5],
    ])
    // it starts over
    expect(picker.next(a, 10)).toHaveLength(2)
  })

  test('sequential mode asks in order', () => {
    const have = new Bitfield(8)
    const picker = createPicker(m, { have, priority: () => 1, sequential: () => true })
    const all = peer('a', [0, 1, 2, 3, 4, 5, 6, 7])
    expect(picker.next(all, 6).map((b) => b.piece)).toEqual([0, 0, 1, 1, 2, 2])
  })
})

describe('the rate limit', () => {
  test('a bucket lets a second’s worth through, then holds back', async () => {
    let t = 0
    const bucket = createBucket(() => t)
    expect(bucket.tryTake(1_000_000)).toBe(true)
    bucket.setRate(100_000)
    t += 1000
    expect(bucket.tryTake(60_000)).toBe(true)
    expect(bucket.tryTake(60_000)).toBe(false)
    t += 500
    expect(bucket.tryTake(60_000)).toBe(true)
  })
})

describe('storage', () => {
  test('a skipped file’s share of a boundary piece goes to the parts file, and moves in when wanted', async () => {
    const files = [
      { path: 'Sintel/a.mkv', data: randomData(20_000) },
      { path: 'Sintel/b.nfo', data: randomData(5_000) },
    ]
    const t = makeTorrent({ name: 'Sintel', files, pieceLength: 16_384 })
    const m = parseTorrentFile(t.torrent)
    const dir = tempDir()
    let priorities: Priority[] = ['normal', 'skip']
    const s = createStorage({ savePath: dir, metainfo: m, priorities: () => priorities })
    const all = Buffer.concat(files.map((f) => f.data))
    await s.write(0, all.subarray(0, 16_384))
    await s.write(1, all.subarray(16_384))
    await s.close()
    expect(existsSync(join(dir, 'Sintel', 'b.nfo'))).toBe(false)
    expect(existsSync(join(dir, `.${m.infoHash}.parts`))).toBe(true)
    expect(
      readFileSync(join(dir, 'Sintel', 'a.mkv')).equals(Buffer.from(files[0]?.data as Uint8Array)),
    ).toBe(true)
    priorities = ['normal', 'normal']
    await s.unskip(1, () => true)
    await s.close()
    expect(
      readFileSync(join(dir, 'Sintel', 'b.nfo')).equals(Buffer.from(files[1]?.data as Uint8Array)),
    ).toBe(true)
  })

  test('removing takes the torrent’s files and empty folders, never the owner’s', async () => {
    const files = [{ path: 'Sintel/a.mkv', data: randomData(1_000) }]
    const m = parseTorrentFile(makeTorrent({ name: 'Sintel', files }).torrent)
    const dir = tempDir()
    const s = createStorage({ savePath: dir, metainfo: m, priorities: () => ['normal'] })
    await s.write(0, files[0]?.data as Uint8Array)
    writeFileSync(join(dir, 'keep.txt'), 'mine')
    await s.remove()
    expect(existsSync(join(dir, 'Sintel'))).toBe(false)
    expect(existsSync(join(dir, 'keep.txt'))).toBe(true)
  })
})

describe('trackers', () => {
  test('raw bytes in a query, and compact peers in both families', () => {
    expect(escapeBytes(Uint8Array.from([0x41, 0x20, 0xff, 0x2e]))).toBe('A%20%FF.')
    expect(compactPeers(Uint8Array.from([127, 0, 0, 1, 0x1a, 0xe1]), 4)).toEqual([
      { host: '127.0.0.1', port: 6881 },
    ])
    const v6 = new Uint8Array(18)
    v6[15] = 1
    v6[16] = 0x1a
    v6[17] = 0xe1
    expect(compactPeers(v6, 6)).toEqual([{ host: '::1', port: 6881 }])
  })

  test('peers6 (BEP 7): 18 bytes a peer, in canonical form, a zero port skipped', () => {
    const peers6 = Buffer.concat([
      Buffer.from('20010db8000000000000000000000042', 'hex'),
      Buffer.from([0xc8, 0xd5]),
      Buffer.from('2a0104f8000000000000000000000001', 'hex'),
      Buffer.from([0, 0]),
      Buffer.from('fe800000000000000000000000000001', 'hex'),
      Buffer.from([0x1a, 0xe1]),
    ])
    expect(compactPeers(peers6, 6)).toEqual([
      { host: '2001:db8::42', port: 51413 },
      { host: 'fe80::1', port: 6881 },
    ])
  })

  test('a tier is tried in order, a tracker that answers moves to the front, the next tier only after', async () => {
    const set = createTrackerSet([['http://a', 'http://b'], ['http://c']], () => 0.99)
    const tried: string[] = []
    const ok = { interval: 60, peers: [], seeders: 3, leechers: 1, warning: null }
    const res = await set.announce(async (url) => {
      tried.push(url)
      if (url === 'http://a') throw new TrackerError('down')
      return ok
    })
    expect(res.url).toBe('http://b')
    expect(tried).toEqual(['http://a', 'http://b'])
    tried.length = 0
    await set.announce(async (url) => {
      tried.push(url)
      return ok
    })
    expect(tried).toEqual(['http://b'])
    expect(set.statuses().find((s) => s.url === 'http://a')).toMatchObject({
      status: 'error',
      message: 'down',
    })
    expect(set.statuses().find((s) => s.url === 'http://c')?.status).toBe('not-contacted')
    expect(set.swarm()).toEqual({ seeders: 3, leechers: 1 })
  })
})

describe('the socket factory', () => {
  test('nothing opens without a binding, and peers are addresses, never names', async () => {
    const f = createSocketFactory()
    expect(() => f.connect('127.0.0.1', 1)).toThrow(Unbound)
    await expect(f.udp(0)).rejects.toThrow(Unbound)
    f.rebind({ address: '127.0.0.1', dns: [] })
    expect(() => f.connect('tracker.example', 80)).toThrow('isn’t an address')
    f.rebind(null)
  })
})

test('a peer id names its client', () => {
  expect(clientOf(Buffer.from('-qB4630-abcdefghijkl').toString('hex'))).toBe('qBittorrent 4.6.3')
  expect(clientOf(Buffer.from('-TR4060-abcdefghijkl').toString('hex'))).toBe('Transmission 4.0.6')
  expect(clientOf(null)).toBe('Unknown')
})

describe('the DHT', () => {
  test('going offline while the bootstrap names resolve starts nothing', async () => {
    const socket = dgram.createSocket('udp4')
    await new Promise<void>((r) => socket.bind(0, '127.0.0.1', r))
    let online = true
    const krpc = createUdpMux(socket).krpc()
    const dht = await startDht({
      socket: krpc,
      family: 4,
      // the engine goes offline during the lookup, as a shutdown or a VPN change can
      resolve: async () => {
        online = false
        return '127.0.0.1'
      },
      bootstrap: ['router.example:6881'],
      onPeer: () => {},
      current: () => online,
    })
    expect(dht).toBeNull()
    // the DHT's view of the shared socket is let go; the socket itself belongs to the engine
    expect(krpc.closed).toBe(true)
    socket.close()
  })
})

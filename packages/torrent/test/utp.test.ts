// SPDX-License-Identifier: AGPL-3.0-only
// uTP (BEP 29) on its own and between two engines, clean and over a lossy, reordering link; the TCP
// fallback; the UDP demultiplexer. Loopback only.
import { afterEach, describe, expect, test } from 'bun:test'
import { randomBytes } from 'node:crypto'
import dgram from 'node:dgram'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createUdpMux, isKrpcMessage, isUtpPacket, type UdpSend } from '../src/udp.ts'
import {
  createUtp,
  decodePacket,
  encodePacket,
  ST_DATA,
  ST_STATE,
  ST_SYN,
  type UtpStream,
} from '../src/utp.ts'
import {
  LOOPBACK,
  lossyLink,
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

describe('the packet format', () => {
  test('a header and a selective ack round-trip, and the demultiplexer tells uTP from the DHT', () => {
    const sack = Uint8Array.from([0b0000_0101, 0, 0, 0])
    const buf = encodePacket({
      type: ST_STATE,
      connId: 0xbeef,
      timestamp: 123_456_789,
      timestampDiff: 4_000,
      wnd: 1 << 20,
      seq: 7,
      ack: 65_535,
      sack,
      payload: new Uint8Array(0),
    })
    // BEP 29: type in the high nibble, version 1 in the low one
    expect(buf[0]).toBe((ST_STATE << 4) | 1)
    expect(buf[1]).toBe(1)
    expect(buf.length).toBe(20 + 2 + 4)
    const p = decodePacket(buf)
    expect(p).toMatchObject({
      type: ST_STATE,
      connId: 0xbeef,
      timestamp: 123_456_789,
      timestampDiff: 4_000,
      wnd: 1 << 20,
      seq: 7,
      ack: 65_535,
    })
    expect([...(p?.sack ?? [])]).toEqual([...sack])

    const data = encodePacket({
      type: ST_DATA,
      connId: 1,
      timestamp: 0,
      timestampDiff: 0,
      wnd: 0,
      seq: 1,
      ack: 0,
      sack: null,
      payload: Buffer.from('hello'),
    })
    expect(Buffer.from(decodePacket(data)?.payload ?? []).toString()).toBe('hello')
    expect(isUtpPacket(data)).toBe(true)
    expect(isKrpcMessage(data)).toBe(false)
    const krpc = Buffer.from('d1:ad2:id20:aaaaaaaaaaaaaaaaaaaae1:q4:ping1:t2:aa1:y1:qe')
    expect(isKrpcMessage(krpc)).toBe(true)
    expect(isUtpPacket(krpc)).toBe(false)
    // version 2 or a type past ST_SYN isn't uTP
    const bad = Buffer.from(data)
    bad[0] = (ST_SYN << 4) | 2
    expect(isUtpPacket(bad)).toBe(false)
    bad[0] = (5 << 4) | 1
    expect(isUtpPacket(bad)).toBe(false)
  })
})

/** Two uTP endpoints on loopback UDP sockets, each through the demultiplexer. */
async function pair(wrap?: (send: UdpSend) => UdpSend) {
  const open = async () => {
    const socket = dgram.createSocket('udp4')
    await new Promise<void>((r) => socket.bind(0, '127.0.0.1', r))
    return socket
  }
  const [sa, sb] = [await open(), await open()]
  const accepted: UtpStream[] = []
  const end = (socket: dgram.Socket, onConnection: (s: UtpStream) => void) => {
    const mux = createUdpMux(socket, wrap)
    const utp = createUtp({ send: mux.send, accept: () => true, onConnection })
    mux.onUtp((buf, from) => utp.handle(buf, from))
    mux.onClose(() => utp.close())
    return utp
  }
  const a = end(sa, () => {})
  end(sb, (s) => accepted.push(s))
  cleanups.push(() => {
    sa.close()
    sb.close()
  })
  return { a, accepted, portB: sb.address().port }
}

/** Sends `size` bytes from a to b and returns what arrived. */
async function transfer(p: Awaited<ReturnType<typeof pair>>, size: number) {
  const data = randomBytes(size)
  const stream = p.a.connect('127.0.0.1', p.portB)
  await new Promise<void>((resolve, reject) => {
    stream.once('connect', resolve)
    stream.once('error', reject)
  })
  await until(() => p.accepted.length === 1, 2_000, 'the incoming stream')
  const incoming = p.accepted[0] as UtpStream
  const chunks: Buffer[] = []
  incoming.on('data', (c: Buffer) => chunks.push(c))
  const ended = new Promise<void>((r) => incoming.once('end', r))
  stream.end(data)
  await ended
  incoming.end()
  return { sent: data, got: Buffer.concat(chunks), stream, incoming }
}

describe('a uTP stream', () => {
  test('carries a megabyte in order and closes with FIN on both sides', async () => {
    const p = await pair()
    const { sent, got, stream, incoming } = await transfer(p, 1024 * 1024)
    expect(got.equals(sent)).toBe(true)
    await until(() => stream.destroyed && incoming.destroyed, 3_000, 'both sides to close')
  }, 15_000)

  test('carries it intact over a link that drops and reorders packets', async () => {
    const link = lossyLink({ seed: 29, loss: 0.03, reorder: 0.1 })
    const p = await pair(link.wrap)
    const { sent, got } = await transfer(p, 512 * 1024)
    expect(got.equals(sent)).toBe(true)
    // the link really did lose and reorder some
    expect(link.counts.dropped).toBeGreaterThan(5)
    expect(link.counts.delayed).toBeGreaterThan(5)
  }, 30_000)

  test('a connection to a port that refuses uTP fails fast with a reset', async () => {
    const socket = dgram.createSocket('udp4')
    await new Promise<void>((r) => socket.bind(0, '127.0.0.1', r))
    const refusing = createUdpMux(socket)
    const no = createUtp({ send: refusing.send, accept: () => false, onConnection: () => {} })
    refusing.onUtp((buf, from) => no.handle(buf, from))
    const p = await pair()
    cleanups.push(() => {
      socket.close()
    })
    const started = Date.now()
    const s = p.a.connect('127.0.0.1', socket.address().port)
    const err = await new Promise<unknown>((r) => {
      s.once('error', r)
      s.once('close', () => r(null))
    })
    expect(err).not.toBeUndefined()
    expect(Date.now() - started).toBeLessThan(1_000)
    no.close()
  })
})

async function seededEngine(
  files: { path: string; data: Uint8Array }[],
  announce: string[],
  name: string,
  options: Parameters<typeof testEngine>[0] = {},
) {
  const t = makeTorrent({ name, files, announce })
  const dir = tempDir('seed')
  writeFiles(dir, files)
  const a = testEngine(options)
  cleanups.push(() => a.engine.close())
  await a.engine.start()
  await a.engine.setBinding(LOOPBACK)
  const { id } = await a.engine.add({
    source: { torrent: t.torrent },
    savePath: dir,
    category: 'movies',
  })
  await until(() => a.engine.get(id).state === 'seeding', 10_000, 'the seeder')
  return { ...t, a, seedId: id }
}

describe('two engines over uTP', () => {
  test('download over uTP, and the peer list says so', async () => {
    const tracker = await startTracker()
    cleanups.push(() => tracker.close())
    const data = randomData(1_000_000)
    const { torrent, a, seedId } = await seededEngine(
      [{ path: 'Sintel.mkv', data }],
      [tracker.httpUrl],
      'Sintel.mkv',
    )
    const b = testEngine()
    cleanups.push(() => b.engine.close())
    await b.engine.start()
    await b.engine.setBinding(LOOPBACK)
    const dir = tempDir('leech')
    const { id } = await b.engine.add({ source: { torrent }, savePath: dir, category: 'movies' })
    let flags = ''
    await until(
      () => {
        const p = b.engine.peers(id)[0]
        if (p) flags = p.flags
        return b.engine.get(id).state === 'seeding'
      },
      20_000,
      'the download',
    )
    expect(readFileSync(join(dir, 'Sintel.mkv')).equals(Buffer.from(data))).toBe(true)
    expect(flags).toContain('P')
    // the stream went through the socket factory, from the binding's address
    const utp = b.sockets.filter((s) => s.kind === 'utp')
    expect(utp.length).toBeGreaterThan(0)
    expect(utp.every((s) => s.localAddress === '127.0.0.1')).toBe(true)
    expect(a.sockets.some((s) => s.kind === 'utp')).toBe(true)
    expect(b.sockets.some((s) => s.kind === 'connect' && s.remote !== null)).toBe(false)
    expect(a.engine.get(seedId).uploaded).toBeGreaterThan(0)
  }, 30_000)

  test('download over uTP on a link that drops and reorders packets both ways', async () => {
    const tracker = await startTracker()
    cleanups.push(() => tracker.close())
    const data = randomData(600_000)
    const seedLink = lossyLink({ seed: 7, loss: 0.02, reorder: 0.1 })
    const leechLink = lossyLink({ seed: 11, loss: 0.02, reorder: 0.1 })
    const { torrent } = await seededEngine(
      [{ path: 'Sintel.mkv', data }],
      [tracker.httpUrl],
      'Sintel.mkv',
      { udpWrap: seedLink.wrap },
    )
    const b = testEngine({ udpWrap: leechLink.wrap })
    cleanups.push(() => b.engine.close())
    await b.engine.start()
    await b.engine.setBinding(LOOPBACK)
    const dir = tempDir('leech')
    const { id } = await b.engine.add({ source: { torrent }, savePath: dir, category: 'movies' })
    await until(() => b.engine.get(id).state === 'seeding', 25_000, 'the download')
    expect(readFileSync(join(dir, 'Sintel.mkv')).equals(Buffer.from(data))).toBe(true)
    expect(b.sockets.some((s) => s.kind === 'utp')).toBe(true)
    expect(seedLink.counts.dropped + leechLink.counts.dropped).toBeGreaterThan(5)
  }, 35_000)

  test('with uTP off on the seeder, the leecher falls back to TCP', async () => {
    const tracker = await startTracker()
    cleanups.push(() => tracker.close())
    const data = randomData(300_000)
    const { torrent } = await seededEngine(
      [{ path: 'Sintel.mkv', data }],
      [tracker.httpUrl],
      'Sintel.mkv',
      { utp: false },
    )
    const b = testEngine()
    cleanups.push(() => b.engine.close())
    await b.engine.start()
    await b.engine.setBinding(LOOPBACK)
    const dir = tempDir('leech')
    const { id } = await b.engine.add({ source: { torrent }, savePath: dir, category: 'movies' })
    let flags: string | null = null
    await until(
      () => {
        const p = b.engine.peers(id)[0]
        if (p) flags = p.flags
        return b.engine.get(id).state === 'seeding'
      },
      20_000,
      'the download',
    )
    expect(readFileSync(join(dir, 'Sintel.mkv')).equals(Buffer.from(data))).toBe(true)
    expect(flags).not.toBeNull()
    expect(flags as unknown as string).not.toContain('P')
    expect(b.sockets.some((s) => s.kind === 'connect' && s.remote !== null)).toBe(true)
  }, 30_000)

  test('setUtp(false) sends new connections over TCP', async () => {
    const tracker = await startTracker()
    cleanups.push(() => tracker.close())
    const data = randomData(200_000)
    const { torrent } = await seededEngine(
      [{ path: 'Sintel.mkv', data }],
      [tracker.httpUrl],
      'Sintel.mkv',
    )
    const b = testEngine()
    cleanups.push(() => b.engine.close())
    b.engine.setUtp(false)
    expect(b.engine.utp()).toBe(false)
    await b.engine.start()
    await b.engine.setBinding(LOOPBACK)
    const dir = tempDir('leech')
    const { id } = await b.engine.add({ source: { torrent }, savePath: dir, category: 'movies' })
    await until(() => b.engine.get(id).state === 'seeding', 20_000, 'the download')
    expect(b.sockets.some((s) => s.kind === 'utp')).toBe(false)
  }, 30_000)
})

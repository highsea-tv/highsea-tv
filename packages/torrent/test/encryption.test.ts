// SPDX-License-Identifier: AGPL-3.0-only
// Protocol encryption (6b): RC4 against published vectors, the MSE handshake over loopback in every
// pairing of policies, and two engines downloading from each other under each combination of
// require, prefer and allow. Nothing leaves 127.0.0.1.
import { afterEach, describe, expect, test } from 'bun:test'
import { randomBytes } from 'node:crypto'
import net from 'node:net'
import Wire from 'bittorrent-protocol'
import {
  type Attempt,
  type EncryptionPolicy,
  firstAttempt,
  type Method,
  nextAttempt,
  type Secured,
  secureIncoming,
  secureOutgoing,
  selectFor,
} from '../src/mse.ts'
import { createRc4 } from '../src/rc4.ts'
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

const POLICIES: EncryptionPolicy[] = ['require', 'prefer', 'allow']
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex')

describe('RC4', () => {
  // the test vectors in RFC 6229's predecessor list, as Wikipedia's RC4 article gives them
  test('the published vectors, with nothing discarded', () => {
    const enc = (key: string, text: string) =>
      hex(createRc4(Buffer.from(key), 0).update(Buffer.from(text)))
    expect(enc('Key', 'Plaintext')).toBe('bbf316e8d940af0ad3')
    expect(enc('Wiki', 'pedia')).toBe('1021bf0420')
    expect(enc('Secret', 'Attack at dawn')).toBe('45a01f645fc35b383552544b9bf5')
  })

  test('MSE’s 1024 discarded bytes, and a stream split anywhere reads the same', () => {
    const key = randomBytes(20)
    const data = randomBytes(5000)
    const whole = createRc4(key).update(data)
    const skipped = createRc4(key, 0)
    skipped.update(new Uint8Array(1024))
    expect(hex(skipped.update(data))).toBe(hex(whole))
    const parts = createRc4(key)
    const split = Buffer.concat([parts.update(data.subarray(0, 7)), parts.update(data.subarray(7))])
    expect(split.equals(Buffer.from(whole))).toBe(true)
  })
})

describe('the policies', () => {
  test('first tries and fallbacks: prefer falls back to plaintext, allow to encrypted', () => {
    expect(firstAttempt('require')).toBe('encrypted')
    expect(firstAttempt('prefer')).toBe('encrypted')
    expect(firstAttempt('allow')).toBe('plain')
    expect(nextAttempt('require', 'encrypted')).toBeNull()
    expect(nextAttempt('prefer', 'encrypted')).toBe('plain')
    expect(nextAttempt('prefer', 'plain')).toBeNull()
    expect(nextAttempt('allow', 'plain')).toBe('encrypted')
    expect(nextAttempt('allow', 'encrypted')).toBeNull()
  })

  test('what B picks from what A offers', () => {
    expect(selectFor('require', 0x03)).toBe(0x02)
    expect(selectFor('require', 0x01)).toBe(0)
    expect(selectFor('prefer', 0x03)).toBe(0x02)
    expect(selectFor('prefer', 0x01)).toBe(0x01)
    expect(selectFor('allow', 0x03)).toBe(0x01)
    expect(selectFor('allow', 0x02)).toBe(0x02)
  })
})

/** A connected pair of sockets on loopback. */
async function pair(): Promise<{ a: net.Socket; b: net.Socket }> {
  const server = net.createServer()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const port = (server.address() as net.AddressInfo).port
  const accepted = new Promise<net.Socket>((r) => server.once('connection', r))
  const a = net.connect({ host: '127.0.0.1', port })
  const b = await accepted
  await new Promise<void>((r) => (a.connecting ? a.once('connect', () => r()) : r()))
  server.close()
  cleanups.push(() => {
    a.destroy()
    b.destroy()
  })
  return { a, b }
}

/** Sends `data` one way and collects it on the other. */
function carry(
  from: NodeJS.WritableStream,
  to: NodeJS.ReadableStream,
  data: Uint8Array,
  length = data.length,
) {
  return new Promise<Buffer>((resolve) => {
    const got: Buffer[] = []
    let n = 0
    to.on('data', (c: Buffer) => {
      got.push(c)
      n += c.length
      if (n >= length) resolve(Buffer.concat(got))
    })
    // a handshake leaves the stream paused, as the wire's pipe expects
    to.resume()
    from.write(Buffer.from(data))
  })
}

describe('the MSE handshake on loopback', () => {
  const infoHash = randomBytes(20).toString('hex')
  const others = [randomBytes(20).toString('hex'), randomBytes(20).toString('hex')]

  // every outgoing policy and first try against every incoming policy
  const cases: {
    out: EncryptionPolicy
    attempt: Attempt
    in: EncryptionPolicy
    expect: Method | 'refused'
  }[] = []
  for (const out of POLICIES)
    for (const attempt of ['encrypted', 'plain'] as const)
      for (const inPolicy of POLICIES) {
        if (out === 'require' && attempt === 'plain') continue
        let expected: Method | 'refused'
        if (attempt === 'plain') expected = inPolicy === 'require' ? 'refused' : 'plain'
        else if (out === 'require' || inPolicy === 'require') expected = 'rc4'
        else expected = inPolicy === 'prefer' ? 'rc4' : 'obfuscated'
        cases.push({ out, attempt, in: inPolicy, expect: expected })
      }

  for (const c of cases)
    test(`${c.out} (${c.attempt}) to ${c.in}: ${c.expect}`, async () => {
      const { a, b } = await pair()
      const outgoing = secureOutgoing(a, infoHash, c.attempt, c.out, 5_000)
      const incoming = secureIncoming(b, c.in, () => [...others, infoHash], 5_000)
      if (c.attempt === 'plain') {
        // a plain connection starts with the BitTorrent handshake: the wire's job, played here
        const header = Buffer.concat([Buffer.from([19]), Buffer.from('BitTorrent protocol')])
        a.write(Buffer.concat([header, Buffer.alloc(48, 7)]))
      }
      if (c.expect === 'refused') {
        await expect(incoming).rejects.toThrow('encryption is required')
        await outgoing
        await until(() => a.destroyed || a.readableEnded, 5_000, 'the hang-up')
        return
      }
      const [o, i] = (await Promise.all([outgoing, incoming])) as [Secured, Secured]
      expect(i.method).toBe(c.expect)
      if (c.attempt === 'encrypted') {
        expect(o.method).toBe(c.expect)
        expect(i.infoHash).toBe(infoHash)
      }
      // bytes cross both ways intact, whatever the method; plain kept the handshake in front
      const there = randomData(200_000)
      const back = randomData(150_000)
      const expected =
        c.attempt === 'plain'
          ? Buffer.concat([
              Buffer.from([19]),
              Buffer.from('BitTorrent protocol'),
              Buffer.alloc(48, 7),
              there,
            ])
          : Buffer.from(there)
      const got = await carry(o.stream, i.stream, there, expected.length)
      expect(got.equals(expected)).toBe(true)
      expect((await carry(i.stream, o.stream, back)).equals(Buffer.from(back))).toBe(true)
      // on the wire itself, RC4 hides the payload
      if (c.expect === 'rc4') {
        const seen: Buffer[] = []
        b.on('data', (d: Buffer) => seen.push(d))
        const marker = Buffer.from('highsea-marker-'.repeat(20))
        await carry(o.stream, i.stream, marker)
        expect(Buffer.concat(seen).includes(marker)).toBe(false)
      }
    })

  test('a torrent B doesn’t have is refused', async () => {
    const { a, b } = await pair()
    const outgoing = secureOutgoing(a, infoHash, 'encrypted', 'prefer', 5_000)
    const incoming = secureIncoming(b, 'prefer', () => others, 5_000)
    await expect(incoming).rejects.toThrow('doesn’t have')
    await expect(outgoing).rejects.toThrow()
  })

  test('a peer that answers with nonsense gives up within the deadline', async () => {
    const { a, b } = await pair()
    const outgoing = secureOutgoing(a, infoHash, 'encrypted', 'prefer', 1_000)
    b.write(randomBytes(96 + 600))
    await expect(outgoing).rejects.toThrow()
    expect(a.destroyed).toBe(true)
  })
})

// --------------------------------------------------------------------- two engines

async function swarmOf(seedPolicy: EncryptionPolicy, leechPolicy: EncryptionPolicy) {
  const tracker = await startTracker()
  cleanups.push(() => tracker.close())
  const data = randomData(300_000)
  const files = [{ path: 'Sintel.mkv', data }]
  const t = makeTorrent({ name: 'Sintel.mkv', files, announce: [tracker.httpUrl] })
  const seedDir = tempDir('seed')
  writeFiles(seedDir, files)
  const a = testEngine({ encryption: seedPolicy })
  cleanups.push(() => a.engine.close())
  await a.engine.start()
  await a.engine.setBinding(LOOPBACK)
  const seed = await a.engine.add({
    source: { torrent: t.torrent },
    savePath: seedDir,
    category: 'movies',
  })
  await until(() => a.engine.get(seed.id).state === 'seeding', 10_000, 'the seeder')
  const b = testEngine({ encryption: leechPolicy })
  cleanups.push(() => b.engine.close())
  await b.engine.start()
  await b.engine.setBinding(LOOPBACK)
  const leech = await b.engine.add({
    source: { torrent: t.torrent },
    savePath: tempDir('leech'),
    category: 'movies',
  })
  return { a, b, seedId: seed.id, leechId: leech.id }
}

describe('two engines, each pairing of policies', () => {
  for (const seedPolicy of POLICIES)
    for (const leechPolicy of POLICIES)
      test(`seeder ${seedPolicy}, downloader ${leechPolicy}`, async () => {
        const { a, b, seedId, leechId } = await swarmOf(seedPolicy, leechPolicy)
        // what the connections look like while they're open: every flag, on both sides
        const flags: string[] = []
        await until(
          () => {
            for (const p of b.engine.peers(leechId)) flags.push(p.flags)
            for (const p of a.engine.peers(seedId)) flags.push(p.flags)
            return b.engine.get(leechId).state === 'seeding'
          },
          20_000,
          'the download',
        )
        expect(flags.length).toBeGreaterThan(0)
        const encrypted = (f: string) => f.includes('E')
        const plain = (f: string) => !f.includes('E') && !f.includes('e')
        if (seedPolicy === 'require' || leechPolicy === 'require')
          expect(flags.every(encrypted)).toBe(true)
        else if (seedPolicy === 'prefer' && leechPolicy === 'prefer')
          expect(flags.every(encrypted)).toBe(true)
        else if (seedPolicy === 'allow' && leechPolicy === 'allow')
          expect(flags.every(plain)).toBe(true)
      }, 30_000)
})

test('a peer that won’t encrypt is refused under require', async () => {
  const { a, seedId } = await swarmOf('require', 'require')
  const infoHash = a.engine.get(seedId).infoHash
  const socket = net.connect({ host: '127.0.0.1', port: a.port })
  cleanups.push(() => {
    socket.destroy()
  })
  const wire = new Wire()
  socket.pipe(wire).pipe(socket)
  let answered = false
  wire.on('handshake', () => {
    answered = true
  })
  wire.handshake(infoHash, randomBytes(20).toString('hex'), { dht: false })
  await until(() => socket.destroyed || socket.readableEnded, 5_000, 'the hang-up')
  expect(answered).toBe(false)
  expect(a.engine.peers(seedId).every((p) => p.flags.includes('E'))).toBe(true)
}, 20_000)

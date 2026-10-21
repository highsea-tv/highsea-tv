// SPDX-License-Identifier: AGPL-3.0-only
// Protocol encryption: Message Stream Encryption (MSE, also called PE), as the community
// specification describes it (https://wiki.vuze.com/w/Message_Stream_Encryption; no BEP covers it).
// It sits below the peer wire as a layer over any duplex (a TCP socket today, a uTP stream with
// 6b's uTP), so the wire never knows whether its bytes are encrypted.
//
// The handshake, A connecting to B:
//   1 A→B  Ya, PadA
//   2 B→A  Yb, PadB
//   3 A→B  HASH('req1', S), HASH('req2', SKEY) xor HASH('req3', S),
//          ENCRYPT(VC, crypto_provide, len(PadC), PadC, len(IA)), ENCRYPT(IA)
//   4 B→A  ENCRYPT(VC, crypto_select, len(PadD), PadD), ENCRYPT2(payload)
//   5 A→B  ENCRYPT2(payload)
// Ya and Yb are Diffie-Hellman public keys over the specification's 768-bit prime with generator 2
// and 160-bit private keys, 96 bytes each. S is the shared secret, SKEY the torrent's info hash,
// HASH is SHA-1, VC eight zero bytes. ENCRYPT is RC4 keyed with HASH('keyA', S, SKEY) from A and
// HASH('keyB', S, SKEY) from B, its first 1024 bytes discarded; ENCRYPT2 is the selected method:
// RC4 (0x02), or plaintext (0x01) after the obfuscated header. B finds where PadA ends by searching
// for HASH('req1', S); A finds where PadB ends by searching for ENCRYPT(VC). Pads are at most 512.
//
// Diffie-Hellman is Node's (https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptocreatediffiehellmanprime-primeencoding-generator-generatorencoding);
// RC4 is ours (rc4.ts), because Node 24's OpenSSL 3 keeps it in the legacy provider.
import { createDiffieHellman, createHash, randomBytes, randomInt } from 'node:crypto'
import { Duplex } from 'node:stream'
import { createRc4, type Rc4 } from './rc4.ts'

/** Settings › Download client's encryption (settings.md). */
export type EncryptionPolicy = 'require' | 'prefer' | 'allow'
/** How one outgoing connection opens: the MSE handshake, or a plain BitTorrent handshake. */
export type Attempt = 'encrypted' | 'plain'
/** What a connection ended up as: RC4 throughout, an MSE header then plaintext, or no MSE. */
export type Method = 'rc4' | 'obfuscated' | 'plain'

export type Secured = {
  stream: Duplex
  method: Method
  /** The torrent the MSE handshake named (incoming); null for a plain handshake. */
  infoHash: string | null
}

const PRIME =
  'ffffffffffffffffc90fdaa22168c234c4c6628b80dc1cd129024e088a67cc74020bbea63b139b22514a08798e3404ddef9519b3cd3a431b302b0a6df25f14374fe1356d6d51c245e485b576625e7ec6f44c42e9a63a36210000000000090563'
const KEY_BYTES = 96
const MAX_PAD = 512
const VC = new Uint8Array(8)
const PLAINTEXT = 0x01
const RC4 = 0x02
const PROTOCOL = Buffer.concat([Buffer.from([19]), Buffer.from('BitTorrent protocol')])
/** The whole handshake, both ways, within this long; the engine's own handshake timer is longer. */
export const MSE_TIMEOUT_MS = 20_000

/** The first try: plaintext only when the policy is allow (settings.md). */
export const firstAttempt = (policy: EncryptionPolicy): Attempt =>
  policy === 'allow' ? 'plain' : 'encrypted'

/**
 * After a failed first try: prefer falls back to plaintext and allow to encrypted; require never
 * falls back. After the second try there's nothing left.
 */
export function nextAttempt(policy: EncryptionPolicy, tried: Attempt): Attempt | null {
  if (policy === 'require' || tried !== firstAttempt(policy)) return null
  return tried === 'plain' ? 'encrypted' : 'plain'
}

/** What we offer in step 3: RC4 only under require, else both. */
const provideFor = (policy: EncryptionPolicy) => (policy === 'require' ? RC4 : RC4 | PLAINTEXT)

/** What B picks from A's offer: require takes RC4 only, prefer RC4 first, allow plaintext first. */
export function selectFor(policy: EncryptionPolicy, provide: number): number {
  if (policy === 'require') return provide & RC4
  if (policy === 'prefer') return provide & RC4 || provide & PLAINTEXT
  return provide & PLAINTEXT || provide & RC4
}

const sha1 = (...parts: Uint8Array[]) => {
  const h = createHash('sha1')
  for (const p of parts) h.update(p)
  return h.digest()
}
const text = (s: string) => Buffer.from(s, 'latin1')
const u16 = (n: number) => {
  const b = Buffer.alloc(2)
  b.writeUInt16BE(n)
  return b
}
const u32 = (n: number) => {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n >>> 0)
  return b
}
const pad96 = (b: Uint8Array) => {
  if (b.length >= KEY_BYTES) return Buffer.from(b)
  const out = Buffer.alloc(KEY_BYTES)
  out.set(b, KEY_BYTES - b.length)
  return out
}
const xor = (a: Uint8Array, b: Uint8Array) => {
  const out = Buffer.alloc(a.length)
  for (let i = 0; i < a.length; i++) out[i] = (a[i] as number) ^ (b[i] as number)
  return out
}
const randomPad = () => randomBytes(randomInt(0, MAX_PAD + 1))

/** Our Diffie-Hellman half: a 160-bit private key, as the specification recommends. */
function keyPair() {
  const dh = createDiffieHellman(PRIME, 'hex', 2)
  dh.setPrivateKey(randomBytes(20))
  const pub = pad96(dh.generateKeys())
  return { pub, secret: (other: Uint8Array) => pad96(dh.computeSecret(other)) }
}

const ciphers = (s: Uint8Array, skey: Uint8Array) => ({
  a: createRc4(sha1(text('keyA'), s, skey)),
  b: createRc4(sha1(text('keyB'), s, skey)),
})

/** Reads the handshake off a duplex: exact lengths, and the two searches for where a pad ends. */
function reader(raw: Duplex) {
  let buf: Buffer = Buffer.alloc(0)
  let wake: (() => void) | null = null
  let failed: Error | null = null
  const onData = (d: Buffer) => {
    buf = buf.length ? Buffer.concat([buf, d]) : d
    wake?.()
  }
  const onEnd = () => {
    failed ??= new Error('The peer hung up during the encryption handshake.')
    wake?.()
  }
  raw.on('data', onData)
  raw.once('end', onEnd)
  raw.once('close', onEnd)
  raw.on('error', onEnd)
  const wait = () => {
    if (failed) throw failed
    return new Promise<void>((r) => {
      wake = () => {
        wake = null
        r()
      }
    })
  }
  const take = (n: number) => {
    const out = buf.subarray(0, n)
    buf = buf.subarray(n)
    return out
  }
  return {
    async read(n: number): Promise<Buffer> {
      while (buf.length < n) await wait()
      return take(n)
    },
    /** Skips up to `maxSkip` bytes to just past `pattern`. */
    async sync(pattern: Uint8Array, maxSkip: number): Promise<void> {
      for (;;) {
        const i = buf.indexOf(pattern)
        if (i >= 0 && i <= maxSkip) {
          take(i + pattern.length)
          return
        }
        if (buf.length >= maxSkip + pattern.length)
          throw new Error('The peer’s encryption handshake didn’t line up.')
        await wait()
      }
    },
    /** Stops reading and hands back what arrived past the handshake. */
    release(): Buffer {
      raw.off('data', onData)
      raw.off('end', onEnd)
      raw.off('close', onEnd)
      raw.off('error', onEnd)
      raw.pause()
      return buf
    },
  }
}

/**
 * The RC4 payload stream over `raw`: `head` first (bytes that came with the handshake, already
 * decrypted), then everything after, through RC4 both ways.
 */
export function wrapStream(
  raw: Duplex,
  head: Uint8Array,
  ciphers: { encrypt: Rc4; decrypt: Rc4 },
): Duplex {
  const out = new Duplex({
    read() {
      raw.resume()
    },
    write(chunk: Buffer, _encoding, callback) {
      if (raw.destroyed) return callback()
      raw.write(ciphers.encrypt.update(chunk), () => callback())
    },
    final(callback) {
      raw.end()
      callback()
    },
    destroy(err, callback) {
      if (!raw.destroyed) raw.destroy()
      callback(err)
    },
  })
  out.on('error', () => {})
  raw.on('error', () => {})
  if (head.length) out.push(Buffer.from(head))
  raw.on('data', (d: Buffer) => {
    if (!out.push(Buffer.from(ciphers.decrypt.update(d)))) raw.pause()
  })
  raw.once('end', () => out.push(null))
  raw.once('close', () => out.destroy())
  raw.resume()
  return out
}

/** A plaintext payload: what came with the handshake goes back in front, and the stream is `raw`. */
function plainStream(raw: Duplex, head: Uint8Array): Duplex {
  if (head.length) raw.unshift(Buffer.from(head))
  return raw
}

/** Gives up on the whole handshake after `ms`: the peer is too slow or isn't speaking MSE. */
async function within<T>(raw: Duplex, ms: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          raw.destroy()
          reject(new Error('The encryption handshake took too long.'))
        }, ms)
        timer.unref?.()
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Opens an outgoing connection's stream. `plain` hands back `raw` as it is; `encrypted` runs the
 * MSE handshake as A and fails if the peer doesn't finish it or picks what the policy refuses.
 */
export async function secureOutgoing(
  raw: Duplex,
  infoHash: string,
  attempt: Attempt,
  policy: EncryptionPolicy,
  timeoutMs = MSE_TIMEOUT_MS,
): Promise<Secured> {
  if (attempt === 'plain') return { stream: raw, method: 'plain', infoHash: null }
  const r = reader(raw)
  const handshake = async (): Promise<Secured> => {
    const skey = Buffer.from(infoHash, 'hex')
    const me = keyPair()
    raw.write(Buffer.concat([me.pub, randomPad()]))
    const s = me.secret(await r.read(KEY_BYTES))
    const { a, b } = ciphers(s, skey)
    const provide = provideFor(policy)
    raw.write(
      Buffer.concat([
        sha1(text('req1'), s),
        xor(sha1(text('req2'), skey), sha1(text('req3'), s)),
        // VC, crypto_provide, len(PadC) = 0, len(IA) = 0: our handshake goes after, in ENCRYPT2
        a.update(Buffer.concat([VC, u32(provide), u16(0), u16(0)])),
      ]),
    )
    // B's VC, encrypted, marks where PadB ends: the same keystream from a second cipher finds it
    await r.sync(ciphers(s, skey).b.update(VC), MAX_PAD)
    b.update(VC)
    const header = Buffer.from(b.update(await r.read(6)))
    const select = header.readUInt32BE(0)
    if ((select !== RC4 && select !== PLAINTEXT) || !(select & provide))
      throw new Error('The peer picked an encryption method highsea didn’t offer.')
    const padD = header.readUInt16BE(4)
    if (padD > MAX_PAD) throw new Error('The peer’s encryption padding is too long.')
    b.update(await r.read(padD))
    const rest = r.release()
    if (select === RC4)
      return {
        stream: wrapStream(raw, b.update(rest), { encrypt: a, decrypt: b }),
        method: 'rc4',
        infoHash,
      }
    return { stream: plainStream(raw, rest), method: 'obfuscated', infoHash }
  }
  try {
    return await within(raw, timeoutMs, handshake())
  } catch (e) {
    r.release()
    raw.destroy()
    throw e
  }
}

/**
 * Takes an incoming connection: a plain BitTorrent handshake (refused under require), or the MSE
 * handshake as B, for any torrent in `infoHashes`.
 */
export async function secureIncoming(
  raw: Duplex,
  policy: EncryptionPolicy,
  infoHashes: () => Iterable<string>,
  timeoutMs = MSE_TIMEOUT_MS,
): Promise<Secured> {
  const r = reader(raw)
  const handshake = async (): Promise<Secured> => {
    const first = await r.read(PROTOCOL.length)
    if (first.equals(PROTOCOL)) {
      if (policy === 'require')
        throw new Error('The peer didn’t encrypt, and encryption is required.')
      return {
        stream: plainStream(raw, Buffer.concat([first, r.release()])),
        method: 'plain',
        infoHash: null,
      }
    }
    const ya = Buffer.concat([first, await r.read(KEY_BYTES - first.length)])
    const me = keyPair()
    const s = me.secret(ya)
    raw.write(Buffer.concat([me.pub, randomPad()]))
    await r.sync(sha1(text('req1'), s), MAX_PAD)
    const named = xor(await r.read(20), sha1(text('req3'), s))
    let infoHash: string | null = null
    for (const h of infoHashes())
      if (sha1(text('req2'), Buffer.from(h, 'hex')).equals(named)) {
        infoHash = h
        break
      }
    if (!infoHash) throw new Error('The peer asked for a torrent highsea doesn’t have.')
    const skey = Buffer.from(infoHash, 'hex')
    const { a, b } = ciphers(s, skey)
    const header = Buffer.from(a.update(await r.read(14)))
    if (!header.subarray(0, 8).equals(VC)) throw new Error('The peer’s encryption didn’t verify.')
    const provide = header.readUInt32BE(8)
    const padC = header.readUInt16BE(12)
    if (padC > MAX_PAD) throw new Error('The peer’s encryption padding is too long.')
    a.update(await r.read(padC))
    const iaLength = Buffer.from(a.update(await r.read(2))).readUInt16BE(0)
    // IA is always RC4: A sends it before it knows what B will pick
    const ia = a.update(await r.read(iaLength))
    const select = selectFor(policy, provide)
    if (!select) throw new Error('The peer offered no encryption method highsea accepts.')
    raw.write(b.update(Buffer.concat([VC, u32(select), u16(0)])))
    const rest = r.release()
    if (select === RC4)
      return {
        stream: wrapStream(raw, Buffer.concat([ia, a.update(rest)]), { encrypt: b, decrypt: a }),
        method: 'rc4',
        infoHash,
      }
    return {
      stream: plainStream(raw, Buffer.concat([ia, rest])),
      method: 'obfuscated',
      infoHash,
    }
  }
  try {
    return await within(raw, timeoutMs, handshake())
  } catch (e) {
    r.release()
    raw.destroy()
    throw e
  }
}

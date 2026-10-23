// SPDX-License-Identifier: AGPL-3.0-only
// A throwaway self-signed certificate for tests, made at test time so no private key is ever
// committed. A minimal X.509 v3 certificate (RFC 5280 § 4.1) in DER (X.690), signed with ECDSA
// P-256 and SHA-256 (RFC 5758 § 3.2), with a subjectAltName for `localhost` and 127.0.0.1.
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto'

const len = (n: number) =>
  n < 128
    ? Buffer.from([n])
    : n < 256
      ? Buffer.from([0x81, n])
      : Buffer.from([0x82, n >> 8, n & 255])
const tlv = (tag: number, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts)
  return Buffer.concat([Buffer.from([tag]), len(body.length), body])
}
const seq = (...parts: Buffer[]) => tlv(0x30, ...parts)
const set = (...parts: Buffer[]) => tlv(0x31, ...parts)
const oid = (dotted: string) => {
  const [a = 0, b = 0, ...rest] = dotted.split('.').map(Number)
  const bytes = [40 * a + b]
  for (const n of rest) {
    const chunk = [n & 0x7f]
    for (let v = n >> 7; v > 0; v >>= 7) chunk.unshift((v & 0x7f) | 0x80)
    bytes.push(...chunk)
  }
  return tlv(0x06, Buffer.from(bytes))
}
const utf8 = (s: string) => tlv(0x0c, Buffer.from(s, 'utf8'))
const time = (d: Date) =>
  tlv(0x17, Buffer.from(`${d.toISOString().replace(/[-:T]/g, '').slice(2, 14)}Z`))
const integer = (b: Buffer) =>
  tlv(0x02, (b[0] as number) & 0x80 ? Buffer.concat([Buffer.from([0]), b]) : b)

export function selfSigned(commonName = 'localhost'): { cert: string; key: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const ecdsaSha256 = seq(oid('1.2.840.10045.4.3.2'))
  const name = seq(set(seq(oid('2.5.4.3'), utf8(commonName))))
  const now = Date.now()
  const san = seq(
    oid('2.5.29.17'),
    tlv(0x04, seq(tlv(0x82, Buffer.from('localhost')), tlv(0x87, Buffer.from([127, 0, 0, 1])))),
  )
  const tbs = seq(
    tlv(0xa0, integer(Buffer.from([2]))),
    integer(randomBytes(8)),
    ecdsaSha256,
    name,
    seq(time(new Date(now - 60_000)), time(new Date(now + 86_400_000))),
    name,
    publicKey.export({ format: 'der', type: 'spki' }),
    tlv(0xa3, seq(san)),
  )
  const signature = sign('sha256', tbs, privateKey)
  const der = seq(tbs, ecdsaSha256, tlv(0x03, Buffer.concat([Buffer.from([0]), signature])))
  const pem = (label: string, b: Buffer) =>
    `-----BEGIN ${label}-----\n${b
      .toString('base64')
      .match(/.{1,64}/g)
      ?.join('\n')}\n-----END ${label}-----\n`
  return {
    cert: pem('CERTIFICATE', der),
    key: privateKey.export({ format: 'pem', type: 'pkcs8' }) as string,
  }
}

// SPDX-License-Identifier: AGPL-3.0-only
// The throwaway test certificate's serial number. It once came straight from 8 random bytes, so
// about 1 in 512 began with 0x00 and then a byte under 0x80, which isn't minimal DER (X.690
// § 8.3.2): BoringSSL rejected the certificate (`INVALID_INTEGER`), OpenSSL too (`illegal padding`).
import { describe, expect, test } from 'bun:test'
import { randomBytes, X509Certificate } from 'node:crypto'
import { createSecureContext } from 'node:tls'
import { integer, selfSigned, serialNumber } from './self-signed.ts'

/** Every first byte, each with a few random tails: 256 × 8 = 2,048 serials. */
const serials = Array.from({ length: 256 }, (_, first) =>
  Array.from({ length: 8 }, () => Buffer.concat([Buffer.from([first]), randomBytes(7)])),
).flat()

const value = (hex: string) => BigInt(`0x${hex}`)

describe('test certificate serial numbers', () => {
  test('encodes integers in minimal DER', () => {
    expect(integer(Buffer.from([0x00, 0x12]))).toEqual(Buffer.from([0x02, 0x01, 0x12]))
    expect(integer(Buffer.from([0x00, 0x00, 0x92]))).toEqual(Buffer.from([0x02, 0x02, 0x00, 0x92]))
    expect(integer(Buffer.from([0x92]))).toEqual(Buffer.from([0x02, 0x02, 0x00, 0x92]))
    expect(integer(Buffer.from([0x00]))).toEqual(Buffer.from([0x02, 0x01, 0x00]))
    expect(integer(Buffer.from([0x12, 0x00]))).toEqual(Buffer.from([0x02, 0x02, 0x12, 0x00]))
  })

  test('every serial is positive, 8 bytes and needs no padding', () => {
    for (const raw of serials) {
      const serial = serialNumber(raw)
      expect(serial.length).toBe(8)
      expect(serial[0]).toBeGreaterThanOrEqual(0x40)
      expect(serial[0]).toBeLessThanOrEqual(0x7f)
      expect(raw.length).toBe(8) // the caller's bytes are left alone
    }
  })

  test('a certificate with each serial parses, including the 0x00-first ones that failed', () => {
    let parsed = 0
    for (const raw of serials) {
      // the raw bytes straight in (the encoding's fix) and through serialNumber (the generator's)
      for (const serial of [raw, serialNumber(raw)]) {
        if (serial.every((b) => b === 0)) continue // zero isn't a positive serial (RFC 5280)
        const { cert } = selfSigned('localhost', serial)
        expect(value(new X509Certificate(cert).serialNumber)).toBe(value(serial.toString('hex')))
        parsed++
      }
    }
    expect(parsed).toBe(serials.length * 2)
  })

  test('the default certificate loads into a TLS context', () => {
    for (let i = 0; i < 32; i++) {
      const { cert, key } = selfSigned()
      expect(() => createSecureContext({ cert, key })).not.toThrow()
    }
  })
})

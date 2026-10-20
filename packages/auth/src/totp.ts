// SPDX-License-Identifier: AGPL-3.0-only
// TOTP (RFC 6238) over HOTP (RFC 4226): HMAC-SHA1, 6 digits, 30-second steps, which is what
// authenticator apps implement and what RFC 6238 recommends as the default step. One step either
// side is accepted for clock drift; the caller refuses a step it has already accepted, so a code
// works once (OWASP MFA Cheat Sheet: "Ensure OTPs are single use").
import { createHmac, randomBytes } from 'node:crypto'

export const TOTP_STEP_SECONDS = 30
export const TOTP_DIGITS = 6
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const i = BASE32.indexOf(ch)
    if (i === -1) throw new Error('Not base32.')
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** A new secret: 20 bytes, the HMAC-SHA1 output length RFC 4226 § 4 recommends. */
export const newTotpSecret = () => base32Encode(randomBytes(20))

/** RFC 4226 § 5.3: HMAC, dynamic truncation, modulo 10^digits. */
export function hotp(
  secret: Uint8Array,
  counter: number,
  digits = TOTP_DIGITS,
  algorithm: 'sha1' | 'sha256' | 'sha512' = 'sha1',
): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const mac = createHmac(algorithm, secret).update(msg).digest()
  const offset = (mac[mac.length - 1] as number) & 0xf
  const code =
    (((mac[offset] as number) & 0x7f) << 24) |
    ((mac[offset + 1] as number) << 16) |
    ((mac[offset + 2] as number) << 8) |
    (mac[offset + 3] as number)
  return String(code % 10 ** digits).padStart(digits, '0')
}

export const totpStep = (ms: number) => Math.floor(ms / 1000 / TOTP_STEP_SECONDS)

/**
 * The step `code` belongs to, within one step of `now`, or null. Steps at or before `lastStep`
 * are refused: each code is accepted once.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  now: number,
  lastStep = 0,
): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const secret = base32Decode(secretBase32)
  const current = totpStep(now)
  for (const step of [current - 1, current, current + 1])
    if (step > lastStep && hotp(secret, step) === code) return step
  return null
}

/** The enrolment URI authenticator apps read from the QR code (the Key Uri Format). */
export function otpauthUri({
  secret,
  account,
  issuer,
}: {
  secret: string
  account: string
  issuer: string
}): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  })
  return `otpauth://totp/${label}?${params}`
}

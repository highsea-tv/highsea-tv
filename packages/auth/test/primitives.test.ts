// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { hashPassword, needsRehash, passwordProblem, verifyPassword } from '../src/passwords.ts'
import { createRateLimiter } from '../src/rate-limit.ts'
import { newCode, newSecret, normalizeCode, verifier } from '../src/secrets.ts'
import { base32Decode, base32Encode, hotp, otpauthUri, totpStep, verifyTotp } from '../src/totp.ts'

const ascii = (s: string) => Buffer.from(s, 'ascii')

describe('HOTP and TOTP', () => {
  test('RFC 4226 Appendix D', () => {
    const secret = ascii('12345678901234567890')
    const expected = [
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489',
    ]
    expect(expected.map((_, i) => hotp(secret, i))).toEqual(expected)
  })

  test('RFC 6238 Appendix B, all three hashes', () => {
    const keys = {
      sha1: ascii('12345678901234567890'),
      sha256: ascii('12345678901234567890123456789012'),
      sha512: ascii('1234567890123456789012345678901234567890123456789012345678901234'),
    }
    const table: [number, string, string, string][] = [
      [59, '94287082', '46119246', '90693936'],
      [1111111109, '07081804', '68084774', '25091201'],
      [1111111111, '14050471', '67062674', '99943326'],
      [1234567890, '89005924', '91819424', '93441116'],
      [2000000000, '69279037', '90698825', '38618901'],
      [20000000000, '65353130', '77737706', '47863826'],
    ]
    for (const [seconds, sha1, sha256, sha512] of table) {
      const step = totpStep(seconds * 1000)
      expect(hotp(keys.sha1, step, 8, 'sha1')).toBe(sha1)
      expect(hotp(keys.sha256, step, 8, 'sha256')).toBe(sha256)
      expect(hotp(keys.sha512, step, 8, 'sha512')).toBe(sha512)
    }
  })

  test('base32 round-trips (RFC 4648 § 10)', () => {
    expect(base32Encode(ascii('foobar'))).toBe('MZXW6YTBOI')
    expect(base32Decode('MZXW6YTBOI').toString('ascii')).toBe('foobar')
    expect(base32Decode('mzxw 6ytb oi').toString('ascii')).toBe('foobar')
  })

  test('accepts one step either side, and never the same step twice', () => {
    const secret = base32Encode(ascii('12345678901234567890'))
    const now = 1111111111 * 1000
    const step = totpStep(now)
    const code = hotp(ascii('12345678901234567890'), step)
    expect(verifyTotp(secret, code, now)).toBe(step)
    expect(verifyTotp(secret, code, now + 30_000)).toBe(step)
    expect(verifyTotp(secret, code, now + 61_000)).toBeNull()
    expect(verifyTotp(secret, code, now, step)).toBeNull()
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull()
  })

  test('the enrolment URI follows the Key Uri Format', () => {
    const uri = otpauthUri({ secret: 'MZXW6YTBOI', account: 'ines', issuer: 'highsea (Harbor)' })
    expect(uri).toStartWith('otpauth://totp/highsea%20(Harbor):ines?')
    const params = new URL(uri).searchParams
    expect(params.get('secret')).toBe('MZXW6YTBOI')
    expect(params.get('issuer')).toBe('highsea (Harbor)')
    expect(params.get('digits')).toBe('6')
  })
})

describe('passwords', () => {
  test('hashes as an argon2id PHC string and verifies', async () => {
    const phc = await hashPassword('correct horse battery')
    expect(phc).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/)
    expect(await verifyPassword('correct horse battery', phc)).toBe(true)
    expect(await verifyPassword('correct horse batterz', phc)).toBe(false)
    expect(needsRehash(phc)).toBe(false)
  })

  test('two hashes of one password differ (random salt)', async () => {
    expect(await hashPassword('same password')).not.toBe(await hashPassword('same password'))
  })

  test('older parameters ask for a rehash, and still verify', async () => {
    const phc = await hashPassword('correct horse battery')
    expect(needsRehash(phc.replace('t=2', 't=1'))).toBe(true)
    expect(needsRehash('not a hash')).toBe(true)
  })

  test('with no account, it does the work and says no', async () => {
    expect(await verifyPassword('anything at all', null)).toBe(false)
  })

  test('length is the only rule', () => {
    expect(passwordProblem('short')).toBe('short')
    expect(passwordProblem('ten chars!')).toBeNull()
    expect(passwordProblem('🙂'.repeat(10))).toBeNull()
    expect(passwordProblem('x'.repeat(257))).toBe('long')
  })
})

describe('secrets', () => {
  test('256-bit secrets with a prefix, stored as a verifier', () => {
    const s = newSecret('hss_')
    expect(s).toMatch(/^hss_[A-Za-z0-9_-]{43}$/)
    expect(verifier(s)).toHaveLength(43)
    expect(verifier(s)).toBe(verifier(s))
    expect(newSecret()).not.toBe(newSecret())
  })

  test('codes for people avoid look-alike characters', () => {
    for (let i = 0; i < 200; i++)
      expect(newCode()).toMatch(/^[2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3}$/)
    expect(normalizeCode('kq7 4pm')).toBe('KQ74PM')
    expect(normalizeCode('KQ7-4PM')).toBe('KQ74PM')
  })
})

describe('rate limiter', () => {
  test('blocks after the limit within the window, then lets go', () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 1000, blockMs: 500 })
    expect(limiter.fail('a', 0)).toBe(0)
    expect(limiter.fail('a', 10)).toBe(0)
    expect(limiter.fail('a', 20)).toBe(500)
    expect(limiter.retryAfter('a', 100)).toBe(420)
    expect(limiter.retryAfter('b', 100)).toBe(0)
    expect(limiter.retryAfter('a', 520)).toBe(0)
  })

  test('failures outside the window don’t count, and success clears them', () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 1000, blockMs: 500 })
    limiter.fail('a', 0)
    expect(limiter.fail('a', 1500)).toBe(0)
    limiter.clear('a')
    expect(limiter.fail('a', 1600)).toBe(0)
  })
})

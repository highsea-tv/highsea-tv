// SPDX-License-Identifier: AGPL-3.0-only
// Passwords are hashed with Argon2id from node:crypto (Stable since Node 24.7; Bun implements the
// same function), at OWASP's minimum: 19 MiB of memory, 2 passes, 1 lane, a 16-byte random salt
// (Password Storage Cheat Sheet). The hash is stored as a PHC string, so a later change to the
// parameters is read from the hash itself and the password is rehashed at the next sign-in.
import { argon2, randomBytes, timingSafeEqual } from 'node:crypto'

export const ARGON2 = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 } as const

/** The setup and invite screens' rule ("Use at least 10 characters"); OWASP asks for ≥ 64 at most. */
export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 256

type Params = { memory: number; passes: number; parallelism: number }

function derive(password: string, salt: Buffer, p: Params, tagLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    argon2(
      'argon2id',
      {
        message: Buffer.from(password, 'utf8'),
        nonce: salt,
        memory: p.memory,
        passes: p.passes,
        parallelism: p.parallelism,
        tagLength,
      },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  )
}

const b64 = (b: Buffer) => b.toString('base64').replace(/=+$/, '')

/** `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`, the PHC string format. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await derive(password, salt, ARGON2, ARGON2.tagLength)
  const { memory: m, passes: t, parallelism: p } = ARGON2
  return `$argon2id$v=19$m=${m},t=${t},p=${p}$${b64(salt)}$${b64(hash)}`
}

type Parsed = Params & { salt: Buffer; hash: Buffer }

function parse(phc: string): Parsed | null {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(
    phc,
  )
  if (!m) return null
  return {
    memory: Number(m[1]),
    passes: Number(m[2]),
    parallelism: Number(m[3]),
    salt: Buffer.from(m[4] as string, 'base64'),
    hash: Buffer.from(m[5] as string, 'base64'),
  }
}

// a fixed hash to check against when there's no account, so the answer takes as long either way
let dummy: Promise<string> | null = null

/** Whether `password` matches `phc`. With no hash, it still does the work and answers false. */
export async function verifyPassword(password: string, phc: string | null): Promise<boolean> {
  const parsed = phc ? parse(phc) : null
  if (!parsed) {
    dummy ??= hashPassword('highsea-no-such-account')
    const d = parse(await dummy) as Parsed
    await derive(password, d.salt, d, d.hash.length)
    return false
  }
  const key = await derive(password, parsed.salt, parsed, parsed.hash.length)
  return key.length === parsed.hash.length && timingSafeEqual(key, parsed.hash)
}

/** Whether a stored hash was made with other parameters than today's. */
export function needsRehash(phc: string): boolean {
  const p = parse(phc)
  return (
    !p ||
    p.memory !== ARGON2.memory ||
    p.passes !== ARGON2.passes ||
    p.parallelism !== ARGON2.parallelism ||
    p.hash.length !== ARGON2.tagLength
  )
}

/** Length is the only rule (OWASP: no composition rules, every character allowed). */
export function passwordProblem(password: string): 'short' | 'long' | null {
  const length = [...password].length
  if (length < PASSWORD_MIN) return 'short'
  if (length > PASSWORD_MAX) return 'long'
  return null
}

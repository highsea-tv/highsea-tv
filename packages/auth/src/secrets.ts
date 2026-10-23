// SPDX-License-Identifier: AGPL-3.0-only
// Bearer secrets: session cookies, device tokens, API keys, invite links and challenges. Each is
// 256 random bits (OWASP asks for at least 64 bits of entropy in a session id). Only a SHA-256
// verifier is stored, OWASP's "one-way verifier" for when the store could be read; a fast hash is
// enough because the secret itself can't be guessed. Lookups go through a unique index on the
// verifier, so no stored secret is ever compared byte by byte with what a caller sent.
import { createHash, randomBytes, randomInt } from 'node:crypto'

/** `prefix` then 43 base64url characters (32 bytes). */
export const newSecret = (prefix = '') => prefix + randomBytes(32).toString('base64url')

export const verifier = (secret: string) => createHash('sha256').update(secret).digest('base64url')

// no 0/O, 1/I/L: codes are read off a screen and typed
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

/** A short code for people to type: `KQ7-4PM`, `7KQ2-4PMX` (groups of `group`). */
export function newCode(groups = 2, group = 3): string {
  const parts: string[] = []
  for (let g = 0; g < groups; g++) {
    let part = ''
    for (let i = 0; i < group; i++) part += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
    parts.push(part)
  }
  return parts.join('-')
}

/** Normalizes a typed code: case, spaces and dashes don't matter. */
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^0-9A-Z]/g, '')

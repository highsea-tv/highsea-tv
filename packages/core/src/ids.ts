// SPDX-License-Identifier: AGPL-3.0-only
// Ids are a short type prefix and random base32 (`job_9x4k…`), so a stray id in a log says what it
// is. They're opaque: nothing parses them.
import { randomBytes } from 'node:crypto'

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'

/** 16 random characters (80 bits) after `prefix_`. */
export function newId(prefix: string): string {
  const bytes = randomBytes(16)
  let out = ''
  for (const b of bytes) out += ALPHABET[b & 31]
  return `${prefix}_${out}`
}

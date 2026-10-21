// SPDX-License-Identifier: AGPL-3.0-only
// OpenSubtitles.com's moviehash ("Hash Source Codes",
// https://opensubtitles.stoplight.io/docs/opensubtitles-api/4wccbf76rim38-hash-source-codes): the
// file's size plus the 64-bit little-endian sums of its first and last 64 KiB, even where they
// overlap, modulo 2^64, as 16 hex characters with leading zeros. OpenSubtitles.com hashes only
// files with `9000000000 > filesize > 131072`; outside that it's null. The documented test vector
// is breakdance.avi, 12,909,756 bytes, `8e245d9679d31e12`.
import { open } from 'node:fs/promises'

export const HASH_CHUNK = 65536
const MIN_SIZE = 131072
const MAX_SIZE = 9_000_000_000
const MASK = (1n << 64n) - 1n

/** Whether OpenSubtitles.com hashes a file of this size. */
export function hashable(size: number): boolean {
  return size > MIN_SIZE && size < MAX_SIZE
}

/** The hash from a file's size and its first and last 64 KiB. */
export function moviehashOf(size: number, head: Uint8Array, tail: Uint8Array): string {
  let sum = BigInt(size)
  for (const chunk of [head, tail]) {
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    for (let i = 0; i + 8 <= chunk.byteLength; i += 8)
      sum = (sum + view.getBigUint64(i, true)) & MASK
  }
  return sum.toString(16).padStart(16, '0')
}

/** The moviehash of a file on disk, or null when OpenSubtitles.com wouldn't hash it. */
export async function moviehash(path: string): Promise<string | null> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    if (!hashable(size)) return null
    const head = new Uint8Array(HASH_CHUNK)
    const tail = new Uint8Array(HASH_CHUNK)
    await handle.read(head, 0, HASH_CHUNK, 0)
    await handle.read(tail, 0, HASH_CHUNK, size - HASH_CHUNK)
    return moviehashOf(size, head, tail)
  } finally {
    await handle.close()
  }
}

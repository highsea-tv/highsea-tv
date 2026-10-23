// SPDX-License-Identifier: AGPL-3.0-only
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HASH_CHUNK, hashable, moviehash, moviehashOf } from '../../src/shared/moviehash.ts'
import { must } from '../must.ts'

const dir = mkdtempSync(join(tmpdir(), 'highsea-moviehash-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** The documented sum, computed here a different way: byte by byte. */
function expected(size: number, head: Uint8Array, tail: Uint8Array): string {
  let sum = BigInt(size)
  for (const chunk of [head, tail])
    for (let i = 0; i + 8 <= chunk.length; i += 8) {
      let word = 0n
      for (let b = 7; b >= 0; b--) word = (word << 8n) | BigInt(must(chunk[i + b]))
      sum += word
    }
  return (sum % 2n ** 64n).toString(16).padStart(16, '0')
}

const bytes = (n: number, seed: number) => {
  const out = new Uint8Array(n)
  let x = seed
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) >>> 0
    out[i] = x >>> 24
  }
  return out
}

describe('moviehash', () => {
  test('only files between 128 KiB and 9 GB are hashed', () => {
    expect(hashable(131072)).toBe(false)
    expect(hashable(131073)).toBe(true)
    expect(hashable(8_999_999_999)).toBe(true)
    expect(hashable(9_000_000_000)).toBe(false)
  })

  test('the size plus the little-endian sums, modulo 2^64, padded', () => {
    const head = bytes(HASH_CHUNK, 1)
    const tail = bytes(HASH_CHUNK, 2)
    expect(moviehashOf(200_000, head, tail)).toBe(expected(200_000, head, tail))
    // overflow wraps; zeros pad
    const ff = new Uint8Array(HASH_CHUNK).fill(0xff)
    expect(moviehashOf(1, ff, ff)).toBe(expected(1, ff, ff))
    const zero = new Uint8Array(HASH_CHUNK)
    expect(moviehashOf(200_000, zero, zero)).toBe('0000000000030d40')
  })

  test('a file on disk: its first and last 64 KiB, overlapping or not', async () => {
    for (const size of [140_000, 1_000_000]) {
      const data = bytes(size, size)
      const path = join(dir, `f${size}`)
      writeFileSync(path, data)
      expect(await moviehash(path)).toBe(
        expected(size, data.subarray(0, HASH_CHUNK), data.subarray(size - HASH_CHUNK)),
      )
    }
  })

  test('a small file has none', async () => {
    const path = join(dir, 'small')
    writeFileSync(path, bytes(1000, 3))
    expect(await moviehash(path)).toBeNull()
  })

  // OpenSubtitles.com's documented vector; the file isn't in the repo (its licence is unknown)
  const vector = process.env.HIGHSEA_MOVIEHASH_VECTOR
  test.skipIf(!vector)('breakdance.avi is 8e245d9679d31e12', async () => {
    expect(await moviehash(must(vector))).toBe('8e245d9679d31e12')
  })
})

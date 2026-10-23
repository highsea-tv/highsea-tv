// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { crc32, MAX_SUBTITLE_BYTES, readSubtitleZip } from '../../src/providers/zip.ts'
import { ProviderError } from '../../src/shared/types.ts'
import { makeZip } from '../fake/index.ts'

const enc = new TextEncoder()
const SRT = enc.encode('1\n00:00:01,000 --> 00:00:02,000\nHello\n')

function refusal(bytes: Uint8Array): string {
  try {
    readSubtitleZip(bytes)
  } catch (error) {
    if (error instanceof ProviderError && error.kind === 'invalid') return error.message
    throw error
  }
  throw new Error('expected the archive to be refused')
}

describe('readSubtitleZip', () => {
  test('CRC-32 matches the check value', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926)
  })

  test('prefers srt, then ass, then vtt, and reduces the name to its base name', () => {
    const zip = makeZip([
      { name: 'readme.txt', bytes: enc.encode('hi') },
      { name: 'Subs/movie.vtt', bytes: enc.encode('WEBVTT\n') },
      { name: 'Subs/movie.ass', bytes: enc.encode('[Script Info]\n') },
      { name: 'Subs/movie.srt', bytes: SRT },
    ])
    expect(readSubtitleZip(zip)).toEqual({ name: 'movie.srt', bytes: SRT })
    const noSrt = makeZip([
      { name: 'a.vtt', bytes: enc.encode('WEBVTT\n') },
      { name: 'b.ssa', bytes: enc.encode('[Script Info]\n') },
    ])
    expect(readSubtitleZip(noSrt).name).toBe('b.ssa')
  })

  test('skips directories and __MACOSX', () => {
    const zip = makeZip([
      { name: 'Subs/', bytes: new Uint8Array(), method: 0 },
      { name: '__MACOSX/Subs/._movie.srt', bytes: enc.encode('junk') },
      { name: 'Subs/movie.srt', bytes: SRT },
    ])
    expect(readSubtitleZip(zip)).toEqual({ name: 'movie.srt', bytes: SRT })
  })

  test('refuses paths that are absolute or climb out', () => {
    expect(refusal(makeZip([{ name: '../evil.srt', bytes: SRT }]))).toContain('outside')
    expect(refusal(makeZip([{ name: 'a/../../evil.srt', bytes: SRT }]))).toContain('outside')
    expect(refusal(makeZip([{ name: '..\\evil.srt', bytes: SRT }]))).toContain('outside')
    expect(refusal(makeZip([{ name: '/etc/evil.srt', bytes: SRT }]))).toContain('absolute')
    expect(refusal(makeZip([{ name: 'C:\\evil.srt', bytes: SRT }]))).toContain('absolute')
  })

  test('refuses an archive with no subtitle', () => {
    expect(refusal(makeZip([{ name: 'readme.txt', bytes: enc.encode('hi') }]))).toBe(
      'The archive holds no subtitle.',
    )
  })

  test('refuses a subtitle over 2 MB, declared or actual', () => {
    const big = new Uint8Array(MAX_SUBTITLE_BYTES + 1).fill(0x41)
    expect(refusal(makeZip([{ name: 'big.srt', bytes: big }]))).toContain('2 MB')
    expect(refusal(makeZip([{ name: 'big.srt', bytes: big, declaredSize: 100 }]))).toContain('2 MB')
    const exact = new Uint8Array(MAX_SUBTITLE_BYTES).fill(0x41)
    expect(readSubtitleZip(makeZip([{ name: 'ok.srt', bytes: exact }])).bytes.length).toBe(
      MAX_SUBTITLE_BYTES,
    )
  })

  test('refuses encrypted entries, damage and things that are not zips', () => {
    expect(refusal(makeZip([{ name: 'a.srt', bytes: SRT, flags: 1 }]))).toContain('encrypted')
    const zip = makeZip([{ name: 'a.srt', bytes: SRT, method: 0 }])
    const damaged = zip.slice()
    const at = 30 + 'a.srt'.length
    damaged[at] = (damaged[at] ?? 0) ^ 0xff
    expect(refusal(damaged)).toContain('damaged')
    expect(refusal(enc.encode('<html>not a zip</html>'))).toContain('isn’t a zip')
    expect(refusal(new Uint8Array(4))).toContain('isn’t a zip')
    expect(refusal(zip.subarray(0, zip.length - 30))).toBeTruthy()
  })

  test('refuses ZIP64 markers', () => {
    const zip = makeZip([{ name: 'a.srt', bytes: SRT }])
    const view = new DataView(zip.buffer)
    view.setUint32(zip.length - 22 + 16, 0xffffffff, true)
    expect(refusal(zip)).toContain('ZIP64')
  })
})

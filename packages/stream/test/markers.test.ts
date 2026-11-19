// SPDX-License-Identifier: AGPL-3.0-only
// Intro and credits markers (Phase 5 C2, ADR 0067): chapters' names, the stretch two
// fingerprints share, and with ffmpeg's `chromaprint` muxer, two clips sharing an intro found at
// the right place within a second. Without ffmpeg, or with one built without Chromaprint (as
// Homebrew's is), the clips' tests are skipped and say so.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hasFfmpeg } from '@highsea-tv/media/testing'
import {
  CREDITS_STRETCH,
  chapterMarkers,
  chapterName,
  fingerprint,
  hasChromaprint,
  INTRO_STRETCH,
  ITEM_SECONDS,
  readChapters,
  sharedStretch,
} from '../src/markers/index.ts'
import { makeEpisode } from '../src/testing/index.ts'

const ffmpeg = process.env.HIGHSEA_FFMPEG || 'ffmpeg'
const ffprobe = process.env.HIGHSEA_FFPROBE || 'ffprobe'
const chromaprint = hasFfmpeg && (await hasChromaprint(ffmpeg))
if (hasFfmpeg && !chromaprint)
  console.warn(
    'This ffmpeg has no chromaprint muxer, so the tests that fingerprint clips are skipped.',
  )

describe('chapters', () => {
  test('names are read without their numbering or case', () => {
    expect(chapterName('01 - Intro')).toBe('intro')
    expect(chapterName('Chapter 2: Opening Credits')).toBe('opening credits')
    expect(chapterName('OP1')).toBe('op')
    expect(chapterName('End  Credits')).toBe('end credits')
  })

  test('an intro in the first half and credits in the second give the markers', () => {
    const chapters = [
      { start: 0, end: 62.5, title: 'Prologue' },
      { start: 62.5, end: 120, title: 'Opening' },
      { start: 120, end: 1250, title: 'Part A' },
      { start: 1250, end: 1320, title: 'End Credits' },
    ]
    expect(chapterMarkers(chapters, 1320)).toEqual({
      intro: { start: 62.5, end: 120 },
      credits: 1250,
    })
  })

  test('numbered chapters, an "Introduction" and credits too early give nothing', () => {
    expect(
      chapterMarkers(
        [
          { start: 0, end: 300, title: 'Chapter 1' },
          { start: 300, end: 600, title: 'Introduction to the case' },
          { start: 600, end: 700, title: 'Credits' },
          { start: 700, end: 1400, title: 'Chapter 4' },
        ],
        1400,
      ),
    ).toEqual({ intro: null, credits: null })
    // an "intro" as long as an act is the act
    expect(chapterMarkers([{ start: 0, end: 900, title: 'Intro' }], 2600).intro).toBeNull()
  })
})

describe('the stretch two fingerprints share', () => {
  /** Items from a seed: a stand-in for a tune's fingerprint. */
  const items = (seed: number, n: number) => {
    const out = new Uint32Array(n)
    let x = seed * 2654435761
    for (let i = 0; i < n; i++) {
      x = (Math.imul(x ^ (x >>> 15), 2246822507) + i) >>> 0
      out[i] = x
    }
    return out
  }
  const join2 = (...parts: Uint32Array[]) => {
    const out = new Uint32Array(parts.reduce((n, p) => n + p.length, 0))
    let at = 0
    for (const p of parts) {
      out.set(p, at)
      at += p.length
    }
    return out
  }
  const s = (seconds: number) => Math.round(seconds / ITEM_SECONDS)

  test('found at its place in each, a few bits apart', () => {
    const intro = items(7, s(40))
    // the second episode's copy differs in a few bits of each item, as another encode does
    const noisy = intro.map((v, i) => v ^ (i % 3 === 0 ? 0b101 : 0))
    const a = join2(items(1, s(30)), intro, items(2, s(100)))
    const b = join2(items(3, s(55)), noisy, items(4, s(80)))
    const found = sharedStretch(a, b, INTRO_STRETCH)
    expect(found).not.toBeNull()
    // these items have no window to lead them, so the marks are its leads late: 0.5 s and 1.2 s
    expect(Math.abs((found?.a.start ?? 0) - 30.5)).toBeLessThan(0.2)
    expect(Math.abs((found?.a.end ?? 0) - 71.2)).toBeLessThan(0.2)
    expect(Math.abs((found?.b.start ?? 0) - 55.5)).toBeLessThan(0.2)
  })

  test('nothing shared, or only silence, is no stretch', () => {
    expect(sharedStretch(items(1, s(120)), items(2, s(120)), INTRO_STRETCH)).toBeNull()
    const quiet = new Uint32Array(s(30)).fill(0x5a5a5a5a)
    expect(
      sharedStretch(
        join2(items(1, s(20)), quiet, items(2, s(20))),
        join2(items(3, s(40)), quiet, items(4, s(20))),
        INTRO_STRETCH,
      ),
    ).toBeNull()
  })

  test('a stretch shorter than 15 s is a sting, not an intro', () => {
    const sting = items(9, s(8))
    expect(
      sharedStretch(
        join2(items(1, s(20)), sting, items(2, s(60))),
        join2(items(3, s(30)), sting, items(4, s(60))),
        INTRO_STRETCH,
      ),
    ).toBeNull()
  })
})

describe.skipIf(!chromaprint)('clips with ffmpeg’s chromaprint muxer', () => {
  let dir = ''
  const clip = (name: string) => join(dir, name)
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'highsea-markers-'))
    // the intro at 20 s in one and 34 s in the other; credits at 180 s in both, 10 s before the end
    await Promise.all([
      makeEpisode(ffmpeg, clip('a.mkv'), 1, {
        open: 20,
        intro: 30,
        body: 130,
        credits: 30,
        tail: 10,
      }),
      makeEpisode(ffmpeg, clip('b.mkv'), 2, {
        open: 34,
        intro: 30,
        body: 116,
        credits: 30,
        tail: 10,
      }),
      makeEpisode(ffmpeg, clip('c.mkv'), 3, {
        open: 60,
        intro: 0,
        body: 160,
        credits: 0,
        tail: 0,
        chapters: [
          { title: 'Cold Open', start: 0, end: 12 },
          { title: 'Intro', start: 12, end: 41.5 },
          { title: 'Episode', start: 41.5, end: 190 },
          { title: 'End Credits', start: 190, end: 220 },
        ],
      }),
    ])
  }, 60_000)
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  test('the intro two episodes share is found within a second of where it is', async () => {
    const [a, b] = await Promise.all([
      fingerprint({ ffmpeg, input: clip('a.mkv'), from: 0, seconds: 80 }),
      fingerprint({ ffmpeg, input: clip('b.mkv'), from: 0, seconds: 80 }),
    ])
    // an item every ~0.124 s, less Chromaprint's window of ~2.6 s at the end
    expect(Math.abs(a.length * ITEM_SECONDS - 80)).toBeLessThan(3)
    const found = sharedStretch(a, b, INTRO_STRETCH)
    expect(found).not.toBeNull()
    expect(Math.abs((found?.a.start ?? 0) - 20)).toBeLessThan(1)
    expect(Math.abs((found?.a.end ?? 0) - 50)).toBeLessThan(1)
    expect(Math.abs((found?.b.start ?? 0) - 34)).toBeLessThan(1)
    expect(Math.abs((found?.b.end ?? 0) - 64)).toBeLessThan(1)
  }, 30_000)

  test('the credits are found from the ending, where they start', async () => {
    const [a, b] = await Promise.all([
      fingerprint({ ffmpeg, input: clip('a.mkv'), from: 140, seconds: 80 }),
      fingerprint({ ffmpeg, input: clip('b.mkv'), from: 140, seconds: 80 }),
    ])
    const found = sharedStretch(a, b, CREDITS_STRETCH)
    expect(Math.abs(140 + (found?.a.start ?? 0) - 180)).toBeLessThan(1)
    expect(Math.abs(140 + (found?.b.start ?? 0) - 180)).toBeLessThan(1)
  }, 30_000)

  test('an episode with no intro shares nothing with one that has it', async () => {
    const [a, c] = await Promise.all([
      fingerprint({ ffmpeg, input: clip('a.mkv'), from: 0, seconds: 80 }),
      fingerprint({ ffmpeg, input: clip('c.mkv'), from: 0, seconds: 80 }),
    ])
    expect(sharedStretch(a, c, INTRO_STRETCH)).toBeNull()
  }, 30_000)

  test('chapters are read with ffprobe', async () => {
    const chapters = await readChapters(ffprobe, clip('c.mkv'))
    expect(chapters.map((c) => c.title)).toEqual(['Cold Open', 'Intro', 'Episode', 'End Credits'])
    expect(chapterMarkers(chapters, 220)).toEqual({ intro: { start: 12, end: 41.5 }, credits: 190 })
  }, 30_000)
})

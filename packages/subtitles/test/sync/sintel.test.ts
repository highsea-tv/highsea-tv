// SPDX-License-Identifier: AGPL-3.0-only
// The ±100 ms test (checkpoint 7, exit criterion 3) on 52 seconds of *Sintel* (© copyright Blender
// Foundation | durian.blender.org, CC BY 3.0; fixtures/sintel/README.md): real speech through
// ffmpeg and the VAD, and the official English cues moved as a bad release would move them.
//
// The official cues aren't within 100 ms of the speech: they start 240–420 ms after it early in the
// clip and up to 360 ms before it near the end (ADR 0044, The Sintel timing). So "restored" means
// back within ±100 ms of where the engine puts the undistorted cues, and the undistorted cues may
// move at most 450 ms from the official timing.
import { beforeAll, describe, expect, test } from 'bun:test'
import { hasFfmpeg } from '@highsea/media/testing'
import {
  type Alignment,
  align,
  applyCorrection,
  type CueSpan,
  speechFrames,
} from '../../src/sync/index.ts'
import { distort, sintel } from '../testing/index.ts'

const where = (r: Alignment, cues: readonly CueSpan[]) =>
  cues.map((c) => applyCorrection(r.correction, c.start))

describe.skipIf(!hasFfmpeg)('the Sintel fixture', () => {
  let speech: Uint8Array
  let official: CueSpan[]
  let placed: number[]
  beforeAll(async () => {
    speech = await speechFrames(sintel.audio, 0)
    official = sintel.cues()
    placed = where(align(speech, official), official)
  })

  test('the speech is found: about 52 seconds of frames, a fair share of them speech', () => {
    expect(speech.length).toBeGreaterThan(5_150)
    expect(speech.length).toBeLessThan(5_250)
  })

  test('the official cues stay close to their timing, with confidence', () => {
    const r = align(speech, official)
    expect(r.confidence).toBeGreaterThanOrEqual(sintel.minConfidence)
    for (const [i, c] of official.entries())
      expect(Math.abs((placed[i] as number) - c.start)).toBeLessThanOrEqual(450)
  })

  test.each([
    ['shifted by +2.5 seconds', { offsetMs: 2_500 }],
    [
      'shifted by −1.2 seconds and stretched 25/23.976',
      { offsetMs: -1_200, ratio: 25 / (24000 / 1001) },
    ],
  ] as const)('%s, every cue comes back within 100 ms', (_, d) => {
    const input = distort(official, d)
    const r = align(speech, input)
    expect(r.confidence).toBeGreaterThanOrEqual(sintel.minConfidence)
    for (const [i, at] of where(r, input).entries())
      expect(Math.abs(at - (placed[i] as number))).toBeLessThanOrEqual(100)
  })

  test('split by 3 seconds at the sixth cue, each section comes back within 100 ms', () => {
    const input = distort(official, { splits: [{ from: 6, offsetMs: 3_000 }] })
    const r = align(speech, input)
    expect(r.confidence).toBeGreaterThanOrEqual(sintel.minConfidence)
    expect(r.correction.sections).toHaveLength(2)
    // each half is compared with where the engine puts that half alone: a half's cues fit their
    // own speech, which the whole subtitle's single offset can't quite do
    const halves = [official.slice(0, 6), official.slice(6)]
    const alone = halves.flatMap((h) => where(align(speech, h), h))
    for (const [i, at] of where(r, input).entries())
      expect(Math.abs(at - (alone[i] as number))).toBeLessThanOrEqual(100)
  })

  test('cues from elsewhere in the film have no confidence', () => {
    // the same 12 cues, each moved to a random place: right lines, wrong times
    const scattered = official.map((c, i) => {
      const start = ((i * 7_919) % 48_000) + 500
      return { ...c, start, end: start + (c.end - c.start) }
    })
    expect(align(speech, scattered).confidence).toBeLessThan(sintel.minConfidence)
  })
})

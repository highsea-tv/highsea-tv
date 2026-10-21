// SPDX-License-Identifier: AGPL-3.0-only
// The alignment on synthetic timelines, no audio (checkpoint 7, Tests: the core on synthetic spans):
// offsets from −60 to +60 seconds, each framerate ratio, one and two splits, noise cues and missing
// speech. Every real cue lands within ±100 ms of the truth.
import { describe, expect, test } from 'bun:test'
import {
  type Alignment,
  align,
  applyCorrection,
  type CueSpan,
  FRAMERATE_RATIOS,
  type Span,
  toFrames,
} from '../../src/sync/index.ts'
import { type Distortion, distort, random, speechTimeline } from '../testing/index.ts'

const speech = speechTimeline(7)
const reference = toFrames(speech)

/** How far each corrected cue lands from where it belongs, in milliseconds. */
function errors(result: Alignment, truth: readonly Span[], input: readonly Span[]): number[] {
  return input.map((c, i) =>
    Math.abs(applyCorrection(result.correction, c.start) - (truth[i] as Span).start),
  )
}

function restores(d: Distortion, cues: readonly CueSpan[] = speech, ref = reference) {
  const input = distort(cues, d)
  const result = align(ref, input, { speechCps: null })
  return { result, worst: Math.max(...errors(result, cues, input)) }
}

describe('the alignment, on synthetic spans', () => {
  test.each([-60_000, -42_370, -2_500, 0, 830, 17_250, 60_000])(
    'an offset of %d ms',
    (offsetMs) => {
      // the correction undoes the distortion: −offset
      const { result, worst } = restores({ offsetMs })
      expect(worst).toBeLessThanOrEqual(100)
      expect(result.offsetMs).toBeCloseTo(-offsetMs, -2)
      expect(result.correction.ratio).toBe(1)
      expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    },
  )

  test.each(FRAMERATE_RATIOS.filter((r) => r !== 1).map((r) => [r.toFixed(4), r]))(
    'a framerate of %s with an offset',
    (_, ratio) => {
      const { result, worst } = restores({ ratio: 1 / (ratio as number), offsetMs: 7_400 })
      expect(worst).toBeLessThanOrEqual(100)
      expect(result.correction.ratio).toBeCloseTo(ratio as number, 6)
      expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    },
  )

  test('one split: a scene cut into the release', () => {
    const at = 120
    const { result, worst } = restores({ offsetMs: 1_500, splits: [{ from: at, offsetMs: 3_000 }] })
    expect(worst).toBeLessThanOrEqual(100)
    expect(result.correction.sections).toHaveLength(2)
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
  })

  test('two splits: a scene cut in and another cut out', () => {
    // a long pause before each split, so the later section can move earlier and stay in order
    const lines = speechTimeline(11, { longGapsAt: [60, 140] })
    const { result, worst } = restores(
      {
        offsetMs: -800,
        splits: [
          { from: 60, offsetMs: 4_000 },
          { from: 140, offsetMs: -3_000 },
        ],
      },
      lines,
      toFrames(lines),
    )
    expect(worst).toBeLessThanOrEqual(100)
    expect(result.correction.sections).toHaveLength(3)
  })

  test('noise cues and missing speech', () => {
    const next = random(3)
    // a tenth of the speech isn't heard (music over it), and 5% more cues are signs and songs
    const heard = speech.filter(() => next() > 0.1)
    const noise = Array.from({ length: Math.round(speech.length * 0.05) }, () => {
      const start = Math.round(next() * 900_000)
      return { start, end: start + 1_500, noise: true }
    })
    const cues = [...speech.map((s) => ({ ...s, noise: false })), ...noise].sort(
      (a, b) => a.start - b.start,
    )
    const input = distort(cues, { offsetMs: -12_000 })
    const result = align(toFrames(heard), input, { speechCps: null })
    const real = cues.map((c, i) => ({ c, i })).filter(({ c }) => !c.noise)
    for (const { c, i } of real)
      expect(
        Math.abs(applyCorrection(result.correction, (input[i] as Span).start) - c.start),
      ).toBeLessThanOrEqual(100)
    expect(result.confidence).toBeGreaterThanOrEqual(0.7)
  })

  test('against speech, a cue counts only while its line is spoken', () => {
    // each cue stays up 1.5 seconds after its line for reading; its text says how long the line is
    const cues = speech.map((s) => ({
      start: s.start,
      end: s.end + 1_500,
      text: 'x'.repeat(Math.round(((s.end - s.start) / 1000) * 17)),
    }))
    const input = distort(cues, { offsetMs: 3_300 })
    const result = align(reference, input)
    expect(Math.max(...errors(result, cues, input))).toBeLessThanOrEqual(100)
  })

  test('cues that belong to another film have no confidence', () => {
    const other = speechTimeline(99)
    const result = align(reference, other, { speechCps: null })
    expect(result.confidence).toBeLessThan(0.7)
  })

  test('no speech at all has no confidence and no correction', () => {
    const result = align(new Uint8Array(reference.length), speech, { speechCps: null })
    expect(result.confidence).toBe(0)
  })

  test('no cues is no correction', () => {
    const result = align(reference, [])
    expect(result).toMatchObject({ confidence: 0, offsetMs: 0, cues: 0 })
  })
})

describe('confidence, on 20 synthetic films', () => {
  test('the right cues score full marks; another film’s stay under 0.5', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const film = speechTimeline(seed)
      const ref = toFrames(film)
      const right = distort(film, { offsetMs: ((seed * 2_971) % 50_000) - 25_000 })
      expect(align(ref, right, { speechCps: null }).confidence).toBe(1)
      expect(align(ref, speechTimeline(seed + 1_000), { speechCps: null }).confidence).toBeLessThan(
        0.5,
      )
    }
  }, 30_000)
})

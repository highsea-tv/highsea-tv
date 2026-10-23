// SPDX-License-Identifier: AGPL-3.0-only
// Aligning a subtitle's cues with a reference (ADR 0044). Pure: the reference is already on the
// grid, as speech from the audio or as an embedded track's cues.
//
// 1. The framerate and offset: for each ratio both ffsubsync and alass try (25/24, 25/23.976,
//    24/23.976, their reciprocals and 1), the cues are stretched and correlated with the reference,
//    and the best score within ±60 seconds wins (ffsubsync's `--max-offset-seconds` default).
// 2. Splits: a dynamic program over the cues, in order, lets a run of cues take its own offset
//    within ±10 seconds of the global one, for a penalty per split: the problem alass's thesis
//    states (§2.5, https://github.com/kaegi/alass/blob/master/documentation/thesis.pdf), written
//    here from that statement. The global fit is the path with no split, so splits are kept only
//    when they beat it by more than their penalties, and only while each section can be placed on
//    its own: otherwise the penalty doubles and the search runs again (judgement call 37).
// 3. Confidence: the minimum of three measures, each 0 to 1 (below).
//
// Against speech, a cue promises speech only at its start: it stays up for reading after the line
// is spoken. Scoring the whole cue against speech lets it slide over its tail at no cost, a plateau
// half a second wide, so each cue's first `characters / 17` seconds are its speech and the rest
// scores 0 (judgement call 35, ADR 0044). Netflix's Timed Text Style Guide caps reading speed at 20
// characters a second for adults and 17 for children
// (https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977); text paced for reading is
// spoken at least that fast, so 17 is the slower bound. Calibration chose it: at 20 the speech
// estimate is too short to place Sintel's split sections within 100 ms.
// Against an embedded subtitle the whole cue counts.
import { createCorrelator, peaks } from './correlate.ts'
import { density, FRAME_MS, type Span, toFrame } from './grid.ts'

/** A cue: its span and, when known, its text, whose length says how long its speech lasts. */
export type CueSpan = Span & { text?: string }

/** ffsubsync's and alass's framerate set, as ratios applied to the subtitle's times; 1 first. */
export const FRAMERATE_RATIOS: readonly number[] = (() => {
  const film = 24000 / 1001
  const pairs = [
    [25, 24],
    [25, film],
    [24, film],
  ] as const
  return [1, ...pairs.flatMap(([a, b]) => [a / b, b / a])]
})()

export type AlignOptions = {
  /** How far the whole subtitle may move: ffsubsync's and Bazarr's 60 seconds. */
  maxOffsetMs: number
  /** How far a split's section may move from the global fit. */
  splitWindowMs: number
  /**
   * What a split costs at first, as the number of typical cues it has to put right: a typical cue's
   * speech agreeing in full rather than not at all. The price doubles while any section can't be
   * placed on its own (`sectionClarity`), so splits that only chase whatever speech is near go.
   */
  splitCues: number
  /** How clearly a section must stand at its place against anywhere else in its window. */
  sectionClarity: number
  ratios: readonly number[]
  /**
   * How fast a cue's text is spoken, in characters a second, or null when the reference is another
   * subtitle. A cue's first `characters / speechCps` seconds are its speech; the rest is reading time,
   * which says nothing about speech and scores 0.
   */
  speechCps: number | null
}

export const ALIGN_DEFAULTS: AlignOptions = {
  maxOffsetMs: 60_000,
  splitWindowMs: 10_000,
  splitCues: 1,
  sectionClarity: 0.3,
  ratios: FRAMERATE_RATIOS,
  speechCps: 17,
}

/**
 * The confidence measures' marks (ADR 0044), set by calibration on real films (judgement calls 36
 * and 45): a measure at or above its mark counts 1, below it in proportion; overlap counts 0 up to
 * its floor.
 * - overlap: how significant the share of the cues' speech time on speech is, in standard
 *   deviations above the share the same placed cues get moved as a whole to 300 other places in
 *   the film. How much speech the VAD hears depends on the mix, so the share itself can't be
 *   compared from film to film (right subtitles lift it from 0.10 to 0.41 on 24 films); its
 *   significance can. A wrong subtitle is the best of about a thousand independent tries (±60 s at
 *   9 framerates, each a second apart), whose noise reaches √(2 ln 1000) ≈ 3.7 deviations, and on
 *   real films reached at most 4.5; right ones placed reliably scored 5.5 to 22.6. So it counts
 *   from 4 and is full at 6;
 * - clarity: how far the fit as found stands above the best fit more than a second away, relative to
 *   the median. A track that fits nowhere (a sine, the wrong film) scores near 0;
 * - coverage: the share of cues with any reference activity within a second of them. Films with
 *   little speech the VAD can hear reach 0.72 with the right subtitle.
 */
export const CONFIDENCE_MARKS = { overlapFloor: 4, overlap: 6, clarity: 0.2, coverage: 0.75 }

/** How many other places the overlap is compared with, and how far from the fit they start. */
const NULL_PLACES = 300
const NULL_FROM_MS = 10_000

/** A section of cues moved together: from the cue at `from` (by start time) to the next section. */
export type Section = { from: number; fromMs: number; offsetMs: number }

/** The correction: t → t · ratio + the offset of the section the cue starts in. */
export type Correction = { ratio: number; sections: Section[] }

export type Measures = { overlap: number; clarity: number; coverage: number }

/** The measures before their marks: what ADR 0044's thresholds were set from. */
export type RawMeasures = {
  /** The share of the cues' speech time on speech, above chance: 0 is chance, 1 all of it. */
  lift: number
  /** That share's standard deviations above the same cues at other places in the film. */
  significance: number
  clarity: number
  coverage: number
}

export type Alignment = {
  correction: Correction
  /** The correction at the first cue, as A6's Offset column shows it. */
  offsetMs: number
  confidence: number
  measures: Measures
  raw: RawMeasures
  cues: number
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)

/** The shortest speech a cue promises: a word. */
const MIN_SPEECH_MS = 300

/** The cues in start order, without empty ones. */
export function orderCues<T extends Span>(cues: readonly T[]): T[] {
  return cues.filter((c) => c.end > c.start).sort((a, b) => a.start - b.start || a.end - b.end)
}

/** How long a cue's speech lasts: all of it against a subtitle, its text's length against speech. */
export function speechEnd(cue: CueSpan, cps: number | null): number {
  if (cps === null || cue.text === undefined) return cue.end
  // tags and line breaks aren't spoken
  const spoken = cue.text
    .replace(/<[^>]*>|\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim().length
  return Math.min(cue.end, cue.start + Math.max(MIN_SPEECH_MS, (spoken / cps) * 1000))
}

/** Where a time lands under a correction; `anchor` (the cue's start) picks its section. */
export function applyCorrection(c: Correction, ms: number, anchor = ms): number {
  let offset = c.sections[0]?.offsetMs ?? 0
  for (const s of c.sections) if (anchor >= s.fromMs) offset = s.offsetMs
  return ms * c.ratio + offset
}

/** No correction: what a low-confidence sync keeps. */
export const IDENTITY: Correction = { ratio: 1, sections: [{ from: 0, fromMs: 0, offsetMs: 0 }] }

/** A cue on the grid: its speech from `a` to `s`, its reading time from `s` to `b`. */
type Placed = { a: number; s: number; b: number }

export function align(
  reference: Uint8Array,
  input: readonly CueSpan[],
  options: Partial<AlignOptions> = {},
): Alignment {
  const o = { ...ALIGN_DEFAULTS, ...options }
  const cues = orderCues(input)
  const none: Alignment = {
    correction: IDENTITY,
    offsetMs: 0,
    confidence: 0,
    measures: { overlap: 0, clarity: 0, coverage: 0 },
    raw: { lift: 0, significance: 0, clarity: 0, coverage: 0 },
    cues: cues.length,
  }
  const p = density(reference)
  if (cues.length === 0 || p === 0 || p === 1) return none
  const spoken = cues.map((c) => speechEnd(c, o.speechCps))
  const onGrid = (ratio: number, lag: number): Placed[] =>
    cues.map((c, i) => ({
      a: toFrame(c.start * ratio) + lag,
      s: toFrame((spoken[i] as number) * ratio) + lag,
      b: toFrame(c.end * ratio) + lag,
    }))

  // 1. the offset for each framerate, then 2. splits around it; the best total wins, and a
  // framerate other than 1 costs one typical cue, so a ratio within noise of 1 doesn't win
  const maxLag = toFrame(o.maxOffsetMs)
  const lengths = cues
    .map((c, i) => toFrame(spoken[i] as number) - toFrame(c.start))
    .sort((x, y) => x - y)
  const penalty = o.splitCues * 2 * Math.max(1, lengths[lengths.length >> 1] as number)
  const lastEnd = (cues.at(-1) as Span).end
  const longest = Math.max(...o.ratios)
  const length = Math.max(reference.length, toFrame(lastEnd * longest) + 1)
  const correlator = createCorrelator(reference, length, maxLag)
  const agree = agreement(reference)
  type Fit = { ratio: number; lag: number; base: Placed[]; shifts: number[]; total: number }
  let fit: Fit | null = null
  for (const ratio of o.ratios) {
    const signal = new Float64Array(toFrame(lastEnd * ratio) + 1).fill(-1)
    for (const c of onGrid(ratio, 0)) {
      signal.fill(1, c.a, c.s)
      signal.fill(0, c.s, c.b)
    }
    const peak = peaks(correlator.correlate(signal), toFrame(1000))
    const base = onGrid(ratio, peak.lag)
    const { shifts, total } = splitClearly(
      agree,
      base,
      toFrame(o.splitWindowMs),
      penalty,
      o.sectionClarity,
    )
    const score = total - (ratio === 1 ? 0 : penalty / o.splitCues)
    if (!fit || score > fit.total) fit = { ratio, lag: peak.lag, base, shifts, total: score }
  }
  if (!fit) return none
  const { base, shifts } = fit
  const lag = fit.lag

  const sections: Section[] = []
  shifts.forEach((d, i) => {
    if (i > 0 && d === shifts[i - 1]) return
    sections.push({
      from: i,
      fromMs: i === 0 ? 0 : (cues[i] as Span).start,
      offsetMs: (lag + d) * FRAME_MS,
    })
  })
  const correction: Correction = { ratio: fit.ratio, sections }

  // 3. confidence, on the cues where the fit puts them
  const placed = base.map((c, i) => {
    const d = shifts[i] ?? 0
    return { a: c.a + d, s: c.s + d, b: c.b + d }
  })
  const raw = measure(reference, placed, p, correlator, maxLag)
  const measures = {
    overlap: clamp01(
      (raw.significance - CONFIDENCE_MARKS.overlapFloor) /
        (CONFIDENCE_MARKS.overlap - CONFIDENCE_MARKS.overlapFloor),
    ),
    clarity: clamp01(raw.clarity / CONFIDENCE_MARKS.clarity),
    coverage: clamp01(raw.coverage / CONFIDENCE_MARKS.coverage),
  }
  const first = cues[0] as Span
  return {
    correction,
    offsetMs: Math.round(applyCorrection(correction, first.start) - first.start),
    confidence: Math.min(measures.overlap, measures.clarity, measures.coverage),
    measures,
    raw,
    cues: cues.length,
  }
}

/**
 * The split search: each cue's extra shift, within ±window frames, maximising the cues' agreement
 * with the reference minus `penalty` for each change of shift (and for leaving the global fit at
 * the start), and the best total. Cues keep their order: a later section can't move back over the
 * cue before it.
 */
export function split(
  agree: Agree,
  cues: readonly Placed[],
  window: number,
  penalty: number,
): { shifts: number[]; total: number } {
  const n = cues.length
  if (n === 0) return { shifts: [], total: 0 }

  const width = 2 * window + 1
  let best = new Float64Array(width)
  let next = new Float64Array(width)
  const from = new Int16Array(n * width)
  const runMax = new Float64Array(width)
  const runArg = new Int16Array(width)
  for (let j = 0; j < width; j++) {
    const d = j - window
    best[j] = agree(cues[0] as Placed, d) - (d === 0 ? 0 : penalty)
    from[j] = j
  }
  for (let i = 1; i < n; i++) {
    const cue = cues[i] as Placed
    const gap = Math.max(0, cue.a - (cues[i - 1] as Placed).b)
    runMax[0] = best[0] as number
    runArg[0] = 0
    for (let j = 1; j < width; j++) {
      const v = best[j] as number
      if (v > (runMax[j - 1] as number)) {
        runMax[j] = v
        runArg[j] = j
      } else {
        runMax[j] = runMax[j - 1] as number
        runArg[j] = runArg[j - 1] as number
      }
    }
    for (let j = 0; j < width; j++) {
      const stay = best[j] as number
      const k = Math.min(width - 1, j + gap)
      const jump = (runMax[k] as number) - penalty
      const take = jump > stay
      next[j] = agree(cue, j - window) + (take ? jump : stay)
      from[i * width + j] = take ? (runArg[k] as number) : j
    }
    ;[best, next] = [next, best]
  }
  let j = 0
  for (let k = 1; k < width; k++) if ((best[k] as number) > (best[j] as number)) j = k
  const total = best[j] as number
  const shifts = new Array<number>(n)
  for (let i = n - 1; i >= 0; i--) {
    shifts[i] = j - window
    j = from[i * width + j] as number
  }
  return { shifts, total }
}

/** A cue's agreement with the reference when moved d frames. */
type Agree = (c: Placed, d: number) => number

/**
 * A cue's agreement is the correlation's own terms for it: speech frames count twice against the
 * gaps around them, reading time once. ±1 sums over a range, by prefix sums (0 outside the
 * reference).
 */
function agreement(reference: Uint8Array): Agree {
  const pre = new Float64Array(reference.length + 1)
  for (let t = 0; t < reference.length; t++)
    pre[t + 1] = (pre[t] as number) + (reference[t] === 1 ? 1 : -1)
  const at = (t: number) => pre[Math.min(reference.length, Math.max(0, t))] as number
  return (c, d) => 2 * (at(c.s + d) - at(c.a + d)) + (at(c.b + d) - at(c.s + d))
}

/**
 * The split search, until every section can be placed on its own: a section of cues moved
 * together must agree best where it was put, clearly above anywhere more than a second away in its
 * window. A section that only found speech to sit on, as cues of another film always can, fails,
 * and the search runs again with splits costing twice as much.
 */
function splitClearly(
  agree: Agree,
  cues: readonly Placed[],
  window: number,
  penalty: number,
  minClarity: number,
): { shifts: number[]; total: number } {
  const apart = toFrame(1000)
  let price = penalty
  for (;;) {
    const found = split(agree, cues, window, price)
    const { shifts } = found
    const starts = shifts.flatMap((d, i) => (i === 0 || d !== shifts[i - 1] ? [i] : []))
    if (starts.length === 1) return found
    const clear = starts.every((from, k) => {
      const to = starts[k + 1] ?? cues.length
      const at = shifts[from] as number
      // the section's agreement at every shift in the window
      const scores = new Float64Array(2 * window + 1)
      for (let i = from; i < to; i++)
        for (let d = -window; d <= window; d++)
          scores[d + window] = (scores[d + window] as number) + agree(cues[i] as Placed, d)
      const best = scores[at + window] as number
      let second = Number.NEGATIVE_INFINITY
      for (let d = -window; d <= window; d++)
        if (Math.abs(d - at) > apart) second = Math.max(second, scores[d + window] as number)
      const median = Float64Array.from(scores).sort()[window] as number
      return best > median && (best - second) / (best - median) >= minClarity
    })
    if (clear) return found
    price *= 2
  }
}

function measure(
  reference: Uint8Array,
  cues: readonly Placed[],
  p: number,
  correlator: ReturnType<typeof createCorrelator>,
  maxLag: number,
): RawMeasures {
  let on = 0
  let total = 0
  let covered = 0
  const near = toFrame(1000)
  let end = 0
  for (const c of cues) {
    end = Math.max(end, c.b)
    total += c.s - c.a
    for (let t = Math.max(0, c.a); t < Math.min(reference.length, c.s); t++) on += reference[t] ?? 0
    let any = false
    for (let t = Math.max(0, c.a - near); t < Math.min(reference.length, c.b + near); t++)
      if (reference[t] === 1) {
        any = true
        break
      }
    if (any) covered++
  }
  const share = total > 0 ? on / total : 0

  // significance: the same placed cues moved as a whole to places spread evenly over the film,
  // wrapping at its end, none within 10 seconds of the fit; each cue's speech counted from a
  // running sum of the reference doubled, so a place costs one step per cue
  const L = reference.length
  const sums = new Uint32Array(2 * L + 1)
  for (let t = 0; t < 2 * L; t++) sums[t + 1] = (sums[t] as number) + (reference[t % L] as number)
  const far = toFrame(NULL_FROM_MS)
  const elsewhere: number[] = []
  for (let k = 1; k <= NULL_PLACES; k++) {
    const d = Math.round((k * L) / (NULL_PLACES + 1))
    if (d < far || L - d < far) continue
    let hits = 0
    for (const c of cues) {
      const length = Math.min(c.s - c.a, L)
      if (length <= 0) continue
      const from = (((c.a + d) % L) + L) % L
      hits += (sums[from + length] as number) - (sums[from] as number)
    }
    elsewhere.push(total > 0 ? hits / total : 0)
  }
  const mean = elsewhere.reduce((x, y) => x + y, 0) / Math.max(1, elsewhere.length)
  const sd = Math.sqrt(
    elsewhere.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, elsewhere.length - 1),
  )
  const significance = sd > 0 ? (share - mean) / sd : 0

  // clarity: the fit as found (lag 0 of the corrected cues) against the best fit more than a
  // second away, relative to the median, which is what a guess scores
  const signal = new Float64Array(Math.max(0, end) + 1).fill(-1)
  for (const c of cues) {
    if (c.b <= 0) continue
    signal.fill(1, Math.max(0, c.a), Math.max(0, c.s))
    signal.fill(0, Math.max(0, c.s), c.b)
  }
  const { scores } = correlator.correlate(
    signal.subarray(0, Math.min(signal.length, correlator.size)),
  )
  const found = scores[maxLag] as number
  let second = Number.NEGATIVE_INFINITY
  for (let i = 0; i < scores.length; i++)
    if (Math.abs(i - maxLag) > near) second = Math.max(second, scores[i] as number)
  const median = Float64Array.from(scores).sort()[scores.length >> 1] as number
  const spread = found - median
  return {
    lift: (share - p) / (1 - p),
    significance,
    clarity: spread > 0 ? (found - second) / spread : 0,
    coverage: covered / cues.length,
  }
}

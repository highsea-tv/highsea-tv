// SPDX-License-Identifier: AGPL-3.0-only
// Every offset scored at once (ADR 0044): the reference and the subtitle as signals of +1 and −1 on
// the 10 ms grid, cross-correlated by FFT, as ffsubsync does
// (https://github.com/smacke/ffsubsync/blob/master/ffsubsync/aligners.py, `FFTAligner`). The score
// at lag n is Σ subtitle[t] · reference[t + n]: how well the subtitle agrees with the reference when
// it's moved n frames later. The FFT is fft.js's radix-4 (https://github.com/indutny/fft.js).
import FFT from 'fft.js'

/** The scores for lags −maxLag to +maxLag: `scores[maxLag + n]` is lag n. */
export type Correlation = { maxLag: number; scores: Float64Array }

const powerOfTwo = (n: number): number => 2 ** Math.ceil(Math.log2(Math.max(4, n)))

/**
 * Holds the reference's spectrum, so each framerate's subtitle signal costs one forward and one
 * inverse transform. `length` is the longest subtitle signal it will see, in frames.
 */
export function createCorrelator(reference: Uint8Array, length: number, maxLag: number) {
  // big enough that no lag inside ±maxLag wraps around
  const size = powerOfTwo(Math.max(reference.length, length) + maxLag + 1)
  const fft = new FFT(size)
  const input = new Float64Array(size)
  for (let t = 0; t < reference.length; t++) input[t] = reference[t] === 1 ? 1 : -1
  const ref = new Float64Array(size * 2)
  fft.realTransform(ref, input)
  fft.completeSpectrum(ref)
  const spectrum = new Float64Array(size * 2)
  const product = new Float64Array(size * 2)
  const result = new Float64Array(size * 2)

  return {
    size,
    /** `subtitle` is +1 (a cue), −1 (no cue) or 0 (past the subtitle's end), `length` long at most. */
    correlate(subtitle: Float64Array): Correlation {
      input.fill(0)
      input.set(subtitle.subarray(0, Math.min(subtitle.length, size)))
      fft.realTransform(spectrum, input)
      fft.completeSpectrum(spectrum)
      // R · conj(S): its inverse is Σ s[t] · r[t + n]
      for (let k = 0; k < size; k++) {
        const re = 2 * k
        const im = re + 1
        const rr = ref[re] as number
        const ri = ref[im] as number
        const sr = spectrum[re] as number
        const si = spectrum[im] as number
        product[re] = rr * sr + ri * si
        product[im] = ri * sr - rr * si
      }
      fft.inverseTransform(result, product)
      const scores = new Float64Array(2 * maxLag + 1)
      for (let n = -maxLag; n <= maxLag; n++) {
        const at = n >= 0 ? n : size + n
        scores[maxLag + n] = result[2 * at] as number
      }
      return { maxLag, scores }
    },
  }
}

/** The best lag, the best more than `apart` frames from it, and the median: what a guess scores. */
export function peaks(c: Correlation, apart: number) {
  let best = 0
  for (let i = 1; i < c.scores.length; i++)
    if ((c.scores[i] as number) > (c.scores[best] as number)) best = i
  let second = Number.NEGATIVE_INFINITY
  for (let i = 0; i < c.scores.length; i++)
    if (Math.abs(i - best) > apart) second = Math.max(second, c.scores[i] as number)
  const sorted = Float64Array.from(c.scores).sort()
  const median = sorted[sorted.length >> 1] as number
  return {
    lag: best - c.maxLag,
    score: c.scores[best] as number,
    second: Number.isFinite(second) ? second : median,
    median,
  }
}

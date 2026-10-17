// SPDX-License-Identifier: AGPL-3.0-only
// An offline renderer that mirrors the Web Audio graph sound packs are played through, so pack
// rules can be checked anywhere (CI, the catalog pipeline) without a browser.
import { expandVoices, type SoundEvent, type SoundPack, type Voice } from './pack.ts'

type Biquad = { process(x: number): number }

/** BiquadFilterNode coefficients as defined by the Web Audio spec. */
function biquad(type: 'lowpass' | 'highpass' | 'bandpass', freq: number, q: number, sr: number) {
  const w0 = (2 * Math.PI * Math.min(freq, sr / 2 - 1)) / sr
  const cos = Math.cos(w0)
  const sin = Math.sin(w0)
  // lowpass and highpass take Q in dB; bandpass takes it linearly
  const alpha = type === 'bandpass' ? sin / (2 * q) : sin / (2 * 10 ** (q / 20))
  let b0: number
  let b1: number
  let b2: number
  if (type === 'lowpass') {
    b0 = (1 - cos) / 2
    b1 = 1 - cos
    b2 = b0
  } else if (type === 'highpass') {
    b0 = (1 + cos) / 2
    b1 = -(1 + cos)
    b2 = b0
  } else {
    b0 = alpha
    b1 = 0
    b2 = -alpha
  }
  const a0 = 1 + alpha
  const a1 = -2 * cos
  const a2 = 1 - alpha
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  return {
    process(x: number) {
      const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
      x2 = x1
      x1 = x
      y2 = y1
      y1 = y
      return y
    },
  } satisfies Biquad
}

/** mulberry32: deterministic noise, so measurements are repeatable. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FLOOR = 0.0001
const TAIL = 0.05

function wave(type: Voice['wave'], phase: number): number {
  switch (type) {
    case 'triangle':
      return phase < 0.25 ? 4 * phase : phase < 0.75 ? 2 - 4 * phase : 4 * phase - 4
    case 'square':
      return phase < 0.5 ? 1 : -1
    case 'sawtooth':
      return phase < 0.5 ? 2 * phase : 2 * phase - 2
    default:
      return Math.sin(2 * Math.PI * phase)
  }
}

function renderVoice(
  v: Voice,
  sr: number,
  noise: Float32Array,
  dry: Float32Array,
  send: Float32Array,
) {
  const start = Math.round((v.at ?? 0) * sr)
  const attack = v.attack ?? 0.003
  const end = attack + v.dur
  const total = Math.min(dry.length - start, Math.ceil((end + TAIL) * sr))
  const q = v.q ?? 0.7
  const filters: Biquad[] = []
  if (v.lowpass) filters.push(biquad('lowpass', v.lowpass, q, sr))
  if (v.highpass) filters.push(biquad('highpass', v.highpass, q, sr))
  if (v.bandpass) filters.push(biquad('bandpass', v.bandpass, q, sr))
  const glide = v.glide ?? v.dur
  let phase = 0
  for (let i = 0; i < total; i++) {
    const t = i / sr
    let x: number
    if (v.wave === 'noise') x = i < noise.length ? (noise[i] as number) : 0
    else {
      const f0 = v.freq ?? 440
      const f =
        v.freqEnd === undefined
          ? f0
          : f0 * (v.freqEnd / f0) ** Math.min(1, t / Math.max(glide, 1e-6))
      x = wave(v.wave, phase)
      phase = (phase + f / sr) % 1
    }
    for (const fl of filters) x = fl.process(x)
    const env =
      t < attack
        ? FLOOR + (v.gain - FLOOR) * (t / attack)
        : t < end
          ? v.gain * (FLOOR / v.gain) ** ((t - attack) / v.dur)
          : FLOOR
    const y = x * env
    const n = start + i
    dry[n] = (dry[n] as number) + y
    if (v.room) send[n] = (send[n] as number) + y
  }
}

export type Rendered = {
  /** Output before the master compressor (pack gain applied). */
  samples: Float32Array
  sampleRate: number
}

export function renderEvent(
  pack: SoundPack,
  event: SoundEvent,
  { sampleRate = 48000, seed = 1 } = {},
): Rendered {
  const voices = expandVoices(pack.events[event])
  const usesRoom = voices.some((v) => v.room) && pack.room
  const span = Math.max(...voices.map((v) => (v.at ?? 0) + (v.attack ?? 0.003) + v.dur + TAIL))
  const length = Math.ceil((span + (usesRoom ? 1 : 0)) * sampleRate)
  const dry = new Float32Array(length)
  const send = new Float32Array(length)
  const random = rng(seed)
  const noise = Float32Array.from({ length: sampleRate }, () => random() * 2 - 1)
  for (const v of voices) renderVoice(v, sampleRate, noise, dry, send)

  const out = new Float32Array(length)
  const room = usesRoom ? pack.room : undefined
  const delay = room ? new Float32Array(Math.max(1, Math.round(room.time * sampleRate))) : null
  const lp = room ? biquad('lowpass', room.lowpass, 1, sampleRate) : null
  let idx = 0
  for (let n = 0; n < length; n++) {
    let wet = 0
    if (room && delay && lp) {
      const y = lp.process(delay[idx] as number)
      delay[idx] = (send[n] as number) + room.feedback * y
      idx = (idx + 1) % delay.length
      wet = room.mix * y
    }
    out[n] = pack.gain * ((dry[n] as number) + wet)
  }
  return { samples: out, sampleRate }
}

export type Measurement = {
  /** Time until the signal stays below −40 dB relative to its peak, ms. */
  audibleMs: number
  /** Peak level in dBFS, before the compressor. */
  peakDb: number
}

export function measure({ samples, sampleRate }: Rendered): Measurement {
  let peak = 0
  for (const s of samples) peak = Math.max(peak, Math.abs(s))
  const floor = peak * 10 ** (-40 / 20)
  let last = 0
  for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i] as number) > floor) last = i
  return { audibleMs: (last / sampleRate) * 1000, peakDb: 20 * Math.log10(peak) }
}

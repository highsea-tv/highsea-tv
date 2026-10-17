// SPDX-License-Identifier: AGPL-3.0-only
// docs/design-language/sound.md#recipe-format

export const SOUND_EVENTS = [
  'navigate',
  'select',
  'back',
  'success',
  'error',
  'notify',
  'arrival',
] as const
export type SoundEvent = (typeof SOUND_EVENTS)[number]

export type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth' | 'noise'

export type Voice = {
  /** Default 'sine'. */
  wave?: Wave
  /** Hz; ignored for noise. */
  freq?: number
  /** Optional pitch drop target, reached after `glide` (default `dur`) seconds. */
  freqEnd?: number
  glide?: number
  /** Start offset, s. */
  at?: number
  /** Linear attack, s. Default 0.003. */
  attack?: number
  /** Exponential decay to silence after the attack, s. */
  dur: number
  /** Peak gain. */
  gain: number
  /** Filters, applied in this order. Lowpass/highpass Q is in dB, bandpass Q is linear (Web Audio). */
  lowpass?: number
  highpass?: number
  bandpass?: number
  /** Default 0.7. */
  q?: number
  /** Send to the room bus. */
  room?: boolean
  /** Extra copies of this voice at freq × mult, with gain × g and dur × d. */
  partials?: [mult: number, gain: number, dur?: number][]
}

export type Room = { time: number; feedback: number; mix: number; lowpass: number }

export type SoundPack = {
  id: string
  name: string
  /** Master gain before the compressor. */
  gain: number
  room?: Room
  events: Record<SoundEvent, Voice[]>
}

/** Master chain after the pack gain. */
export const COMPRESSOR = { threshold: -14, ratio: 3 } as const

/** Default pack, "felt and wood": docs/brand/direction.md#sound. */
export const defaultSoundPack: SoundPack = {
  id: 'felt',
  name: 'Felt',
  gain: 0.9,
  // a short room reflection, not an echo: only notify and arrival use it
  room: { time: 0.045, feedback: 0.12, mix: 0.14, lowpass: 1800 },
  events: {
    // felt tick: a tiny noise transient with a faint body
    navigate: [
      { wave: 'noise', bandpass: 3400, q: 1.4, dur: 0.012, gain: 0.08, attack: 0.0005 },
      { wave: 'triangle', freq: 1180, lowpass: 2400, dur: 0.022, gain: 0.05, attack: 0.001 },
    ],
    // wood tock: firm and short
    select: [
      { wave: 'noise', bandpass: 2600, q: 1.1, dur: 0.014, gain: 0.07, attack: 0.0005 },
      { wave: 'triangle', freq: 560, lowpass: 2200, dur: 0.06, gain: 0.13, attack: 0.001 },
      { freq: 1120, dur: 0.03, gain: 0.03, attack: 0.001 },
    ],
    // the same tock, lower and softer, with a natural pitch drop
    back: [
      { wave: 'noise', bandpass: 1900, q: 1.1, dur: 0.012, gain: 0.05, attack: 0.0005 },
      {
        wave: 'triangle',
        freq: 400,
        freqEnd: 370,
        lowpass: 1600,
        dur: 0.065,
        gain: 0.11,
        attack: 0.001,
      },
    ],
    // two felt-piano notes, a rising major third
    success: [
      {
        wave: 'triangle',
        freq: 523.25,
        lowpass: 2400,
        dur: 0.2,
        gain: 0.08,
        attack: 0.002,
        partials: [[2, 0.18, 0.5]],
      },
      {
        wave: 'triangle',
        freq: 659.25,
        at: 0.075,
        lowpass: 2400,
        dur: 0.28,
        gain: 0.08,
        attack: 0.002,
        partials: [[2, 0.18, 0.5]],
      },
    ],
    // two muted thuds
    error: [
      { wave: 'triangle', freq: 220, lowpass: 900, dur: 0.09, gain: 0.15, attack: 0.001 },
      { wave: 'noise', bandpass: 900, q: 0.9, dur: 0.02, gain: 0.05, attack: 0.0005 },
      { wave: 'triangle', freq: 196, at: 0.11, lowpass: 900, dur: 0.11, gain: 0.14, attack: 0.001 },
    ],
    // a soft two-note chime in a small room
    notify: [
      {
        wave: 'triangle',
        freq: 659.25,
        lowpass: 2600,
        dur: 0.32,
        gain: 0.09,
        attack: 0.002,
        room: true,
        partials: [[2, 0.2, 0.45]],
      },
      {
        wave: 'triangle',
        freq: 987.77,
        at: 0.09,
        lowpass: 2600,
        dur: 0.42,
        gain: 0.07,
        attack: 0.002,
        room: true,
        partials: [[2, 0.16, 0.45]],
      },
    ],
    // launch: a warm low swell, then three felt notes (C major)
    arrival: [
      { wave: 'triangle', freq: 130.81, lowpass: 700, dur: 1.0, gain: 0.08, attack: 0.25 },
      { wave: 'triangle', freq: 196, lowpass: 900, dur: 0.9, gain: 0.05, attack: 0.3 },
      {
        wave: 'triangle',
        freq: 523.25,
        at: 0.32,
        lowpass: 2400,
        dur: 0.45,
        gain: 0.055,
        attack: 0.003,
        room: true,
      },
      {
        wave: 'triangle',
        freq: 659.25,
        at: 0.42,
        lowpass: 2400,
        dur: 0.5,
        gain: 0.05,
        attack: 0.003,
        room: true,
      },
      {
        wave: 'triangle',
        freq: 783.99,
        at: 0.52,
        lowpass: 2400,
        dur: 0.7,
        gain: 0.05,
        attack: 0.003,
        room: true,
      },
    ],
  },
}

/** Expands partials into plain voices: the fundamental plus one voice per partial. */
export function expandVoices(voices: Voice[]): Voice[] {
  return voices.flatMap(({ partials, ...v }) => [
    v,
    ...(partials ?? []).map(([mult, g, d = 1]) => ({
      ...v,
      ...(v.freq !== undefined ? { freq: v.freq * mult } : {}),
      ...(v.freqEnd !== undefined ? { freqEnd: v.freqEnd * mult } : {}),
      gain: v.gain * g,
      dur: v.dur * d,
    })),
  ])
}

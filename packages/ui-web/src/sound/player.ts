// SPDX-License-Identifier: AGPL-3.0-only
// Plays sound packs with Web Audio. The graph matches the offline renderer in @highsea/tokens, so
// what the pack rules measure is what users hear: docs/design-language/sound.md
import {
  COMPRESSOR,
  defaultSoundPack,
  expandVoices,
  NAVIGATE_THROTTLE_MS,
  type SoundEvent,
  type SoundPack,
  type Voice,
} from '@highsea/tokens'

const FLOOR = 0.0001
const TAIL = 0.05
/** How fast a sound is cut when a different event starts, s. */
const CUT = 0.008

export type SoundPlayerOptions = {
  pack?: SoundPack
  /** Off by default everywhere except TV (docs/design-language/sound.md#defaults). */
  enabled?: boolean
  /** Linear volume, 0–1. Admin plays everything 6 dB down: `dbToGain(-6)`. */
  volume?: number
  /** For tests and custom output. Defaults to a new `AudioContext` on first play. */
  createContext?: () => AudioContext
}

export type SoundPlayer = {
  /** Plays an event's sound. `force` plays it even when sound is off (previews in settings). */
  play(event: SoundEvent, options?: { force?: boolean }): void
  readonly enabled: boolean
  setEnabled(enabled: boolean): void
  setVolume(volume: number): void
  setPack(pack: SoundPack): void
  /** Closes the audio context. */
  dispose(): void
}

export const dbToGain = (db: number) => 10 ** (db / 20)

type Graph = {
  ctx: AudioContext
  master: GainNode
  room: GainNode | null
  noise: AudioBuffer
}

export function createSoundPlayer(options: SoundPlayerOptions = {}): SoundPlayer {
  let pack = options.pack ?? defaultSoundPack
  let enabled = options.enabled ?? false
  let volume = options.volume ?? 1
  let graph: Graph | null = null
  let lastNavigate = Number.NEGATIVE_INFINITY
  let current: { event: SoundEvent; bus: GainNode; until: number } | null = null

  const build = (): Graph => {
    const ctx = options.createContext?.() ?? new AudioContext()
    const master = ctx.createGain()
    master.gain.value = pack.gain * volume
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = COMPRESSOR.threshold
    comp.ratio.value = COMPRESSOR.ratio
    master.connect(comp)
    comp.connect(ctx.destination)

    // the shared room bus: send → delay → lowpass → (feedback → delay) + (mix → master)
    let room: GainNode | null = null
    if (pack.room) {
      room = ctx.createGain()
      const delay = ctx.createDelay(1)
      delay.delayTime.value = pack.room.time
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = pack.room.lowpass
      lp.Q.value = 1
      const feedback = ctx.createGain()
      feedback.gain.value = pack.room.feedback
      const wet = ctx.createGain()
      wet.gain.value = pack.room.mix
      room.connect(delay)
      delay.connect(lp)
      lp.connect(feedback)
      feedback.connect(delay)
      lp.connect(wet)
      wet.connect(master)
    }

    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return { ctx, master, room, noise }
  }

  const voice = (g: Graph, v: Voice, bus: GainNode, t0: number) => {
    const { ctx } = g
    const start = t0 + (v.at ?? 0)
    const attack = v.attack ?? 0.003
    const env = ctx.createGain()
    env.gain.setValueAtTime(FLOOR, start)
    env.gain.linearRampToValueAtTime(v.gain, start + attack)
    env.gain.exponentialRampToValueAtTime(FLOOR, start + attack + v.dur)

    let src: AudioScheduledSourceNode
    if (v.wave === 'noise') {
      const buffer = ctx.createBufferSource()
      buffer.buffer = g.noise
      src = buffer
    } else {
      const osc = ctx.createOscillator()
      osc.type = v.wave ?? 'sine'
      osc.frequency.setValueAtTime(v.freq ?? 440, start)
      if (v.freqEnd !== undefined)
        osc.frequency.exponentialRampToValueAtTime(v.freqEnd, start + (v.glide ?? v.dur))
      src = osc
    }

    let node: AudioNode = src
    for (const type of ['lowpass', 'highpass', 'bandpass'] as const) {
      const freq = v[type]
      if (!freq) continue
      const filter = ctx.createBiquadFilter()
      filter.type = type
      filter.frequency.value = freq
      filter.Q.value = v.q ?? 0.7
      node.connect(filter)
      node = filter
    }
    node.connect(env)
    env.connect(bus)
    if (v.room && g.room) env.connect(g.room)
    src.start(start)
    src.stop(start + attack + v.dur + TAIL)
    return start + attack + v.dur
  }

  return {
    play(event, { force = false } = {}) {
      if (!enabled && !force) return
      graph ??= build()
      const g = graph
      if (g.ctx.state === 'suspended') void g.ctx.resume()
      const now = g.ctx.currentTime
      // held keys auto-repeat faster than the ear wants
      if (event === 'navigate') {
        if ((now - lastNavigate) * 1000 < NAVIGATE_THROTTLE_MS) return
        lastNavigate = now
      }
      // two different events never overlap, except notify over others
      if (current && current.event !== event && current.until > now && event !== 'notify') {
        if (current.event !== 'notify') {
          current.bus.gain.setValueAtTime(1, now)
          current.bus.gain.linearRampToValueAtTime(0, now + CUT)
        }
      }
      const bus = g.ctx.createGain()
      bus.connect(g.master)
      const t0 = now + 0.01
      let until = t0
      for (const v of expandVoices(pack.events[event]))
        until = Math.max(until, voice(g, v, bus, t0))
      if (event !== 'notify' || !current || current.until <= now) current = { event, bus, until }
    },
    get enabled() {
      return enabled
    },
    setEnabled(value) {
      enabled = value
    },
    setVolume(value) {
      volume = value
      if (graph) graph.master.gain.value = pack.gain * volume
    },
    setPack(next) {
      if (next === pack) return
      pack = next
      // the room bus and master gain depend on the pack
      void graph?.ctx.close()
      graph = null
      current = null
    },
    dispose() {
      void graph?.ctx.close()
      graph = null
      current = null
    },
  }
}

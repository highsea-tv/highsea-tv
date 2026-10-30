// SPDX-License-Identifier: AGPL-3.0-only
// Interface sounds on the native apps (sound.md): a pack's recipes are played through Web Audio in
// the browsers, which React Native doesn't have, so each event is rendered once with the tokens'
// offline renderer (the same graph, `@highsea-tv/tokens`' render.ts), written to the cache as a
// 16-bit WAV, and played with expo-audio, mixed with whatever else is playing
// (https://docs.expo.dev/versions/latest/sdk/audio/). The packs peak between −32 and −16 dBFS
// (rules.ts), under the compressor's threshold, so leaving the compressor out changes nothing.
// Navigate sounds at most every 80 ms while a key is held (NAVIGATE_THROTTLE_MS).
import {
  defaultSoundPack,
  NAVIGATE_THROTTLE_MS,
  renderEvent,
  type SoundEvent,
  type SoundPack,
} from '@highsea-tv/tokens'
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio'
import { File, Paths } from 'expo-file-system'
import { useCallback, useEffect, useRef } from 'react'

const SAMPLE_RATE = 44100

/** Float samples as a mono 16-bit PCM WAV file (RIFF, WAVE_FORMAT_PCM). */
export function wav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const v = new DataView(bytes.buffer)
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i))
  }
  text(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  text(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] as number))
    v.setInt16(44 + i * 2, Math.round(s * 0x7fff), true)
  }
  return bytes
}

async function load(pack: SoundPack, event: SoundEvent): Promise<AudioPlayer> {
  const file = new File(Paths.cache, `sound-${pack.id}-${event}.wav`)
  if (!file.exists) {
    const { samples, sampleRate } = renderEvent(pack, event, { sampleRate: SAMPLE_RATE })
    file.create()
    await file.write(wav(samples, sampleRate))
  }
  return createAudioPlayer({ uri: file.uri })
}

/**
 * Plays the pack's events while `on`, at `volume` (0–1). The players are made once per pack and
 * let go with it.
 */
export function useSounds({
  on,
  volume,
  pack = defaultSoundPack,
}: {
  on: boolean
  volume: number
  pack?: SoundPack
}) {
  const players = useRef(new Map<SoundEvent, AudioPlayer>())
  const lastNavigate = useRef(0)
  const live = useRef({ on, volume })
  live.current = { on, volume }

  useEffect(() => {
    if (!on) return
    let gone = false
    const made = players.current
    void setAudioModeAsync({ interruptionMode: 'mixWithOthers' }).catch(() => {})
    for (const event of ['navigate', 'select', 'back', 'success', 'error'] as const)
      load(pack, event)
        .then((p) => {
          if (gone) p.remove()
          else made.set(event, p)
        })
        .catch(() => {})
    return () => {
      gone = true
      for (const p of made.values()) p.remove()
      made.clear()
    }
  }, [on, pack])

  return useCallback((event: SoundEvent) => {
    if (!live.current.on) return
    if (event === 'navigate') {
      const now = Date.now()
      if (now - lastNavigate.current < NAVIGATE_THROTTLE_MS) return
      lastNavigate.current = now
    }
    const p = players.current.get(event)
    if (!p) return
    p.volume = live.current.volume
    void p.seekTo(0).then(() => p.play())
  }, [])
}

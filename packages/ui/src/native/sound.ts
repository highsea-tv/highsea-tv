// SPDX-License-Identifier: AGPL-3.0-only
// The interface's sounds (docs/design-language/sound.md), a pair of platform files: on the web
// (sound.web.ts) a player that synthesizes the token sound pack with Web Audio, as the web
// renderer's did, for the admin's previews in Settings › Appearance; here, on the phone and the TV,
// a player that stays silent until native sound comes (parity.ts's SoundProvider).
import type { SoundEvent, SoundPack } from '@highsea-tv/tokens'

export type SoundPlayerOptions = {
  pack?: SoundPack
  /** Off by default everywhere except TV (docs/design-language/sound.md#defaults). */
  enabled?: boolean
  /** Linear volume, 0–1. Admin plays everything 6 dB down: `dbToGain(-6)`. */
  volume?: number
  /** For tests and custom output: on the web, an `AudioContext`, made on first play by default. */
  createContext?: () => unknown
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

/** A player that keeps its settings and plays nothing. */
export function createSoundPlayer(options: SoundPlayerOptions = {}): SoundPlayer {
  let enabled = options.enabled ?? false
  return {
    play() {},
    get enabled() {
      return enabled
    },
    setEnabled(value) {
      enabled = value
    },
    setVolume() {},
    setPack() {},
    dispose() {},
  }
}

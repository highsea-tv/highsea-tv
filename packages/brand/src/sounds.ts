// SPDX-License-Identifier: AGPL-3.0-only
// The default sound pack as audio files, for players without Web Audio (React Native).
// The recipes in @highsea/tokens are the source; these files are rendered from them.
import { defaultSoundPack, renderEvent, SOUND_EVENTS, type SoundEvent } from '@highsea/tokens'

export const SOUND_SAMPLE_RATE = 48000

/** File name per event, under `sounds/`. */
export const SOUND_FILES = Object.fromEntries(
  SOUND_EVENTS.map((e) => [e, `${defaultSoundPack.id}-${e}.wav`]),
) as Record<SoundEvent, string>

/**
 * Renders one event of the default pack, trimmed where it stays 60 dB below its peak. The files
 * hold the signal before the master compressor, which never engages at these levels.
 */
export function renderSoundFile(event: SoundEvent): Float32Array {
  const { samples } = renderEvent(defaultSoundPack, event, { sampleRate: SOUND_SAMPLE_RATE })
  let peak = 0
  for (const s of samples) peak = Math.max(peak, Math.abs(s))
  const floor = peak * 10 ** (-60 / 20)
  let end = samples.length
  while (end > 0 && Math.abs(samples[end - 1] as number) < floor) end--
  return samples.slice(0, end)
}

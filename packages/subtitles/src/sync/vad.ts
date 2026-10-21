// SPDX-License-Identifier: AGPL-3.0-only
/// <reference path="./fvad.d.ts" />
// Voice activity (ADR 0044; the owner's answer 9): WebRTC's VAD through `@echogarden/fvad-wasm`,
// libfvad built to WebAssembly, on 10 ms frames of 16 kHz mono 16-bit audio in mode 3, as ffsubsync
// runs it (https://github.com/smacke/ffsubsync/blob/master/ffsubsync/speech_transformers.py,
// `_make_webrtcvad_detector`). Audio arrives in chunks from ffmpeg and is never held whole: each
// chunk becomes frames as it comes, one byte per 10 ms.
import fvad, { type FvadModule } from '@echogarden/fvad-wasm'
import { closeGaps } from './grid.ts'

export const SAMPLE_RATE = 16_000
/** 10 ms at 16 kHz. */
const FRAME_SAMPLES = 160
const FRAME_BYTES = FRAME_SAMPLES * 2

let loaded: Promise<FvadModule> | null = null
const load = () => {
  loaded ??= fvad()
  return loaded
}

export type Vad = {
  /** A chunk of signed 16-bit little-endian samples, any length. */
  push(chunk: Uint8Array): void
  /** The frames so far, gaps under 200 ms closed; frees the detector. */
  finish(): Uint8Array
}

/** A detector for one stream of audio. */
export async function createVad(mode = 3): Promise<Vad> {
  const m = await load()
  const inst = m._fvad_new()
  if (inst === 0) throw new Error('The voice detector couldn’t start.')
  if (m._fvad_set_mode(inst, mode) !== 0 || m._fvad_set_sample_rate(inst, SAMPLE_RATE) !== 0) {
    m._fvad_free(inst)
    throw new Error('The voice detector refused its settings.')
  }
  const ptr = m._malloc(FRAME_BYTES)
  const frame = new Int16Array(FRAME_SAMPLES)
  const bytes = new Uint8Array(frame.buffer)
  let filled = 0
  let out = new Uint8Array(1 << 16)
  let count = 0
  let done = false

  const emit = () => {
    // HEAP16 is a view the module may replace when its memory grows: read it each time
    m.HEAP16.set(frame, ptr >> 1)
    const speech = m._fvad_process(inst, ptr, FRAME_SAMPLES)
    if (count === out.length) {
      const bigger = new Uint8Array(out.length * 2)
      bigger.set(out)
      out = bigger
    }
    out[count++] = speech === 1 ? 1 : 0
  }

  return {
    push(chunk) {
      if (done) throw new Error('The voice detector has finished.')
      let at = 0
      while (at < chunk.length) {
        const take = Math.min(FRAME_BYTES - filled, chunk.length - at)
        bytes.set(chunk.subarray(at, at + take), filled)
        filled += take
        at += take
        if (filled === FRAME_BYTES) {
          emit()
          filled = 0
        }
      }
    },
    finish() {
      if (!done) {
        done = true
        m._free(ptr)
        m._fvad_free(inst)
      }
      return closeGaps(out.slice(0, count))
    },
  }
}

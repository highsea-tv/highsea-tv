// SPDX-License-Identifier: AGPL-3.0-only
// The speech in an audio stream (ADR 0044; checkpoint 7, The design, steps 2 and 3): ffmpeg decodes
// it to 16 kHz mono signed 16-bit PCM on its standard output (https://ffmpeg.org/ffmpeg.html `-ac`,
// `-ar`, `-f`; https://ffmpeg.org/ffmpeg-formats.html, the raw PCM muxers), with ffsubsync's
// `aresample=async=1` so a gap in the audio's timestamps doesn't move everything after it. The PCM
// goes to the VAD as it arrives and is never held whole: a two-hour film is about 230 MB of it.
import { ffmpegBinary, run } from './binaries.ts'
import { createVad, SAMPLE_RATE } from './vad.ts'

export async function speechFrames(
  file: string,
  index: number,
  options: { signal?: AbortSignal; binary?: string } = {},
): Promise<Uint8Array> {
  const vad = await createVad()
  try {
    await run(
      options.binary ?? ffmpegBinary(),
      [
        ...['-nostdin', '-v', 'error', '-i', file, '-map', `0:${index}`, '-vn'],
        ...['-ac', '1', '-ar', String(SAMPLE_RATE), '-acodec', 'pcm_s16le'],
        ...['-af', 'aresample=async=1', '-f', 's16le', '-'],
      ],
      {
        signal: options.signal,
        onData: (chunk) => vad.push(chunk),
        failed: 'ffmpeg couldn’t read the file’s audio.',
      },
    )
  } catch (e) {
    vad.finish() // frees the detector
    throw e
  }
  return vad.finish()
}

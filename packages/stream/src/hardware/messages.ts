// SPDX-License-Identifier: AGPL-3.0-only
// What Settings › Playback says about each hardware path (ADR 0021, playback-settings.md): why one
// can't be used here, and what its check found, with what to try when it failed. The reasons a
// path is unavailable are the prototype's own words.
import { createT, defineMessages, type T } from '@highsea-tv/i18n'

export const hardwareMessages = defineMessages({
  // Why a path can't be used here
  'unavailable.dri': 'No /dev/dri in the container.',
  'unavailable.nvidia': 'No NVIDIA GPU in the container.',
  'unavailable.nvidiaHost':
    'This computer has an NVIDIA GPU, but the container doesn’t. Install NVIDIA’s container toolkit on the host and make it Docker’s default runtime, then restart highsea.',
  'unavailable.mac': 'Only when highsea runs on a Mac, outside Docker.',
  'unavailable.linux': 'Only when highsea runs on Linux.',
  'unavailable.notIntel': 'Only on Intel graphics. This is {name}.',
  'unavailable.i965': 'Only with Intel’s media driver (iHD). This chip has the older i965 driver.',
  'unavailable.encoder': 'This ffmpeg can’t encode with {encoder}.',
  // What a check found
  'check.passed':
    'Decodes 10-bit HEVC and encodes H.264{lowPower, select, true { in low-power mode} other {}}. {toneMap, select, gpu {Tone maps HDR on the graphics chip.} cpu {HDR is tone mapped on the processor.} other {HDR isn’t tone mapped.}}',
  'check.noClip': 'highsea couldn’t make the check’s clip. This ffmpeg needs libx265.',
  'check.openDri':
    'highsea couldn’t open {device}. Pass /dev/dri through to the container, as the install guide shows.',
  'check.qsvOlder':
    'Quick Sync needs Intel graphics from Tiger Lake (2020) on, and these are older. VAAPI works on them.',
  'check.mediaDriver':
    'The Intel media driver didn’t load, so ffmpeg couldn’t open the GPU. VAAPI works on the same graphics without it.',
  'check.nvidia':
    'highsea couldn’t find an NVIDIA GPU. Install NVIDIA’s container toolkit on the host and make it Docker’s default runtime.',
  'check.failed': 'ffmpeg opened the GPU, but the transcode failed: {line}',
  'check.timedOut': 'The transcode didn’t finish in 2 minutes.',
  'check.failedPlaying':
    'A film’s transcode failed on it, so the film went on on the processor. System › Logs has ffmpeg’s output.',
})

export type HardwareMessages = typeof hardwareMessages
export type HardwareT = T<HardwareMessages>

export const hardwareT = (locale = 'en'): HardwareT => createT(hardwareMessages, locale)

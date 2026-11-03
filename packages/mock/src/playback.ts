// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Playback (docs/product/playback-settings.md; checkpoint 4.0b): how highsea transcodes,
// and the hardware it found to do it. The mock finds no hardware on the empty server and an Intel
// GPU on Harbor; a check takes a few seconds and passes, or fails when the prototype asks it to.

export type AccelerationPath = 'vaapi' | 'qsv' | 'nvenc' | 'videotoolbox'

export type PlaybackSettings = {
  /** `auto` uses the first path whose check passed; an unchecked path is never used on its own. */
  acceleration: 'auto' | AccelerationPath | 'off'
  /** Convert HDR to SDR when a screen can't show HDR. */
  toneMapping: boolean
  /** Transcodes at once; more wait for one to finish. */
  maxTranscodes: number
  preset: 'speed' | 'balanced' | 'quality'
  /** The most a stream away from home is sent, in Mbps; null for no limit. */
  remoteMaxMbps: number | null
  cachePath: string
  /** The transcode cache's limit, in GB. Trickplay images aren't counted. */
  cacheLimitGb: number
}

export type PathCheck = {
  result: 'pass' | 'fail'
  /** Frames a second for the check's clip: 1080p HEVC to H.264. */
  fps?: number
  detail: string
  at: number
}

export type PathRuntime = {
  id: AccelerationPath
  /** What highsea found: a render node, a GPU, or nothing. */
  device: string | null
  name: string | null
  check: PathCheck | null
  /** While a check runs, when it ends. */
  checkingUntil: number
}

export type PlaybackRuntime = {
  /** Where highsea runs: VideoToolbox needs macOS outside a container. */
  host: 'container' | 'macos'
  paths: PathRuntime[]
  transcodeBytes: number
  trickplayBytes: number
  /** Prototype only: the next check fails, to review that state. */
  failNext: boolean
}

export type PathStatus = PathRuntime & {
  label: string
  /** What it is, in a line. */
  line: string
  /** Why it can't be used here, when it can't. */
  unavailable: string | null
  checking: boolean
}

export type PlaybackStatus = {
  paths: PathStatus[]
  /** The path transcodes use now, or null for the processor. */
  inUse: AccelerationPath | null
  cache: { transcodeBytes: number; trickplayBytes: number; limitBytes: number; over: boolean }
}

const GB = 1_000_000_000

const pathInfo: Record<AccelerationPath, { label: string; line: string }> = {
  vaapi: { label: 'VAAPI', line: 'Intel and AMD graphics on Linux, through /dev/dri.' },
  qsv: {
    label: 'Intel Quick Sync',
    line: 'Intel graphics on Linux, through the Intel media driver.',
  },
  nvenc: { label: 'NVIDIA NVENC', line: 'NVIDIA graphics, through NVIDIA’s container toolkit.' },
  videotoolbox: { label: 'VideoToolbox', line: 'Apple silicon and Intel Macs.' },
}

export const pathLabel = (id: AccelerationPath) => pathInfo[id].label

export const defaultPlaybackSettings = (): PlaybackSettings => ({
  acceleration: 'auto',
  toneMapping: true,
  maxTranscodes: 3,
  preset: 'balanced',
  remoteMaxMbps: 8,
  cachePath: '/config/cache/transcodes',
  cacheLimitGb: 20,
})

export const seedPlayback = (kind: 'populated' | 'empty', now: number): PlaybackRuntime => {
  const intel = kind === 'populated'
  return {
    host: 'container',
    paths: [
      {
        id: 'vaapi',
        device: intel ? '/dev/dri/renderD128' : null,
        name: intel ? 'Intel UHD Graphics 770' : null,
        check: intel
          ? {
              result: 'pass',
              fps: 286,
              detail: 'Decodes and encodes H.264 and HEVC, 10-bit included.',
              at: now - 2 * 86_400_000,
            }
          : null,
        checkingUntil: 0,
      },
      {
        id: 'qsv',
        device: intel ? '/dev/dri/renderD128' : null,
        name: intel ? 'Intel UHD Graphics 770' : null,
        check: null,
        checkingUntil: 0,
      },
      { id: 'nvenc', device: null, name: null, check: null, checkingUntil: 0 },
      { id: 'videotoolbox', device: null, name: null, check: null, checkingUntil: 0 },
    ],
    transcodeBytes: intel ? 6.1 * GB : 0,
    trickplayBytes: intel ? 12.3 * GB : 0,
    failNext: false,
  }
}

const unavailable = (p: PathRuntime, host: PlaybackRuntime['host']): string | null => {
  if (p.id === 'videotoolbox')
    return host === 'macos' ? null : 'Only when highsea runs on a Mac, outside Docker.'
  if (p.device) return null
  if (p.id === 'nvenc') return 'No NVIDIA GPU in the container.'
  return 'No /dev/dri in the container.'
}

export function playbackStatus(
  s: PlaybackSettings,
  r: PlaybackRuntime,
  now: number,
): PlaybackStatus {
  const paths = r.paths.map(
    (p): PathStatus => ({
      ...p,
      ...pathInfo[p.id],
      unavailable: unavailable(p, r.host),
      checking: p.checkingUntil > now,
    }),
  )
  const passed = (p: PathStatus) => !p.unavailable && p.check?.result === 'pass'
  const inUse =
    s.acceleration === 'off'
      ? null
      : s.acceleration === 'auto'
        ? (paths.find(passed)?.id ?? null)
        : passed(paths.find((p) => p.id === s.acceleration) as PathStatus)
          ? s.acceleration
          : null
  const limitBytes = s.cacheLimitGb * GB
  return {
    paths,
    inUse,
    cache: {
      transcodeBytes: r.transcodeBytes,
      trickplayBytes: r.trickplayBytes,
      limitBytes,
      over: r.transcodeBytes > limitBytes,
    },
  }
}

/** A check ends: it passes on hardware that's there, unless the prototype asked for a failure. */
export function finishCheck(p: PathRuntime, r: PlaybackRuntime, now: number): PathCheck {
  if (!p.device)
    return {
      result: 'fail',
      detail:
        p.id === 'nvenc'
          ? 'highsea couldn’t find an NVIDIA GPU. Install NVIDIA’s container toolkit on the host and give the container the GPU.'
          : 'highsea couldn’t open /dev/dri/renderD128. Pass /dev/dri through to the container.',
      at: now,
    }
  if (r.failNext) {
    r.failNext = false
    return {
      result: 'fail',
      detail:
        p.id === 'qsv'
          ? 'The Intel media driver didn’t load, so ffmpeg couldn’t open the GPU. VAAPI works on the same graphics without it.'
          : 'ffmpeg opened the GPU but the encode failed partway. The log has ffmpeg’s output.',
      at: now,
    }
  }
  return {
    result: 'pass',
    fps: p.id === 'qsv' ? 341 : 286,
    detail: 'Decodes and encodes H.264 and HEVC, 10-bit included.',
    at: now,
  }
}

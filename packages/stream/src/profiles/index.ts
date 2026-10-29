// SPDX-License-Identifier: AGPL-3.0-only
// Device profiles (ADR 0052): what a client plays as it is, in one shape the decision reasons
// over. Built-in profiles are conservative: a codec is in one only where the platform's own
// documentation says it plays. A client may report what it finds it can play, which replaces the
// built-in profile's lists for that device. Browser-safe: the web client builds its report with
// these schemas.
import { z } from 'zod'

/** Containers by what highsea calls them; `containerOf` maps ffprobe's names onto these. */
export const Container = z.enum(['mp4', 'mov', 'mkv', 'webm', 'mpegts', 'avi', 'ogg'])
export type Container = z.infer<typeof Container>

/** HDR formats a client shows, from the probe's `HdrFormat` (`hdr10plus` falls back to `hdr10`). */
export const Hdr = z.enum(['hdr10', 'hdr10plus', 'hlg', 'dv'])
export type Hdr = z.infer<typeof Hdr>

export const VideoSupport = z.object({
  /** ffprobe's `codec_name`: `h264`, `hevc`, `av1`, `vp9`, `vp8`. */
  codec: z.string(),
  /** ffprobe's profile names, lower case (`main`, `high`, `main 10`); absent takes any. */
  profiles: z.array(z.string()).optional(),
  /** The bit depths it decodes. */
  bitDepths: z.array(z.number().int()).default([8]),
  maxWidth: z.number().int().positive().optional(),
  maxHeight: z.number().int().positive().optional(),
  /** The codec tag it needs in MP4 (Apple's players take HEVC only as `hvc1`). */
  tag: z.string().optional(),
})
export type VideoSupport = z.infer<typeof VideoSupport>

export const AudioSupport = z.object({
  /** ffprobe's `codec_name`: `aac`, `ac3`, `eac3`, `opus`, `flac`, `mp3`. */
  codec: z.string(),
  maxChannels: z.number().int().positive().default(2),
})
export type AudioSupport = z.infer<typeof AudioSupport>

/** Subtitle formats a client draws itself; anything else is sent as WebVTT or burned in. */
export const SubtitleFormat = z.enum(['webvtt', 'srt', 'ass', 'pgs', 'vobsub'])
export type SubtitleFormat = z.infer<typeof SubtitleFormat>

export const DeviceProfile = z.object({
  id: z.string(),
  name: z.string(),
  containers: z.array(Container),
  video: z.array(VideoSupport),
  hdr: z.object({
    formats: z.array(Hdr).default([]),
    /** Dolby Vision profiles it shows, when `formats` has `dv`. */
    dolbyVision: z.array(z.number().int()).default([]),
  }),
  audio: z.array(AudioSupport),
  /** Formats it passes through to a receiver without decoding them. */
  passthrough: z.array(z.string()).default([]),
  subtitles: z.array(SubtitleFormat),
  /** Whether it can choose among a file's audio tracks; without it, only the file's default plays. */
  audioTracks: z.boolean(),
  hls: z.object({
    /** Plays HLS itself (Safari, AVPlayer); otherwise through hls.js over Media Source Extensions. */
    native: z.boolean(),
    /** Plays HLS at all, natively or through Media Source Extensions. */
    supported: z.boolean(),
  }),
  /** Bits a second; the most it asks for, below the server's remote ceiling. */
  maxBitrate: z.number().int().positive().nullable().default(null),
})
export type DeviceProfile = z.infer<typeof DeviceProfile>

/**
 * What a client reports it plays (ADR 0052): any list it sends replaces the built-in profile's,
 * which both narrows and widens it. Browsers find it with `MediaSource.isTypeSupported()` and
 * `MediaCapabilities.decodingInfo()`
 * (https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities/decodingInfo).
 */
export const ReportedProfile = DeviceProfile.pick({
  containers: true,
  video: true,
  hdr: true,
  audio: true,
  subtitles: true,
  audioTracks: true,
}).partial()
export type ReportedProfile = z.infer<typeof ReportedProfile>

/** The built-in profile with a device's report laid over it. */
export const withReport = (base: DeviceProfile, report: ReportedProfile | null): DeviceProfile =>
  report
    ? { ...base, ...Object.fromEntries(Object.entries(report).filter(([, v]) => v !== undefined)) }
    : base

// The browsers' codecs and containers are MDN's: the web video and audio codec guides and the
// container guide (https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats). All four
// play MP4 and WebM; none lists Matroska. H.264 plays everywhere at 8 bits (High 10 isn't in any
// browser's list). HEVC is Chrome's on every Mac (macOS 11+) but only with hardware support on
// Windows and Linux, and Firefox's only from 134 to 137 with conditions, so those are left to the
// device's report. AV1 is Safari's only on Apple's newest hardware, so the same. Opus plays in
// Safari only in CAF, and Vorbis not at all. Safari plays AC-3 and E-AC-3, and takes HEVC only
// tagged `hvc1` (Apple's HLS authoring specification,
// https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices).
// No browser documents HDR it always shows, so HDR comes only from a report; Safari's HLS is
// native. `audioTracks` is `HTMLMediaElement.audioTracks`, which only Safari ships
// (https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/audioTracks). Browsers draw
// WebVTT through `<track>`.

const h264: VideoSupport = {
  codec: 'h264',
  profiles: ['constrained baseline', 'baseline', 'main', 'high'],
  bitDepths: [8],
}
const vp8: VideoSupport = { codec: 'vp8', bitDepths: [8] }
const vp9: VideoSupport = { codec: 'vp9', profiles: ['profile 0', 'profile 2'], bitDepths: [8, 10] }
const av1: VideoSupport = { codec: 'av1', profiles: ['main'], bitDepths: [8, 10] }
const hevc: VideoSupport = { codec: 'hevc', profiles: ['main', 'main 10'], bitDepths: [8, 10] }
const webAudio: AudioSupport[] = [
  { codec: 'aac', maxChannels: 8 },
  { codec: 'mp3', maxChannels: 2 },
  { codec: 'flac', maxChannels: 8 },
]
const noHdr = { formats: [], dolbyVision: [] }

const chromium: DeviceProfile = {
  id: 'web-chromium',
  name: 'Chrome',
  containers: ['mp4', 'webm'],
  video: [h264, vp8, vp9, av1],
  hdr: noHdr,
  audio: [...webAudio, { codec: 'opus', maxChannels: 8 }, { codec: 'vorbis', maxChannels: 8 }],
  passthrough: [],
  subtitles: ['webvtt'],
  audioTracks: false,
  hls: { native: false, supported: true },
  maxBitrate: null,
}

export const BUILT_IN: readonly DeviceProfile[] = [
  chromium,
  {
    ...chromium,
    id: 'web-chromium-macos',
    name: 'Chrome on a Mac',
    video: [h264, hevc, vp8, vp9, av1],
  },
  { ...chromium, id: 'web-firefox', name: 'Firefox' },
  {
    id: 'web-safari',
    name: 'Safari',
    containers: ['mp4', 'mov', 'webm'],
    video: [h264, { ...hevc, tag: 'hvc1' }, vp8, vp9],
    hdr: noHdr,
    audio: [
      ...webAudio,
      { codec: 'alac', maxChannels: 8 },
      { codec: 'ac3', maxChannels: 6 },
      { codec: 'eac3', maxChannels: 8 },
    ],
    passthrough: [],
    subtitles: ['webvtt'],
    audioTracks: true,
    hls: { native: true, supported: true },
    maxBitrate: null,
  },
]

export const builtIn = (id: string): DeviceProfile | null =>
  BUILT_IN.find((p) => p.id === id) ?? null

/** The browser's built-in profile, from its engine and OS as the client names them. */
export function browserProfile(
  engine: 'chromium' | 'firefox' | 'safari',
  os: string,
): DeviceProfile {
  const id =
    engine === 'safari'
      ? 'web-safari'
      : engine === 'firefox'
        ? 'web-firefox'
        : os === 'macos'
          ? 'web-chromium-macos'
          : 'web-chromium'
  return builtIn(id) as DeviceProfile
}

/**
 * ffprobe's `format_name` as a container. Matroska and WebM share one demuxer
 * (`matroska,webm`), so the file's extension tells them apart; MP4's demuxer covers QuickTime.
 */
export function containerOf(formatName: string | null, path: string): Container | null {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  const names = (formatName ?? '').split(',')
  if (names.includes('matroska')) return ext === 'webm' ? 'webm' : 'mkv'
  if (names.includes('mp4') || names.includes('mov')) return ext === 'mov' ? 'mov' : 'mp4'
  if (names.includes('mpegts')) return 'mpegts'
  if (names.includes('avi')) return 'avi'
  if (names.includes('ogg')) return 'ogg'
  return null
}

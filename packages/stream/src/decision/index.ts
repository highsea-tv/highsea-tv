// SPDX-License-Identifier: AGPL-3.0-only
// The playback decision (ADR 0051): a version's streams, the person's picks, the client's
// profile (ADR 0052) and the bitrate ceiling in; direct play, direct stream or a transcode out,
// with what's copied and what's made again for each stream, and the reasons as it goes. Pure, so
// its tests run every built-in profile against every kind of file without a device or ffmpeg.
import type { ValuesFor } from '@highsea-tv/i18n'
import type { AudioInfo, MediaInfo, SubtitleInfo, VideoInfo } from '@highsea-tv/media/shared'
import { type Container, containerOf, type DeviceProfile, type Hdr } from '../profiles/index.ts'
import { type StreamMessageId, type StreamMessages, streamT } from './messages.ts'

export { type StreamMessageId, streamMessages, streamT } from './messages.ts'

export type Reason = {
  kind: 'accepted' | 'rejected' | 'warning'
  code: StreamMessageId
  message: string
}

/** The most a stream is sent (Settings › Playback): bits a second, and a picture height. */
export type Ceiling = { bitrate: number | null; height: number | null }

export type SubtitlePick =
  | { kind: 'embedded'; index: number }
  /** A sidecar file (ADR 0043), by its format: `srt`, `ass`, `vtt`. */
  | { kind: 'sidecar'; id: string; format: string }

export type DecisionInput = {
  file: { path: string; size: number; info: MediaInfo }
  profile: DeviceProfile
  /** The audio stream's index; unset picks the file's default. */
  audio?: number | null
  subtitle?: SubtitlePick | null
  /** Null at home, where streams are never limited. */
  ceiling?: Ceiling | null
  /** What the server can do (ADR 0051): burning in image subtitles and tone mapping come at 4.3. */
  server?: { burnIn: boolean; toneMapping: boolean }
  locale?: string
}

export type Method = 'direct-play' | 'direct-stream' | 'transcode' | 'unplayable'

export type VideoPlan =
  | { action: 'copy' }
  | {
      action: 'transcode'
      codec: 'h264'
      /** The picture's height, at most the source's and the ceiling's. */
      height: number
      /** Bits a second, for `-maxrate`. */
      bitrate: number
      /** Made into SDR: with tone mapping when the server has it (4.3), plainly until then. */
      toSdr: boolean
    }

export type AudioPlan =
  | { index: number; action: 'copy' }
  | { index: number; action: 'transcode'; codec: 'aac'; channels: number }

export type SubtitlePlan = {
  pick: SubtitlePick
  /** `external`: sent as WebVTT; `embedded`: the client draws it from the file. */
  delivery: 'external' | 'embedded' | 'burn-in' | 'unavailable'
}

export type PlaybackDecision = {
  method: Method
  container: Container | null
  /** Null when the file has no picture. */
  video: VideoPlan | null
  audio: AudioPlan | null
  subtitle: SubtitlePlan | null
  /** The file's bits a second, from its size and length; null when its length isn't known. */
  bitrate: number | null
  reasons: Reason[]
}

/** Codecs HLS carries in fragmented MP4 (RFC 8216 § 3.3; Apple's HLS authoring specification). */
const HLS_VIDEO = new Set(['h264', 'hevc', 'av1'])
const HLS_AUDIO = new Set(['aac', 'ac3', 'eac3', 'flac', 'opus', 'mp3', 'alac'])

const TEXT_SUBTITLES: Record<string, string> = {
  subrip: 'srt',
  srt: 'srt',
  ass: 'ass',
  ssa: 'ass',
  webvtt: 'webvtt',
  vtt: 'webvtt',
  mov_text: 'srt',
  text: 'srt',
}
const IMAGE_SUBTITLES: Record<string, string> = {
  hdmv_pgs_subtitle: 'pgs',
  dvd_subtitle: 'vobsub',
  dvb_subtitle: 'dvb',
}

/**
 * A transcode's bitrate when nothing caps it, by height: the tiers Settings › Playback offers
 * (playback-settings.md), at the higher of each, since a stream at home is never limited.
 */
const transcodeBitrate = (height: number) =>
  height <= 480 ? 2_000_000 : height <= 720 ? 4_000_000 : height <= 1080 ? 12_000_000 : 40_000_000

const VIDEO_NAMES: Record<string, string> = {
  h264: 'H.264',
  hevc: 'HEVC',
  av1: 'AV1',
  vp8: 'VP8',
  vp9: 'VP9',
  mpeg4: 'MPEG-4',
  mpeg2video: 'MPEG-2',
  vc1: 'VC-1',
}
const AUDIO_NAMES: Record<string, string> = {
  aac: 'AAC',
  ac3: 'Dolby Digital',
  eac3: 'Dolby Digital Plus',
  truehd: 'Dolby TrueHD',
  dts: 'DTS',
  flac: 'FLAC',
  opus: 'Opus',
  mp3: 'MP3',
  vorbis: 'Vorbis',
  alac: 'ALAC',
}
const CONTAINER_NAMES: Record<Container, string> = {
  mp4: 'MP4',
  mov: 'QuickTime',
  mkv: 'Matroska',
  webm: 'WebM',
  mpegts: 'MPEG-TS',
  avi: 'AVI',
  ogg: 'Ogg',
}
const HDR_NAMES: Record<Hdr, string> = {
  hdr10: 'HDR10',
  hdr10plus: 'HDR10+',
  hlg: 'HLG',
  dv: 'Dolby Vision',
}
const SUBTITLE_NAMES: Record<string, string> = {
  srt: 'SRT',
  ass: 'ASS',
  webvtt: 'WebVTT',
  pgs: 'PGS',
  vobsub: 'VobSub',
  dvb: 'DVB',
}

const videoName = (codec: string) => VIDEO_NAMES[codec] ?? codec.toUpperCase()
const audioName = (a: AudioInfo) =>
  a.codec === 'dts' && a.profile
    ? a.profile
    : (AUDIO_NAMES[a.codec] ?? (a.codec.startsWith('pcm_') ? 'PCM' : a.codec.toUpperCase()))
const mbps = (bits: number) => `${(bits / 1_000_000).toFixed(bits < 10_000_000 ? 1 : 0)} Mbps`

/**
 * The picture's height as the ceiling's tiers mean it: a 1920 × 800 film is 1080p, so the width
 * counts as well, at 16:9.
 */
export const tierHeight = (v: Pick<VideoInfo, 'width' | 'height'>) =>
  Math.max(v.height, Math.round((v.width * 9) / 16))

/** The track a player picks by itself: the first marked default, else the first. */
const defaultAudio = (audio: AudioInfo[]) => audio.find((a) => a.default) ?? audio[0] ?? null

/**
 * What the probe's HDR needs from the client: the format it is, and what it falls back to on a
 * client without it (Dolby Vision profile 8.1 carries an HDR10 base layer, 8.4 HLG, 8.2 SDR;
 * profile 5 has none: https://professionalsupport.dolby.com/s/article/What-is-Dolby-Vision-Profile).
 */
function hdrNeed(v: VideoInfo): { format: Hdr; fallback: Hdr | 'sdr' | null } | null {
  switch (v.hdr) {
    case 'none':
      return null
    case 'pq':
    case 'hdr10':
      return { format: 'hdr10', fallback: null }
    case 'hdr10plus':
      return { format: 'hdr10plus', fallback: 'hdr10' }
    case 'hlg':
      return { format: 'hlg', fallback: null }
    case 'dv':
      return { format: 'dv', fallback: null }
    case 'dv-hdr10':
      return { format: 'dv', fallback: 'hdr10' }
    case 'dv-hdr10plus':
      return { format: 'dv', fallback: 'hdr10plus' }
    case 'dv-hlg':
      return { format: 'dv', fallback: 'hlg' }
    case 'dv-sdr':
      return { format: 'dv', fallback: 'sdr' }
  }
}

export function decide(input: DecisionInput): PlaybackDecision {
  const { file, profile } = input
  const { info } = file
  const server = input.server ?? { burnIn: false, toneMapping: false }
  const t = streamT(input.locale)
  const client = profile.name
  const reasons: Reason[] = []
  const say = <K extends StreamMessageId>(
    kind: Reason['kind'],
    code: K,
    ...values: ValuesFor<StreamMessages[K]>
  ) => {
    reasons.push({ kind, code, message: t(code, ...values) })
  }

  // The container
  const container = containerOf(info.container, file.path)
  const containerOk = container !== null && profile.containers.includes(container)
  if (!container) say('rejected', 'container.unknown')
  else if (containerOk)
    say('accepted', 'container.supported', { client, container: CONTAINER_NAMES[container] })
  else say('rejected', 'container.unsupported', { client, container: CONTAINER_NAMES[container] })

  // The picture: can it be copied, and can it be played from this very file
  const v = info.video
  let videoCopy = true
  let videoAsIs = true
  let toSdr = false
  if (!v) say('accepted', 'video.none')
  else {
    const codec = videoName(v.codec)
    const support = profile.video.find((s) => s.codec === v.codec)
    const vp = v.profile?.toLowerCase() ?? null
    if (!support) {
      videoCopy = false
      say('rejected', 'video.codec', { client, codec })
    } else if (support.profiles && vp && !support.profiles.includes(vp)) {
      videoCopy = false
      say('rejected', 'video.profile', { client, codec, profile: v.profile ?? '' })
    } else if (!support.bitDepths.includes(v.bitDepth)) {
      videoCopy = false
      say('rejected', 'video.bitDepth', { client, codec, bitDepth: v.bitDepth })
    } else if (
      (support.maxWidth && v.width > support.maxWidth) ||
      (support.maxHeight && v.height > support.maxHeight)
    ) {
      videoCopy = false
      say('rejected', 'video.size', { client, width: v.width, height: v.height })
    } else {
      say('accepted', 'video.supported', { client, codec, bitDepth: v.bitDepth })
      // A remux into HLS writes the tag the client needs, so only playing the file needs it
      if (
        support.tag &&
        (container === 'mp4' || container === 'mov') &&
        v.codecTag !== support.tag
      ) {
        videoAsIs = false
        say('rejected', 'video.tag', { client, tag: support.tag, actual: v.codecTag ?? '' })
      }
    }

    const need = hdrNeed(v)
    if (need) {
      const shows = (f: Hdr) =>
        profile.hdr.formats.includes(f) &&
        (f !== 'dv' || profile.hdr.dolbyVision.includes(v.dolbyVision?.profile ?? -1))
      const hdr = HDR_NAMES[need.format]
      if (shows(need.format) || (need.format === 'hdr10plus' && shows('hdr10')))
        say('accepted', 'hdr.supported', { client, hdr })
      else if (need.fallback === 'sdr')
        say('accepted', 'hdr.fallback', { client, hdr, fallback: 'SDR' })
      else if (need.fallback && shows(need.fallback))
        say('accepted', 'hdr.fallback', { client, hdr, fallback: HDR_NAMES[need.fallback] })
      else {
        videoCopy = false
        toSdr = true
        say('rejected', 'hdr.unsupported', { client, hdr })
        if (!server.toneMapping) say('warning', 'hdr.washedOut')
      }
    }
  }

  // The bitrate and the picture's size against the ceiling
  const bitrate =
    info.duration && info.duration > 0 ? Math.round((file.size * 8) / info.duration) : null
  const limits = [profile.maxBitrate, input.ceiling?.bitrate ?? null].filter(
    (n): n is number => !!n,
  )
  const limit = limits.length ? Math.min(...limits) : null
  const maxHeight = input.ceiling?.height ?? null
  if (v && limit !== null && bitrate !== null && bitrate > limit) {
    videoCopy = false
    say('rejected', 'bitrate.over', { bitrate: mbps(bitrate), limit: mbps(limit) })
  }
  if (v && maxHeight !== null && tierHeight(v) > maxHeight) {
    videoCopy = false
    say('rejected', 'bitrate.height', { height: tierHeight(v), limit: maxHeight })
  }

  // Sound
  const picked = info.audio.find((a) => a.index === input.audio) ?? defaultAudio(info.audio)
  let audioCopy = false
  let audioAsIs = true
  let channels = 2
  if (!picked) say('accepted', 'audio.none')
  else {
    const codec = audioName(picked)
    const support = profile.audio.find((s) => s.codec === picked.codec)
    const aac = profile.audio.find((s) => s.codec === 'aac')
    channels = Math.min(picked.channels, (aac?.maxChannels ?? 2) >= 6 ? 6 : 2)
    if (profile.passthrough.includes(picked.codec)) {
      audioCopy = true
      say('accepted', 'audio.passthrough', { codec })
    } else if (!support) say('rejected', 'audio.codec', { client, codec })
    else if (picked.channels > support.maxChannels)
      say('rejected', 'audio.channels', { client, codec, max: support.maxChannels })
    else {
      audioCopy = true
      say('accepted', 'audio.supported', { client, codec, channels: picked.channels })
    }
    if (picked !== defaultAudio(info.audio) && !profile.audioTracks) {
      audioAsIs = false
      say('rejected', 'audio.track', { client, track: picked.title ?? picked.language ?? codec })
    }
  }

  // Subtitles
  let subtitle: SubtitlePlan | null = null
  if (input.subtitle) {
    const pick = input.subtitle
    const stream: SubtitleInfo | undefined =
      pick.kind === 'embedded' ? info.subtitles.find((s) => s.index === pick.index) : undefined
    const raw = pick.kind === 'embedded' ? (stream?.codec ?? '') : pick.format
    const text = TEXT_SUBTITLES[raw]
    const image = IMAGE_SUBTITLES[raw]
    const format = SUBTITLE_NAMES[text ?? image ?? ''] ?? raw.toUpperCase()
    if (text) {
      subtitle = { pick, delivery: 'external' }
      say('accepted', 'subtitle.external', { format })
      if (text === 'ass' && !profile.subtitles.includes('ass')) say('warning', 'subtitle.styling')
    } else if (image && pick.kind === 'embedded' && profile.subtitles.includes(image as 'pgs')) {
      subtitle = { pick, delivery: 'embedded' }
      say('accepted', 'subtitle.embedded', { client, format })
    } else if (server.burnIn) {
      subtitle = { pick, delivery: 'burn-in' }
      videoCopy = false
      say('rejected', 'subtitle.burnIn', { client, format })
    } else {
      subtitle = { pick, delivery: 'unavailable' }
      say('warning', 'subtitle.unavailable', { format })
    }
  }

  // The method, in ADR 0051's order
  const audioPlan = (copy: boolean): AudioPlan | null =>
    !picked
      ? null
      : copy
        ? { index: picked.index, action: 'copy' }
        : { index: picked.index, action: 'transcode', codec: 'aac', channels }
  if (containerOk && videoCopy && videoAsIs && (audioCopy || !picked) && audioAsIs) {
    say('accepted', 'method.directPlay')
    return {
      method: 'direct-play',
      container,
      video: v ? { action: 'copy' } : null,
      audio: audioPlan(true),
      subtitle,
      bitrate,
      reasons,
    }
  }
  if (!profile.hls.supported) {
    say('rejected', 'method.unplayable', { client })
    return { method: 'unplayable', container, video: null, audio: null, subtitle, bitrate, reasons }
  }
  // HLS can't carry an image subtitle for the client to draw: it's burned in or not shown
  if (subtitle?.delivery === 'embedded') subtitle = { pick: subtitle.pick, delivery: 'unavailable' }
  const audioHls = audioCopy && !!picked && HLS_AUDIO.has(picked.codec)
  if (!v || (videoCopy && HLS_VIDEO.has(v.codec))) {
    say('accepted', 'method.directStream', { client })
    return {
      method: 'direct-stream',
      container,
      video: v ? { action: 'copy' } : null,
      audio: audioPlan(audioHls),
      subtitle,
      bitrate,
      reasons,
    }
  }
  const height = Math.min(tierHeight(v), maxHeight ?? Number.POSITIVE_INFINITY)
  const cap = Math.min(limit ?? transcodeBitrate(height), transcodeBitrate(height))
  say('accepted', 'method.transcode', { height })
  return {
    method: 'transcode',
    container,
    video: { action: 'transcode', codec: 'h264', height, bitrate: cap, toSdr },
    audio: audioPlan(audioHls),
    subtitle,
    bitrate,
    reasons,
  }
}

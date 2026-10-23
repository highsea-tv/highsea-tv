// SPDX-License-Identifier: AGPL-3.0-only
// What ffprobe says about a file (checkpoint 6, The import pipeline, step 3; ffprobe.ts runs it),
// and the names Radarr gives it. Pure, so a browser can load it through naming. ffprobe's JSON is
// read as Radarr's VideoFileInfoReader reads it
// (https://github.com/Radarr/Radarr/blob/develop/src/NzbDrone.Core/MediaFiles/MediaInfo/VideoFileInfoReader.cs):
// the primary video stream skips cover art, the runtime prefers the video's, then the audio's,
// then the container's, and HDR follows its GetHdrFormat. HDR10+ needs the first frame's side
// data (`-show_frames`), which 6a doesn't read: a PQ file without mastering metadata reads as PQ.

/** Radarr's `HdrFormat`, spelled for JSON. */
export type HdrFormat =
  | 'none'
  | 'pq'
  | 'hdr10'
  | 'hdr10plus'
  | 'hlg'
  | 'dv'
  | 'dv-hdr10'
  | 'dv-hdr10plus'
  | 'dv-hlg'
  | 'dv-sdr'

export type VideoInfo = {
  index: number
  /** ffprobe's `codec_name` (`h264`, `hevc`, `av1`). */
  codec: string
  /** `codec_tag_string`, which names XviD and DivX. */
  codecTag: string | null
  profile: string | null
  width: number
  height: number
  bitDepth: number
  /** Bits a second; 0 when unknown. */
  bitrate: number
  colorPrimaries: string | null
  colorTransfer: string | null
  hdr: HdrFormat
  /** The Dolby Vision configuration record, when there is one. */
  dolbyVision: { profile: number | null; compatibility: number | null } | null
}

export type AudioInfo = {
  index: number
  codec: string
  codecTag: string | null
  profile: string | null
  channels: number
  /** ffprobe's `channel_layout` (`5.1(side)`, `stereo`). */
  layout: string | null
  /** ISO 639-2 as the container tags it; null when untagged or `und`. */
  language: string | null
  title: string | null
  default: boolean
  bitrate: number
}

export type SubtitleInfo = {
  index: number
  codec: string
  language: string | null
  title: string | null
  forced: boolean
  /** For the hard of hearing. */
  hi: boolean
  default: boolean
}

export type MediaInfo = {
  /** Seconds; null when nothing says. */
  duration: number | null
  /** ffprobe's `format_name` (`matroska,webm`, `mov,mp4,m4a,3gp,3g2,mj2`). */
  container: string | null
  video: VideoInfo | null
  audio: AudioInfo[]
  subtitles: SubtitleInfo[]
}

export type Probe = (path: string) => Promise<MediaInfo>

export class ProbeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProbeError'
  }
}

/** ffprobe's own documented output for `-show_format -show_streams -of json`, as far as it's read. */
type RawStream = {
  index?: number
  codec_name?: string
  codec_type?: string
  codec_tag_string?: string
  profile?: string
  width?: number
  height?: number
  pix_fmt?: string
  bits_per_raw_sample?: string
  color_primaries?: string
  color_transfer?: string
  bit_rate?: string
  channels?: number
  channel_layout?: string
  duration?: string
  tags?: Record<string, string>
  disposition?: Record<string, number>
  side_data_list?: Record<string, unknown>[]
}
type RawProbe = {
  streams?: RawStream[]
  format?: { format_name?: string; duration?: string; tags?: Record<string, string> }
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : Number.NaN
  return Number.isFinite(n) ? n : null
}

/** A tag, whatever its case: Matroska writes `language`, some muxers `LANGUAGE`. */
const tag = (tags: Record<string, string> | undefined, name: string): string | null => {
  if (!tags) return null
  for (const [k, v] of Object.entries(tags))
    if (k.toLowerCase() === name && v.trim()) return v.trim()
  return null
}

const language = (s: RawStream) => {
  const l = tag(s.tags, 'language')
  return l && l.toLowerCase() !== 'und' ? l.toLowerCase() : null
}

/** Matroska keeps the bitrate in a `BPS` tag when the stream has none (Radarr's GetBitrate). */
const bitrate = (s: RawStream) => num(s.bit_rate) ?? num(tag(s.tags, 'bps')) ?? 0

/**
 * Bits per component from the pixel format's name (`yuv420p10le` is 10, `yuv420p` is 8), as
 * FFmpeg names them (libavutil/pixfmt.h), or `bits_per_raw_sample` when it's set.
 */
function bitDepthOf(s: RawStream): number {
  const raw = num(s.bits_per_raw_sample)
  if (raw && raw > 0) return raw
  const m = /p(\d{2})(?:le|be)?$/.exec(s.pix_fmt ?? '')
  return m ? Number(m[1]) : 8
}

const sideData = (s: RawStream, type: string) =>
  (s.side_data_list ?? []).find(
    (d) => typeof d.side_data_type === 'string' && d.side_data_type.toLowerCase() === type,
  )

/** Radarr's GetHdrFormat: Dolby Vision by its compatibility id, else bt2020 with PQ or HLG. */
export function hdrOf(s: RawStream): HdrFormat {
  if (bitDepthOf(s) < 10) return 'none'
  const dovi = sideData(s, 'dovi configuration record')
  const hdr10plus = !!sideData(s, 'hdr dynamic metadata smpte2094-40 (hdr10+)')
  if (dovi) {
    switch (num(dovi.dv_bl_signal_compatibility_id)) {
      case 1:
      case 6:
        return hdr10plus ? 'dv-hdr10plus' : 'dv-hdr10'
      case 2:
        return 'dv-sdr'
      case 4:
        return 'dv-hlg'
      default:
        return 'dv'
    }
  }
  if (s.color_primaries !== 'bt2020') return 'none'
  if (s.color_transfer === 'arib-std-b67') return 'hlg'
  if (s.color_transfer !== 'smpte2084') return 'none'
  if (hdr10plus) return 'hdr10plus'
  if (sideData(s, 'mastering display metadata') || sideData(s, 'content light level metadata'))
    return 'hdr10'
  return 'pq'
}

/** Cover art and thumbnails come as video streams; they're never the film. */
const STILLS = new Set(['mjpeg', 'png', 'bmp', 'gif'])

/** ffprobe's JSON as a `MediaInfo`. Pure, for tests and recorded output. */
export function parseProbe(json: unknown): MediaInfo {
  const raw = (json ?? {}) as RawProbe
  const streams = Array.isArray(raw.streams) ? raw.streams : []
  const videos = streams.filter((s) => s.codec_type === 'video')
  const primary =
    videos.find((s) => !STILLS.has(s.codec_name ?? '') && !s.disposition?.attached_pic) ?? videos[0]
  const audioStreams = streams.filter((s) => s.codec_type === 'audio')
  const video: VideoInfo | null = primary
    ? {
        index: primary.index ?? 0,
        codec: primary.codec_name ?? 'unknown',
        codecTag:
          primary.codec_tag_string && !/^\[/.test(primary.codec_tag_string)
            ? primary.codec_tag_string
            : null,
        profile: primary.profile ?? null,
        width: primary.width ?? 0,
        height: primary.height ?? 0,
        bitDepth: bitDepthOf(primary),
        bitrate: bitrate(primary),
        colorPrimaries: primary.color_primaries ?? null,
        colorTransfer: primary.color_transfer ?? null,
        hdr: hdrOf(primary),
        dolbyVision: (() => {
          const d = sideData(primary, 'dovi configuration record')
          return d
            ? { profile: num(d.dv_profile), compatibility: num(d.dv_bl_signal_compatibility_id) }
            : null
        })(),
      }
    : null
  const durationOf = (s: RawStream | undefined) => {
    if (!s) return null
    const d = num(s.duration) ?? matroskaDuration(tag(s.tags, 'duration'))
    return d && d > 0 ? d : null
  }
  const duration =
    durationOf(primary) ?? durationOf(audioStreams[0]) ?? num(raw.format?.duration) ?? null
  return {
    duration,
    container: raw.format?.format_name ?? null,
    video,
    audio: audioStreams.map((s) => ({
      index: s.index ?? 0,
      codec: s.codec_name ?? 'unknown',
      codecTag: s.codec_tag_string && !/^\[/.test(s.codec_tag_string) ? s.codec_tag_string : null,
      profile: s.profile ?? null,
      channels: s.channels ?? 0,
      layout: s.channel_layout ?? null,
      language: language(s),
      title: tag(s.tags, 'title'),
      default: s.disposition?.default === 1,
      bitrate: bitrate(s),
    })),
    subtitles: streams
      .filter((s) => s.codec_type === 'subtitle')
      .map((s) => ({
        index: s.index ?? 0,
        codec: s.codec_name ?? 'unknown',
        language: language(s),
        title: tag(s.tags, 'title'),
        forced: s.disposition?.forced === 1,
        hi: s.disposition?.hearing_impaired === 1,
        default: s.disposition?.default === 1,
      })),
  }
}

/** Matroska's per-stream `DURATION` tag, `HH:MM:SS.nnnnnnnnn`. */
function matroskaDuration(v: string | null): number | null {
  const m = v ? /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(v) : null
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null
}

/** Radarr's FormatVideoCodec: the name says x264 or AVC, else ffprobe's codec decides. */
export function videoCodecName(info: MediaInfo, sceneName = ''): string {
  const v = info.video
  if (!v) return ''
  const scene = sceneName.replace(/\.[a-z0-9]{2,4}$/i, '').toLowerCase()
  const pick = (...tokens: string[]) =>
    tokens.find((t) => scene.includes(t.toLowerCase())) ?? (tokens[tokens.length - 1] as string)
  const tagName = (v.codecTag ?? '').toUpperCase()
  switch (v.codec) {
    case 'h264':
      return tagName === 'X264' ? 'x264' : pick('AVC', 'x264', 'h264')
    case 'hevc':
      return tagName === 'X265' ? 'x265' : pick('HEVC', 'x265', 'h265')
    case 'mpeg2video':
      return 'MPEG2'
    case 'mpeg1video':
      return 'MPEG'
    case 'mpeg4':
    case 'msmpeg4v2':
    case 'msmpeg4v3':
      if (tagName === 'XVID') return 'XviD'
      return ['DIV3', 'DX50', 'DIVX'].includes(tagName) ? 'DivX' : ''
    case 'vc1':
      return 'VC1'
    case 'av1':
      return 'AV1'
    case 'vp8':
    case 'vp9':
      return v.codec.toUpperCase()
    case 'wmv1':
    case 'wmv2':
    case 'wmv3':
      return 'WMV'
    default:
      return v.codec
  }
}

/** Radarr's FormatAudioCodec, for the first audio stream. */
export function audioCodecName(info: MediaInfo): string {
  const a = info.audio[0]
  if (!a) return ''
  const profile = a.profile ?? ''
  if (a.codecTag === 'thd+') return 'TrueHD Atmos'
  if (a.codecTag === 'ec+3') return 'EAC3 Atmos'
  switch (a.codec) {
    case 'truehd':
      return profile === 'Dolby TrueHD + Dolby Atmos' ? 'TrueHD Atmos' : 'TrueHD'
    case 'flac':
      return 'FLAC'
    case 'dts':
      if (['DTS:X', 'DTS-HD MA + DTS:X', 'DTS-HD MA + DTS:X IMAX'].includes(profile)) return 'DTS-X'
      return ['DTS-HD MA', 'DTS-ES', 'DTS-HD HRA', 'DTS Express', 'DTS 96/24'].includes(profile)
        ? profile
        : 'DTS'
    case 'eac3':
      return profile === 'Dolby Digital Plus + Dolby Atmos' ? 'EAC3 Atmos' : 'EAC3'
    case 'ac3':
      return 'AC3'
    case 'aac':
      return profile === 'HE-AAC' || profile === 'xHE-AAC' ? profile : 'AAC'
    case 'mp3':
      return 'MP3'
    case 'mp2':
      return 'MP2'
    case 'opus':
      return 'Opus'
    case 'vorbis':
      return 'Vorbis'
    case 'wmav1':
    case 'wmav2':
    case 'wmapro':
      return 'WMA'
    default:
      return a.codec.startsWith('pcm_') || a.codec.startsWith('adpcm_') ? 'PCM' : a.codec
  }
}

/**
 * Radarr's FormatAudioChannels: the layout's leading `X.Y` (`5.1(side)` is 5.1), else the channel
 * count, to one decimal (`2.0`). Layouts ffprobe names in words are read as their counts.
 */
export function audioChannelsOf(a: Pick<AudioInfo, 'channels' | 'layout'> | undefined): string {
  if (!a) return ''
  const m = /^(\d\.\d)/.exec(a.layout ?? '')
  if (m) return m[1] as string
  if (a.layout === 'mono') return '1.0'
  if (a.layout === 'stereo') return '2.0'
  return a.channels > 0 ? a.channels.toFixed(1) : ''
}

/** Radarr's FormatVideoDynamicRangeType: `DV HDR10`, `HDR10`, `HLG`, `PQ`; empty for SDR. */
export function dynamicRangeType(info: MediaInfo): string {
  const names: Record<HdrFormat, string> = {
    none: '',
    pq: 'PQ',
    hdr10: 'HDR10',
    hdr10plus: 'HDR10Plus',
    hlg: 'HLG',
    dv: 'DV',
    'dv-hdr10': 'DV HDR10',
    'dv-hdr10plus': 'DV HDR10Plus',
    'dv-hlg': 'DV HLG',
    'dv-sdr': 'DV SDR',
  }
  return names[info.video?.hdr ?? 'none']
}

/**
 * Lines of a picture as a resolution, as Radarr augments a quality from media info: by width or
 * height, so a 1920×800 scope film is 1080p.
 */
export function resolutionOf(v: Pick<VideoInfo, 'width' | 'height'> | null) {
  if (!v) return null
  const { width: w, height: h } = v
  if (w >= 3200 || h >= 2100) return 2160 as const
  if (w >= 1800 || h >= 1000) return 1080 as const
  if (w >= 1200 || h >= 700) return 720 as const
  if (w >= 1000 || h >= 560) return 576 as const
  if (h >= 400 || w >= 640) return 480 as const
  return null
}

/** The prototype's stream shapes (design/prototypes/src/mock/types.ts, `Stream`). */
export type Stream =
  | {
      index: number
      type: 'video'
      codec: string
      width: number
      height: number
      hdr: 'none' | 'hdr10' | 'dolby-vision' | 'hlg'
      bitrate: number
    }
  | {
      index: number
      type: 'audio'
      codec: string
      language: string
      channels: string
      title: string | null
      default: boolean
    }
  | {
      index: number
      type: 'subtitle'
      codec: string
      language: string
      forced: boolean
      hi: boolean
      default: boolean
    }

const shortHdr = (h: HdrFormat): 'none' | 'hdr10' | 'dolby-vision' | 'hlg' =>
  h.startsWith('dv') ? 'dolby-vision' : h === 'hlg' ? 'hlg' : h === 'none' ? 'none' : 'hdr10'

export function streamsOf(info: MediaInfo): Stream[] {
  const out: Stream[] = []
  if (info.video)
    out.push({
      index: info.video.index,
      type: 'video',
      codec: info.video.codec,
      width: info.video.width,
      height: info.video.height,
      hdr: shortHdr(info.video.hdr),
      bitrate: info.video.bitrate,
    })
  for (const a of info.audio)
    out.push({
      index: a.index,
      type: 'audio',
      codec: a.codec,
      language: a.language ?? 'und',
      channels: audioChannelsOf(a),
      title: a.title,
      default: a.default,
    })
  for (const s of info.subtitles)
    out.push({
      index: s.index,
      type: 'subtitle',
      codec: s.codec,
      language: s.language ?? 'und',
      forced: s.forced,
      hi: s.hi,
      default: s.default,
    })
  return out.sort((a, b) => a.index - b.index)
}

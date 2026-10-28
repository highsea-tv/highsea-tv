// SPDX-License-Identifier: AGPL-3.0-only
// ffmpeg's and ffprobe's command lines for HLS (ADR 0051), as argument arrays, never through a
// shell. Pure, so the tests keep them as snapshots.
//
// A run writes fragmented MP4 with ffmpeg's HLS muxer (https://ffmpeg.org/ffmpeg-formats.html#hls-2):
// - `-hls_time 0` cuts at every keyframe. The muxer cuts at a keyframe once the time since the run
//   began passes `hls_time` × the segments written (libavformat/hlsenc.c, `hls_write_packet`), so
//   at 0 every keyframe starts a file, and a file's number is its keyframe's, whichever keyframe a
//   run starts from (`-start_number`).
// - `-copyts` with `-start_at_zero` keeps the film's own timestamps from its start
//   (https://ffmpeg.org/ffmpeg.html#Advanced-options), and the MP4 muxer's `frag_discont` writes
//   them into each fragment, so a run started anywhere writes the same timeline, and the player's
//   seeks land where the playlist says.
// - `-hls_flags temp_file` writes each file under `.tmp` and renames it when it's whole, so a file
//   that exists is complete. The muxer writes the initialization section when the first file is
//   cut (`hls_write_packet`), so it's whole once that file is.
import { join } from 'node:path'
import type { AudioPlan, VideoPlan } from '../decision/index.ts'
import { type Accel, deviceArgs, encoderArgs, gpuFilters } from '../hardware/index.ts'
import { SEGMENT_SECONDS } from './playlist.ts'

export type RunInput = {
  /** The film, by its absolute path. */
  input: string
  /** The session's folder in the cache. */
  dir: string
  /** Seconds into the film the run starts at: a piece's start. */
  start: number
  /** That piece's number, ffmpeg's first file. */
  startNumber: number
  /** `bitDepth` is the picture's, 8 when left out: a GPU's frames come down to memory in it. */
  video: {
    index: number
    codec: string
    width: number
    height: number
    bitDepth?: number
    plan: VideoPlan
  } | null
  /** The track's own channels and ffprobe's layout, for the downmix. */
  audio: { index: number; plan: AudioPlan; channels?: number; layout?: string | null } | null
  /** Settings › Playback's Encoder (4.3): Faster, Balanced or Sharper; Balanced when left out. */
  preset?: EncoderPreset
  /** A subtitle drawn into the picture (4.3), which only a transcode can do. */
  burnIn?: BurnIn | null
  /** The GPU path a transcode takes (4.3b, ADR 0056); the processor when left out. */
  accel?: Accel | null
  /**
   * Where HDR is made SDR for a picture the plan sends as SDR: on `accel`'s GPU, or on the
   * processor (`toneMapOn`); left out, it's only labelled SDR, as 4.1 did.
   */
  toneMap?: 'gpu' | 'cpu' | null
}

/**
 * A subtitle burned in (4.3): a picture track (PGS, VobSub, DVB) of the film's own, laid over the
 * picture, or an ASS file drawn by libass with its fonts, if it has any.
 */
export type BurnIn =
  | { kind: 'picture'; index: number }
  | { kind: 'text'; path: string; fontsDir: string | null }

export type EncoderPreset = 'speed' | 'balanced' | 'quality'

/**
 * libx264's own speed setting for each of Settings › Playback's three (https://trac.ffmpeg.org/wiki/Encode/H.264,
 * "Preset"): Balanced is 4.1's `veryfast`, and each step is the next preset either side.
 */
export const X264_PRESETS: Record<EncoderPreset, string> = {
  speed: 'superfast',
  balanced: 'veryfast',
  quality: 'faster',
}

/** The run's own playlist, which highsea never serves: it writes its own (`playlist.ts`). */
export const RUN_PLAYLIST = 'ffmpeg.m3u8'
/** The pieces' and the initialization section's names in the session's folder. */
export const pieceName = (n: number) => `${n}.m4s`
export const INIT_NAME = 'init.mp4'

/**
 * The picture's size for a transcode to `height` tier lines: the source scaled by the same factor
 * the tier is (`tierHeight`), even in both directions as H.264's 4:2:0 needs, never larger.
 */
export function scaledSize(
  source: { width: number; height: number },
  tier: number,
): { width: number; height: number } {
  const sourceTier = Math.max(source.height, Math.round((source.width * 9) / 16))
  const f = Math.min(1, tier / sourceTier)
  const even = (n: number) => Math.max(2, Math.round((n * f) / 2) * 2)
  return { width: even(source.width), height: even(source.height) }
}

/**
 * H.264's level for a picture this size, at up to 60 frames a second (ITU-T H.264 Annex A, Table
 * A-1): 4.1 to 1080p, 5.1 above.
 */
export const h264Level = (height: number) => (height <= 1088 ? '4.1' : '5.1')

/** The variant's RFC 6381 codecs for a transcode: H.264 High at its level, AAC-LC. */
export function transcodeCodecs(height: number, audio: boolean): string {
  const level = h264Level(height) === '4.1' ? '29' : '33'
  return [`avc1.6400${level}`, ...(audio ? ['mp4a.40.2'] : [])].join(',')
}

/**
 * A path as a filter's option inside a filtergraph: escaped once for the option and once for the
 * graph (https://ffmpeg.org/ffmpeg-filters.html#Notes-on-filtergraph-escaping). No shell is involved.
 */
export const filterPath = (path: string) =>
  path.replace(/[\\':]/g, (c) => `\\${c}`).replace(/[\\'[\],;]/g, (c) => `\\${c}`)

/**
 * The processor's tone mapping, after scaling so it works on fewer pixels: to linear light, BT.709's
 * primaries, Hable's curve without desaturation, then BT.709's transfer and matrix (ffmpeg-filters ›
 * tonemap, whose example this is; `npl=100` is SDR's reference white).
 */
const SDR_PARAMS = 'color_primaries=bt709:color_trc=bt709:colorspace=bt709'

export const CPU_TONE_MAP =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,' +
  'tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p'

/**
 * The picture's filters, and how it's mapped. A picture subtitle is a second input to `overlay`,
 * so the graph is a complex one with its own output. ASS is drawn by libass's `subtitles` after
 * scaling, so its text is sharp at the size sent (https://ffmpeg.org/ffmpeg-filters.html#overlay-1
 * and #subtitles-1).
 *
 * - On the processor without tone mapping, a picture track is scaled to the film's size and laid
 *   on before scaling, since a track's canvas needn't be the film's size (4.3a).
 * - Otherwise the picture is scaled (and tone mapped) first, on the GPU when there is one, and the
 *   subtitle is laid on at the size sent, after tone mapping, so its colours aren't mapped. On a
 *   GPU the frames come down to memory for the subtitle (`hwdownload`) and go back up for an
 *   encoder that wants them there (`hwupload`): ffmpeg 7.1's `overlay_vaapi`, `overlay_qsv` and
 *   `overlay_cuda` need the subtitle on the GPU too, and libass draws only in memory.
 */
function pictureFilters(
  video: NonNullable<RunInput['video']>,
  burnIn: BurnIn | null | undefined,
  accel: Accel | null,
  toneMap: 'gpu' | 'cpu' | null,
) {
  const plan = video.plan as Extract<VideoPlan, { action: 'transcode' }>
  const size = scaledSize(video, plan.height)
  const scale = `scale=${size.width}:${size.height}`
  const ass = (b: Extract<BurnIn, { kind: 'text' }>) =>
    `subtitles=filename=${filterPath(b.path)}` +
    (b.fontsDir ? `:fontsdir=${filterPath(b.fontsDir)}` : '')
  if (!accel && toneMap !== 'cpu') {
    if (burnIn?.kind === 'picture')
      return {
        map: ['-map', '[v]'],
        filters: [
          '-filter_complex',
          `[0:${burnIn.index}]scale=${video.width}:${video.height}[s];` +
            `[0:${video.index}][s]overlay=eof_action=pass,${scale},format=yuv420p[v]`,
        ],
      }
    return {
      map: ['-map', `0:${video.index}`],
      filters: [
        '-vf',
        [scale, ...(burnIn?.kind === 'text' ? [ass(burnIn)] : []), 'format=yuv420p'].join(','),
      ],
    }
  }
  const gpu = accel ? gpuFilters(accel, size, toneMap === 'gpu', video.bitDepth) : null
  // a GPU's frames are labelled in the graph: output options such as `-color_primaries` make
  // ffmpeg add a `scale` to convert to them, which can't take a GPU's frames (`setparams`,
  // https://ffmpeg.org/ffmpeg-filters.html#setparams); tone mapping labels its own
  const label = plan.toSdr && toneMap === null ? [`setparams=${SDR_PARAMS}`] : []
  const picture = gpu ? [gpu.scale, ...label].join(',') : [scale, CPU_TONE_MAP].join(',')
  // a subtitle is drawn in memory; on a GPU the frames come down for it and go back up after
  const down = gpu?.download ? [gpu.download] : []
  const up = gpu ? (gpu.upload ? [gpu.upload] : ['format=yuv420p']) : ['format=yuv420p']
  if (burnIn?.kind === 'picture')
    return {
      map: ['-map', '[v]'],
      filters: [
        '-filter_complex',
        `[0:${video.index}]${[picture, ...down].join(',')}[b];` +
          `[0:${burnIn.index}]scale=${size.width}:${size.height}[s];` +
          `[b][s]overlay=eof_action=pass,${up.join(',')}[v]`,
      ],
    }
  if (burnIn?.kind === 'text')
    return {
      map: ['-map', `0:${video.index}`],
      filters: ['-vf', [picture, ...down, ass(burnIn), ...up].join(',')],
    }
  return { map: ['-map', `0:${video.index}`], filters: ['-vf', picture] }
}

const forceKeyframes = ['-force_key_frames', `expr:gte(t,n_forced*${SEGMENT_SECONDS})`]

const videoArgs = (video: NonNullable<RunInput['video']>, run: RunInput): string[] => {
  const preset = run.preset ?? 'balanced'
  const accel = run.accel ?? null
  const toneMap = run.toneMap ?? null
  const plan = video.plan
  if (plan.action === 'copy')
    // Apple's players and Chrome want HEVC tagged hvc1 in MP4 (Apple's HLS authoring
    // specification, "Video" § 1.10)
    return ['-c:v', 'copy', ...(video.codec === 'hevc' ? ['-tag:v', 'hvc1'] : [])]
  const size = scaledSize(video, plan.height)
  const level = h264Level(size.height)
  return [
    ...pictureFilters(video, run.burnIn, accel, toneMap).filters,
    // a keyframe every segment and none between, so every segment is one piece (`-force_key_frames`,
    // https://ffmpeg.org/ffmpeg.html#Advanced-Video-options)
    ...(accel
      ? // the path's own encoder, capped at the same bitrate, keyframes only where forced (ADR 0056)
        [...encoderArgs(accel, preset, plan.bitrate, level), ...forceKeyframes]
      : [
          // libx264 at the chosen preset, capped (4.1's answer 8; https://trac.ffmpeg.org/wiki/Encode/H.264,
          // "Constrained encoding (VBV / maximum bit rate)")
          ...['-c:v', 'libx264', '-preset', X264_PRESETS[preset], '-crf', '23'],
          ...['-maxrate', String(plan.bitrate), '-bufsize', String(plan.bitrate * 2)],
          ...['-profile:v', 'high', '-level:v', level],
          ...forceKeyframes,
          // and none of x264's own (keyint and scenecut), each an IDR frame (`forced-idr`,
          // https://ffmpeg.org/ffmpeg-codecs.html#libx264_002c-libx264rgb)
          ...['-x264-params', 'keyint=infinite:scenecut=0', '-forced-idr', '1'],
        ]),
    // SDR's labels on the processor: tone mapped, or without it only relabelled, which looks washed
    // out (on a GPU, `pictureFilters` labels the frames)
    ...(plan.toSdr && !accel
      ? ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709']
      : []),
  ]
}

/**
 * RFC 7845's stereo downmixes (§ 5.1.1.5, Figures 7 and 9), in ffmpeg's own channel order: 5.1 is
 * FL FR FC LFE and the back or side pair, 7.1 is FL FR FC LFE BL BR SL SR
 * (https://ffmpeg.org/ffmpeg-utils.html#Channel-Layout). The centre is −3 dB against the fronts,
 * as ATSC A/52's Lo/Ro downmix has it (§ 7.8.2), each surround is split between the sides, and each
 * row sums to 2, so loud scenes don't clip. ffmpeg's own `-ac 2` adds the centre and surrounds at
 * −3 dB to the fronts and, for the floating-point samples AAC takes, doesn't scale them down
 * (libswresample's `rematrix_maxval`), so peaks clip.
 */
const DOWNMIX: Record<number, string> = {
  6: [
    'FL=0.529067*c0+0.374107*c2+0.458186*c4+0.264534*c5+0.374107*c3',
    'FR=0.529067*c1+0.374107*c2+0.264534*c4+0.458186*c5+0.374107*c3',
  ].join('|'),
  8: [
    'FL=0.388631*c0+0.274804*c2+0.336565*c6+0.194316*c7+0.336565*c4+0.194316*c5+0.274804*c3',
    'FR=0.388631*c1+0.274804*c2+0.194316*c6+0.336565*c7+0.194316*c4+0.336565*c5+0.274804*c3',
  ].join('|'),
}
/** The layouts whose order the matrices assume; an unknown layout of 6 or 8 is taken as one. */
const DOWNMIX_LAYOUTS = new Set(['5.1', '5.1(side)', '7.1'])

/** The downmix's filter for this track, or null for ffmpeg's own (`-ac 2`). */
export function downmixFilter(channels: number, layout: string | null | undefined): string | null {
  const matrix = DOWNMIX[channels]
  if (!matrix || (layout && !DOWNMIX_LAYOUTS.has(layout))) return null
  return `pan=stereo|${matrix}`
}

const audioArgs = (audio: NonNullable<RunInput['audio']>): string[] => {
  const plan = audio.plan
  if (plan.action === 'copy') return ['-c:a', 'copy']
  const pan = plan.channels === 2 ? downmixFilter(audio.channels ?? 0, audio.layout) : null
  return [
    ...['-c:a', 'aac'],
    ...(pan ? ['-af', pan] : ['-ac', String(plan.channels)]),
    ...['-b:a', plan.channels > 2 ? '384k' : '160k'],
  ]
}

/** One run of ffmpeg, from `start` on, writing pieces into `dir`. */
export function runArgs(run: RunInput): string[] {
  const copy = run.video?.plan.action === 'copy'
  // a copy starts at the keyframe at or before the seek, so a millisecond past the piece's start
  // lands on its own keyframe however its time was rounded
  const at = (run.start + (copy ? 0.001 : 0)).toFixed(6)
  const seek = run.start > 0 ? ['-ss', at] : []
  // a transcode's input seek is exact for the picture, which is decoded, but a copied sound track
  // starts at the keyframe before: `-ss` on the output drops what's before the start, and
  // `-output_ts_offset` puts the film's time back (https://ffmpeg.org/ffmpeg.html#Main-options)
  const trim = run.start > 0 && !copy && run.video ? ['-ss', at, '-output_ts_offset', at] : []
  return [
    ...['-hide_banner', '-nostdin', '-loglevel', 'warning'],
    // what it has made, a line at a time, for its speed (runner.ts)
    ...['-progress', 'pipe:1', '-stats_period', '1'],
    ...seek,
    ...['-copyts', '-start_at_zero'],
    // decoding on the GPU, before the input it applies to
    ...(run.video && !copy && run.accel ? deviceArgs(run.accel) : []),
    ...['-i', run.input],
    ...(run.video
      ? copy
        ? ['-map', `0:${run.video.index}`]
        : pictureFilters(run.video, run.burnIn, run.accel ?? null, run.toneMap ?? null).map
      : []),
    ...(run.audio ? ['-map', `0:${run.audio.index}`] : []),
    ...['-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1'],
    ...trim,
    ...(run.video ? videoArgs(run.video, run) : []),
    ...(run.audio ? audioArgs(run.audio) : []),
    ...['-f', 'hls', '-hls_segment_type', 'fmp4'],
    // without a picture every audio frame is a keyframe, so sound alone is cut by time
    ...['-hls_time', run.video ? '0' : String(SEGMENT_SECONDS)],
    ...['-hls_list_size', '0', '-hls_flags', 'temp_file'],
    // each fragment's decode time (`tfdt`) is the film's own, not the run's, so pieces from any run
    // share one timeline and one initialization section (`frag_discont`,
    // https://ffmpeg.org/ffmpeg-formats.html#Options-6, as Jellyfin's HLS does)
    ...['-hls_segment_options', 'movflags=+frag_discont'],
    ...['-hls_fmp4_init_filename', INIT_NAME],
    ...['-start_number', String(run.startNumber)],
    ...['-hls_segment_filename', join(run.dir, '%d.m4s')],
    join(run.dir, RUN_PLAYLIST),
  ]
}

/**
 * A text subtitle as WebVTT (https://ffmpeg.org/ffmpeg-codecs.html#webvtt): the film's own stream
 * by index, or a sidecar file's only one. Timestamps from the film's start, as the picture's.
 */
export function subtitleArgs(input: string, index: number | null, output: string): string[] {
  return [
    ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-y'],
    ...['-i', input],
    ...['-map', index === null ? '0:s:0' : `0:${index}`],
    ...['-c:s', 'webvtt', '-f', 'webvtt', output],
  ]
}

/**
 * An ASS track to burn in, taken out of the film once a session, with the fonts it carries: libass's
 * `subtitles` filter reads the whole file it's given each time it starts, and each seek starts a
 * run. Each font is written under a name highsea picks, never the one in the file
 * (`-dump_attachment`, https://ffmpeg.org/ffmpeg.html#Main-options); libass reads every file in
 * `fontsdir`.
 */
export function assArgs(
  input: string,
  index: number,
  output: string,
  fonts: { index: number; path: string }[],
): string[] {
  return [
    ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-y'],
    ...fonts.flatMap((f) => [`-dump_attachment:${f.index}`, f.path]),
    ...['-i', input],
    ...['-map', `0:${index}`, '-c:s', 'copy', '-f', 'ass', output],
  ]
}

/** ffprobe's attachments, with the tags that say which are fonts (https://ffmpeg.org/ffprobe.html). */
export function attachmentArgs(input: string): string[] {
  return [
    ...['-v', 'error', '-select_streams', 't'],
    ...['-show_entries', 'stream=index:stream_tags=mimetype,filename', '-of', 'json'],
    input,
  ]
}

/** The attachments that are fonts, by their MIME type or their name's extension. */
export function parseFonts(output: string): number[] {
  const streams =
    (
      JSON.parse(output || '{}') as {
        streams?: { index?: number; tags?: { mimetype?: string; filename?: string } }[]
      }
    ).streams ?? []
  return streams
    .filter(
      (s) =>
        typeof s.index === 'number' &&
        (/font|truetype|opentype/i.test(s.tags?.mimetype ?? '') ||
          /\.(ttf|otf|ttc)$/i.test(s.tags?.filename ?? '')),
    )
    .map((s) => s.index as number)
}

/**
 * ffprobe's list of the picture's packets with their times and flags, read without decoding
 * (https://ffmpeg.org/ffprobe.html): the keyframes are the ones flagged `K`.
 */
export function keyframeArgs(input: string, index: number): string[] {
  return [
    ...['-v', 'error', '-select_streams', String(index)],
    ...['-show_entries', 'format=start_time:packet=pts_time,dts_time,flags'],
    ...['-of', 'compact=p=0:nk=0', input],
  ]
}

/**
 * The keyframes' times in seconds from the film's start, ascending, from `keyframeArgs`'s output.
 * The film's start is the container's `start_time`, which `-start_at_zero` takes away too.
 */
export function parseKeyframes(output: string): number[] {
  let start = 0
  const raw: number[] = []
  for (const line of output.split('\n')) {
    const fields = new Map(
      line
        .trim()
        .split('|')
        .map((f) => f.split('=') as [string, string]),
    )
    if (fields.has('start_time')) {
      const s = Number(fields.get('start_time'))
      if (Number.isFinite(s)) start = s
      continue
    }
    if (!fields.get('flags')?.includes('K')) continue
    const pts = Number(fields.get('pts_time'))
    const t = Number.isFinite(pts) ? pts : Number(fields.get('dts_time'))
    if (Number.isFinite(t)) raw.push(t)
  }
  return [...new Set(raw.map((t) => Math.max(0, Math.round((t - start) * 1e6) / 1e6)))].sort(
    (a, b) => a - b,
  )
}

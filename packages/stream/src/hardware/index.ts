// SPDX-License-Identifier: AGPL-3.0-only
// Hardware acceleration (ADR 0056): the four paths a transcode can take besides the processor, what
// each needs on ffmpeg's command line, and reading what the host has. Pure; the runtime looks and
// runs (`packages/runtime/src/hardware.ts`), and `hls/args.ts` builds a run's command line from an
// `Accel`.
//
// Every flag here is from ffmpeg's own documentation for that path, read against ffmpeg 7.1 (the
// image's) and 9.0 (Homebrew's):
// - VAAPI: https://trac.ffmpeg.org/wiki/Hardware/VAAPI, and ffmpeg-codecs › VAAPI encoders;
// - QSV: https://trac.ffmpeg.org/wiki/Hardware/QuickSync, with VAAPI decoding mapped to QSV
//   (`hwmap=derive_device=qsv`), as that page shows for Linux;
// - NVENC: https://trac.ffmpeg.org/wiki/HWAccelIntro#CUDANVENCNVDEC and ffmpeg-codecs › NVENC;
// - VideoToolbox: https://trac.ffmpeg.org/wiki/HWAccelIntro#VideoToolbox, and ffmpeg-filters › scale_vt.

export const PATHS = ['vaapi', 'qsv', 'nvenc', 'videotoolbox'] as const
export type AccelPath = (typeof PATHS)[number]

/** Whose chip it is: it decides how VAAPI tone maps (Intel's own filter, or libplacebo on AMD). */
export type Vendor = 'intel' | 'amd' | 'nvidia' | 'apple' | 'other'

/** A path a run can take, as its check left it. */
export type Accel = {
  path: AccelPath
  vendor: Vendor
  /** The render node, for VAAPI and QSV. */
  device: string | null
  /** Intel's low-power encoder, when the check found it works (it's tried first). */
  lowPower: boolean
  /** The path tone maps on the GPU: the check's second step passed. */
  toneMap: boolean
}

/** What a film's HDR is, as the probe has it (`@highsea-tv/media/shared`'s `HdrFormat`). */
export type HdrKind = string

/** The encoder each path uses for H.264. */
export const ENCODERS: Record<AccelPath, string> = {
  vaapi: 'h264_vaapi',
  qsv: 'h264_qsv',
  nvenc: 'h264_nvenc',
  videotoolbox: 'h264_videotoolbox',
}

/** The filters each path's runs need, besides the encoder: none of them may be missing. */
export const FILTERS: Record<AccelPath, string[]> = {
  vaapi: ['scale_vaapi'],
  qsv: ['vpp_qsv', 'hwmap'],
  nvenc: ['scale_cuda'],
  videotoolbox: ['scale_vt'],
}

/** The filters the processor's tone mapping needs (ffmpeg-filters › tonemap, its example). */
export const CPU_TONE_MAP_FILTERS = ['zscale', 'tonemap']

/**
 * Where a film's HDR is made SDR, when it must be: on this path's GPU, on the processor (the run
 * then leaves the GPU altogether), or nowhere, and the picture is only labelled SDR (4.1's way,
 * which looks washed out).
 *
 * - Intel's `tonemap_vaapi` takes PQ only (vf_tonemap_vaapi.c: "Only support HDR10 as input"), and
 *   `vpp_qsv` tone maps only a frame with HDR metadata (its `tonemap` option), so HLG and Dolby
 *   Vision's profile 5 go to the processor there.
 * - libplacebo (NVIDIA, AMD) reads PQ, HLG and Dolby Vision's RPU (`apply_dolbyvision`).
 * - VideoToolbox's `scale_vt` converts by colour properties, so not Dolby Vision's profile 5, which
 *   has no HDR10 base.
 * - The processor's `zscale` reads PQ and HLG; profile 5 is not made right there either, so it's
 *   only labelled.
 */
export function toneMapOn(hdr: HdrKind, accel: Accel | null, cpu: boolean): 'gpu' | 'cpu' | null {
  const pq = ['pq', 'hdr10', 'hdr10plus', 'dv-hdr10', 'dv-hdr10plus'].includes(hdr)
  const profile5 = hdr === 'dv'
  if (accel?.toneMap) {
    const libplacebo = accel.path === 'nvenc' || (accel.path === 'vaapi' && accel.vendor === 'amd')
    if (libplacebo) return 'gpu'
    if (accel.path === 'videotoolbox' ? !profile5 : pq) return 'gpu'
  }
  return cpu && !profile5 ? 'cpu' : null
}

/** H.264's level as its `level_idc`, which every hardware encoder takes: 4.1 is 41. */
const levelIdc = (level: string) => String(Math.round(Number(level) * 10))

/**
 * Each path's own speed setting for Faster, Balanced and Sharper (playback-settings.md):
 * - NVENC's presets p1 (fastest) to p7 (ffmpeg-codecs › NVENC, NVIDIA's Video Codec SDK's preset table);
 * - QSV's `preset`, veryfast to veryslow;
 * - VAAPI's `quality`, "higher is faster", which Intel's driver reads as its target usage 1 to 7
 *   (4 by default) and others clamp;
 * - VideoToolbox's `prio_speed`, its one switch.
 */
const SPEED: Record<AccelPath, Record<'speed' | 'balanced' | 'quality', string[]>> = {
  vaapi: { speed: ['-quality', '7'], balanced: ['-quality', '4'], quality: ['-quality', '1'] },
  qsv: {
    speed: ['-preset', 'veryfast'],
    balanced: ['-preset', 'medium'],
    quality: ['-preset', 'slow'],
  },
  nvenc: { speed: ['-preset', 'p2'], balanced: ['-preset', 'p4'], quality: ['-preset', 'p6'] },
  videotoolbox: {
    speed: ['-prio_speed', '1'],
    balanced: ['-prio_speed', '1'],
    quality: ['-prio_speed', '0'],
  },
}

/** What a run on a path puts before `-i`: the device, and decoding on it. */
export function deviceArgs(accel: Accel): string[] {
  const node = accel.device ?? '/dev/dri/renderD128'
  // decode where the picture is scaled, so frames stay on the GPU (`-hwaccel_output_format`)
  const vaapi = [
    ...['-hwaccel', 'vaapi', '-hwaccel_output_format', 'vaapi', '-hwaccel_device', 'va'],
  ]
  switch (accel.path) {
    case 'vaapi':
      return [
        ...['-init_hw_device', `vaapi=va:${node}`],
        // AMD's tone mapping maps the frames to Vulkan for libplacebo, on the same GPU
        ...(accel.vendor === 'amd' && accel.toneMap ? ['-init_hw_device', 'vulkan=vk@va'] : []),
        ...vaapi,
        // burned-in subtitles go back up with `hwupload`, onto this device
        ...['-filter_hw_device', 'va'],
      ]
    case 'qsv':
      // VAAPI decodes, and its frames are mapped to QSV for `vpp_qsv` and the encoder (the
      // QuickSync wiki's Linux interop)
      return [
        ...['-init_hw_device', `vaapi=va:${node}`, '-init_hw_device', 'qsv=qs@va'],
        ...vaapi,
        ...['-filter_hw_device', 'qs'],
      ]
    case 'nvenc':
      return [
        ...['-init_hw_device', 'cuda=cu:0'],
        ...['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda', '-hwaccel_device', 'cu'],
      ]
    case 'videotoolbox':
      return ['-hwaccel', 'videotoolbox', '-hwaccel_output_format', 'videotoolbox_vld']
  }
}

/** SDR's colour properties, which tone mapping makes. */
const BT709 = 'colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv'

/**
 * The picture's filters on a path: scaled (and tone mapped when `toneMap`) on the GPU. With
 * `download`, the frames come back to memory as `nv12` at the end, for a subtitle to be drawn on
 * them by the processor; `upload` takes them back up for an encoder that wants GPU frames.
 */
export function gpuFilters(
  accel: Accel,
  size: { width: number; height: number },
  toneMap: boolean,
  bitDepth = 8,
): { scale: string; download: string; upload: string } {
  const { width: w, height: h } = size
  switch (accel.path) {
    case 'vaapi':
      if (toneMap && accel.vendor === 'amd')
        return {
          // libplacebo on Mesa's RADV, the frames shared with VAAPI (ffmpeg-filters › libplacebo,
          // and hwmap's derive_device)
          scale:
            'hwmap=derive_device=vulkan,format=vulkan,' +
            `libplacebo=w=${w}:h=${h}:format=nv12:${BT709}:tonemapping=auto,` +
            'hwmap=derive_device=vaapi,format=vaapi',
          download: 'hwdownload,format=nv12',
          upload: 'format=nv12,hwupload',
        }
      return {
        // tonemap_vaapi takes the 10-bit frames scale_vaapi leaves and writes 8-bit SDR
        scale: toneMap
          ? `scale_vaapi=w=${w}:h=${h},tonemap_vaapi=format=nv12:t=bt709:m=bt709:p=bt709`
          : `scale_vaapi=w=${w}:h=${h}:format=nv12`,
        download: 'hwdownload,format=nv12',
        upload: 'format=nv12,hwupload',
      }
    case 'qsv':
      return {
        scale:
          'hwmap=derive_device=qsv,format=qsv,' +
          `vpp_qsv=w=${w}:h=${h}:format=nv12` +
          (toneMap
            ? ':tonemap=1:out_color_matrix=bt709:out_color_primaries=bt709:out_color_transfer=bt709'
            : ''),
        download: 'hwdownload,format=nv12',
        upload: 'format=nv12,hwupload=extra_hw_frames=16,format=qsv',
      }
    case 'nvenc':
      // libplacebo takes the frames from memory on its own Vulkan device (NVIDIA's driver, through
      // the container toolkit's `graphics` capability); NVENC encodes frames from memory
      if (toneMap)
        return {
          scale:
            `scale_cuda=w=${w}:h=${h}:format=p010le,hwdownload,format=p010le,` +
            `libplacebo=format=yuv420p:${BT709}:tonemapping=auto:apply_dolbyvision=1`,
          download: '',
          upload: '',
        }
      return {
        scale: `scale_cuda=w=${w}:h=${h}:format=nv12`,
        download: 'hwdownload,format=nv12',
        upload: '',
      }
    case 'videotoolbox':
      // scale_vt converts to the colour properties it's given, which is VideoToolbox's tone mapping.
      // It keeps the frames' bit depth, so a 10-bit film's come down as p010 (hwdownload takes only
      // the frames' own format) and are made 8-bit in memory
      return {
        scale:
          `scale_vt=w=${w}:h=${h}` +
          (toneMap ? ':color_matrix=bt709:color_primaries=bt709:color_transfer=bt709' : ''),
        download: bitDepth > 8 ? 'hwdownload,format=p010le,format=nv12' : 'hwdownload,format=nv12',
        upload: '',
      }
  }
}

/**
 * The encoder's arguments on a path: H.264 High at its level, capped at the plan's bitrate, with a
 * keyframe only where `-force_key_frames` asks for one, as an IDR frame, so every segment is one
 * piece as 4.1's libx264 makes them:
 * - the GOP is as long as each encoder allows (`-g`; QSV's `GopPicSize` is 16 bits), so it adds no
 *   keyframes of its own;
 * - VAAPI's common encoder makes a forced frame an IDR and starts its GOP again
 *   (libavcodec/hw_base_encode.c); NVENC needs `forced-idr`, QSV `forced_idr`, and NVENC's
 *   lookahead `no-scenecut`; VideoToolbox forces each as a keyframe (videotoolboxenc.c's
 *   `kVTEncodeFrameOptionKey_ForceKeyFrame`).
 */
export function encoderArgs(
  accel: Accel,
  preset: 'speed' | 'balanced' | 'quality',
  bitrate: number,
  level: string,
): string[] {
  const rate = ['-b:v', String(bitrate), '-maxrate', String(bitrate)]
  const buffer = ['-bufsize', String(bitrate * 2)]
  const common = ['-profile:v', 'high', '-level:v', levelIdc(level), '-g', '65535']
  switch (accel.path) {
    case 'vaapi':
      return [
        ...['-c:v', 'h264_vaapi', '-rc_mode', 'VBR', ...rate, ...buffer],
        ...SPEED.vaapi[preset],
        ...(accel.lowPower ? ['-low_power', '1'] : []),
        ...common,
      ]
    case 'qsv':
      return [
        ...['-c:v', 'h264_qsv', ...rate, ...buffer],
        ...SPEED.qsv[preset],
        ...(accel.lowPower ? ['-low_power', '1'] : ['-low_power', '0']),
        ...['-look_ahead', '0', '-forced_idr', '1'],
        ...common,
      ]
    case 'nvenc':
      return [
        ...['-c:v', 'h264_nvenc', ...SPEED.nvenc[preset], '-tune', 'hq', '-rc', 'vbr'],
        ...rate,
        ...buffer,
        ...['-forced-idr', '1', '-no-scenecut', '1'],
        ...common,
      ]
    case 'videotoolbox':
      return [
        ...['-c:v', 'h264_videotoolbox', ...SPEED.videotoolbox[preset], ...rate, ...buffer],
        ...common,
      ]
  }
}

// ---- Reading what the host has ----

/** The names in `ffmpeg -encoders` or `ffmpeg -filters`: the word after the flags on each line. */
export function parseList(output: string): Set<string> {
  const names = new Set<string>()
  for (const line of output.split('\n')) {
    const m = /^\s*[A-Z.|]{2,6}\s+(\w+)\s/.exec(line)
    if (m?.[1]) names.add(m[1])
  }
  return names
}

/**
 * The driver's own name for a VAAPI device, from ffmpeg's verbose log when it opens one
 * (libavutil/hwcontext_vaapi.c logs `VAAPI driver: <vaQueryVendorString>.`):
 * - Intel's media driver: "Intel iHD driver for Intel(R) Gen Graphics - 24.1.0 ()";
 * - Intel's older one: "Intel i965 driver for Intel(R) Coffee Lake - 2.4.1";
 * - Mesa: "Mesa Gallium driver 24.2.8-1 for AMD Radeon RX 6600 (radeonsi, navi23, …)".
 */
export function parseVaapiDriver(
  log: string,
): { vendor: Vendor; driver: 'iHD' | 'i965' | 'mesa' | null; name: string } | null {
  const m = /VAAPI driver: (.+?)\.?\s*$/m.exec(log)
  const text = m?.[1]?.trim()
  if (!text) return null
  const intel = /Intel (iHD|i965) driver/.exec(text)
  if (intel) {
    const driver = intel[1] as 'iHD' | 'i965'
    const version = /- ([\d.]+)/.exec(text)?.[1]
    return {
      vendor: 'intel',
      driver,
      name: `Intel graphics (${driver}${version ? ` ${version}` : ''})`,
    }
  }
  const mesa = /Mesa Gallium driver [^ ]+ for (.+?) \(/.exec(text)
  if (mesa?.[1]) {
    const model = mesa[1].trim()
    return { vendor: /AMD|Radeon/i.test(model) ? 'amd' : 'other', driver: 'mesa', name: model }
  }
  return { vendor: 'other', driver: null, name: text }
}

/** Opens a device, and nothing else: a tenth of a second of black through it to nowhere. */
export function probeArgs(path: AccelPath, device: string | null): string[] {
  const init =
    path === 'vaapi' || path === 'qsv'
      ? ['-init_hw_device', `vaapi=va:${device ?? '/dev/dri/renderD128'}`]
      : path === 'nvenc'
        ? ['-init_hw_device', 'cuda=cu:0']
        : ['-init_hw_device', 'videotoolbox=vt']
  return [
    ...['-hide_banner', '-nostdin', '-v', 'verbose', ...init],
    ...['-f', 'lavfi', '-i', 'color=black:s=64x64:d=0.1', '-f', 'null', '-'],
  ]
}

/** The render nodes in `/dev/dri`'s names: `renderD128` and on, in order. */
export function renderNodes(names: string[]): string[] {
  return names
    .filter((n) => /^renderD\d+$/.test(n))
    .sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)))
    .map((n) => `/dev/dri/${n}`)
}

// ---- The check ----

/** The check's clip: 1080p HEVC Main 10 marked as HDR10, ten seconds at 24 frames a second. */
export const CHECK_CLIP = { width: 1920, height: 1080, fps: 24, seconds: 10 }
export const CHECK_FRAMES = CHECK_CLIP.fps * CHECK_CLIP.seconds

/**
 * Makes the check's clip from lavfi's test pattern (ADR 0040's sources), with libx265 tagging it
 * HDR10 as a film is: BT.2020, PQ and mastering metadata (x265's `hdr10`, `master-display` and
 * `max-cll`, https://x265.readthedocs.io/en/master/cli.html#vui-video-usability-information-options).
 */
export function clipArgs(output: string, clip: typeof CHECK_CLIP = CHECK_CLIP): string[] {
  const { width, height, fps, seconds } = clip
  return [
    ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-y'],
    ...['-f', 'lavfi', '-i', `testsrc2=s=${width}x${height}:r=${fps}:d=${seconds}`],
    ...['-vf', 'format=yuv420p10le', '-c:v', 'libx265', '-preset', 'ultrafast'],
    ...[
      '-x265-params',
      'log-level=error:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:hdr10=1:' +
        'master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):' +
        'max-cll=1000,400',
    ],
    ...['-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc'],
    ...['-tag:v', 'hvc1', output],
  ]
}

/** The check's bitrate: 1080p's in the decision's ladder. */
const CHECK_BITRATE = 8_000_000

/**
 * One step of a path's check: the clip decoded, scaled to 1080p, tone mapped when `toneMap`, and
 * encoded to H.264 on the path, thrown away (`-f null`). It's a run's own command line but for its
 * output, so a path that passes runs films the same way.
 */
export function checkArgs(clip: string, accel: Accel, toneMap: boolean): string[] {
  const size = { width: CHECK_CLIP.width, height: CHECK_CLIP.height }
  return [
    ...['-hide_banner', '-nostdin', '-loglevel', 'error'],
    ...deviceArgs(accel),
    ...['-i', clip, '-map', '0:v:0', '-an'],
    ...['-vf', gpuFilters(accel, size, toneMap, 10).scale],
    ...encoderArgs(accel, 'balanced', CHECK_BITRATE, '4.1'),
    ...['-f', 'null', '-'],
  ]
}

/**
 * The path transcodes take: the one Settings › Playback names, if its check passed, or with
 * Automatic the first in the list whose check passed (playback-settings.md: an unchecked path is
 * never used on its own). Null is the processor.
 */
export function choosePath<T extends { path: AccelPath; passed: boolean }>(
  setting: 'auto' | 'off' | AccelPath,
  paths: T[],
): T | null {
  if (setting === 'off') return null
  const passed = paths.filter((p) => p.passed)
  if (setting === 'auto')
    return PATHS.map((id) => passed.find((p) => p.path === id)).find(Boolean) ?? null
  return passed.find((p) => p.path === setting) ?? null
}

export * from './messages.ts'

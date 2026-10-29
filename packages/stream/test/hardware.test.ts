// SPDX-License-Identifier: AGPL-3.0-only
// Hardware acceleration's command lines and what's read from the host (4.3b, ADR 0056). CI has no
// GPU, so each path's command line is kept here in full; the ffmpeg runs on this machine's own
// path are in hls-ffmpeg.test.ts.
import { describe, expect, test } from 'bun:test'
import {
  type Accel,
  type AccelPath,
  CHECK_FRAMES,
  checkArgs,
  choosePath,
  clipArgs,
  parseList,
  parseVaapiDriver,
  probeArgs,
  renderNodes,
  toneMapOn,
} from '../src/hardware/index.ts'
import { CPU_TONE_MAP, type RunInput, runArgs } from '../src/hls/index.ts'

const accel = (path: AccelPath, more: Partial<Accel> = {}): Accel => ({
  path,
  vendor: path === 'nvenc' ? 'nvidia' : path === 'videotoolbox' ? 'apple' : 'intel',
  device: path === 'vaapi' || path === 'qsv' ? '/dev/dri/renderD128' : null,
  lowPower: false,
  toneMap: true,
  ...more,
})

const run = (more: Partial<RunInput>): RunInput => ({
  input: '/m/a.mkv',
  dir: '/t/s',
  start: 0,
  startNumber: 0,
  video: {
    index: 0,
    codec: 'hevc',
    width: 3840,
    height: 2160,
    plan: { action: 'transcode', codec: 'h264', height: 1080, bitrate: 8_000_000, toSdr: true },
  },
  audio: null,
  ...more,
})

/** The run's arguments from the input on, up to the HLS muxer's. */
const middle = (args: string[]) => args.slice(args.indexOf('-progress') + 4, args.indexOf('-f'))

const KEYFRAMES = ['-force_key_frames', 'expr:gte(t,n_forced*6)']

describe('each path’s command line', () => {
  test('VAAPI on Intel: decoded, scaled and tone mapped on the GPU, encoded by h264_vaapi', () => {
    expect(middle(runArgs(run({ accel: accel('vaapi'), toneMap: 'gpu' })))).toEqual([
      ...['-copyts', '-start_at_zero'],
      ...['-init_hw_device', 'vaapi=va:/dev/dri/renderD128'],
      ...['-hwaccel', 'vaapi', '-hwaccel_output_format', 'vaapi', '-hwaccel_device', 'va'],
      ...['-filter_hw_device', 'va'],
      ...['-i', '/m/a.mkv', '-map', '0:0'],
      ...['-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1'],
      '-vf',
      'scale_vaapi=w=1920:h=1080,tonemap_vaapi=format=nv12:t=bt709:m=bt709:p=bt709',
      ...['-c:v', 'h264_vaapi', '-rc_mode', 'VBR'],
      ...['-b:v', '8000000', '-maxrate', '8000000', '-bufsize', '16000000'],
      ...['-quality', '4'],
      ...['-profile:v', 'high', '-level:v', '41', '-g', '65535'],
      ...KEYFRAMES,
    ])
  })

  test('VAAPI with low power, without tone mapping: 8-bit from the scaler, labelled SDR', () => {
    const args = middle(
      runArgs(run({ accel: accel('vaapi', { lowPower: true }), toneMap: null, preset: 'speed' })),
    )
    expect(args).toContain(
      'scale_vaapi=w=1920:h=1080:format=nv12,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709',
    )
    expect(args.join(' ')).toContain('-quality 7 -low_power 1')
    // output colour options would make ffmpeg add a scale that can't take GPU frames
    expect(args).not.toContain('-color_primaries')
  })

  test('VAAPI on AMD: tone mapped by libplacebo on Vulkan, mapped from VAAPI and back', () => {
    const args = middle(runArgs(run({ accel: accel('vaapi', { vendor: 'amd' }), toneMap: 'gpu' })))
    expect(args.join(' ')).toContain(
      '-init_hw_device vaapi=va:/dev/dri/renderD128 -init_hw_device vulkan=vk@va -hwaccel vaapi',
    )
    expect(args).toContain(
      'hwmap=derive_device=vulkan,format=vulkan,' +
        'libplacebo=w=1920:h=1080:format=nv12:colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv:tonemapping=auto,' +
        'hwmap=derive_device=vaapi,format=vaapi',
    )
  })

  test('QSV: VAAPI decodes, mapped to QSV, vpp_qsv scales and tone maps, h264_qsv encodes', () => {
    expect(
      middle(runArgs(run({ accel: accel('qsv'), toneMap: 'gpu', preset: 'quality' }))),
    ).toEqual([
      ...['-copyts', '-start_at_zero'],
      ...['-init_hw_device', 'vaapi=va:/dev/dri/renderD128', '-init_hw_device', 'qsv=qs@va'],
      ...['-hwaccel', 'vaapi', '-hwaccel_output_format', 'vaapi', '-hwaccel_device', 'va'],
      ...['-filter_hw_device', 'qs'],
      ...['-i', '/m/a.mkv', '-map', '0:0'],
      ...['-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1'],
      '-vf',
      'hwmap=derive_device=qsv,format=qsv,vpp_qsv=w=1920:h=1080:format=nv12:tonemap=1:' +
        'out_color_matrix=bt709:out_color_primaries=bt709:out_color_transfer=bt709',
      ...['-c:v', 'h264_qsv', '-b:v', '8000000', '-maxrate', '8000000', '-bufsize', '16000000'],
      ...['-preset', 'slow', '-low_power', '0', '-look_ahead', '0', '-forced_idr', '1'],
      ...['-profile:v', 'high', '-level:v', '41', '-g', '65535'],
      ...KEYFRAMES,
    ])
  })

  test('NVENC: CUDA decodes and scales; libplacebo tone maps from memory; h264_nvenc encodes', () => {
    expect(middle(runArgs(run({ accel: accel('nvenc'), toneMap: 'gpu' })))).toEqual([
      ...['-copyts', '-start_at_zero'],
      ...['-init_hw_device', 'cuda=cu:0'],
      ...['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda', '-hwaccel_device', 'cu'],
      ...['-i', '/m/a.mkv', '-map', '0:0'],
      ...['-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1'],
      '-vf',
      'scale_cuda=w=1920:h=1080:format=p010le,hwdownload,format=p010le,' +
        'libplacebo=format=yuv420p:colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv:' +
        'tonemapping=auto:apply_dolbyvision=1',
      ...['-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'hq', '-rc', 'vbr'],
      ...['-b:v', '8000000', '-maxrate', '8000000', '-bufsize', '16000000'],
      ...['-forced-idr', '1', '-no-scenecut', '1'],
      ...['-profile:v', 'high', '-level:v', '41', '-g', '65535'],
      ...KEYFRAMES,
    ])
  })

  test('NVENC without tone mapping keeps the frames on the GPU', () => {
    const args = middle(runArgs(run({ accel: accel('nvenc'), toneMap: null, preset: 'speed' })))
    expect(args).toContain(
      'scale_cuda=w=1920:h=1080:format=nv12,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709',
    )
    expect(args.join(' ')).toContain('-preset p2')
  })

  test('VideoToolbox: decoded, scaled and converted to BT.709 by scale_vt', () => {
    expect(middle(runArgs(run({ accel: accel('videotoolbox'), toneMap: 'gpu' })))).toEqual([
      ...['-copyts', '-start_at_zero'],
      ...['-hwaccel', 'videotoolbox', '-hwaccel_output_format', 'videotoolbox_vld'],
      ...['-i', '/m/a.mkv', '-map', '0:0'],
      ...['-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1'],
      '-vf',
      'scale_vt=w=1920:h=1080:color_matrix=bt709:color_primaries=bt709:color_transfer=bt709',
      ...['-c:v', 'h264_videotoolbox', '-prio_speed', '1'],
      ...['-b:v', '8000000', '-maxrate', '8000000', '-bufsize', '16000000'],
      ...['-profile:v', 'high', '-level:v', '41', '-g', '65535'],
      ...KEYFRAMES,
    ])
  })

  test('a picture subtitle on a GPU: the frames come down, the subtitle is laid on, and go back up', () => {
    const args = runArgs(
      run({ accel: accel('vaapi'), toneMap: 'gpu', burnIn: { kind: 'picture', index: 3 } }),
    )
    expect(
      args.slice(args.indexOf('-filter_complex'), args.indexOf('-filter_complex') + 2),
    ).toEqual([
      '-filter_complex',
      '[0:0]scale_vaapi=w=1920:h=1080,tonemap_vaapi=format=nv12:t=bt709:m=bt709:p=bt709,' +
        'hwdownload,format=nv12[b];[0:3]scale=1920:1080[s];' +
        '[b][s]overlay=eof_action=pass,format=nv12,hwupload[v]',
    ])
    expect(args.join(' ')).toContain('-map [v]')
  })

  test('ASS on NVENC and VideoToolbox: drawn in memory, which their encoders take', () => {
    const burnIn = { kind: 'text', path: '/t/s/burn.ass', fontsDir: null } as const
    expect(runArgs(run({ accel: accel('videotoolbox'), toneMap: 'gpu', burnIn }))).toContain(
      'scale_vt=w=1920:h=1080:color_matrix=bt709:color_primaries=bt709:color_transfer=bt709,' +
        'hwdownload,format=nv12,subtitles=filename=/t/s/burn.ass,format=yuv420p',
    )
    expect(runArgs(run({ accel: accel('nvenc'), toneMap: 'gpu', burnIn })).join(' ')).toContain(
      'apply_dolbyvision=1,subtitles=filename=/t/s/burn.ass,format=yuv420p',
    )
  })

  test('a 10-bit film’s frames come down from VideoToolbox as p010, then 8-bit in memory', () => {
    const burnIn = { kind: 'text', path: '/t/s/burn.ass', fontsDir: null } as const
    const tenBit = run({ accel: accel('videotoolbox'), toneMap: null, burnIn })
    if (tenBit.video) tenBit.video.bitDepth = 10
    expect(runArgs(tenBit).join(' ')).toContain(
      'hwdownload,format=p010le,format=nv12,subtitles=filename=/t/s/burn.ass,format=yuv420p',
    )
  })

  test('QSV takes its frames back with hwupload into QSV’s own format', () => {
    const args = runArgs(
      run({ accel: accel('qsv'), toneMap: null, burnIn: { kind: 'picture', index: 2 } }),
    )
    expect(args.join(' ')).toContain(
      'overlay=eof_action=pass,format=nv12,hwupload=extra_hw_frames=16,format=qsv[v]',
    )
  })

  test('the processor tone maps with zscale after scaling, and lays a subtitle on after that', () => {
    const args = runArgs(run({ toneMap: 'cpu', burnIn: { kind: 'picture', index: 3 } }))
    expect(args).toContain(
      `[0:0]scale=1920:1080,${CPU_TONE_MAP}[b];[0:3]scale=1920:1080[s];` +
        '[b][s]overlay=eof_action=pass,format=yuv420p[v]',
    )
    expect(args.join(' ')).toContain('-c:v libx264')
    expect(args.join(' ')).toContain('-color_primaries bt709 -color_trc bt709 -colorspace bt709')
    expect(runArgs(run({ toneMap: 'cpu' }))).toContain(`scale=1920:1080,${CPU_TONE_MAP}`)
  })

  test('a direct stream never touches the GPU', () => {
    const args = runArgs(
      run({
        accel: accel('vaapi'),
        video: { index: 0, codec: 'hevc', width: 1920, height: 1080, plan: { action: 'copy' } },
      }),
    )
    expect(args.join(' ')).not.toContain('hwaccel')
    expect(args.join(' ')).toContain('-c:v copy')
  })
})

describe('where HDR is tone mapped', () => {
  const intel = accel('vaapi')
  test('Intel’s GPU tone maps PQ only; HLG and Dolby Vision’s profile 5 go to the processor', () => {
    expect(toneMapOn('hdr10', intel, true)).toBe('gpu')
    expect(toneMapOn('dv-hdr10', accel('qsv'), true)).toBe('gpu')
    expect(toneMapOn('hlg', intel, true)).toBe('cpu')
    expect(toneMapOn('hlg', accel('qsv'), false)).toBeNull()
    expect(toneMapOn('dv', intel, true)).toBeNull()
  })
  test('libplacebo reads them all; VideoToolbox all but profile 5', () => {
    for (const hdr of ['hdr10', 'hlg', 'dv', 'dv-hdr10plus']) {
      expect(toneMapOn(hdr, accel('nvenc'), false)).toBe('gpu')
      expect(toneMapOn(hdr, accel('vaapi', { vendor: 'amd' }), false)).toBe('gpu')
    }
    expect(toneMapOn('hlg', accel('videotoolbox'), false)).toBe('gpu')
    expect(toneMapOn('dv', accel('videotoolbox'), true)).toBeNull()
  })
  test('a path whose tone mapping failed its check leaves it to the processor', () => {
    expect(toneMapOn('hdr10', accel('vaapi', { toneMap: false }), true)).toBe('cpu')
    expect(toneMapOn('hdr10', accel('vaapi', { toneMap: false }), false)).toBeNull()
    expect(toneMapOn('hdr10', null, true)).toBe('cpu')
  })
})

describe('what the host has', () => {
  test('encoders and filters by name, from ffmpeg’s lists', () => {
    const encoders = parseList(
      [
        'Encoders:',
        ' V..... = Video',
        ' ------',
        ' V....D libx264              libx264 H.264 / AVC (codec h264)',
        ' V....D h264_vaapi           H.264/AVC (VAAPI) (codec h264)',
        ' A....D aac                  AAC (Advanced Audio Coding)',
      ].join('\n'),
    )
    expect([...encoders]).toEqual(['libx264', 'h264_vaapi', 'aac'])
    const filters = parseList(
      [
        'Filters:',
        '  T.. = Timeline support',
        ' ... zscale            V->V       Apply resizing, colorspace and bit depth conversion.',
        ' TSC overlay           VV->V      Overlay a video source on top of the input.',
        ' .. scale_vt          V->V       Scale Videotoolbox frames',
      ].join('\n'),
    )
    expect(filters.has('zscale')).toBe(true)
    expect(filters.has('overlay')).toBe(true)
    expect(filters.has('scale_vt')).toBe(true)
  })

  test('the VAAPI driver’s name, from ffmpeg’s verbose log', () => {
    const line = (s: string) => `[AVHWDeviceContext @ 0x55d] VAAPI driver: ${s}.\n`
    expect(
      parseVaapiDriver(line('Intel iHD driver for Intel(R) Gen Graphics - 24.1.0 ()')),
    ).toEqual({ vendor: 'intel', driver: 'iHD', name: 'Intel graphics (iHD 24.1.0)' })
    expect(parseVaapiDriver(line('Intel i965 driver for Intel(R) Coffee Lake - 2.4.1'))).toEqual({
      vendor: 'intel',
      driver: 'i965',
      name: 'Intel graphics (i965 2.4.1)',
    })
    expect(
      parseVaapiDriver(
        line('Mesa Gallium driver 24.2.8-1 for AMD Radeon RX 6600 (radeonsi, navi23, LLVM 19.1.4)'),
      ),
    ).toEqual({ vendor: 'amd', driver: 'mesa', name: 'AMD Radeon RX 6600' })
    expect(parseVaapiDriver('Device creation failed: -22.')).toBeNull()
  })

  test('render nodes in order', () => {
    expect(renderNodes(['card0', 'renderD129', 'renderD128', 'by-path'])).toEqual([
      '/dev/dri/renderD128',
      '/dev/dri/renderD129',
    ])
  })

  test('opening a device', () => {
    expect(probeArgs('qsv', '/dev/dri/renderD129')).toEqual([
      ...['-hide_banner', '-nostdin', '-v', 'verbose'],
      ...['-init_hw_device', 'vaapi=va:/dev/dri/renderD129'],
      ...['-f', 'lavfi', '-i', 'color=black:s=64x64:d=0.1', '-f', 'null', '-'],
    ])
    expect(probeArgs('nvenc', null)).toContain('cuda=cu:0')
    expect(probeArgs('videotoolbox', null)).toContain('videotoolbox=vt')
  })
})

describe('the check', () => {
  test('a 10 s 1080p HEVC 10-bit clip tagged HDR10', () => {
    const args = clipArgs('/data/hardware/check.mkv')
    expect(args).toContain('testsrc2=s=1920x1080:r=24:d=10')
    expect(args.join(' ')).toContain('-c:v libx265')
    expect(args.join(' ')).toContain('colorprim=bt2020:transfer=smpte2084')
    expect(CHECK_FRAMES).toBe(240)
  })

  test('a run’s own command line, thrown away', () => {
    const args = checkArgs('/c.mkv', accel('vaapi', { lowPower: true }), false)
    expect(args.join(' ')).toBe(
      '-hide_banner -nostdin -loglevel error ' +
        '-init_hw_device vaapi=va:/dev/dri/renderD128 ' +
        '-hwaccel vaapi -hwaccel_output_format vaapi -hwaccel_device va -filter_hw_device va ' +
        '-i /c.mkv -map 0:v:0 -an -vf scale_vaapi=w=1920:h=1080:format=nv12 ' +
        '-c:v h264_vaapi -rc_mode VBR -b:v 8000000 -maxrate 8000000 -bufsize 16000000 ' +
        '-quality 4 -low_power 1 -profile:v high -level:v 41 -g 65535 -f null -',
    )
    expect(checkArgs('/c.mkv', accel('vaapi'), true).join(' ')).toContain('tonemap_vaapi')
  })

  test('Automatic takes the first path that passed, and never one that hasn’t', () => {
    const paths = [
      { path: 'vaapi' as const, passed: false },
      { path: 'qsv' as const, passed: true },
      { path: 'nvenc' as const, passed: true },
    ]
    expect(choosePath('auto', paths)?.path).toBe('qsv')
    expect(choosePath('nvenc', paths)?.path).toBe('nvenc')
    expect(choosePath('vaapi', paths)).toBeNull()
    expect(choosePath('off', paths)).toBeNull()
    expect(choosePath('auto', [])).toBeNull()
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { unparsable } from '@highsea-tv/i18n'
import { decide, type Method, streamMessages } from '../src/decision/index.ts'
import { BUILT_IN, builtIn, type DeviceProfile, withReport } from '../src/profiles/index.ts'
import { FILES, type FileName } from './files.ts'

const profile = (id: string) => builtIn(id) as DeviceProfile
const codes = (d: { reasons: { code: string }[] }) => d.reasons.map((r) => r.code)

// Exit criterion 2: every built-in profile against every kind of file, with the method each
// should get. Chrome and Firefox share MDN's lists; Chrome on a Mac adds HEVC; Safari takes
// AC-3 and E-AC-3 and HEVC tagged hvc1, and no Opus.
const MATRIX: Record<FileName, Record<string, Method>> = {
  'mp4-h264-aac': {
    'web-chromium': 'direct-play',
    'web-chromium-macos': 'direct-play',
    'web-firefox': 'direct-play',
    'web-safari': 'direct-play',
  },
  'mkv-h264-ac3-srt': {
    'web-chromium': 'direct-stream',
    'web-chromium-macos': 'direct-stream',
    'web-firefox': 'direct-stream',
    'web-safari': 'direct-stream',
  },
  'mkv-hevc-hdr10-truehd-pgs': {
    'web-chromium': 'transcode',
    'web-chromium-macos': 'transcode',
    'web-firefox': 'transcode',
    'web-safari': 'transcode',
  },
  'mp4-hevc-hev1': {
    'web-chromium': 'transcode',
    'web-chromium-macos': 'direct-play',
    'web-firefox': 'transcode',
    'web-safari': 'direct-stream',
  },
  'mp4-dv5': {
    'web-chromium': 'transcode',
    'web-chromium-macos': 'transcode',
    'web-firefox': 'transcode',
    'web-safari': 'transcode',
  },
  'mkv-dv81': {
    'web-chromium': 'transcode',
    'web-chromium-macos': 'transcode',
    'web-firefox': 'transcode',
    'web-safari': 'transcode',
  },
  'webm-vp9-opus': {
    'web-chromium': 'direct-play',
    'web-chromium-macos': 'direct-play',
    'web-firefox': 'direct-play',
    'web-safari': 'transcode',
  },
  'mkv-av1-opus': {
    'web-chromium': 'direct-stream',
    'web-chromium-macos': 'direct-stream',
    'web-firefox': 'direct-stream',
    'web-safari': 'transcode',
  },
  'mkv-h264-hi10p': {
    'web-chromium': 'transcode',
    'web-chromium-macos': 'transcode',
    'web-firefox': 'transcode',
    'web-safari': 'transcode',
  },
  'avi-mpeg4-mp3': {
    'web-chromium': 'transcode',
    'web-chromium-macos': 'transcode',
    'web-firefox': 'transcode',
    'web-safari': 'transcode',
  },
  'mkv-h264-dts': {
    'web-chromium': 'direct-stream',
    'web-chromium-macos': 'direct-stream',
    'web-firefox': 'direct-stream',
    'web-safari': 'direct-stream',
  },
}

describe('the matrix', () => {
  test('covers every built-in profile', () => {
    for (const row of Object.values(MATRIX))
      expect(Object.keys(row).sort()).toEqual(BUILT_IN.map((p) => p.id).sort())
  })
  for (const [name, row] of Object.entries(MATRIX))
    for (const [id, method] of Object.entries(row))
      test(`${name} on ${id}: ${method}`, () => {
        const d = decide({ file: FILES[name as FileName], profile: profile(id) })
        expect(d.method).toBe(method)
        // every decision says why, and ends with its method
        expect(d.reasons.length).toBeGreaterThan(1)
        expect(d.reasons.at(-1)?.code).toStartWith('method.')
      })
})

describe('the plans', () => {
  test('direct play copies everything', () => {
    const d = decide({ file: FILES['mp4-h264-aac'], profile: profile('web-firefox') })
    expect(d).toMatchObject({
      container: 'mp4',
      video: { action: 'copy' },
      audio: { index: 1, action: 'copy' },
    })
    expect(d.bitrate).toBe(6_000_000)
  })

  test('direct stream copies the picture and makes AC-3 into AAC for Chrome, keeping 5.1', () => {
    const d = decide({ file: FILES['mkv-h264-ac3-srt'], profile: profile('web-chromium') })
    expect(d.video).toEqual({ action: 'copy' })
    expect(d.audio).toEqual({ index: 1, action: 'transcode', codec: 'aac', channels: 6 })
    expect(codes(d)).toContain('container.unsupported')
    expect(codes(d)).toContain('audio.codec')
  })

  test('Safari copies AC-3 into the stream', () => {
    const d = decide({ file: FILES['mkv-h264-ac3-srt'], profile: profile('web-safari') })
    expect(d.audio).toEqual({ index: 1, action: 'copy' })
  })

  test('Safari takes HEVC tagged hev1 only once it is remuxed', () => {
    const d = decide({ file: FILES['mp4-hevc-hev1'], profile: profile('web-safari') })
    expect(codes(d)).toContain('video.tag')
    expect(d.video).toEqual({ action: 'copy' })
  })

  test('an HDR film on a client without HDR is made into SDR, and says the colours suffer', () => {
    const d = decide({
      file: FILES['mkv-hevc-hdr10-truehd-pgs'],
      profile: profile('web-chromium-macos'),
    })
    expect(d.video).toMatchObject({ action: 'transcode', codec: 'h264', height: 2160, toSdr: true })
    expect(codes(d)).toContain('hdr.unsupported')
    expect(codes(d)).toContain('hdr.washedOut')
    const mapped = decide({
      file: FILES['mkv-hevc-hdr10-truehd-pgs'],
      profile: profile('web-chromium-macos'),
      server: { burnIn: false, toneMapping: true },
    })
    expect(codes(mapped)).not.toContain('hdr.washedOut')
    expect(codes(mapped)).toContain('hdr.toneMapped')
  })

  test('Dolby Vision 8.1 plays its HDR10 layer where HDR10 is shown, and profile 5 can’t', () => {
    const hdr10 = withReport(profile('web-chromium-macos'), {
      hdr: { formats: ['hdr10'], dolbyVision: [] },
    })
    const d81 = decide({ file: FILES['mkv-dv81'], profile: hdr10 })
    expect(d81.method).toBe('direct-stream')
    expect(codes(d81)).toContain('hdr.fallback')
    expect(decide({ file: FILES['mp4-dv5'], profile: hdr10 }).method).toBe('transcode')
  })

  test('a transcode makes TrueHD into AAC 5.1 and caps the picture at the ceiling', () => {
    const d = decide({
      file: FILES['mkv-hevc-hdr10-truehd-pgs'],
      profile: profile('web-chromium'),
      ceiling: { bitrate: 8_000_000, height: 1080 },
    })
    expect(d.video).toMatchObject({ height: 1080, bitrate: 8_000_000 })
    expect(d.audio).toEqual({ index: 1, action: 'transcode', codec: 'aac', channels: 6 })
    expect(codes(d)).toContain('bitrate.over')
    expect(codes(d)).toContain('bitrate.height')
  })

  test('away from home, a file over the ceiling is transcoded even when the client plays it', () => {
    const d = decide({
      file: FILES['mp4-h264-aac'],
      profile: profile('web-safari'),
      ceiling: { bitrate: 4_000_000, height: 720 },
    })
    expect(d.method).toBe('transcode')
    expect(d.video).toMatchObject({ height: 720, bitrate: 4_000_000 })
    // the sound plays as it is, so it's copied into the stream
    expect(d.audio).toEqual({ index: 1, action: 'copy' })
  })

  test('a film 1920 wide and 800 high counts as 1080p', () => {
    const wide = { ...FILES['mp4-h264-aac'], info: { ...FILES['mp4-h264-aac'].info } }
    wide.info.video = { ...(wide.info.video as NonNullable<typeof wide.info.video>), height: 800 }
    expect(
      decide({
        file: wide,
        profile: profile('web-safari'),
        ceiling: { bitrate: null, height: 1080 },
      }).method,
    ).toBe('direct-play')
    expect(
      decide({
        file: wide,
        profile: profile('web-safari'),
        ceiling: { bitrate: null, height: 720 },
      }).method,
    ).toBe('transcode')
  })
})

describe('the picks', () => {
  test('a browser that can’t choose a file’s sound track gets the commentary put first', () => {
    const d = decide({
      file: FILES['mkv-h264-ac3-srt'],
      profile: profile('web-chromium'),
      audio: 2,
    })
    expect(d.audio).toEqual({ index: 2, action: 'copy' })
    expect(codes(d)).toContain('audio.track')
  })

  test('Safari chooses the track itself, so the file plays as it is', () => {
    const file = { ...FILES['mp4-h264-aac'] }
    file.info = {
      ...file.info,
      audio: [
        ...file.info.audio,
        { ...(file.info.audio[0] as (typeof file.info.audio)[0]), index: 2, default: false },
      ],
    }
    expect(decide({ file, profile: profile('web-safari'), audio: 2 }).method).toBe('direct-play')
    expect(decide({ file, profile: profile('web-chromium'), audio: 2 }).method).toBe(
      'direct-stream',
    )
  })

  test('text subtitles are sent alongside as WebVTT and don’t change the method', () => {
    const d = decide({
      file: FILES['mp4-h264-aac'],
      profile: profile('web-chromium'),
      subtitle: { kind: 'sidecar', id: 's1', format: 'srt' },
    })
    expect(d.method).toBe('direct-play')
    expect(d.subtitle).toEqual({
      pick: { kind: 'sidecar', id: 's1', format: 'srt' },
      delivery: 'external',
    })
  })

  test('ASS loses its styling, unless the server burns it in', () => {
    const d = decide({
      file: FILES['mkv-av1-opus'],
      profile: profile('web-chromium'),
      subtitle: { kind: 'embedded', index: 2 },
    })
    expect(d.subtitle?.delivery).toBe('external')
    expect(codes(d)).toContain('subtitle.styling')
    const burnt = decide({
      file: FILES['mkv-av1-opus'],
      profile: profile('web-chromium'),
      subtitle: { kind: 'embedded', index: 2 },
      server: { burnIn: true, toneMapping: false },
    })
    expect(burnt.method).toBe('transcode')
    expect(burnt.subtitle?.delivery).toBe('burn-in')
    expect(codes(burnt)).toContain('subtitle.burnIn')
    expect(codes(burnt)).not.toContain('subtitle.styling')
    // a sidecar's SRT is never burned in
    const srt = decide({
      file: FILES['mkv-av1-opus'],
      profile: profile('web-chromium'),
      subtitle: { kind: 'sidecar', id: 's1', format: 'srt' },
      server: { burnIn: true, toneMapping: false },
    })
    expect(srt.subtitle?.delivery).toBe('external')
  })

  test('PGS can’t be shown until the server burns it in, and then it forces a transcode', () => {
    const file = FILES['mkv-h264-ac3-srt']
    const pgs = {
      ...file,
      info: {
        ...file.info,
        subtitles: [
          {
            ...(file.info.subtitles[0] as (typeof file.info.subtitles)[0]),
            codec: 'hdmv_pgs_subtitle',
          },
        ],
      },
    }
    const now = decide({
      file: pgs,
      profile: profile('web-chromium'),
      subtitle: { kind: 'embedded', index: 3 },
    })
    expect(now.method).toBe('direct-stream')
    expect(now.subtitle?.delivery).toBe('unavailable')
    expect(codes(now)).toContain('subtitle.unavailable')
    const later = decide({
      file: pgs,
      profile: profile('web-chromium'),
      subtitle: { kind: 'embedded', index: 3 },
      server: { burnIn: true, toneMapping: true },
    })
    expect(later.method).toBe('transcode')
    expect(later.subtitle?.delivery).toBe('burn-in')
  })
})

describe('reported profiles', () => {
  test('a report replaces the lists it sends, widening Chrome to HEVC', () => {
    const report = withReport(profile('web-chromium'), {
      video: [
        { codec: 'h264', bitDepths: [8] },
        { codec: 'hevc', profiles: ['main'], bitDepths: [8] },
      ],
    })
    expect(decide({ file: FILES['mp4-hevc-hev1'], profile: report }).method).toBe('direct-play')
    expect(report.containers).toEqual(profile('web-chromium').containers)
  })

  test('and narrowing it', () => {
    const report = withReport(profile('web-chromium'), { containers: ['webm'] })
    expect(decide({ file: FILES['mp4-h264-aac'], profile: report }).method).toBe('direct-stream')
  })
})

describe('the reasons', () => {
  test('read as sentences', () => {
    const d = decide({ file: FILES['mkv-h264-dts'], profile: profile('web-firefox') })
    expect(d.reasons.map((r) => r.message)).toEqual([
      'Firefox can’t open Matroska files',
      'Firefox plays H.264 at 8 bits',
      'Firefox can’t play DTS-HD MA, so it’s made into AAC',
      'The picture is sent as it is, in a stream Firefox can play',
    ])
  })

  test('are valid ICU', () => {
    expect(unparsable(streamMessages)).toEqual([])
  })
})

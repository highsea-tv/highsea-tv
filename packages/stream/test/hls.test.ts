// SPDX-License-Identifier: AGPL-3.0-only
// HLS (checkpoint 4.1b, ADR 0051): segments from the grid and from keyframes, the playlists
// against RFC 8216's rules, and ffmpeg's command lines kept as they are. Real ffmpeg runs in
// hls-ffmpeg.test.ts.
import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assArgs,
  attachmentArgs,
  copySeek,
  covers,
  createTranscodes,
  cueBlocks,
  downmixFilter,
  type EncoderPreset,
  filterPath,
  gridSegments,
  keyframeArgs,
  keyframeSegments,
  LEADING_FRAMES,
  leadInArgs,
  mediaPlaylist,
  multivariantPlaylist,
  parseFonts,
  parseKeyframes,
  pieceStarts,
  runArgs,
  type Segment,
  scaledSize,
  segmentAt,
  subtitleArgs,
  subtitlePlaylist,
  subtitlesArgs,
  transcodeCodecs,
  webvttSegment,
} from '../src/hls/index.ts'
import { trickplayArgs, trickplayManifest } from '../src/trickplay/index.ts'

/**
 * RFC 8216's rules a media playlist must keep: the header first (§ 4.3.1.1), a version that
 * allows EXT-X-MAP (§ 4.3.2.5, § 7), every EXTINF rounded at most the target (§ 4.3.3.1), a URI
 * after each EXTINF (§ 4.3.2.1), and the end tag on a VOD playlist (§ 4.3.3.4, § 4.3.3.5).
 */
function checkMedia(text: string) {
  const lines = text.trim().split('\n')
  expect(lines[0]).toBe('#EXTM3U')
  const version = Number(lines.find((l) => l.startsWith('#EXT-X-VERSION:'))?.split(':')[1])
  expect(version).toBeGreaterThanOrEqual(6)
  const target = Number(lines.find((l) => l.startsWith('#EXT-X-TARGETDURATION:'))?.split(':')[1])
  expect(Number.isInteger(target)).toBe(true)
  expect(lines).toContain('#EXT-X-PLAYLIST-TYPE:VOD')
  expect(lines.at(-1)).toBe('#EXT-X-ENDLIST')
  const map = lines.findIndex((l) => l.startsWith('#EXT-X-MAP:'))
  const first = lines.findIndex((l) => l.startsWith('#EXTINF:'))
  expect(map).toBeGreaterThan(-1)
  expect(map).toBeLessThan(first)
  let total = 0
  lines.forEach((l, i) => {
    if (!l.startsWith('#EXTINF:')) return
    const d = Number(l.slice(8).split(',')[0])
    expect(Math.round(d)).toBeLessThanOrEqual(target)
    expect(lines[i + 1]?.startsWith('#')).toBe(false)
    total += d
  })
  return total
}

const contiguous = (segments: Segment[], duration: number) => {
  segments.forEach((s, i) => {
    const next = segments[i + 1]
    if (next) {
      expect(next.start).toBeCloseTo(s.start + s.duration, 6)
      expect(next.first).toBe(s.last)
    }
    expect(s.last).toBeGreaterThan(s.first)
  })
  expect(segments[0]?.start).toBe(0)
  const last = segments.at(-1) as Segment
  expect(last.start + last.duration).toBeCloseTo(duration, 6)
}

describe('segments', () => {
  test('a transcode is cut every 6 s, one piece each, the last shorter', () => {
    const s = gridSegments(20)
    expect(s).toEqual([
      { start: 0, duration: 6, first: 0, last: 1 },
      { start: 6, duration: 6, first: 1, last: 2 },
      { start: 12, duration: 6, first: 2, last: 3 },
      { start: 18, duration: 2, first: 3, last: 4 },
    ])
    expect(gridSegments(18)).toHaveLength(3)
    contiguous(gridSegments(5404.544), 5404.544)
  })

  test('a direct stream is cut at the first keyframe 6 s or more after the last cut', () => {
    // a B-frame film's first keyframe is shown a frame in: its piece still starts the film
    const keyframes = [0.083, 1.0, 2.5, 7.0, 9.0, 13.5, 24.0, 25.0]
    expect(pieceStarts(keyframes)).toEqual([0, 1, 2.5, 7, 9, 13.5, 24, 25])
    const s = keyframeSegments(keyframes, 27)
    expect(s).toEqual([
      { start: 0, duration: 7, first: 0, last: 3 },
      { start: 7, duration: 6.5, first: 3, last: 5 },
      { start: 13.5, duration: 10.5, first: 5, last: 6 },
      { start: 24, duration: 3, first: 6, last: 8 },
    ])
    contiguous(s, 27)
  })

  test('where a session starts, a direct stream’s first segments are as short as 2 s', () => {
    // a keyframe a second, as a disc's picture has
    const keyframes = Array.from({ length: 40 }, (_, i) => i)
    const lengths = (from?: number) =>
      keyframeSegments(keyframes, 40, 6, from).map((s) => `${s.start}+${s.duration}`)
    expect(lengths()).toEqual(['0+6', '6+6', '12+6', '18+6', '24+6', '30+6', '36+4'])
    // from the beginning: 12 s of 2 s segments, then 6 s ones
    expect(lengths(0).slice(0, 8)).toEqual([
      '0+2',
      '2+2',
      '4+2',
      '6+2',
      '8+2',
      '10+2',
      '12+6',
      '18+6',
    ])
    // a resume: a segment begins at the keyframe before it, and the short ones follow
    expect(lengths(15.5)).toEqual([
      '0+6',
      '6+6',
      '12+3',
      '15+2',
      '17+2',
      '19+2',
      '21+2',
      '23+2',
      '25+2',
      '27+6',
      '33+6',
      '39+1',
    ])
    contiguous(keyframeSegments(keyframes, 40, 6, 15.5), 40)
    // keyframes further apart than that can't be cut shorter: the same segments either way
    const sparse = [0, 10.4, 20.8, 31.2]
    expect(keyframeSegments(sparse, 40, 6, 12)).toEqual(keyframeSegments(sparse, 40))
  })

  test('the segment holding a time', () => {
    const s = gridSegments(60)
    expect(segmentAt(s, 0)).toBe(0)
    expect(segmentAt(s, 5.99)).toBe(0)
    expect(segmentAt(s, 6)).toBe(1)
    expect(segmentAt(s, 59)).toBe(9)
    expect(segmentAt(s, 600)).toBe(9)
  })

  test('keyframes from ffprobe, from the container’s start', () => {
    const out = [
      'pts_time=10.083417|dts_time=10.000000|flags=K__',
      'pts_time=10.166833|dts_time=10.041708|flags=___',
      'pts_time=20.5|dts_time=20.4|flags=K_',
      'pts_time=N/A|dts_time=30.000000|flags=K__',
      'start_time=10.000000',
    ].join('\n')
    expect(parseKeyframes(out)).toEqual([0.083417, 10.5, 20])
  })
})

describe('playlists, by RFC 8216', () => {
  test('a transcode’s media playlist lists every segment, from the start', () => {
    const text = mediaPlaylist(gridSegments(20))
    expect(checkMedia(text)).toBeCloseTo(20, 6)
    expect(text).toBe(
      [
        '#EXTM3U',
        '#EXT-X-VERSION:7',
        '#EXT-X-TARGETDURATION:6',
        '#EXT-X-MEDIA-SEQUENCE:0',
        '#EXT-X-PLAYLIST-TYPE:VOD',
        '#EXT-X-INDEPENDENT-SEGMENTS',
        '#EXT-X-MAP:URI="init.mp4"',
        '#EXTINF:6.000000,',
        '0.m4s',
        '#EXTINF:6.000000,',
        '1.m4s',
        '#EXTINF:6.000000,',
        '2.m4s',
        '#EXTINF:2.000000,',
        '3.m4s',
        '#EXT-X-ENDLIST',
        '',
      ].join('\n'),
    )
  })

  test('a direct stream’s target is its longest segment, rounded', () => {
    const text = mediaPlaylist(keyframeSegments([0, 10.427, 20.854, 31.6], 35))
    expect(checkMedia(text)).toBeCloseTo(35, 6)
    expect(text).toContain('#EXT-X-TARGETDURATION:11')
  })

  test('a resume’s media playlist says where to start, to the moment (§ 4.3.5.2)', () => {
    const segments = gridSegments(7200)
    const text = mediaPlaylist(segments, { start: 3604.25 })
    expect(checkMedia(text)).toBeCloseTo(7200, 6)
    const lines = text.split('\n')
    expect(lines).toContain('#EXT-X-START:TIME-OFFSET=3604.250,PRECISE=YES')
    // once, and before the segments
    expect(lines.filter((l) => l.startsWith('#EXT-X-START')).length).toBe(1)
    expect(lines.findIndex((l) => l.startsWith('#EXT-X-START'))).toBeLessThan(
      lines.findIndex((l) => l.startsWith('#EXTINF')),
    )
    // from the beginning there's nothing to say
    expect(mediaPlaylist(segments)).not.toContain('#EXT-X-START')
    expect(mediaPlaylist(segments, { start: 0 })).not.toContain('#EXT-X-START')
  })

  test('the multivariant playlist: one variant, and the text subtitles as a group', () => {
    const text = multivariantPlaylist(
      {
        bandwidth: 8_000_000,
        codecs: transcodeCodecs(1080, true),
        width: 1920,
        height: 1080,
        uri: 'video.m3u8',
      },
      [
        { name: 'English', language: 'en', forced: false, uri: 'subs/a.m3u8' },
        { name: 'English (forced)', language: 'en', forced: true, uri: 'subs/b.m3u8' },
        { name: 'Say "hi"', language: null, forced: false, uri: 'subs/c.m3u8' },
      ],
    )
    expect(text).toBe(
      [
        '#EXTM3U',
        '#EXT-X-VERSION:7',
        '#EXT-X-INDEPENDENT-SEGMENTS',
        '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",DEFAULT=NO,AUTOSELECT=NO,FORCED=NO,URI="subs/a.m3u8"',
        '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English (forced)",LANGUAGE="en",DEFAULT=NO,AUTOSELECT=YES,FORCED=YES,URI="subs/b.m3u8"',
        `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Say 'hi'",DEFAULT=NO,AUTOSELECT=NO,FORCED=NO,URI="subs/c.m3u8"`,
        '#EXT-X-STREAM-INF:BANDWIDTH=8000000,CODECS="avc1.640029,mp4a.40.2",RESOLUTION=1920x1080,SUBTITLES="subs"',
        'video.m3u8',
        '',
      ].join('\n'),
    )
  })

  test('a copied stream’s variant leaves out what it doesn’t know', () => {
    const text = multivariantPlaylist(
      { bandwidth: 6_000_000, codecs: null, width: null, height: null, uri: 'video.m3u8' },
      [],
    )
    expect(text).toContain('#EXT-X-STREAM-INF:BANDWIDTH=6000000\nvideo.m3u8')
    expect(text).not.toContain('SUBTITLES')
  })

  test('a subtitle rendition has a WebVTT segment at each of the picture’s', () => {
    // a resume's segments: a long one up to the keyframe before the start, short ones after
    const text = subtitlePlaylist(
      [
        { start: 0, duration: 3600.24, first: 0, last: 360 },
        { start: 3600.24, duration: 10, first: 360, last: 361 },
        { start: 3610.24, duration: 10.5, first: 361, last: 362 },
      ],
      (i) => `fil_1%3A2/${i}.vtt`,
    )
    expect(text).toBe(
      [
        '#EXTM3U',
        '#EXT-X-VERSION:7',
        '#EXT-X-TARGETDURATION:3600',
        '#EXT-X-MEDIA-SEQUENCE:0',
        '#EXT-X-PLAYLIST-TYPE:VOD',
        '#EXTINF:3600.240000,',
        'fil_1%3A2/0.vtt',
        '#EXTINF:10.000000,',
        'fil_1%3A2/1.vtt',
        '#EXTINF:10.500000,',
        'fil_1%3A2/2.vtt',
        '#EXT-X-ENDLIST',
        '',
      ].join('\n'),
    )
  })
})

describe('subtitle segments', () => {
  // as ffmpeg's WebVTT muxer writes them, the last cut short where a run was stopped
  const written = [
    'WEBVTT',
    '',
    '00:58.000 --> 01:00.500',
    'Before the start.',
    '',
    '01:00.000 --> 01:01.000',
    '<i>Hello.</i>',
    '',
    '01:05.000 --> 01:07.000 line:85%',
    'Across',
    'the boundary.',
    '',
    '01:00:12.000 --> 01:00:13.000',
    'An hour in.',
    '',
    '01:00:20.000 --> 01:00:2',
  ].join('\n')

  test('the cues of a growing file, each as written, a cut-off one left out', () => {
    expect(cueBlocks(written)).toEqual([
      { start: 58, end: 60.5, block: '00:58.000 --> 01:00.500\nBefore the start.' },
      { start: 60, end: 61, block: '01:00.000 --> 01:01.000\n<i>Hello.</i>' },
      { start: 65, end: 67, block: '01:05.000 --> 01:07.000 line:85%\nAcross\nthe boundary.' },
      { start: 3612, end: 3613, block: '01:00:12.000 --> 01:00:13.000\nAn hour in.' },
    ])
    // Windows line ends, and a header with notes
    expect(cueBlocks('WEBVTT\r\n\r\nNOTE x\r\n\r\n00:01.000 --> 00:02.000\r\nHi.\r\n')).toEqual([
      { start: 1, end: 2, block: '00:01.000 --> 00:02.000\nHi.' },
    ])
  })

  test('a cue across a boundary is in each segment it shows in, with its own times', () => {
    const cues = cueBlocks(written)
    const first = webvttSegment(cues, 60, 66)
    const second = webvttSegment(cues, 66, 72)
    expect(first).toBe(
      [
        'WEBVTT',
        'X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0',
        '',
        '00:58.000 --> 01:00.500',
        'Before the start.',
        '',
        '01:00.000 --> 01:01.000',
        '<i>Hello.</i>',
        '',
        '01:05.000 --> 01:07.000 line:85%',
        'Across',
        'the boundary.',
        '',
      ].join('\n'),
    )
    expect(second).toContain('01:05.000 --> 01:07.000 line:85%\nAcross\nthe boundary.')
    expect(second).not.toContain('Hello.')
    // a segment with none is a header alone, still valid WebVTT (RFC 8216 § 3.5)
    expect(webvttSegment(cues, 70, 76)).toBe(
      'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0\n',
    )
  })

  test('a stretch read by two runs gives each cue once, in order', () => {
    const cues = cueBlocks(written)
    const text = webvttSegment([...cues.slice(2), ...cues, ...cues.slice(1, 2)], 55, 3700)
    expect(text.match(/Hello\./g)).toHaveLength(1)
    expect(text.indexOf('Before the start.')).toBeLessThan(text.indexOf('An hour in.'))
  })

  test('what the runs have read covers a segment only without a gap', () => {
    const read = [
      { from: 3590, to: 3600 },
      { from: 3600, to: 3640 },
      { from: 0, to: 20 },
    ]
    expect(covers(read, 3590, 3620)).toBe(true)
    expect(covers(read, 10, 20)).toBe(true)
    expect(covers(read, 15, 25)).toBe(false)
    expect(covers(read, 3630, 3650)).toBe(false)
    expect(covers([], 5, 5)).toBe(true)
  })
})

describe('ffmpeg’s command lines', () => {
  const video = { index: 0, codec: 'h264', width: 1920, height: 800 }

  test('a direct stream copies the picture from a keyframe, and the sound if it can', () => {
    expect(
      runArgs({
        input: '/m/Film (2001)/Film.mkv',
        dir: '/data/transcodes/s1',
        start: 403.778375,
        startNumber: 100,
        nextStart: 409.778375,
        video: { ...video, codec: 'hevc', plan: { action: 'copy' } },
        audio: { index: 1, plan: { index: 1, action: 'transcode', codec: 'aac', channels: 6 } },
      }),
    ).toEqual([
      ...['-hide_banner', '-nostdin', '-loglevel', 'warning'],
      ...['-progress', 'pipe:1', '-stats_period', '1'],
      // halfway into the piece's GOP, and a transcoded sound track isn't trimmed to it (`copySeek`)
      ...['-noaccurate_seek', '-ss', '406.778375', '-copyts', '-start_at_zero'],
      ...['-i', '/m/Film (2001)/Film.mkv', '-map', '0:0', '-map', '0:1'],
      ...['-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1'],
      ...['-c:v', 'copy', '-tag:v', 'hvc1', '-bsf:v', 'noise=drop=lt(pts\\,startpts)'],
      ...['-c:a', 'aac', '-ac', '6', '-b:a', '384k'],
      ...['-f', 'hls', '-hls_segment_type', 'fmp4', '-hls_time', '0'],
      ...['-hls_list_size', '0', '-hls_flags', 'temp_file'],
      ...['-hls_segment_options', 'movflags=+frag_discont'],
      ...['-hls_fmp4_init_filename', 'init.mp4', '-start_number', '100'],
      ...['-hls_segment_filename', '/data/transcodes/s1/%d.m4s'],
      '/data/transcodes/s1/ffmpeg.m3u8',
    ])
  })

  test('a copy seeks halfway into its own GOP, short of the next keyframe (HT-56)', () => {
    // ffmpeg's demuxer lands 3/23 s early for B-frames (fftools/ffmpeg_demux.c), and 7.1's
    // Matroska seek earlier again: a millisecond past the keyframe started a GOP early
    expect(copySeek(485.986, 491.825)).toBeCloseTo(488.9055, 9)
    expect(copySeek(10, 10.1)).toBeCloseTo(10.05, 9)
    expect(copySeek(485.986)).toBeCloseTo(486.486, 9)
    expect(copySeek(600, 600)).toBeCloseTo(600.5, 9)
  })

  test('a copy drops the packets that show before its first, an open GOP’s leading frames (HT-56)', () => {
    const copy = (start: number) =>
      runArgs({
        input: '/m/a.mkv',
        dir: '/t',
        start,
        startNumber: 0,
        video: { ...video, plan: { action: 'copy' } },
        audio: null,
      })
    // the comma is escaped: a bitstream filter list is separated by commas
    expect(LEADING_FRAMES).toBe('noise=drop=lt(pts\\,startpts)')
    expect(copy(60).join(' ')).toContain(`-c:v copy -bsf:v ${LEADING_FRAMES}`)
    expect(copy(0).join(' ')).toContain(`-bsf:v ${LEADING_FRAMES}`)
    expect(copy(0)).not.toContain('-noaccurate_seek')
  })

  test('a run writes the film’s own text tracks as WebVTT, an output each, from its read', () => {
    const args = runArgs({
      input: '/m/a.mkv',
      dir: '/t/s1',
      start: 0,
      startNumber: 0,
      video: { ...video, plan: { action: 'copy' } },
      audio: null,
      subtitles: [
        { index: 2, output: '/t/s1/subs/run-1-2.vtt' },
        { index: 3, output: '/t/s1/subs/run-1-3.vtt' },
      ],
    })
    // after the stream's own output, which keeps leaving subtitles out
    const hls = args.indexOf('/t/s1/ffmpeg.m3u8')
    expect(args.slice(0, hls)).toContain('-sn')
    expect(args.slice(hls + 1)).toEqual([
      ...['-map', '0:2', '-c:s', 'webvtt', '-flush_packets', '1'],
      ...['-f', 'webvtt', '/t/s1/subs/run-1-2.vtt'],
      ...['-map', '0:3', '-c:s', 'webvtt', '-flush_packets', '1'],
      ...['-f', 'webvtt', '/t/s1/subs/run-1-3.vtt'],
    ])
  })

  test('the stretch before a run’s start is read for its subtitles alone', () => {
    expect(leadInArgs('/m/a.mkv', 3590.24, 3600.24, [{ index: 2, output: '/t/l.vtt' }])).toEqual([
      ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-y'],
      ...['-ss', '3590.240000', '-t', '10.000000', '-copyts', '-start_at_zero'],
      ...['-i', '/m/a.mkv', '-map', '0:2', '-c:s', 'webvtt', '-f', 'webvtt', '/t/l.vtt'],
    ])
  })

  test('a transcode makes H.264 with a keyframe every 6 s, capped, from the start', () => {
    expect(
      runArgs({
        input: '/m/a.mkv',
        dir: '/t/s2',
        start: 600,
        startNumber: 100,
        video: {
          ...video,
          plan: {
            action: 'transcode',
            codec: 'h264',
            height: 720,
            bitrate: 4_000_000,
            toSdr: true,
          },
        },
        audio: { index: 2, plan: { index: 2, action: 'copy' } },
      }),
    ).toEqual([
      ...['-hide_banner', '-nostdin', '-loglevel', 'warning'],
      ...['-progress', 'pipe:1', '-stats_period', '1', '-ss', '600.000000'],
      ...['-copyts', '-start_at_zero', '-i', '/m/a.mkv', '-map', '0:0', '-map', '0:2'],
      ...['-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1'],
      // the copied sound starts where the picture does
      ...['-ss', '600.000000', '-output_ts_offset', '600.000000'],
      // HDR relabelled as SDR on the frames, which the encoder takes its labels from
      ...[
        '-vf',
        'scale=1280:534:out_color_matrix=bt709,' +
          'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709,format=yuv420p',
      ],
      ...['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23'],
      ...['-maxrate', '4000000', '-bufsize', '8000000', '-profile:v', 'high', '-level:v', '4.1'],
      ...['-force_key_frames', 'expr:gte(t,n_forced*6)'],
      ...['-x264-params', 'keyint=infinite:scenecut=0', '-forced-idr', '1'],
      ...['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'],
      ...['-c:a', 'copy'],
      ...['-f', 'hls', '-hls_segment_type', 'fmp4', '-hls_time', '0'],
      ...['-hls_list_size', '0', '-hls_flags', 'temp_file'],
      ...['-hls_segment_options', 'movflags=+frag_discont'],
      ...['-hls_fmp4_init_filename', 'init.mp4', '-start_number', '100'],
      ...['-hls_segment_filename', '/t/s2/%d.m4s', '/t/s2/ffmpeg.m3u8'],
    ])
  })

  test('the encoder’s three settings are libx264’s presets either side of 4.1’s', () => {
    const at = (preset: EncoderPreset) => {
      const args = runArgs({
        input: '/m/a.mkv',
        dir: '/t/s3',
        start: 0,
        startNumber: 0,
        video: {
          ...video,
          plan: { action: 'transcode', codec: 'h264', height: 720, bitrate: 4e6, toSdr: false },
        },
        audio: null,
        preset,
      })
      return args[args.indexOf('-preset') + 1]
    }
    expect([at('speed'), at('balanced'), at('quality')]).toEqual([
      'superfast',
      'veryfast',
      'faster',
    ])
  })

  const transcode = {
    ...video,
    plan: {
      action: 'transcode' as const,
      codec: 'h264' as const,
      height: 720,
      bitrate: 4_000_000,
      toSdr: false,
    },
  }
  const after = (args: string[], flag: string) => args[args.indexOf(flag) + 1]

  test('a picture subtitle is scaled to the picture, laid over it, then scaled with it', () => {
    const args = runArgs({
      input: '/m/a.mkv',
      dir: '/t/s',
      start: 0,
      startNumber: 0,
      video: transcode,
      audio: null,
      burnIn: { kind: 'picture', index: 4 },
    })
    expect(after(args, '-filter_complex')).toBe(
      '[0:4]scale=1920:800[s];[0:0][s]overlay=eof_action=pass,scale=1280:534,format=yuv420p[v]',
    )
    expect(after(args, '-map')).toBe('[v]')
    expect(args).not.toContain('-vf')
  })

  test('ASS is drawn by libass after scaling, its paths escaped for the filtergraph', () => {
    const args = runArgs({
      input: '/m/a.mkv',
      dir: '/t/s',
      start: 0,
      startNumber: 0,
      video: transcode,
      audio: null,
      burnIn: { kind: 'text', path: "/t/s/Bob's: [film], 2.ass", fontsDir: '/t/s/fonts' },
    })
    expect(after(args, '-vf')).toBe(
      String.raw`scale=1280:534,subtitles=filename=/t/s/Bob\\\'s\\: \[film\]\, 2.ass` +
        ':fontsdir=/t/s/fonts,format=yuv420p',
    )
    expect(after(args, '-map')).toBe('0:0')
    // ffmpeg-filters' own example of the two levels
    expect(filterPath("a 'b': c, d")).toBe(String.raw`a \\\'b\\\'\\: c\, d`)
  })

  test('5.1 and 7.1 made stereo by RFC 7845’s matrices; other layouts by ffmpeg’s own', () => {
    const sound = (channels: number, layout: string | null) =>
      runArgs({
        input: '/m/a.mkv',
        dir: '/t/s',
        start: 0,
        startNumber: 0,
        video: null,
        audio: {
          index: 1,
          plan: { index: 1, action: 'transcode', codec: 'aac', channels: 2 },
          channels,
          layout,
        },
      })
    expect(after(sound(6, '5.1(side)'), '-af')).toBe(
      'pan=stereo|FL=0.529067*c0+0.374107*c2+0.458186*c4+0.264534*c5+0.374107*c3' +
        '|FR=0.529067*c1+0.374107*c2+0.264534*c4+0.458186*c5+0.374107*c3',
    )
    expect(downmixFilter(8, '7.1')).toBe(
      'pan=stereo|FL=0.388631*c0+0.274804*c2+0.336565*c6+0.194316*c7+0.336565*c4+0.194316*c5+0.274804*c3' +
        '|FR=0.388631*c1+0.274804*c2+0.194316*c6+0.336565*c7+0.194316*c4+0.336565*c5+0.274804*c3',
    )
    // an older probe without a layout: six channels are 5.1
    expect(downmixFilter(6, null)).toStartWith('pan=stereo|')
    for (const [channels, layout] of [
      [6, 'hexagonal'],
      [2, 'stereo'],
      [3, '2.1'],
    ] as const) {
      const args = sound(channels, layout)
      expect(args).not.toContain('-af')
      expect(after(args, '-ac')).toBe('2')
    }
    // each row sums to 2 (the RFC's normalization)
    for (const n of [6, 8]) {
      const rows = (downmixFilter(n, null) as string).split('|').slice(1)
      for (const row of rows) {
        const sum = [...row.matchAll(/([\d.]+)\*c/g)].reduce((a, m) => a + Number(m[1]), 0)
        expect(sum).toBeCloseTo(2, 4)
      }
    }
  })

  test('an ASS track is taken out with its fonts, named by highsea', () => {
    expect(
      assArgs('/m/a.mkv', 3, '/t/s/burn.ass', [
        { index: 7, path: '/t/s/fonts/0.font' },
        { index: 9, path: '/t/s/fonts/1.font' },
      ]),
    ).toEqual([
      ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-y'],
      ...['-dump_attachment:7', '/t/s/fonts/0.font', '-dump_attachment:9', '/t/s/fonts/1.font'],
      ...['-i', '/m/a.mkv', '-map', '0:3', '-c:s', 'copy', '-f', 'ass', '/t/s/burn.ass'],
    ])
    expect(attachmentArgs('/m/a.mkv')).toContain('stream=index:stream_tags=mimetype,filename')
    expect(
      parseFonts(
        JSON.stringify({
          streams: [
            { index: 7, tags: { mimetype: 'application/x-truetype-font', filename: 'a.ttf' } },
            { index: 8, tags: { mimetype: 'image/jpeg', filename: 'cover.jpg' } },
            { index: 9, tags: { filename: 'B.OTF' } },
            { index: 10, tags: { mimetype: 'font/ttf' } },
          ],
        }),
      ),
    ).toEqual([7, 9, 10])
    expect(parseFonts('')).toEqual([])
  })

  test('the picture’s size for a tier, even and never larger', () => {
    expect(scaledSize({ width: 3840, height: 2160 }, 1080)).toEqual({ width: 1920, height: 1080 })
    expect(scaledSize({ width: 1920, height: 800 }, 720)).toEqual({ width: 1280, height: 534 })
    expect(scaledSize({ width: 1280, height: 720 }, 1080)).toEqual({ width: 1280, height: 720 })
  })

  test('subtitles, keyframes and trickplay', () => {
    expect(subtitleArgs('/m/a.mkv', 3, '/t/s/sub.vtt')).toEqual([
      ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-i', '/m/a.mkv'],
      ...['-map', '0:3', '-c:s', 'webvtt', '-f', 'webvtt', '/t/s/sub.vtt'],
    ])
    expect(subtitleArgs('/m/a.en.srt', null, '/t/s/sub.vtt')).toContain('0:s:0')
    // a film's own tracks, read ahead of the first play: one pass over the file, an output each
    expect(
      subtitlesArgs('/m/a.mkv', [
        { index: 2, output: '/d/webvtt/f1/9-2.vtt.part' },
        { index: 3, output: '/d/webvtt/f1/9-3.vtt.part' },
      ]),
    ).toEqual([
      ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', '-i', '/m/a.mkv'],
      ...['-map', '0:2', '-c:s', 'webvtt', '-f', 'webvtt', '/d/webvtt/f1/9-2.vtt.part'],
      ...['-map', '0:3', '-c:s', 'webvtt', '-f', 'webvtt', '/d/webvtt/f1/9-3.vtt.part'],
    ])
    expect(keyframeArgs('/m/a.mkv', 0)).toEqual([
      ...['-v', 'error', '-select_streams', '0'],
      ...['-show_entries', 'format=start_time:packet=pts_time,dts_time,flags'],
      ...['-of', 'compact=p=0:nk=0', '/m/a.mkv'],
    ])
    expect(trickplayArgs('/m/a.mkv', 0, '/data/trickplay/f1.part')).toEqual([
      ...['-hide_banner', '-nostdin', '-loglevel', 'error', '-y'],
      ...['-skip_frame', 'nokey', '-i', '/m/a.mkv', '-map', '0:0', '-an', '-sn', '-dn'],
      ...['-vf', 'fps=1/10,scale=320:-2,tile=10x10', '-fps_mode', 'passthrough', '-q:v', '5'],
      ...['-f', 'image2', '-start_number', '0', '/data/trickplay/f1.part/%d.jpg'],
    ])
    expect(trickplayManifest(5404.5, { width: 1920, height: 800 })).toEqual({
      interval: 10,
      width: 320,
      height: 134,
      columns: 10,
      rows: 10,
      count: 541,
      sheets: 6,
    })
  })
})

describe('the cache', () => {
  test('at boot only the sessions’ folders go: the owner may share the folder', async () => {
    const root = mkdtempSync(join(tmpdir(), 'highsea-cache-'))
    const session = join(root, '0b6f7a52-3c1e-4b8a-9d2f-5e6a7b8c9d0e')
    mkdirSync(session)
    writeFileSync(join(session, '0.m4s'), 'x')
    writeFileSync(join(root, 'keep.txt'), 'x')
    mkdirSync(join(root, 'films'))
    const quiet = { info() {}, warn() {}, error() {} }
    await createTranscodes({ root, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', logger: quiet }).clear()
    expect(existsSync(session)).toBe(false)
    expect(existsSync(join(root, 'keep.txt'))).toBe(true)
    expect(existsSync(join(root, 'films'))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })
})

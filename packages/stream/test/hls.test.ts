// SPDX-License-Identifier: AGPL-3.0-only
// HLS (checkpoint 4.1b, ADR 0051): segments from the grid and from keyframes, the playlists
// against RFC 8216's rules, and ffmpeg's command lines kept as they are. Real ffmpeg runs in
// hls-ffmpeg.test.ts.
import { describe, expect, test } from 'bun:test'
import {
  gridSegments,
  keyframeArgs,
  keyframeSegments,
  mediaPlaylist,
  multivariantPlaylist,
  parseKeyframes,
  pieceStarts,
  runArgs,
  type Segment,
  scaledSize,
  segmentAt,
  subtitleArgs,
  subtitlePlaylist,
  transcodeCodecs,
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

  test('a subtitle rendition is one WebVTT segment as long as the film', () => {
    const text = subtitlePlaylist(5404.544, '/stream/subtitles/t/a.vtt')
    expect(text).toContain('#EXT-X-TARGETDURATION:5405')
    expect(text).toContain('#EXTINF:5404.544000,\n/stream/subtitles/t/a.vtt\n#EXT-X-ENDLIST')
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
        video: { ...video, codec: 'hevc', plan: { action: 'copy' } },
        audio: { index: 1, plan: { index: 1, action: 'transcode', codec: 'aac', channels: 6 } },
      }),
    ).toEqual([
      ...['-hide_banner', '-nostdin', '-loglevel', 'warning'],
      ...['-ss', '403.779375', '-copyts', '-start_at_zero'],
      ...['-i', '/m/Film (2001)/Film.mkv', '-map', '0:0', '-map', '0:1'],
      ...['-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1'],
      ...['-c:v', 'copy', '-tag:v', 'hvc1'],
      ...['-c:a', 'aac', '-ac', '6', '-b:a', '384k'],
      ...['-f', 'hls', '-hls_segment_type', 'fmp4', '-hls_time', '0'],
      ...['-hls_list_size', '0', '-hls_flags', 'temp_file'],
      ...['-hls_segment_options', 'movflags=+frag_discont'],
      ...['-hls_fmp4_init_filename', 'init.mp4', '-start_number', '100'],
      ...['-hls_segment_filename', '/data/transcodes/s1/%d.m4s'],
      '/data/transcodes/s1/ffmpeg.m3u8',
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
      ...['-hide_banner', '-nostdin', '-loglevel', 'warning', '-ss', '600.000000'],
      ...['-copyts', '-start_at_zero', '-i', '/m/a.mkv', '-map', '0:0', '-map', '0:2'],
      ...['-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1'],
      // the copied sound starts where the picture does
      ...['-ss', '600.000000', '-output_ts_offset', '600.000000'],
      ...['-vf', 'scale=1280:534,format=yuv420p'],
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

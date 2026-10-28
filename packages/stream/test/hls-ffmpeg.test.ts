// SPDX-License-Identifier: AGPL-3.0-only
// HLS and trickplay with real ffmpeg (checkpoint 4.1b), on a clip made here with lavfi's sources
// (ADR 0040), skipped and said so without ffmpeg, as ADR 0044's tests are: segments made on
// demand from a keyframe, on the film's own timeline whichever run made them, a run paused when
// it's far enough ahead, a transcode's keyframes every 6 s, WebVTT from an embedded track, a
// failure's log, and trickplay's sheets.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hasFfmpeg } from '@highsea-tv/media/testing'
import type { PlaybackDecision } from '../src/decision/index.ts'
import {
  createTranscodes,
  type HlsSource,
  readKeyframes,
  TranscodeError,
  type Transcodes,
} from '../src/hls/index.ts'
import { makeTrickplay } from '../src/trickplay/index.ts'

const ffmpeg = process.env.HIGHSEA_FFMPEG || 'ffmpeg'
const ffprobe = process.env.HIGHSEA_FFPROBE || 'ffprobe'

/** Each packet's stream, time and whether it's a keyframe, of a segment read with its header. */
function packets(dir: string, files: string[]) {
  const joined = join(dir, `joined-${Math.random().toString(36).slice(2)}.mp4`)
  writeFileSync(
    joined,
    Buffer.concat([join(dir, 'header.mp4'), ...files].map((f) => readFileSync(f))),
  )
  return execFileSync(ffprobe, [
    ...['-v', 'error', '-show_entries', 'packet=stream_index,pts_time,flags'],
    ...['-of', 'csv=p=0', joined],
  ])
    .toString()
    .trim()
    .split('\n')
    .map((l) => {
      const [stream, pts, flags] = l.split(',')
      return { stream: Number(stream), pts: Number(pts), key: flags?.startsWith('K') ?? false }
    })
}

/** The video track's timescale in the clip's MP4 pieces: the muxer's default for 24 fps. */
const VIDEO_TIMESCALE = 16000

/**
 * Each fragment's decode time (`tfdt`, ISO/IEC 14496-12 § 8.8.12) in a piece, by track: the
 * film's own time, whichever run wrote it.
 */
function decodeTimes(file: string): number[] {
  const data = readFileSync(file)
  const times: number[] = []
  for (let i = data.indexOf('tfdt'); i >= 0; i = data.indexOf('tfdt', i + 4)) {
    const version = data[i + 4]
    times.push(version === 1 ? Number(data.readBigUInt64BE(i + 8)) : data.readUInt32BE(i + 8))
  }
  return times
}

/** Each track's timescale, from the header's media header boxes (`mdhd`, § 8.4.2), in track order. */
function timescales(header: string): number[] {
  const data = readFileSync(header)
  const scales: number[] = []
  for (let i = data.indexOf('mdhd'); i >= 0; i = data.indexOf('mdhd', i + 4)) {
    // after the version and flags, two times of 4 bytes each (8 in version 1)
    scales.push(data.readUInt32BE(i + 8 + (data[i + 4] === 1 ? 16 : 8)))
  }
  return scales
}

const decision = (video: PlaybackDecision['video']): PlaybackDecision => ({
  method: video?.action === 'copy' ? 'direct-stream' : 'transcode',
  container: 'mkv',
  video,
  audio: { index: 1, action: 'transcode', codec: 'aac', channels: 2 },
  subtitle: null,
  bitrate: 1_000_000,
  reasons: [],
})

describe.skipIf(!hasFfmpeg)('HLS with ffmpeg', () => {
  let dir: string
  let clip: string
  let transcodes: Transcodes
  const logged: string[] = []
  const DURATION = 40

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'highsea-hls-'))
    clip = join(dir, 'clip.mkv')
    const srt = join(dir, 'clip.srt')
    writeFileSync(
      srt,
      '1\n00:00:01,000 --> 00:00:03,000\nHello.\n\n2\n00:00:30,000 --> 00:00:32,000\nLater.\n',
    )
    // 24 fps with a keyframe every 2 s, and one forced at 5 s, which x264 counts on from
    execFileSync(ffmpeg, [
      ...[
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `testsrc2=size=320x180:rate=24:duration=${DURATION}`,
      ],
      ...['-f', 'lavfi', '-i', `sine=frequency=440:duration=${DURATION}`, '-i', srt],
      ...['-map', '0:v', '-map', '1:a', '-map', '2:s'],
      ...['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'],
      ...['-g', '48', '-keyint_min', '48', '-force_key_frames', '5'],
      ...['-c:a', 'aac', '-c:s', 'srt', clip],
    ])
    transcodes = createTranscodes({
      root: join(dir, 'transcodes'),
      ffmpeg,
      ffprobe,
      logger: {
        info: () => {},
        warn: (m) => logged.push(m),
        error: (m, d) => logged.push(`${m} ${String(d?.log ?? '')}`),
      },
      aheadSeconds: 8,
      farSeconds: 6,
    })
  })
  afterAll(async () => {
    await transcodes.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const source = (o: Partial<HlsSource>): HlsSource => ({
    input: clip,
    duration: DURATION,
    decision: decision({ action: 'copy' }),
    video: { index: 0, codec: 'h264', width: 320, height: 180 },
    start: 0,
    keyframes: () => readKeyframes(ffprobe, clip, 0),
    ...o,
  })

  test('the keyframes, read without decoding', async () => {
    expect(await readKeyframes(ffprobe, clip, 0)).toEqual([
      0,
      2,
      4,
      5,
      ...Array.from({ length: 17 }, (_, i) => 7 + i * 2),
    ])
  })

  test('a direct stream: segments from keyframes, made when asked, on one timeline from any run', async () => {
    const t = transcodes.open('copy', source({}))
    const segments = await t.segments()
    expect(segments.slice(0, 3)).toEqual([
      { start: 0, duration: 7, first: 0, last: 4 },
      { start: 7, duration: 6, first: 4, last: 7 },
      { start: 13, duration: 6, first: 7, last: 10 },
    ])
    const files = await t.segment(1)
    expect(files.map((f) => f.split('/').at(-1))).toEqual(['4.m4s', '5.m4s', '6.m4s'])
    await t.init()
    const video = packets(t.dir, files).filter((p) => p.stream === 0)
    expect(video[0]).toMatchObject({ pts: 7, key: true })
    // Matroska keeps milliseconds, so 9 s is 8.999
    expect(video.filter((p) => p.key).map((p) => Math.round(p.pts))).toEqual([7, 9, 11])
    expect(video.at(-1)?.pts).toBeCloseTo(13 - 1 / 24, 3)

    // the end: far past what the paused run made, so a run starts there
    const last = segments.length - 1
    const tail = await t.segment(last)
    expect(packets(t.dir, tail).find((p) => p.stream === 0)).toMatchObject({ pts: 37, key: true })
    expect(decodeTimes(tail[0] as string)[0]).toBe(37 * VIDEO_TIMESCALE)

    // the same piece from a run started elsewhere starts at the same time, from the same header
    const before = decodeTimes(join(t.dir, '5.m4s'))
    const other = transcodes.open('copy-again', source({ start: 8 }))
    const again = await other.segment(1)
    expect(other.state()?.first).toBe(4)
    expect(decodeTimes(again[1] as string)).toEqual(before)
    await other.init()
    expect(readFileSync(join(other.dir, 'header.mp4'))).toEqual(
      readFileSync(join(t.dir, 'header.mp4')),
    )
    await transcodes.end('copy-again')
    expect(existsSync(other.dir)).toBe(false)
  })

  test('the init, asked for as a seek restarts the run, comes from the new run', async () => {
    const t = transcodes.open('init-restart', source({}))
    t.prepare()
    const segments = await t.segments()
    const [header, tail] = await Promise.all([t.init(), t.segment(segments.length - 1)])
    expect(timescales(header)).toHaveLength(2)
    expect(decodeTimes(tail[0] as string)[0]).toBe(37 * VIDEO_TIMESCALE)
    await transcodes.end('init-restart')
  })

  test('a run far enough ahead of the player is paused, and goes on when asked', async () => {
    const t = transcodes.open(
      'ahead',
      source({
        decision: decision({
          action: 'transcode',
          codec: 'h264',
          height: 180,
          bitrate: 500_000,
          toSdr: false,
        }),
      }),
    )
    await t.segment(0)
    const paused = Date.now()
    while (!t.state()?.paused && Date.now() - paused < 10_000) await Bun.sleep(50)
    const state = t.state()
    expect(state?.paused).toBe(true)
    // 8 s ahead of the first segment's end: no more than three segments made
    expect(state?.next).toBeLessThanOrEqual(4)
    const files = await t.segment(4)
    expect(files).toHaveLength(1)
    await transcodes.end('ahead')
  })

  test('a transcode starts each 6 s segment with a keyframe, from wherever it starts', async () => {
    const t = transcodes.open(
      'transcode',
      source({
        start: 18,
        decision: decision({
          action: 'transcode',
          codec: 'h264',
          height: 180,
          bitrate: 500_000,
          toSdr: false,
        }),
      }),
    )
    t.prepare()
    const segments = await t.segments()
    expect(segments).toHaveLength(7)
    while (!t.state()) await Bun.sleep(20)
    expect(t.state()?.first).toBe(3)
    const [file] = await t.segment(4)
    await t.init()
    const video = packets(t.dir, [file as string]).filter((p) => p.stream === 0)
    expect(video[0]?.key).toBe(true)
    expect(video[0]?.pts).toBeGreaterThanOrEqual(24)
    expect(video[0]?.pts).toBeLessThan(24.2)
    expect(video.filter((p) => p.key)).toHaveLength(1)
    expect(t.state()?.first).toBe(3)
    await transcodes.end('transcode')
  })

  test('a transcode’s copied sound starts with its picture, on the film’s timeline', async () => {
    const t = transcodes.open(
      'copied-sound',
      source({
        start: 12,
        decision: {
          ...decision({
            action: 'transcode',
            codec: 'h264',
            height: 180,
            bitrate: 500_000,
            toSdr: false,
          }),
          audio: { index: 1, action: 'copy' },
        },
      }),
    )
    const [file] = await t.segment(2)
    const [video, audio] = decodeTimes(file as string)
    const [videoScale, audioScale] = timescales(await t.init())
    expect((video as number) / (videoScale as number)).toBeCloseTo(12, 1)
    expect((audio as number) / (audioScale as number)).toBeCloseTo(12, 1)
    await transcodes.end('copied-sound')
  })

  test('an embedded text track as WebVTT, converted once', async () => {
    const t = transcodes.open('subs', source({}))
    const [a, b] = await Promise.all([t.subtitle('f:2', clip, 2), t.subtitle('f:2', clip, 2)])
    expect(a).toBe(b as string)
    const vtt = readFileSync(a, 'utf8')
    expect(vtt.startsWith('WEBVTT')).toBe(true)
    expect(vtt).toContain('00:01.000 --> 00:03.000\nHello.')
    expect(vtt).toContain('00:30.000 --> 00:32.000\nLater.')
    await transcodes.end('subs')
  })

  test('a run that fails keeps ffmpeg’s last lines for the log', async () => {
    const t = transcodes.open(
      'broken',
      source({ input: join(dir, 'missing.mkv'), keyframes: async () => [0, 2, 4] }),
    )
    const error = await t.segment(0).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TranscodeError)
    expect((error as TranscodeError).log.join('\n')).toContain('missing.mkv')
    expect(t.failure()).not.toBeNull()
    expect(logged.some((l) => l.includes('ffmpeg failed') && l.includes('missing.mkv'))).toBe(true)
    await transcodes.end('broken')
  })

  test('trickplay: a sheet of previews every 10 s, moved into place when whole', async () => {
    const out = join(dir, 'trickplay', 'f1')
    const sheets = await makeTrickplay({ ffmpeg, input: clip, index: 0, dir: out })
    expect(sheets).toBe(1)
    expect(existsSync(`${out}.part`)).toBe(false)
    const size = execFileSync(ffprobe, [
      ...['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0'],
      join(out, '0.jpg'),
    ])
      .toString()
      .trim()
    expect(size).toBe('3200,1800')
  })
})

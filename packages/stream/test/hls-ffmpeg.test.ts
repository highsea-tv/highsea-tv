// SPDX-License-Identifier: AGPL-3.0-only
// HLS and trickplay with real ffmpeg (checkpoint 4.1b), on a clip made here with lavfi's sources
// (ADR 0040), skipped and said so without ffmpeg, as ADR 0044's tests are: segments made on
// demand from a keyframe, on the film's own timeline whichever run made them, a run paused when
// it's far enough ahead, a transcode's keyframes every 6 s, WebVTT from an embedded track and in
// segments from the runs' own reads, a failure's log, and trickplay's sheets.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { execFileSync, spawn as nodeSpawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hasFfmpeg, TOOL_LIMIT } from '@highsea-tv/media/testing'
import type { PlaybackDecision } from '../src/decision/index.ts'
import { type Accel, clipArgs, parseList, probeArgs } from '../src/hardware/index.ts'
import {
  createTranscodes,
  downmixFilter,
  type Hardware,
  type HlsSource,
  type Limits,
  readKeyframes,
  type Spawn,
  type Transcode,
  TranscodeError,
  type Transcodes,
  type TranscodesOptions,
} from '../src/hls/index.ts'
import { pgsBox } from '../src/testing/index.ts'
import { makeTrickplay } from '../src/trickplay/index.ts'

/**
 * Sets of transcodes a test opens, closed after it whether it passes or not: a test that fails
 * before its own `close()` would leave its runs, paused ones among them, going.
 */
const opened: { close(): Promise<void> }[] = []
const closedAfter = <T extends { close(): Promise<void> }>(set: T) => {
  opened.push(set)
  return set
}
afterEach(async () => {
  await Promise.all(opened.splice(0).map((s) => s.close()))
})

const ffmpeg = process.env.HIGHSEA_FFMPEG || 'ffmpeg'
const ffprobe = process.env.HIGHSEA_FFPROBE || 'ffprobe'
/** ffmpeg or ffprobe run here, under the tests' time limit (TOOL_LIMIT in @highsea-tv/media/testing). */
const run = (bin: string, args: string[]) => execFileSync(bin, args, TOOL_LIMIT)

/** Each packet's stream, time and whether it's a keyframe, of a segment read with its header. */
function packets(dir: string, files: string[]) {
  const joined = join(dir, `joined-${Math.random().toString(36).slice(2)}.mp4`)
  writeFileSync(
    joined,
    Buffer.concat([join(dir, 'header.mp4'), ...files].map((f) => readFileSync(f))),
  )
  return run(ffprobe, [
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
      [
        '1\n00:00:01,000 --> 00:00:03,000\nHello.',
        // across the segment boundary at 13 s, and showing at the keyframe at 19 s
        '2\n00:00:12,500 --> 00:00:14,500\nAcross.',
        '3\n00:00:18,500 --> 00:00:22,000\nAlready.',
        '4\n00:00:30,000 --> 00:00:32,000\nLater.\n',
      ].join('\n\n'),
    )
    // 24 fps with a keyframe every 2 s, and one forced at 5 s, which x264 counts on from
    run(ffmpeg, [
      ...[
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `testsrc2=size=320x180:rate=24:duration=${DURATION}`,
      ],
      // the sound 24 ms late: AAC's 1,024 priming samples start it 23 ms before the picture,
      // which would move the film's start and every time below (ffmpeg 6.1 to 9.0 all do)
      ...[
        '-itsoffset',
        '0.024',
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=440:duration=${DURATION}`,
        '-i',
        srt,
      ],
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
    // short where the session starts (2 s or the next keyframe after it), 6 s from 12 s on
    expect(segments.slice(0, 7)).toEqual([
      { start: 0, duration: 2, first: 0, last: 1 },
      { start: 2, duration: 2, first: 1, last: 2 },
      { start: 4, duration: 3, first: 2, last: 4 },
      { start: 7, duration: 2, first: 4, last: 5 },
      { start: 9, duration: 2, first: 5, last: 6 },
      { start: 11, duration: 2, first: 6, last: 7 },
      { start: 13, duration: 6, first: 7, last: 10 },
    ])
    const files = await t.segment(6)
    expect(files.map((f) => f.split('/').at(-1))).toEqual(['7.m4s', '8.m4s', '9.m4s'])
    await t.init()
    const video = packets(t.dir, files).filter((p) => p.stream === 0)
    expect(video[0]).toMatchObject({ pts: 13, key: true })
    // Matroska keeps milliseconds, so 15 s is 14.999
    expect(video.filter((p) => p.key).map((p) => Math.round(p.pts))).toEqual([13, 15, 17])
    expect(video.at(-1)?.pts).toBeCloseTo(19 - 1 / 24, 3)

    // the end: far past what the paused run made, so a run starts there
    const last = segments.length - 1
    const tail = await t.segment(last)
    expect(packets(t.dir, tail).find((p) => p.stream === 0)).toMatchObject({ pts: 37, key: true })
    // the picture's timescale is the muxer's choice, 16000 or 12288 for 24 fps by ffmpeg's version
    const [videoScale] = timescales(await t.init())
    expect(decodeTimes(tail[0] as string)[0]).toBe(37 * (videoScale as number))

    // the same piece from a run started elsewhere starts at the same time, from the same header
    // (both runs start at the keyframe at 7 s: the sound's first samples follow a run's start)
    await t.segment(3)
    await t.segment(4)
    const before = decodeTimes(join(t.dir, '5.m4s'))
    const other = transcodes.open('copy-again', source({ start: 8 }))
    // a resume at 8 s: a segment begins at the keyframe before it (7 s), short ones after
    expect((await other.segments()).slice(0, 3)).toEqual([
      { start: 0, duration: 7, first: 0, last: 4 },
      { start: 7, duration: 2, first: 4, last: 5 },
      { start: 9, duration: 2, first: 5, last: 6 },
    ])
    await other.segment(1)
    const again = await other.segment(2)
    expect(other.state()?.first).toBe(4)
    expect(again.map((f) => f.split('/').at(-1))).toEqual(['5.m4s'])
    expect(decodeTimes(again[0] as string)).toEqual(before)
    await other.init()
    expect(readFileSync(join(other.dir, 'header.mp4'))).toEqual(
      readFileSync(join(t.dir, 'header.mp4')),
    )
    await transcodes.end('copy-again')
    expect(existsSync(other.dir)).toBe(false)
  })

  test('a resumed Matroska film with open GOPs starts its first run at its own keyframe, with no frame before it (HT-56)', async () => {
    // B-frames and open GOPs, as a Blu-ray's picture has. ffmpeg's demuxer seeks a Matroska file
    // early for B-frames (fftools/ffmpeg_demux.c, `dts_heuristic`), so a run asked for a
    // millisecond past a keyframe started at the one before; and an open GOP's keyframe is an
    // I-frame whose leading B-frames show before it and refer to the GOP before, which Chrome
    // can't decode at a run's start
    const film = join(dir, 'open-gop.mkv')
    run(ffmpeg, [
      ...['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=320x180:rate=24:duration=20`],
      ...['-c:v', 'libx264', '-preset', 'veryfast', '-bf', '3', '-pix_fmt', 'yuv420p'],
      ...['-x264-params', 'open-gop=1', '-g', '48', '-keyint_min', '48', '-sc_threshold', '0'],
      film,
    ])
    const t = transcodes.open(
      'open-gop',
      source({
        input: film,
        duration: 20,
        decision: { ...decision({ action: 'copy' }), audio: null },
        start: 9,
        keyframes: () => readKeyframes(ffprobe, film, 0),
      }),
    )
    const segments = await t.segments()
    const at = segments.findIndex((s) => s.start === 8)
    const files = await t.segment(at)
    await t.init()
    const video = packets(t.dir, files).filter((p) => p.stream === 0)
    expect(video[0]?.key).toBe(true)
    expect(video[0]?.pts).toBeCloseTo(8, 2)
    expect(Math.min(...video.map((p) => p.pts))).toBeCloseTo(8, 2)
    await transcodes.end('open-gop')
  })

  test('a piece past a run’s first keeps its keyframe’s own time, after its leading frames (HT-59)', async () => {
    // ffmpeg's HLS muxer fragments in DASH mode, which moved each fragment's first sample to where
    // the last one ended unless `skip_sidx` is set: an open GOP's keyframe showed three frames
    // early, before the leading frames that come before it
    const film = join(dir, 'open-gop-later.mkv')
    run(ffmpeg, [
      ...['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=320x180:rate=24:duration=12`],
      ...['-c:v', 'libx264', '-preset', 'veryfast', '-bf', '3', '-pix_fmt', 'yuv420p'],
      ...['-x264-params', 'open-gop=1', '-g', '48', '-keyint_min', '48', '-sc_threshold', '0'],
      film,
    ])
    const t = transcodes.open(
      'open-gop-later',
      source({
        input: film,
        duration: 12,
        decision: { ...decision({ action: 'copy' }), audio: null },
        start: 0,
        keyframes: () => readKeyframes(ffprobe, film, 0),
      }),
    )
    const segments = await t.segments()
    await t.segment(0)
    const at = segments.findIndex((s) => s.start >= 4)
    const files = await t.segment(at)
    await t.init()
    const video = packets(t.dir, files).filter((p) => p.stream === 0)
    const start = segments[at]?.start ?? 0
    // the keyframe, then its three leading frames in decode order, each shown before it, as in
    // the film (a run from the film's start shifts every time by its B-frame delay, a frame or two)
    const [key, ...leading] = video.slice(0, 4)
    expect(key?.key).toBe(true)
    expect(Math.abs((key?.pts ?? 0) - start)).toBeLessThan(0.1)
    for (const l of leading) expect(l.pts).toBeLessThan(key?.pts ?? 0)
    await transcodes.end('open-gop-later')
  })

  test('the init, asked for as a seek restarts the run, comes from the new run', async () => {
    const t = transcodes.open('init-restart', source({}))
    t.prepare()
    const segments = await t.segments()
    const [header, tail] = await Promise.all([t.init(), t.segment(segments.length - 1)])
    const scales = timescales(header)
    expect(scales).toHaveLength(2)
    expect(decodeTimes(tail[0] as string)[0]).toBe(37 * (scales[0] as number))
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

  test('the film’s own text track in segments, from the run’s read, a cue across a boundary in both', async () => {
    const t = transcodes.open('subs-cut', source({ subtitles: [2] }))
    const segments = await t.segments()
    // played from the start, as a player asks: 11–13 s, then 13–19 s
    for (let i = 0; i <= 6; i++) await t.segment(i)
    expect(segments[5]).toMatchObject({ start: 11, duration: 2 })
    expect(segments[6]).toMatchObject({ start: 13, duration: 6 })
    const [first, fifth, sixth] = await Promise.all([
      t.subtitleSegment(2, 0),
      t.subtitleSegment(2, 5),
      t.subtitleSegment(2, 6),
    ])
    expect(first).toBe(
      'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0\n\n00:01.000 --> 00:03.000\nHello.\n',
    )
    expect(fifth).toContain('\n00:12.500 --> 00:14.500\nAcross.\n')
    expect(sixth).toContain('\n00:12.500 --> 00:14.500\nAcross.\n')
    expect(sixth).toContain('\n00:18.500 --> 00:22.000\nAlready.\n')
    expect(fifth).not.toContain('Hello.')
    // one run read it all: nothing else read the film
    expect(t.state()?.first).toBe(0)
    await transcodes.end('subs-cut')
  })

  test('a resume’s subtitles: the cue showing where it starts is read from just before it', async () => {
    const t = transcodes.open('subs-resume', source({ start: 20, subtitles: [2] }))
    const segments = await t.segments()
    const at = segments.findIndex((s) => s.start <= 20 && 20 < s.start + s.duration)
    expect(segments[at]).toMatchObject({ start: 19, first: 10 })
    await t.segment(at)
    const text = await t.subtitleSegment(2, at)
    expect(text).toContain('\n00:18.500 --> 00:22.000\nAlready.\n')
    expect(text).not.toContain('Across.')
    // the run itself never sees it: Matroska's seek drops what began before the keyframe
    // (libavformat/matroskadec.c), which is why the few seconds before are read on their own
    const own = readFileSync(join(t.dir, 'subs', 'run-1-2.vtt'), 'utf8')
    expect(own).not.toContain('Already.')
    expect(readFileSync(join(t.dir, 'subs', 'lead-1-2.vtt'), 'utf8')).toContain('Already.')
    // a segment far past what's been read waits, and the session's end answers it
    const far = t.subtitleSegment(2, segments.length - 1).catch((e: Error) => e)
    await transcodes.end('subs-resume')
    expect(await far).toBeInstanceOf(TranscodeError)
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

  const transcode = decision({
    action: 'transcode',
    codec: 'h264',
    height: 180,
    bitrate: 500_000,
    toSdr: false,
  })
  /**
   * A transcode's picture is drawn at five times real time, so a run still holds its slot while a
   * test looks: at full speed the clip is done at once. `realtime=speed=5` ends the picture's
   * filters (https://ffmpeg.org/ffmpeg-filters.html#realtime_002c-arealtime) and sleeps by the
   * frames' own times, alike in every ffmpeg from 6.1 on. A copy has no filters and holds no slot,
   * so it runs at full speed.
   *
   * Not `-readrate 5`: since ffmpeg 8.0 a reader that falls 0.3 s behind (as it does while x264
   * starts) slows to `-readrate_catchup` until it catches up, but sleeps the film's time rather
   * than the clock's, so at 5 it never catches up and reads at about real time
   * (fftools/ffmpeg_demux.c, `readrate_sleep`): 9.0 took 40 s to copy this clip, not 8.
   */
  const slowed: Spawn = (command, args) => {
    const at = args.indexOf('-vf') + 1
    const slow = at ? args.with(at, `${args[at]},realtime=speed=5`) : args
    return nodeSpawn(command, slow, { stdio: ['ignore', 'ignore', 'pipe'] })
  }
  /** Another set of transcodes in the same cache, with Settings › Playback’s limits. */
  const limited = (limits: Partial<Limits>, o: Partial<TranscodesOptions> = {}) =>
    closedAfter(
      createTranscodes({
        root: join(dir, 'limited'),
        ffmpeg,
        ffprobe,
        spawn: slowed,
        logger: { info: () => {}, warn: () => {}, error: () => {} },
        aheadSeconds: 8,
        farSeconds: 6,
        limits: () => ({ maxTranscodes: 1, cacheBytes: null, preset: 'speed', ...limits }),
        ...o,
      }),
    )

  test('past the transcode limit a transcode waits for a slot; a direct stream doesn’t count', async () => {
    const set = limited({ maxTranscodes: 1 })
    const a = set.open('a', source({ decision: transcode }))
    await a.segment(0)
    expect(set.running()).toBe(1)
    // a direct stream plays beside it
    const copy = set.open('copy', source({}))
    expect((await copy.segment(0)).length).toBeGreaterThan(0)
    const b = set.open('b', source({ decision: transcode }))
    let made = false
    const waited = b.segment(0).then(() => {
      made = true
    })
    await Bun.sleep(300)
    expect(made).toBe(false)
    expect(b.waiting()).toBe(true)
    await set.end('a')
    await waited
    expect(made).toBe(true)
    expect(b.waiting()).toBe(false)
    await set.close()
  })

  test('a transcode that waits too long gives up with the limit as its reason', async () => {
    const set = limited({ maxTranscodes: 1 }, { waitMs: 200 })
    await set.open('a', source({ decision: transcode })).segment(0)
    const b = set.open('b', source({ decision: transcode }))
    const error = (await b.segment(0).catch((e: unknown) => e)) as TranscodeError
    expect(error).toBeInstanceOf(TranscodeError)
    expect(error.reason).toBe('limit')
    expect(b.failure()?.reason).toBe('limit')
    await set.close()
  })

  test('raising the limit lets a waiting transcode start', async () => {
    let max = 1
    const set = limited(
      {},
      {
        limits: () => ({ maxTranscodes: max, cacheBytes: null, preset: 'balanced' }),
      },
    )
    await set.open('a', source({ decision: transcode })).segment(0)
    const waited = set.open('b', source({ decision: transcode })).segment(0)
    await Bun.sleep(100)
    max = 2
    set.limitsChanged()
    expect(await waited).toHaveLength(1)
    expect(set.running()).toBe(2)
    await set.close()
  })

  test('past the cache’s limit, pieces furthest behind the player go, and are made again when asked', async () => {
    const set = limited(
      { maxTranscodes: 4, cacheBytes: 1 },
      { keepBehindSeconds: 7, spawn: undefined },
    )
    const t = set.open('cache', source({ decision: transcode }))
    for (const i of [0, 1, 2, 3]) await t.segment(i)
    const before = await t.size()
    expect(before).toBeGreaterThan(0)
    const removed = await set.enforce()
    // the player is at segment 3 (18 s): pieces 0 and 1 are more than 7 s behind it
    expect(removed).toBe(2)
    expect(existsSync(join(set.root(), 'cache', '0.m4s'))).toBe(false)
    expect(existsSync(join(set.root(), 'cache', '2.m4s'))).toBe(true)
    // seeking back makes it again
    const files = await t.segment(0)
    expect(existsSync(files[0] as string)).toBe(true)
    await set.close()
  })

  test('Clear removes what the runs have passed, and stops nothing', async () => {
    const set = limited({ maxTranscodes: 4 }, { spawn: undefined })
    const t = set.open('clear', source({ decision: transcode }))
    await t.segment(0)
    await t.segment(1)
    await set.empty()
    expect(existsSync(join(set.root(), 'clear', '0.m4s'))).toBe(false)
    expect(existsSync(join(set.root(), 'clear', 'header.mp4'))).toBe(true)
    expect(await t.segment(2)).toHaveLength(1)
    expect(await t.segment(0)).toHaveLength(1)
    await set.close()
  })

  test('a session that ends as its first piece comes leaves no folder behind (HT-72)', async () => {
    // the header's copy starts as the first piece arrives: an end then waits for it, and for the
    // run's ffmpeg to exit, before it removes the folder, so nothing lands in it after
    for (let k = 0; k < 5; k++) {
      const t = transcodes.open(`ends-${k}`, source({}))
      await t.segment(0)
      await transcodes.end(`ends-${k}`)
      expect(existsSync(t.dir)).toBe(false)
    }
  })

  test('a moved cache is used by streams that start after it', async () => {
    const set = limited({ maxTranscodes: 4 })
    const old = set.open('old', source({}))
    await old.segment(0)
    await set.moveTo(join(dir, 'moved'))
    const moved = set.open('new', source({}))
    await moved.segment(0)
    expect(old.dir.startsWith(join(dir, 'limited'))).toBe(true)
    expect(moved.dir.startsWith(join(dir, 'moved'))).toBe(true)
    await set.end('old')
    expect(existsSync(old.dir)).toBe(false)
    await set.close()
  })

  test('trickplay: a sheet of previews every 10 s, moved into place when whole', async () => {
    const out = join(dir, 'trickplay', 'f1')
    const sheets = await makeTrickplay({ ffmpeg, input: clip, index: 0, dir: out })
    expect(sheets).toBe(1)
    expect(existsSync(`${out}.part`)).toBe(false)
    const size = run(ffprobe, [
      ...['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0'],
      join(out, '0.jpg'),
    ])
      .toString()
      .trim()
    expect(size).toBe('3200,1800')
  })
})

const hasLibass =
  hasFfmpeg && / subtitles +V->V/.test(run(ffmpeg, ['-hide_banner', '-filters']).toString())
if (hasFfmpeg && !hasLibass)
  console.warn('This ffmpeg has no libass, so the tests that burn in ASS are skipped.')

/** The picture at `seconds` into the pieces, in grey, one byte a pixel. */
function frameAt(dir: string, files: string[], seconds: number) {
  const joined = join(dir, `frame-${Math.random().toString(36).slice(2)}.mp4`)
  writeFileSync(
    joined,
    Buffer.concat([join(dir, 'header.mp4'), ...files].map((f) => readFileSync(f))),
  )
  return run(ffmpeg, [
    ...['-v', 'error', '-ss', String(seconds), '-i', joined],
    ...['-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
  ])
}

/** The mean brightness of a rectangle of a grey frame `width` wide. */
function brightness(
  frame: Buffer,
  width: number,
  r: { x: number; y: number; w: number; h: number },
) {
  let sum = 0
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) sum += frame[y * width + x] ?? 0
  return sum / (r.w * r.h)
}

describe.skipIf(!hasFfmpeg)('subtitles burned in, and the downmix, with ffmpeg (4.3)', () => {
  let dir: string
  let clip: string
  let transcodes: Transcodes
  const W = 640
  const H = 360
  const BOX = { x: 220, y: 280, w: 200, h: 40 }
  const ass = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, BorderStyle, Outline, Shadow, Alignment, MarginV',
    'Style: Default,DejaVu Sans,60,&H00FFFFFF,1,0,0,2,20',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Text',
    'Dialogue: 0,0:00:00.50,0:00:04.00,Default,█████',
    '',
  ].join('\n')

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'highsea-burn-'))
    clip = join(dir, 'clip.mkv')
    const sup = join(dir, 'box.sup')
    writeFileSync(sup, pgsBox({ width: W, height: H, ...BOX, from: 0.5, to: 4 }))
    writeFileSync(join(dir, 'box.ass'), ass)
    // black, so anything bright is the subtitle; the PGS track is stream 1, the ASS stream 2
    run(ffmpeg, [
      ...[
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=black:size=${W}x${H}:rate=24:duration=8`,
      ],
      ...['-i', sup, '-i', join(dir, 'box.ass')],
      ...['-map', '0:v', '-map', '1:s', '-map', '2:s'],
      ...['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:s', 'copy', clip],
    ])
    transcodes = createTranscodes({
      root: join(dir, 'transcodes'),
      ffmpeg,
      ffprobe,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    })
  })
  afterAll(async () => {
    await transcodes.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const burning = (burnIn: HlsSource['burnIn']): HlsSource => ({
    input: clip,
    duration: 8,
    decision: {
      ...decision({
        action: 'transcode',
        codec: 'h264',
        height: H,
        bitrate: 2_000_000,
        toSdr: false,
      }),
      audio: null,
    },
    video: { index: 0, codec: 'h264', width: W, height: H },
    start: 0,
    keyframes: () => readKeyframes(ffprobe, clip, 0),
    burnIn,
  })

  test('a PGS track is laid over the picture while it shows, and gone after', async () => {
    const t = transcodes.open('pgs', burning({ kind: 'picture', index: 1 }))
    const files = await t.segment(0)
    await t.init()
    const shown = frameAt(t.dir, files, 1)
    expect(brightness(shown, W, BOX)).toBeGreaterThan(200)
    expect(brightness(shown, W, { x: 0, y: 0, w: W, h: 200 })).toBeLessThan(30)
    expect(brightness(frameAt(t.dir, files, 5), W, BOX)).toBeLessThan(30)
  })

  test.skipIf(!hasLibass)('ASS from the film is taken out once and drawn by libass', async () => {
    const t = transcodes.open('ass', burning({ kind: 'text', input: clip, index: 2 }))
    const files = await t.segment(0)
    await t.init()
    expect(existsSync(join(t.dir, 'burn.ass'))).toBe(true)
    const shown = frameAt(t.dir, files, 1)
    expect(brightness(shown, W, { x: 0, y: 260, w: W, h: 100 })).toBeGreaterThan(40)
    expect(brightness(shown, W, { x: 0, y: 0, w: W, h: 150 })).toBeLessThan(30)
    expect(brightness(frameAt(t.dir, files, 5), W, { x: 0, y: 260, w: W, h: 100 })).toBeLessThan(30)
  })

  test('the downmix’s levels on a tone in each channel, against RFC 7845’s matrices', () => {
    /** Each output channel's RMS level in dB, as `astats` measures it. */
    const rms = (filters: string) => {
      const r = Bun.spawnSync(
        [
          ffmpeg,
          ...['-hide_banner', '-nostdin', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=1'],
          ...['-af', `${filters},astats`, '-f', 'null', '-'],
        ],
        TOOL_LIMIT,
      )
      const text = r.stderr.toString()
      const channels = text.split(/Channel: \d+/).slice(1)
      return channels.map((c) => {
        const m = /RMS level dB: (-?[\d.]+|-inf)/.exec(c)
        return m?.[1] === '-inf' || !m ? Number.NEGATIVE_INFINITY : Number(m[1])
      })
    }
    const [tone] = rms('anull')
    const db = (coefficient: number) => (tone as number) + 20 * Math.log10(coefficient)
    const expectLevels = (got: number[], want: (number | null)[]) => {
      expect(got).toHaveLength(2)
      want.forEach((w, i) => {
        if (w === null) expect(got[i]).toBeLessThan(-90)
        else expect(got[i]).toBeCloseTo(db(w), 1)
      })
    }
    const five = downmixFilter(6, '5.1') as string
    expectLevels(rms(`pan=5.1|FC=c0,${five}`), [0.374107, 0.374107])
    expectLevels(rms(`pan=5.1|FL=c0,${five}`), [0.529067, null])
    expectLevels(rms(`pan=5.1|BR=c0,${five}`), [0.264534, 0.458186])
    expectLevels(rms(`pan=5.1|LFE=c0,${five}`), [0.374107, 0.374107])
    const side = downmixFilter(6, '5.1(side)') as string
    expectLevels(rms(`pan=5.1(side)|SL=c0,${side}`), [0.458186, 0.264534])
    const seven = downmixFilter(8, '7.1') as string
    expectLevels(rms(`pan=7.1|FC=c0,${seven}`), [0.274804, 0.274804])
    expectLevels(rms(`pan=7.1|SR=c0,${seven}`), [0.194316, 0.336565])
    expectLevels(rms(`pan=7.1|BL=c0,${seven}`), [0.336565, 0.194316])
    expectLevels(rms(`pan=7.1|FR=c0,${seven}`), [null, 0.388631])
  })
})

const filters = hasFfmpeg
  ? parseList(run(ffmpeg, ['-hide_banner', '-filters']).toString())
  : new Set<string>()
const hasZscale = filters.has('zscale') && filters.has('tonemap')
if (hasFfmpeg && !hasZscale)
  console.warn('This ffmpeg has no zscale, so the test of the processor’s tone mapping is skipped.')
/** VideoToolbox: on a Mac whose ffmpeg has it, as highsea runs outside Docker (4.3's answer 4). */
const hasVideoToolbox =
  hasFfmpeg &&
  process.platform === 'darwin' &&
  filters.has('scale_vt') &&
  Bun.spawnSync([ffmpeg, ...probeArgs('videotoolbox', null)], TOOL_LIMIT).exitCode === 0
if (hasFfmpeg && !hasVideoToolbox)
  console.warn('No VideoToolbox here, so the tests that transcode on it are skipped.')

describe.skipIf(!hasFfmpeg)('hardware and tone mapping, with ffmpeg (4.3b)', () => {
  let dir: string
  let hdr: string
  const W = 640
  const H = 360
  const BOX = { x: 220, y: 280, w: 200, h: 40 }
  const failures: string[] = []

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'highsea-hw-'))
    hdr = join(dir, 'hdr.mkv')
    const sup = join(dir, 'box.sup')
    writeFileSync(sup, pgsBox({ width: W, height: H, ...BOX, from: 0.5, to: 4 }))
    // HDR10 as the check's clip is, small, with a PGS track as stream 1
    const made = join(dir, 'hdr-video.mkv')
    run(ffmpeg, clipArgs(made, { width: W, height: H, fps: 24, seconds: 14 }))
    run(ffmpeg, [
      ...['-v', 'error', '-y', '-i', made, '-i', sup, '-map', '0:v', '-map', '1:s'],
      ...['-c', 'copy', hdr],
    ])
  })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  const make = (hardware: () => Hardware) =>
    closedAfter(
      createTranscodes({
        root: join(dir, 'transcodes'),
        ffmpeg,
        ffprobe,
        logger: { info: () => {}, warn: () => {}, error: () => {} },
        hardware,
        onHardwareFailure: (path) => failures.push(path),
      }),
    )

  const source = (burnIn: HlsSource['burnIn'] = null): HlsSource => ({
    input: hdr,
    duration: 14,
    decision: {
      ...decision({
        action: 'transcode',
        codec: 'h264',
        height: H,
        bitrate: 2_000_000,
        toSdr: true,
      }),
      audio: null,
    },
    video: { index: 0, codec: 'hevc', width: W, height: H, hdr: 'hdr10', bitDepth: 10 },
    start: 0,
    keyframes: () => readKeyframes(ffprobe, hdr, 0),
    burnIn,
  })

  /** The colour properties of the picture in a session's pieces. */
  const colours = (t: Transcode, files: string[]) => {
    const joined = join(t.dir, 'joined.mp4')
    writeFileSync(
      joined,
      Buffer.concat([join(t.dir, 'header.mp4'), ...files].map((f) => readFileSync(f))),
    )
    return run(ffprobe, [
      ...['-v', 'error', '-select_streams', 'v', '-show_entries'],
      ...['stream=pix_fmt,color_transfer,color_primaries', '-of', 'csv=p=0', joined],
    ])
      .toString()
      .trim()
      .replace(/,+$/, '')
  }

  test.skipIf(!hasZscale)('the processor tone maps HDR10 to SDR with zscale', async () => {
    const set = make(() => ({ accel: null, toneMapping: true, cpuToneMap: true }))
    const t = set.open('cpu', source())
    const files = await t.segment(0)
    await t.init()
    expect(colours(t, files)).toBe('yuv420p,bt709,bt709')
    expect(t.hardware()).toBeNull()
    await set.close()
  })

  test('a run on a GPU that fails goes on on the processor at the same piece', async () => {
    failures.length = 0
    // no CUDA device here: the run fails at once
    const nvenc: Accel = {
      path: 'nvenc',
      vendor: 'nvidia',
      device: null,
      lowPower: false,
      toneMap: false,
    }
    const set = make(() => ({ accel: nvenc, toneMapping: false, cpuToneMap: false }))
    const t = set.open('fallback', source())
    const files = await t.segment(0)
    expect(files).toHaveLength(1)
    expect(failures).toEqual(['nvenc'])
    expect(t.fellBack()).toBe(true)
    expect(t.hardware()).toBeNull()
    // and stays there for the session
    expect(await t.segment(2)).toHaveLength(1)
    expect(failures).toEqual(['nvenc'])
    await set.close()
  })

  describe.skipIf(!hasVideoToolbox)('on VideoToolbox', () => {
    const vt: Accel = {
      path: 'videotoolbox',
      vendor: 'apple',
      device: null,
      lowPower: false,
      toneMap: true,
    }
    const onVt = () => make(() => ({ accel: vt, toneMapping: true, cpuToneMap: false }))

    test('tone maps on the GPU, with a keyframe every 6 s and none between', async () => {
      const set = onVt()
      const t = set.open('vt', source())
      const files = [...(await t.segment(0)), ...(await t.segment(1))]
      await t.init()
      expect(t.hardware()).toBe('videotoolbox')
      expect(colours(t, files)).toBe('yuv420p,bt709,bt709')
      const keys = packets(t.dir, files)
        .filter((p) => p.key)
        .map((p) => Math.round(p.pts))
      expect(keys).toEqual([0, 6])
      expect(failures).not.toContain('videotoolbox')
      await set.close()
    })

    test('lays a PGS track over the picture after it comes down from the GPU', async () => {
      const set = onVt()
      const t = set.open('vt-pgs', source({ kind: 'picture', index: 1 }))
      const files = await t.segment(0)
      await t.init()
      expect(t.fellBack()).toBe(false)
      const shown = frameAt(t.dir, files, 1)
      expect(brightness(shown, W, BOX)).toBeGreaterThan(200)
      expect(brightness(frameAt(t.dir, files, 5), W, BOX)).toBeLessThan(200)
      await set.close()
    })
  })
})

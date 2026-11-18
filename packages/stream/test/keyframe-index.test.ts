// SPDX-License-Identifier: AGPL-3.0-only
// A film's keyframes from its index (HT-48): Matroska's Cues and MP4's sync sample table read in
// a few kilobytes, the same keyframes ffprobe lists from every packet, and the full read when the
// index is missing, can't be used or disagrees with the packets. On films made here with lavfi's
// sources (ADR 0040), skipped and said so without ffmpeg.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hasFfmpeg, TOOL_LIMIT } from '@highsea-tv/media/testing'
import {
  agrees,
  fileReader,
  keyframeArgs,
  matroskaKeyframes,
  mp4Keyframes,
  NoIndex,
  parseKeyframes,
  readKeyframesFrom,
  windows,
} from '../src/hls/index.ts'

const ffmpeg = process.env.HIGHSEA_FFMPEG || 'ffmpeg'
const ffprobe = process.env.HIGHSEA_FFPROBE || 'ffprobe'
const run = (bin: string, args: string[]) => execFileSync(bin, args, TOOL_LIMIT)

describe('checking an index against the packets', () => {
  const keys = [0, 2, 4, 5.5, 7.5, 9.5, 11.5]

  test('three windows: the start through the second keyframe, a gap in the middle, the end', () => {
    expect(windows(keys)).toEqual([
      { interval: '%2.001000', edge: 'start' },
      { interval: '5.499500%7.501000', edge: 'middle' },
      { interval: '11.499500%', edge: 'end' },
    ])
    expect(windows([0, 2, 4])).toBeNull()
  })

  test('the same keyframes over the stretch read agree', () => {
    expect(agrees(keys, { keys: [0, 2], last: 2.3 }, 'start')).toBe(true)
    // a seek that lands a keyframe early still compares like with like
    expect(agrees(keys, { keys: [5.5, 7.5, 9.5], last: 9.6 }, 'middle')).toBe(true)
    expect(agrees(keys, { keys: [11.5], last: 13.9 }, 'end')).toBe(true)
  })

  test('a keyframe the index lacks, or one it has that the packets don’t, disagrees', () => {
    // sparse: the packets have a keyframe between two of the index's
    expect(agrees(keys, { keys: [7.5, 8.5, 9.5], last: 9.6 }, 'middle')).toBe(false)
    // something before the index's first keyframe
    expect(agrees([2, 4, 6, 8], { keys: [0, 2], last: 2.1 }, 'start')).toBe(false)
    // an index that stops short of the film's end
    expect(agrees(keys, { keys: [11.5, 13.5], last: 14 }, 'end')).toBe(false)
    // an index entry with no keyframe there
    expect(agrees([0, 1, 2, 4, 6, 8], { keys: [0, 2], last: 2.1 }, 'start')).toBe(false)
    // too little read to tell
    expect(agrees(keys, { keys: [7.5], last: 8 }, 'middle')).toBe(false)
    expect(agrees(keys, { keys: [], last: 8 }, 'middle')).toBe(false)
  })
})

describe.skipIf(!hasFfmpeg)('keyframes from the index, with ffmpeg', () => {
  let dir: string
  /** 30 s of 24000/1001 H.264 with B-frames, a keyframe every 2 s and some forced between. */
  let mkv: string
  let mp4: string
  let full: number[]

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'highsea-keyframe-index-'))
    mkv = join(dir, 'film.mkv')
    mp4 = join(dir, 'film.mp4')
    run(ffmpeg, [
      ...['-v', 'error', '-y', '-nostdin'],
      ...['-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=24000/1001'],
      ...['-f', 'lavfi', '-i', 'sine=f=440', '-t', '30'],
      ...['-c:v', 'libx264', '-preset', 'ultrafast', '-g', '48', '-bf', '2'],
      ...['-force_key_frames', '1.3,5.7,13.3,13.9', '-c:a', 'aac', mkv],
    ])
    run(ffmpeg, ['-v', 'error', '-y', '-nostdin', '-i', mkv, '-c', 'copy', mp4])
    full = parseKeyframes(run(ffprobe, keyframeArgs(mkv, 0)).toString())
  }, 60_000)
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  test('Matroska: the Cues give every keyframe the packets do, from a few kilobytes', async () => {
    expect(full.length).toBeGreaterThan(15)
    expect(full).toContain(1.335)
    const reader = await fileReader(mkv)
    const keys = await matroskaKeyframes(reader, 0)
    await reader.close()
    expect(keys).toEqual(full)
    expect(reader.bytes).toBeLessThan(16 * 1024)
    expect(await readKeyframesFrom(ffprobe, mkv, 0)).toEqual({ times: full, from: 'index' })
  })

  test('MP4: the sync sample table and the edit list give the same', async () => {
    expect(parseKeyframes(run(ffprobe, keyframeArgs(mp4, 0)).toString())).toEqual(full)
    const reader = await fileReader(mp4)
    const keys = await mp4Keyframes(reader, 1, 0)
    await reader.close()
    expect(keys).toEqual(full)
    expect(reader.bytes).toBeLessThan(statSync(mp4).size / 4)
    expect(await readKeyframesFrom(ffprobe, mp4, 0)).toEqual({ times: full, from: 'index' })
  })

  test('Matroska written as a stream, with no Cues: every packet is read instead', async () => {
    const live = join(dir, 'live.mkv')
    const args = ['-v', 'error', '-nostdin', '-i', mkv, '-c', 'copy', '-f', 'matroska', 'pipe:1']
    writeFileSync(live, execFileSync(ffmpeg, args, { ...TOOL_LIMIT, maxBuffer: 64 * 1024 * 1024 }))
    const reader = await fileReader(live)
    await expect(matroskaKeyframes(reader, 0)).rejects.toThrow(NoIndex)
    await reader.close()
    const read = await readKeyframesFrom(ffprobe, live, 0)
    expect(read.from).toBe('packets')
    expect(read.times).toEqual(full)
  })

  test('Cues for every other keyframe: the check finds the gap and every packet is read', async () => {
    // the Cues are written last; each CuePoint's CueTrack for track 1 is F7 81 01, and every
    // other one is pointed at a track the file doesn't have
    const data = readFileSync(mkv)
    const cues = data.lastIndexOf(Buffer.from([0x1c, 0x53, 0xbb, 0x6b]))
    let n = 0
    for (let i = cues; i < data.length - 2; i++)
      if (data[i] === 0xf7 && data[i + 1] === 0x81 && data[i + 2] === 0x01 && n++ % 2)
        data[i + 2] = 0x09
    const sparse = join(dir, 'sparse.mkv')
    writeFileSync(sparse, data)
    const reader = await fileReader(sparse)
    expect((await matroskaKeyframes(reader, 0)).length).toBeLessThan(full.length)
    await reader.close()
    const read = await readKeyframesFrom(ffprobe, sparse, 0)
    expect(read.from).toBe('packets')
    expect(read.why).toContain('disagrees')
    expect(read.times).toEqual(full)
  })

  test('a fragmented MP4 and an MPEG-TS, with no index read here: every packet is read', async () => {
    const fragmented = join(dir, 'fragmented.mp4')
    run(ffmpeg, [
      ...['-v', 'error', '-y', '-nostdin', '-i', mkv, '-c', 'copy'],
      ...['-movflags', 'frag_keyframe+empty_moov', fragmented],
    ])
    const ts = join(dir, 'film.ts')
    run(ffmpeg, ['-v', 'error', '-y', '-nostdin', '-i', mkv, '-c', 'copy', ts])
    for (const file of [fragmented, ts]) {
      const read = await readKeyframesFrom(ffprobe, file, 0)
      expect(read.from).toBe('packets')
      expect(read.times).toEqual(parseKeyframes(run(ffprobe, keyframeArgs(file, 0)).toString()))
    }
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
// Each track's loudness (HT-117): ReplayGain and R128 tags trusted where a file has them; ffmpeg's
// `ebur128` measuring the rest, checked against tones made here by ffmpeg at known levels; the
// album's level once every track has one; one job per album that carries on where it stopped; and
// the levels in a play's answer and the envelope in the queue. The real-file tests skip without
// ffmpeg, and say so.
//
// The known level: EBU Tech 3341's first test signal, a stereo 1 kHz sine at -23 dBFS in both
// channels, reads -23.0 ±0.1 LUFS (https://tech.ebu.ch/docs/tech/tech3341.pdf, Table 1). Here the
// tolerance is ±0.2 LU, for the files' encoding; the true peak of such a sine is its amplitude.
import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { silentLogger } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import {
  albumLevel,
  createMusicPlayback,
  envelopeOf,
  ffmpegLoudnessMeter,
  type LoudnessMeter,
  MUSIC_LOUDNESS_JOB,
  parseEbur128,
} from '../../src/music/index.ts'
import { createTagReader, tagLoudness } from '../../src/music/tags.ts'
import { hasFfmpeg, runTool } from '../clips.ts'
import { cleanup, parklife, person, setup } from './fixture.ts'

afterEach(cleanup)
const dir = mkdtempSync(join(tmpdir(), 'highsea-music-loudness-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** A stereo 1 kHz sine at `dbfs` peak in both channels, `seconds` long, tagged as given. */
async function tone(name: string, dbfs: number, seconds = 4, tags: Record<string, string> = {}) {
  const a = 10 ** (dbfs / 20)
  const path = join(dir, name)
  const sine = `${a}*sin(2*PI*1000*t)`
  await runTool('ffmpeg', [
    // biome-ignore format: ffmpeg's options read best in their pairs
    '-nostdin',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `aevalsrc=${sine}|${sine}:s=48000:d=${seconds}`,
    ...Object.entries(tags).flatMap(([k, v]) => ['-metadata', `${k}=${v}`]),
    '-y',
    path,
  ])
  return path
}

describe('the rules', () => {
  test('ebur128’s log: the frames’ momentary loudness, the summary’s I and true peak', () => {
    const lines = [
      '[Parsed_ebur128_0 @ 0x1] t: 0.0999773  TARGET:-23 LUFS    M:-120.7 S:-120.7     I: -70.0 LUFS       LRA:   0.0 LU',
      '[Parsed_ebur128_0 @ 0x1] t: 0.399977   TARGET:-23 LUFS    M: -23.0 S:-120.7     I: -23.0 LUFS       LRA:   0.0 LU',
      '[Parsed_ebur128_0 @ 0x1] Summary:',
      '',
      '  Integrated loudness:',
      '    I:         -23.0 LUFS',
      '    Threshold: -33.0 LUFS',
      '  True peak:',
      '    Peak:      -22.9 dBFS',
    ]
    expect(parseEbur128(lines)).toEqual({ lufs: -23, peak: -22.9, momentary: [-120.7, -23] })
    expect(() => parseEbur128(['nothing'])).toThrow()
  })

  test('ReplayGain 2.0 is to -18 LUFS; R128’s Q7.8 gain to -23 LUFS, with no peak to lift by', () => {
    const tags: Record<string, string> = {
      replaygaintrackgain: '-6.50 dB',
      replaygaintrackpeak: '0.501187',
      replaygainalbumgain: '-5.00 dB',
      replaygainalbumpeak: '1.0',
    }
    const rg = tagLoudness((n) => tags[n] ?? null)
    expect(rg.track?.lufs).toBeCloseTo(-11.5, 5)
    expect(rg.track?.peak).toBeCloseTo(-6, 2)
    expect(rg.album).toEqual({ lufs: -13, peak: 0 })
    const opus = tagLoudness((n) => (n === 'r128trackgain' ? '-1280' : null))
    expect(opus).toEqual({ track: { lufs: -18, peak: 0 }, album: null })
    expect(tagLoudness(() => null)).toEqual({ track: null, album: null })
    expect(tagLoudness((n) => (n === 'replaygaintrackgain' ? 'loud' : null)).track).toBeNull()
  })

  test('the envelope: even steps of energy, -50 LUFS the floor and -5 the top', () => {
    const quietThenLoud = [...Array(50).fill(-60), ...Array(50).fill(-5)]
    const e = envelopeOf(quietThenLoud, 4)
    expect(e).toEqual([0, 0, 1, 1])
    expect(envelopeOf([], 4)).toEqual([])
    expect(envelopeOf([-27.5], 2)).toEqual([0.5, 0.5])
  })

  test('an album’s level: the tracks’ energy over their lengths, and the highest peak', () => {
    expect(
      albumLevel([
        { lufs: -10, peak: -1, duration: 100 },
        { lufs: -10, peak: -3, duration: 300 },
      ]),
    ).toEqual({ lufs: -10, peak: -1 })
    // a quiet short track barely moves a long loud one
    const a = albumLevel([
      { lufs: -8, peak: 0, duration: 600 },
      { lufs: -30, peak: -20, duration: 60 },
    ])
    expect(a?.lufs).toBeCloseTo(-8.41, 1)
    expect(albumLevel([])).toBeNull()
  })
})

describe('the job', () => {
  /** A meter that reads the file's tags' `level` and counts its calls. */
  function fakeMeter(levels: Record<string, number>) {
    const calls: string[] = []
    const meter: LoudnessMeter = async (path) => {
      calls.push(path)
      const name = Object.keys(levels).find((k) => path.endsWith(k)) as string
      const lufs = levels[name] as number
      return { lufs, peak: lufs + 10, momentary: Array(40).fill(lufs) }
    }
    return { meter, calls }
  }

  test('tags first, measured otherwise; the album’s level once all are read; once only', async () => {
    const { meter, calls } = fakeMeter({ '02.flac': -14, '03.flac': -8 })
    const t = await setup({ measureLoudness: meter })
    t.put(
      'Blur/Parklife (1994)/01.flac',
      parklife(1, 'Girls & Boys', {
        loudness: { track: { lufs: -9, peak: -0.5 }, album: null },
      }),
    )
    t.put('Blur/Parklife (1994)/02.flac', parklife(2, 'Tracy Jacks'))
    t.put('Blur/Parklife (1994)/03.flac', parklife(3, 'End of a Century'))
    await t.music.libraryScan.scan()
    const queued = t.jobs.list({ status: ['queued'] }).filter((j) => j.type === MUSIC_LOUDNESS_JOB)
    expect(queued).toHaveLength(1)
    expect(queued[0]?.subject).toBe(`album:${t.rows().albums[0]?.id}`)
    await t.drain()
    // the tagged track wasn't measured
    expect(calls.map((c) => c.slice(-7))).toEqual(['02.flac', '03.flac'])
    const rows = t.db.select().from(schema.musicLoudness).all()
    const byTrack = new Map(rows.map((r) => [r.trackId, r]))
    const [one, two] = t.rows().tracks
    expect(byTrack.get(one?.id as string)).toMatchObject({
      source: 'tags',
      trackLufs: -9,
      envelope: [],
    })
    expect(byTrack.get(two?.id as string)).toMatchObject({ source: 'measured', trackLufs: -14 })
    expect(byTrack.get(two?.id as string)?.envelope).toHaveLength(160)
    // every track shares the album's level: three even lengths' energy mean, the highest peak
    const album = albumLevel([
      { lufs: -9, peak: -0.5, duration: 180 },
      { lufs: -14, peak: -4, duration: 180 },
      { lufs: -8, peak: 2, duration: 180 },
    ])
    for (const r of rows) expect({ lufs: r.albumLufs, peak: r.albumPeak }).toEqual(album as never)
    // nothing more to read: a scan again queues nothing, and measures nothing
    expect(t.music.loudness.queuePending()).toBe(0)
    await t.music.libraryScan.scan()
    await t.drain()
    expect(calls).toHaveLength(2)
  })

  test('the album’s tags win when every track carries them', async () => {
    const t = await setup({ measureLoudness: fakeMeter({}).meter })
    for (const n of [1, 2])
      t.put(
        `Blur/Parklife (1994)/0${n}.flac`,
        parklife(n, `Song ${n}`, {
          loudness: { track: { lufs: -10 - n, peak: -1 }, album: { lufs: -11.5, peak: -0.2 } },
        }),
      )
    await t.music.libraryScan.scan()
    await t.drain()
    const rows = t.db.select().from(schema.musicLoudness).all()
    expect(rows.map((r) => [r.albumLufs, r.albumPeak])).toEqual([
      [-11.5, -0.2],
      [-11.5, -0.2],
    ])
  })

  test('a job stopped part way carries on from the next track; a changed file is read again', async () => {
    const { meter, calls } = fakeMeter({ '01.flac': -10, '02.flac': -12, '03.flac': -14 })
    const t = await setup({ measureLoudness: meter })
    for (const n of [1, 2, 3]) t.put(`Blur/Parklife (1994)/0${n}.flac`, parklife(n, `Song ${n}`))
    await t.music.libraryScan.scan()
    const albumId = t.rows().albums[0]?.id as string
    // the server stops after the first track (a restart, the job's timeout)
    const stop = new AbortController()
    await t.music.loudness.measureAlbum(albumId, {
      signal: stop.signal,
      progress: (share) => share > 0 && stop.abort(),
    })
    expect(t.db.select().from(schema.musicLoudness).all()).toHaveLength(1)
    expect(t.db.select().from(schema.musicLoudness).all()[0]?.albumLufs).toBeNull()
    // the queued job picks up the rest
    await t.drain()
    expect(calls.map((c) => c.slice(-7))).toEqual(['01.flac', '02.flac', '03.flac'])
    expect(
      t.db
        .select()
        .from(schema.musicLoudness)
        .all()
        .every((r) => r.albumLufs !== null),
    ).toBe(true)
    // a file that changes on disk is read again at the next scan's queueing
    const track = t.rows().tracks[1]
    t.db
      .update(schema.musicTracks)
      .set({ mtime: (track?.mtime ?? 0) + 1000 })
      .run()
    expect(t.music.loudness.pending()).toEqual([albumId])
  })

  test('the play answers the levels, the queue the envelope; none yet is a plain level', async () => {
    const t = await setup({ measureLoudness: fakeMeter({ '01.flac': -12 }).meter })
    t.put('Blur/Parklife (1994)/01.flac', parklife(1, 'Girls & Boys'))
    t.put('Blur/Parklife (1994)/02.flac', 'broken')
    await t.music.libraryScan.scan()
    const who = person(t)
    const playback = createMusicPlayback(
      {
        db: t.db,
        jobs: t.jobs,
        clock: t.clock,
        events: t.events,
        logger: silentLogger,
        metadata: t.metadata,
      },
      {
        dir: join(t.dir, 'transcodes-music'),
        level: (id) => t.music.loudness.levelOf(id),
        profileFor: () => ({ audio: [{ codec: 'flac', maxChannels: 2 }] }),
        away: () => false,
        displayName: () => 'Ines',
        profileName: () => 'Main',
        device: () => null,
        allowed: () => true,
      },
    )
    const id = t.rows().tracks[0]?.id as string
    expect(playback.play(who, id, {}, { address: '10.0.0.2' }).level).toEqual({
      track: null,
      album: null,
    })
    await t.drain()
    expect(playback.play(who, id, {}, { address: '10.0.0.2' }).level).toEqual({
      track: { lufs: -12, peak: -2 },
      album: { lufs: -12, peak: -2 },
    })
    const queue = t.music.client.queue(who, { album: t.rows().albums[0]?.id as string }, false)
    expect(queue[0]?.loudness).toHaveLength(160)
  })
})

describe.skipIf(!hasFfmpeg)('measured by ffmpeg', () => {
  const meter = ffmpegLoudnessMeter('ffmpeg')

  test('EBU Tech 3341’s -23 dBFS stereo sine reads -23 LUFS, and -12 dBFS reads -12', async () => {
    const quiet = await meter(await tone('quiet.flac', -23))
    expect(Math.abs(quiet.lufs - -23)).toBeLessThanOrEqual(0.2)
    expect(Math.abs(quiet.peak - -23)).toBeLessThanOrEqual(0.2)
    // a frame every 100 ms
    expect(quiet.momentary.length).toBeGreaterThanOrEqual(38)
    const loud = await meter(await tone('loud.wav', -12))
    expect(Math.abs(loud.lufs - -12)).toBeLessThanOrEqual(0.2)
    // MP3's encoding moves it a little more (its low-pass and frames): within half a LU
    const mp3 = await meter(await tone('loud.mp3', -12))
    expect(Math.abs(mp3.lufs - -12)).toBeLessThanOrEqual(0.5)
  })

  test('a file that isn’t audio is a failure, not a level', async () => {
    const { writeFileSync } = await import('node:fs')
    const path = join(dir, 'not-audio.flac')
    writeFileSync(path, 'nothing to hear')
    await expect(meter(path)).rejects.toThrow()
  })

  test('ReplayGain tags in a real FLAC are read by ffprobe and trusted', async () => {
    const path = await tone('tagged.flac', -20, 1, {
      REPLAYGAIN_TRACK_GAIN: '-4.00 dB',
      REPLAYGAIN_TRACK_PEAK: '0.100000',
    })
    const read = await createTagReader()(path)
    expect(read.loudness?.track?.lufs).toBeCloseTo(-14, 5)
    expect(read.loudness?.track?.peak).toBeCloseTo(-20, 3)
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
// The references (checkpoint 7, Tests: against a reference track, no speech): a generated clip with
// an embedded text subtitle, a PGS stream's saved ffprobe frames, and a clip whose only sound is a
// sine tone. The worker task reads each with ffmpeg or ffprobe, as it does in the pool.
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProbe } from '@highsea-tv/media/shared'
import { hasFfmpeg } from '@highsea-tv/media/testing'
import {
  align,
  applyCorrection,
  chooseReference,
  imageCues,
  textReference,
  toFrames,
} from '../../src/sync/index.ts'
import { sync } from '../../src/sync/worker.ts'
import { distort, makeSyncClip, pgsFrames, sintel } from '../testing/index.ts'

const dir = mkdtempSync(join(tmpdir(), 'highsea-sync-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('choosing the reference', () => {
  const audio = [
    { index: 1, default: false },
    { index: 2, default: true },
  ]
  test('a full text track first, then an image track, then the default audio', () => {
    expect(
      chooseReference({
        audio,
        subtitles: [
          { index: 3, codec: 'hdmv_pgs_subtitle', forced: false },
          { index: 4, codec: 'subrip', forced: true },
          { index: 5, codec: 'ass', forced: false },
        ],
      }),
    ).toEqual({ kind: 'text', index: 5 })
    expect(
      chooseReference({
        audio,
        subtitles: [
          { index: 4, codec: 'subrip', forced: true },
          { index: 3, codec: 'dvd_subtitle', forced: false },
        ],
      }),
    ).toEqual({ kind: 'image', index: 3 })
    expect(chooseReference({ audio, subtitles: [] })).toEqual({ kind: 'audio', index: 2 })
    expect(chooseReference({ audio: [], subtitles: [] })).toBeNull()
  })
})

describe('an image track’s times', () => {
  test('a PGS cue runs until the next display set clears it', () => {
    const spans = imageCues(pgsFrames())
    expect(spans[0]).toEqual({ start: 87_296, end: 89_298 })
    expect(spans.length).toBe(pgsFrames().filter((f) => f.num_rects).length)
  })

  test('a cue with its own end time keeps it; one with nothing after it gets five seconds', () => {
    expect(
      imageCues([
        { pts_time: '10.000000', start_display_time: 0, end_display_time: 2_000, num_rects: 1 },
        {
          pts_time: '20.000000',
          start_display_time: 0,
          end_display_time: 4_294_967_295,
          num_rects: 1,
        },
      ]),
    ).toEqual([
      { start: 10_000, end: 12_000 },
      { start: 20_000, end: 25_000 },
    ])
  })

  test('aligning against them restores a shifted copy', () => {
    const spans = imageCues(pgsFrames())
    const input = distort(spans, { offsetMs: 2_000 })
    const r = align(toFrames(spans), input, { speechCps: null })
    for (const [i, c] of input.entries())
      expect(
        Math.abs(applyCorrection(r.correction, c.start) - (spans[i]?.start ?? 0)),
      ).toBeLessThanOrEqual(100)
  })
})

describe.skipIf(!hasFfmpeg)('the worker task, on generated clips', () => {
  test('an embedded text track is the reference, and a shifted subtitle comes back to it', async () => {
    const clip = makeSyncClip(join(dir, 'text.mkv'), { audio: 'sintel', subtitle: sintel.srtPath })
    const info = await createProbe()(clip)
    const reference = chooseReference(info)
    expect(reference?.kind).toBe('text')
    const embedded = await textReference(clip, reference?.index ?? -1)
    expect(embedded).toHaveLength(12)

    const official = sintel.cues()
    const input = distort(official, { offsetMs: 4_000 })
    const r = await sync({
      file: clip,
      reference: reference as NonNullable<typeof reference>,
      cues: input,
    })
    expect(r.reference).toBe('text')
    expect(r.confidence).toBeGreaterThanOrEqual(0.7)
    for (const [i, c] of input.entries())
      expect(
        Math.abs(applyCorrection(r.correction, c.start) - (official[i]?.start ?? 0)),
      ).toBeLessThanOrEqual(100)
  })

  test('a sine tone is no speech: the confidence stays under the minimum', async () => {
    const clip = makeSyncClip(join(dir, 'sine.mkv'), { audio: 'sine' })
    const info = await createProbe()(clip)
    const reference = chooseReference(info)
    expect(reference?.kind).toBe('audio')
    const r = await sync({
      file: clip,
      reference: reference as NonNullable<typeof reference>,
      cues: sintel.cues(),
    })
    expect(r.confidence).toBeLessThan(0.7)
  })

  test('the speech through the worker task matches the fixture’s', async () => {
    const clip = makeSyncClip(join(dir, 'speech.mkv'), { audio: 'sintel' })
    const r = await sync({
      file: clip,
      reference: { kind: 'audio', index: 1 },
      cues: distort(sintel.cues(), { offsetMs: 2_500 }),
    })
    expect(r.confidence).toBeGreaterThanOrEqual(sintel.minConfidence)
    expect(r.correction.ratio).toBe(1)
  })

  test('a missing ffmpeg says how to fix it', async () => {
    await expect(
      sync({
        file: '/nowhere.mkv',
        reference: { kind: 'audio', index: 1 },
        cues: sintel.cues(),
        binaries: { ffmpeg: '/nonexistent/ffmpeg' },
      }),
    ).rejects.toThrow('ffmpeg isn’t installed')
  })
})

// SPDX-License-Identifier: AGPL-3.0-only
// The sync as the library sees it (checkpoint 7, 7b): a download waits for its sync and comes back
// Synced or Not synced, the sidecar carries the correction and the nudge, Re-sync and the offset,
// failures, a replaced file, and the resilience test (exit criterion 5): a sync cut short by a
// crash runs once more after the restart, with one sidecar and one history entry. The engine is a
// fake here; test/sync runs the real one on real audio.
import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { schema } from '@highsea/db'
import { eq } from 'drizzle-orm'
import { JOBS } from '../../src/movies/index.ts'
import { SyncError } from '../../src/sync/index.ts'
import { must } from '../must.ts'
import { reason, SINTEL, setup, syncedOutcome } from './helpers.ts'

let t: ReturnType<typeof setup>
afterEach(() => t?.cleanup())

/**
 * A movie with one English track from OpenSubtitles.com, downloaded with Use; nothing run yet. Its
 * first line names the provider, so cleanup drops it as an ad: the sidecar starts at 5 seconds.
 */
async function downloaded(over: Parameters<typeof setup>[0] = {}) {
  t = setup(over)
  const m = t.movie()
  t.fake.add({
    provider: 'opensubtitles',
    tmdbId: SINTEL.tmdbId,
    language: 'en',
    releaseName: 'Sintel.2010.1080p.BluRay.x264-GRP',
  })
  const results = await t.subtitles.search(SINTEL.tmdbId, 'en')
  const track = await t.subtitles.download(SINTEL.tmdbId, must(results[0]).id)
  return { m, track }
}

const firstCue = (path: string) => readFileSync(path, 'utf8').split('\n')[1]
const syncHistory = () =>
  t.history().filter((h) => h.type === 'subtitle-synced' || h.type === 'subtitle-sync-failed')

describe('a download and its sync', () => {
  test('waits for the sync, then is Synced, with the correction in the sidecar', async () => {
    const { track } = await downloaded()
    expect(track.sync.status).toBe('queued')
    expect(firstCue(track.path)).toBe('00:00:05,000 --> 00:00:07,500')

    await t.drain()
    const [view] = t.subtitles.forItem(SINTEL.tmdbId)
    expect(view?.sync).toEqual({
      status: 'synced',
      confidence: 0.92,
      offsetMs: 1_200,
      detail: null,
    })
    expect(firstCue(track.path)).toBe('00:00:06,200 --> 00:00:08,700')
    // the engine was asked about the file's audio, with the track's cues as written
    expect(t.engine.tasks[0]).toMatchObject({ reference: { kind: 'audio', index: 1 } })
    expect(t.engine.tasks[0]?.cues).toHaveLength(2)
    expect(syncHistory().map((h) => [h.type, h.message])).toEqual([
      ['subtitle-synced', 'Synced English subtitles to the audio: 92% confidence.'],
    ])
    expect(t.subtitles.stats()).toMatchObject({ syncedToday: 1, waiting: 0, avgOffsetMs: 1_200 })
  })

  test('a framerate or splits say so on the track', async () => {
    const { track } = await downloaded()
    t.engine.outcome = syncedOutcome({
      correction: { ratio: 25 / (24000 / 1001), sections: [{ from: 0, fromMs: 0, offsetMs: 0 }] },
    })
    await t.drain()
    expect(t.subtitles.forItem(SINTEL.tmdbId)[0]?.sync.detail).toBe(
      'Framerate corrected (25 → 23.976)',
    )
    t.engine.outcome = syncedOutcome({
      correction: {
        ratio: 1,
        sections: [
          { from: 0, fromMs: 0, offsetMs: 1_200 },
          { from: 2, fromMs: 9_000, offsetMs: 4_200 },
        ],
      },
    })
    t.subtitles.sync(track.id)
    await t.drain()
    expect(t.subtitles.forItem(SINTEL.tmdbId)[0]?.sync.detail).toBe('2 sections moved')
    // the third cue (9 s) is in the second section; its end moves with its start
    expect(readFileSync(track.path, 'utf8')).toContain('00:00:13,200 --> 00:00:15,700')
  })

  test('below the minimum confidence the original timing stays, and the history says why', async () => {
    const { track } = await downloaded()
    t.engine.outcome = syncedOutcome({ confidence: 0.54 })
    await t.drain()
    const [view] = t.subtitles.forItem(SINTEL.tmdbId)
    expect(view?.sync).toEqual({ status: 'unsynced', confidence: 0.54, offsetMs: 0, detail: null })
    expect(firstCue(track.path)).toBe('00:00:05,000 --> 00:00:07,500')
    expect(syncHistory().map((h) => [h.type, h.message])).toEqual([
      ['subtitle-sync-failed', 'Kept the original timing: 54% confidence.'],
    ])
    expect(t.subtitles.stats().waiting).toBe(0)
  })

  test('with Sync to the audio off, a download keeps its timing and nothing syncs', async () => {
    t = setup()
    t.subtitles.settings.save({ autoSync: false })
    const m = t.movie()
    t.fake.add({
      provider: 'opensubtitles',
      tmdbId: SINTEL.tmdbId,
      language: 'en',
      releaseName: 'Sintel.2010.1080p.BluRay.x264-GRP',
    })
    t.subtitles.refreshWanted(m.itemId)
    t.jobs.enqueue(JOBS.search, { fileId: m.fileId })
    await t.drain()
    expect(t.rows().map((r) => r.syncStatus)).toEqual(['unsynced'])
    expect(t.engine.tasks).toEqual([])
    expect(t.jobs.list({}).some((j) => j.type === JOBS.sync)).toBe(false)
  })

  test('the minimum confidence is the setting’s', async () => {
    await downloaded()
    t.subtitles.settings.save({ minConfidence: 0.95 })
    await t.drain()
    expect(t.rows()[0]?.syncStatus).toBe('unsynced')
  })
})

describe('Re-sync and the offset', () => {
  test('the nudge moves the sidecar at once, on top of the sync', async () => {
    const { track } = await downloaded()
    await t.drain()
    // the offset is the one A6 shows, the sync's 1,200 ms and the nudge
    const view = await t.subtitles.setOffset(track.id, 1_450)
    expect(view.sync).toMatchObject({ status: 'synced', offsetMs: 1_450 })
    expect(t.rows()[0]?.manualOffsetMs).toBe(250)
    expect(firstCue(track.path)).toBe('00:00:06,450 --> 00:00:08,950')
    await t.subtitles.setOffset(track.id, 1_100)
    expect(firstCue(track.path)).toBe('00:00:06,100 --> 00:00:08,600')
  })

  test('Re-sync queues the sync, its nudge back at zero, and the result arrives', async () => {
    const { track } = await downloaded()
    await t.drain()
    await t.subtitles.setOffset(track.id, 1_450)
    t.engine.outcome = syncedOutcome({
      offsetMs: 900,
      correction: { ratio: 1, sections: [{ from: 0, fromMs: 0, offsetMs: 900 }] },
    })
    const view = t.subtitles.sync(track.id)
    expect(view.sync.status).toBe('queued')
    expect(t.rows()[0]?.manualOffsetMs).toBe(0)
    await t.drain()
    expect(t.subtitles.forItem(SINTEL.tmdbId)[0]?.sync).toMatchObject({
      status: 'synced',
      offsetMs: 900,
    })
    expect(firstCue(track.path)).toBe('00:00:05,900 --> 00:00:08,400')
    expect(syncHistory()).toHaveLength(2)
  })

  test('an offset must be whole milliseconds within ten minutes; an image track can’t move', async () => {
    const { track } = await downloaded()
    expect(await reason(() => t.subtitles.setOffset(track.id, 0.5))).toBe('invalid:undefined')
    expect(await reason(() => t.subtitles.setOffset(track.id, 600_001))).toBe('invalid:undefined')
    t.db
      .update(schema.subtitleFiles)
      .set({ original: null, format: 'sup' })
      .where(eq(schema.subtitleFiles.id, track.id))
      .run()
    expect(await reason(() => t.subtitles.setOffset(track.id, 50))).toBe('invalid:image-subtitle')
    expect(await reason(() => t.subtitles.sync(track.id))).toBe('invalid:image-subtitle')
    expect(await reason(() => t.subtitles.sync('sub-missing'))).toBe('not-found:undefined')
  })
})

describe('when a sync can’t finish', () => {
  test('ffmpeg missing fails at once, with the reason, and isn’t tried again', async () => {
    await downloaded()
    t.engine.outcome = new SyncError(
      'ffmpeg isn’t installed. Install FFmpeg, or set HIGHSEA_FFMPEG to ffmpeg’s path.',
    )
    await t.drain()
    expect(t.rows()[0]?.syncStatus).toBe('failed')
    expect(t.engine.tasks).toHaveLength(1)
    expect(syncHistory().map((h) => h.message)).toEqual([
      'Couldn’t sync English subtitles: ffmpeg isn’t installed. Install FFmpeg, or set HIGHSEA_FFMPEG to ffmpeg’s path.',
    ])
  })

  test('anything else waits and tries once more before it fails', async () => {
    await downloaded()
    t.engine.outcome = new Error('The worker stopped.')
    await t.drain()
    expect(t.rows()[0]?.syncStatus).toBe('queued')
    expect(syncHistory()).toEqual([])
    t.clock.advance(60_000)
    await t.drain()
    expect(t.rows()[0]?.syncStatus).toBe('failed')
    expect(t.engine.tasks).toHaveLength(2)
    expect(syncHistory()).toHaveLength(1)
  })

  test('a file with no audio and no subtitle stream can’t be synced', async () => {
    await downloaded()
    const [file] = t.db.select().from(schema.mediaFiles).all()
    t.db
      .update(schema.mediaFiles)
      .set({ mediaInfo: { probe: { duration: 60, audio: [], subtitles: [] } } })
      .where(eq(schema.mediaFiles.id, must(file).id))
      .run()
    await t.drain()
    expect(t.rows()[0]?.syncStatus).toBe('failed')
    expect(syncHistory().map((h) => h.message)).toEqual([
      'Couldn’t sync English subtitles: the file has no audio.',
    ])
  })

  test('an embedded text track is the reference before the audio', async () => {
    t = setup()
    t.movie({ embedded: [{ index: 3, codec: 'subrip', language: 'spa' }] })
    t.fake.add({
      provider: 'opensubtitles',
      tmdbId: SINTEL.tmdbId,
      language: 'en',
      releaseName: 'Sintel.2010.1080p.BluRay.x264-GRP',
    })
    const results = await t.subtitles.search(SINTEL.tmdbId, 'en')
    await t.subtitles.download(SINTEL.tmdbId, must(results[0]).id)
    await t.drain()
    expect(t.engine.tasks[0]?.reference).toEqual({ kind: 'text', index: 3 })
  })
})

describe('resilience', () => {
  test('a sync cut short by a crash runs again after the restart: one sidecar, one entry', async () => {
    const { track } = await downloaded()
    t.engine.hold = true
    void t.jobs.tick()
    // the job is running and the track is Syncing when the process dies
    await new Promise((r) => setTimeout(r, 20))
    expect(t.rows()[0]?.syncStatus).toBe('syncing')

    t.engine.hold = false
    const again = t.restart()
    await again.drain()
    again.stop()
    expect(t.rows()).toHaveLength(1)
    expect(t.rows()[0]?.syncStatus).toBe('synced')
    expect(firstCue(track.path)).toBe('00:00:06,200 --> 00:00:08,700')
    expect(syncHistory()).toHaveLength(1)
    expect(t.engine.tasks).toHaveLength(2)
  })

  test('a track left waiting without its job is queued on boot', async () => {
    await downloaded()
    // the job is lost; the row still says Waiting to sync
    for (const j of t.jobs.list({ status: ['queued'] })) t.jobs.cancel(j.id)
    const again = t.restart()
    await again.drain()
    again.stop()
    expect(t.rows()[0]?.syncStatus).toBe('synced')
  })
})

describe('a replaced file', () => {
  test('its tracks follow it, a hash match is scored again, and each is synced again', async () => {
    const { m, track } = await downloaded()
    await t.drain()
    t.db
      .update(schema.subtitleFiles)
      .set({ matches: ['hash'], score: 99 })
      .where(eq(schema.subtitleFiles.id, track.id))
      .run()
    // the import moved the tracks to the new file in its transaction, then ran its hook
    const fileId = 'fil-new'
    const path = join(m.folder, 'Sintel (2010) Remux-1080p.mkv')
    writeFileSync(path, 'a better copy')
    t.db.transaction((tx) => {
      const old = must(
        tx.select().from(schema.mediaFiles).where(eq(schema.mediaFiles.id, m.fileId)).get(),
      )
      tx.insert(schema.mediaFiles)
        .values({ ...old, id: fileId, path })
        .run()
      t.subtitles.hooks.replacing?.(tx, m.fileId, fileId)
      tx.delete(schema.mediaFiles).where(eq(schema.mediaFiles.id, m.fileId)).run()
    })
    await t.subtitles.hooks.afterImport?.({
      fileId,
      itemId: m.itemId,
      path,
      sourceFolder: null,
      inPlace: false,
    })
    await t.drain()
    const [row] = t.rows()
    expect(row).toMatchObject({
      mediaFileId: fileId,
      score: 56,
      syncStatus: 'synced',
      path: join(m.folder, 'Sintel (2010) Remux-1080p.en.srt'),
    })
    expect(row?.matches).toEqual(['title', 'year'])
    expect(t.engine.tasks).toHaveLength(2)
  })
})

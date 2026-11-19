// SPDX-License-Identifier: AGPL-3.0-only
// `media.markers` (Phase 5 C2, ADR 0067): a season's intro and credits found from the sound its
// episodes share, chapters first; the job repeated changes nothing; the owner's word survives a
// rerun; a season being played waits; an ffmpeg without the chromaprint muxer gives chapters
// alone, said once. The clips' tests skip, and say so, where ffmpeg can't fingerprint.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEventBus, createFakeClock, createLogger, type LogEntry } from '@highsea-tv/core'
import { migrate, openDatabase, schema } from '@highsea-tv/db'
import { createJobQueue } from '@highsea-tv/jobs'
import { createShowMarkers, MARKERS_JOB } from '@highsea-tv/media/shows'
import { hasFfmpeg } from '@highsea-tv/media/testing'
import { hasChromaprint } from '@highsea-tv/stream/markers'
import { type EpisodeParts, makeEpisode } from '@highsea-tv/stream/testing'
import { eq } from 'drizzle-orm'
import { createMarkers, NO_CHROMAPRINT } from '../src/markers.ts'

const ffmpeg = process.env.HIGHSEA_FFMPEG || 'ffmpeg'
const ffprobe = process.env.HIGHSEA_FFPROBE || 'ffprobe'
const chromaprint = hasFfmpeg && (await hasChromaprint(ffmpeg))
if (!hasFfmpeg) console.warn('No ffmpeg here, so the markers job’s tests are skipped.')
else if (!chromaprint)
  console.warn(
    'This ffmpeg has no chromaprint muxer, so the tests that find marks from sound are skipped.',
  )

/** The pure compare, run here rather than in a worker thread. */
const inline = {
  run: async <T>(task: { module: string; fn: string; input: unknown }) => {
    const mod = (await import(task.module)) as Record<string, (input: unknown) => T>
    return (mod[task.fn] as (input: unknown) => T)(task.input)
  },
}

/** A database with one show, its season 1, and an episode per clip, each with its file. */
function library(clips: { path: string; duration: number }[]) {
  const { db, raw } = openDatabase(':memory:')
  migrate(raw)
  const clock = createFakeClock()
  const now = clock.now()
  const item = (id: string, type: 'show' | 'season' | 'episode', more: object) =>
    db
      .insert(schema.mediaItems)
      .values({
        id,
        type,
        tmdbId: 100 + Number(id.replace(/\D/g, '') || 0),
        title: id,
        sortTitle: id,
        status: 'available',
        monitored: true,
        minimumAvailability: 'released',
        qualityProfileId: 'qp',
        rootFolder: '/tv',
        path: '/tv/show',
        addedAt: now,
        updatedAt: now,
        ...more,
      })
      .run()
  item('itm_show', 'show', { tmdbId: 1 })
  item('itm_s1', 'season', { parentId: 'itm_show', showId: 'itm_show', seasonNumber: 1 })
  clips.forEach((c, i) => {
    const n = i + 1
    item(`itm_e${n}`, 'episode', {
      tmdbId: 1000 + n,
      parentId: 'itm_s1',
      showId: 'itm_show',
      seasonNumber: 1,
      episodeNumber: n,
    })
    db.insert(schema.versions)
      .values({
        id: `ver_${n}`,
        itemId: `itm_e${n}`,
        label: 'Default',
        qualityProfileId: 'qp',
        position: 0,
        createdAt: now,
      })
      .run()
    db.insert(schema.mediaFiles)
      .values({
        id: `fil_${n}`,
        itemId: `itm_e${n}`,
        versionId: `ver_${n}`,
        path: c.path,
        size: statSync(c.path).size,
        addedAt: now + n,
        mediaInfo: {
          probe: {
            duration: c.duration,
            container: 'matroska',
            video: { codec: 'h264', width: 64, height: 36, hdr: null },
            audio: [{ language: 'eng' }],
            subtitles: [],
          },
        },
      })
      .run()
    db.update(schema.versions)
      .set({ fileId: `fil_${n}` })
      .where(eq(schema.versions.id, `ver_${n}`))
      .run()
  })
  const logs: LogEntry[] = []
  const logger = createLogger({ sinks: [(e) => logs.push(e)] })
  const jobs = createJobQueue({ db, clock, events: createEventBus({ now: clock.now }) })
  return { db, raw, clock, jobs, logger, logs }
}

const rows = (db: ReturnType<typeof openDatabase>['db']) =>
  db.select().from(schema.episodeMarkers).orderBy(schema.episodeMarkers.fileId).all()

/** Runs what's due: one season, as the queue would. */
async function drain(jobs: ReturnType<typeof createJobQueue>) {
  await jobs.tick()
  await jobs.idle()
}

describe.skipIf(!hasFfmpeg)('the markers job', () => {
  let dir = ''
  // three episodes: a cold open of its own length, the intro, the episode, the credits and a few
  // seconds of its own; the third has chapters naming its intro and credits
  const parts = (e: number): EpisodeParts => ({
    open: 8 + 3 * e,
    intro: 25,
    body: 110,
    credits: 30,
    tail: 5,
    ...(e === 3
      ? {
          chapters: [
            { title: 'Cold Open', start: 0, end: 17 },
            { title: 'Opening Credits', start: 17, end: 42 },
            { title: 'Episode', start: 42, end: 152 },
            { title: 'End Credits', start: 152, end: 187 },
          ],
        }
      : {}),
  })
  const total = (e: number) => {
    const p = parts(e)
    return p.open + p.intro + p.body + p.credits + p.tail
  }
  const clips: { path: string; duration: number }[] = []

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'highsea-markers-job-'))
    for (const e of [1, 2, 3]) {
      const path = join(dir, `S01E0${e}.mkv`)
      await makeEpisode(ffmpeg, path, e, parts(e))
      clips.push({ path, duration: total(e) })
    }
  }, 120_000)
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  test.skipIf(!chromaprint)(
    'finds the season’s intro and credits from their sound, chapters first',
    async () => {
      const { db, clock, jobs, logger } = library(clips)
      const markers = createMarkers({ db, jobs, clock, logger, ffmpeg, ffprobe, workers: inline })
      await markers.start()
      expect(jobs.list({ status: ['queued'] }).map((j) => j.type)).toEqual([MARKERS_JOB])
      const started = performance.now()
      await drain(jobs)
      const ms = performance.now() - started
      console.info(
        `a season of three ${Math.round(total(2) / 60)}-minute clips took ${ms.toFixed(0)} ms`,
      )
      const [e1, e2, e3] = rows(db)
      for (const [row, e] of [
        [e1, 1],
        [e2, 2],
      ] as const) {
        const open = parts(e).open
        expect(row?.introSource).toBe('audio')
        expect(Math.abs((row?.introStart ?? 0) - open)).toBeLessThan(1)
        expect(Math.abs((row?.introEnd ?? 0) - (open + 25))).toBeLessThan(1)
        expect(row?.creditsSource).toBe('audio')
        expect(Math.abs((row?.credits ?? 0) - (total(e) - 35))).toBeLessThan(1)
        expect(row?.error).toBeNull()
      }
      expect(e3).toMatchObject({
        introStart: 17,
        introEnd: 42,
        introSource: 'chapters',
        credits: 152,
        creditsSource: 'chapters',
      })
    },
    120_000,
  )

  test.skipIf(!chromaprint)(
    'run again, it changes nothing; the owner’s word survives a replaced file',
    async () => {
      const { db, clock, jobs, logger } = library(clips)
      const markers = createMarkers({ db, jobs, clock, logger, ffmpeg, ffprobe, workers: inline })
      await markers.start()
      await drain(jobs)
      const first = rows(db)
      clock.advance(60_000)
      // asked again, as an import's hook asks: nothing's waiting, so nothing's written
      await markers.afterImport()
      await drain(jobs)
      expect(rows(db)).toEqual(first)

      // the owner moves episode 1's intro and clears its credits, then the file is replaced
      const owner = createShowMarkers({ db, jobs, clock })
      owner.correct('fil_1', { intro: { start: 3, end: 33 }, credits: null })
      db.update(schema.mediaFiles)
        .set({ size: (first[0]?.size ?? 0) + 1 })
        .where(eq(schema.mediaFiles.id, 'fil_1'))
        .run()
      await markers.afterImport()
      await drain(jobs)
      const [e1] = rows(db)
      expect(e1).toMatchObject({
        introStart: 3,
        introEnd: 33,
        introSource: 'owner',
        credits: null,
        creditsSource: 'owner',
        size: (first[0]?.size ?? 0) + 1,
      })
      expect((e1?.checkedAt ?? 0) > (first[0]?.checkedAt ?? 0)).toBe(true)
    },
    120_000,
  )

  test('a season being played waits, and comes back later', async () => {
    const { db, clock, jobs, logger } = library(clips)
    const markers = createMarkers({
      db,
      jobs,
      clock,
      logger,
      ffmpeg,
      ffprobe,
      workers: inline,
      chromaprint: async () => true,
      busy: () => new Set(['fil_2']),
    })
    await markers.start()
    await jobs.tick()
    await jobs.idle()
    expect(rows(db)).toEqual([])
    const later = jobs.list({ status: ['queued'] })
    expect(later.map((j) => j.type)).toEqual([MARKERS_JOB])
    expect((later[0]?.runAt ?? 0) - clock.now()).toBe(10 * 60_000)
  })

  test('without the chromaprint muxer: chapters alone, said once, never a failed job', async () => {
    const { db, clock, jobs, logger, logs } = library(clips)
    let asked = 0
    const markers = createMarkers({
      db,
      jobs,
      clock,
      logger,
      ffmpeg,
      ffprobe,
      workers: inline,
      chromaprint: async () => {
        asked++
        return false
      },
    })
    await markers.start()
    await drain(jobs)
    const [e1, e2, e3] = rows(db)
    expect(e1).toMatchObject({ introStart: null, credits: null, error: NO_CHROMAPRINT })
    expect(e2).toMatchObject({ introStart: null, credits: null, error: NO_CHROMAPRINT })
    expect(e3).toMatchObject({ introStart: 17, introEnd: 42, credits: 152 })
    expect(jobs.list({ status: ['failed'] })).toEqual([])
    expect(asked).toBe(1)
    expect(logs.filter((l) => /chromaprint/.test(l.message))).toHaveLength(1)

    // a server started again with one that has it looks at those files again, the owner's kept
    createShowMarkers({ db, jobs, clock }).correct('fil_2', { credits: 160 })
    const restarted = createJobQueue({ db, clock, events: createEventBus({ now: clock.now }) })
    const again = createMarkers({
      db,
      jobs: restarted,
      clock,
      logger,
      ffmpeg,
      ffprobe,
      workers: inline,
      chromaprint: async () => true,
    })
    await again.start()
    // the two without both marks wait to be looked at again; the chapters' file is done
    expect(rows(db).map((r) => [r.fileId, r.size === -1])).toEqual([
      ['fil_1', true],
      ['fil_2', true],
      ['fil_3', false],
    ])
    expect(rows(db)[1]).toMatchObject({ credits: 160, creditsSource: 'owner' })
    expect(restarted.list({ status: ['queued'] }).map((j) => j.type)).toEqual([MARKERS_JOB])
  })
})

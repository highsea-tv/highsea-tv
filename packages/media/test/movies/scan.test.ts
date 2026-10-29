// SPDX-License-Identifier: AGPL-3.0-only
// The library scan on generated clips with a fake clock: a file that appears in a movie's folder is
// probed and recorded, one that changes is probed again, one that disappears clears its version
// (and with Stop monitoring deleted files, the movie stops being monitored), an unreadable root is
// left alone, and the job runs 12-hourly and after each import.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'
import { LIBRARY_SCAN_JOB, SCAN_EVERY_MS } from '../../src/movies/index.ts'
import { type Clips, hasFfmpeg, makeClips } from '../clips.ts'
import { SINTEL, setup } from './helpers.ts'

let clipsDir: string
let clips: Clips
beforeAll(() => {
  clipsDir = mkdtempSync(join(tmpdir(), 'highsea-scan-clips-'))
  if (hasFfmpeg) clips = makeClips(clipsDir)
})
afterAll(() => rmSync(clipsDir, { recursive: true, force: true }))

let cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})

const MINUTE = 60_000

/** Sintel in the library, its folder made; downloads beside it. */
async function start() {
  let downloads = ''
  const s = await setup({ importing: { downloadDirs: () => [downloads], sampleSeconds: 2 } })
  cleanups.push(s.cleanup)
  downloads = join(s.dir, 'downloads')
  mkdirSync(downloads)
  await s.add(SINTEL)
  const row = s.db
    .select()
    .from(schema.mediaItems)
    .where(eq(schema.mediaItems.tmdbId, SINTEL))
    .get()
  if (!row) throw new Error('Sintel wasn’t added.')
  mkdirSync(row.path, { recursive: true })
  const item = () =>
    s.db.select().from(schema.mediaItems).where(eq(schema.mediaItems.id, row.id)).get()
  const versions = () =>
    s.db.select().from(schema.versions).where(eq(schema.versions.itemId, row.id)).all()
  return { ...s, row, item, versions, downloads }
}

describe.skipIf(!hasFfmpeg)('the library scan', () => {
  test('a file that appears in a movie’s folder is recorded in place, once', async () => {
    const s = await start()
    const path = join(s.row.path, 'Sintel.2010.1080p.BluRay.x264-GRP.mkv')
    copyFileSync(clips.main, path)

    expect(await s.movies.libraryScan.scan()).toEqual({
      added: 1,
      movies: 0,
      waiting: 0,
      changed: 0,
      removed: 0,
      unreadable: [],
    })
    const [file] = s.movies.files(SINTEL)
    expect(file).toMatchObject({
      path,
      releaseGroup: 'GRP',
      transfer: null,
      quality: { name: 'Bluray-1080p', codec: 'h264' },
    })
    expect(s.item()?.status).toBe('available')
    expect(s.versions()[0]?.fileId).toBe(file?.id as string)
    expect(s.movies.history(SINTEL).items[0]).toMatchObject({
      type: 'imported',
      message: 'Found in the movie’s folder.',
    })

    // safe to repeat: nothing new the second time
    expect(await s.movies.libraryScan.scan()).toEqual({
      added: 0,
      movies: 0,
      waiting: 0,
      changed: 0,
      removed: 0,
      unreadable: [],
    })
    expect(s.movies.files(SINTEL)).toHaveLength(1)
    expect(s.movies.history(SINTEL).items).toHaveLength(1)
  })

  test('a sample is left alone, and a video in no movie’s folder isn’t recorded against one', async () => {
    const s = await start()
    copyFileSync(clips.sample, join(s.row.path, 'sintel-sample.mkv'))
    mkdirSync(join(s.folder.path, 'Unknown (1999)'))
    copyFileSync(clips.main, join(s.folder.path, 'Unknown (1999)', 'Unknown.1999.mkv'))
    expect((await s.movies.libraryScan.scan()).added).toBe(0)
    expect(s.movies.files(SINTEL)).toEqual([])
  })

  test('a changed file is probed again; its size and time are kept', async () => {
    const s = await start()
    const path = join(s.row.path, 'Sintel.2010.1080p.BluRay.x264-GRP.mkv')
    copyFileSync(clips.main, path)
    await s.movies.libraryScan.scan()

    // recorded in place with its facts (checkpoint 8d); cleared here, a changed file sets them again
    const facts = () =>
      s.db
        .select({ resolution: schema.mediaFiles.resolution, codec: schema.mediaFiles.videoCodec })
        .from(schema.mediaFiles)
        .get()
    expect(facts()).toEqual({ resolution: 1080, codec: 'h264' })
    s.db.update(schema.mediaFiles).set({ resolution: null, videoCodec: null }).run()
    s.db.delete(schema.mediaFileLanguages).run()

    const later = new Date(Date.now() + 60 * MINUTE)
    utimesSync(path, later, later)
    expect((await s.movies.libraryScan.scan()).changed).toBe(1)
    expect(facts()).toEqual({ resolution: 1080, codec: 'h264' })
    expect(s.db.select().from(schema.mediaFileLanguages).all()).toHaveLength(3)
    appendFileSync(path, Buffer.alloc(1024))
    expect((await s.movies.libraryScan.scan()).changed).toBe(1)
    expect(s.movies.files(SINTEL)[0]?.size).toBe(statSync(path).size)
    expect((await s.movies.libraryScan.scan()).changed).toBe(0)
  })

  test('a deleted file clears its version and, by default, stops monitoring the movie', async () => {
    const s = await start()
    const path = join(s.row.path, 'Sintel.2010.1080p.BluRay.x264-GRP.mkv')
    copyFileSync(clips.main, path)
    await s.movies.libraryScan.scan()
    // history is ordered by time: the deletion comes a minute later
    s.clock.advance(MINUTE)
    rmSync(path)

    expect((await s.movies.libraryScan.scan()).removed).toBe(1)
    expect(s.movies.files(SINTEL)).toEqual([])
    expect(s.versions()[0]?.fileId).toBeNull()
    expect(s.item()).toMatchObject({ monitored: false, status: 'unmonitored' })
    expect(s.movies.history(SINTEL).items[0]).toMatchObject({
      type: 'deleted',
      message: 'The file was deleted outside highsea, so the movie is no longer monitored.',
    })
    expect((await s.movies.libraryScan.scan()).removed).toBe(0)
  })

  test('with Stop monitoring deleted files off, the movie stays monitored and wanted', async () => {
    const s = await start()
    s.media.mediaManagement.save({ unmonitorDeleted: false })
    const path = join(s.row.path, 'Sintel.2010.1080p.BluRay.x264-GRP.mkv')
    copyFileSync(clips.main, path)
    await s.movies.libraryScan.scan()
    // history is ordered by time: the deletion comes a minute later
    s.clock.advance(MINUTE)
    rmSync(path)
    await s.movies.libraryScan.scan()
    expect(s.item()).toMatchObject({ monitored: true, status: 'wanted' })
    expect(s.movies.history(SINTEL).items[0]?.message).toBe('The file was deleted outside highsea.')
  })

  test('a root folder that can’t be read is left alone: nothing reads as deleted', async () => {
    const s = await start()
    const path = join(s.row.path, 'Sintel.2010.1080p.BluRay.x264-GRP.mkv')
    copyFileSync(clips.main, path)
    await s.movies.libraryScan.scan()
    const away = `${s.folder.path}-unmounted`
    renameSync(s.folder.path, away)
    try {
      expect(await s.movies.libraryScan.scan()).toEqual({
        added: 0,
        movies: 0,
        waiting: 0,
        changed: 0,
        removed: 0,
        unreadable: [s.folder.path],
      })
      expect(s.movies.files(SINTEL)).toHaveLength(1)
    } finally {
      renameSync(away, s.folder.path)
    }
  })

  test('a scan of one folder looks only there', async () => {
    const s = await start()
    copyFileSync(clips.main, join(s.row.path, 'Sintel.2010.1080p.BluRay.x264-GRP.mkv'))
    expect((await s.movies.libraryScan.scan({ folder: join(s.folder.path, 'Other') })).added).toBe(
      0,
    )
    expect((await s.movies.libraryScan.scan({ folder: s.row.path })).added).toBe(1)
    // a folder outside every root folder is nothing to scan
    expect((await s.movies.libraryScan.scan({ folder: s.downloads })).added).toBe(0)
  })

  test('an import asks for a scan of the movie’s folder', async () => {
    const s = await start()
    const name = 'Sintel.2010.1080p.BluRay.x264-GRP'
    const folder = join(s.downloads, name)
    mkdirSync(folder)
    copyFileSync(clips.main, join(folder, `${name}.mkv`))
    const result = await s.movies.importDownload({
      itemId: s.row.id,
      folder,
      releaseTitle: name,
      quality: 'Bluray-1080p',
      indexer: 'Fake',
      downloadId: 'dl-1',
    })
    expect(result.status).toBe('imported')
    const queued = s.jobs.list({ type: LIBRARY_SCAN_JOB, status: ['queued'] })
    expect(queued.map((j) => j.payload)).toEqual([{ folder: s.row.path }])
    // the scan finds the import's own file already recorded
    await s.jobs.tick()
    await s.jobs.idle()
    expect(s.jobs.get(queued[0]?.id as string)?.status).toBe('succeeded')
    expect(s.movies.files(SINTEL)).toHaveLength(1)
  })
})

describe('the scan’s schedule', () => {
  test('ten minutes after boot, then every 12 hours (Jellyfin’s interval)', async () => {
    const s = await setup()
    cleanups.push(s.cleanup)
    expect(SCAN_EVERY_MS).toBe(12 * 60 * MINUTE)
    s.movies.jobs.schedule(s.clock.now())
    const scans = () => s.jobs.list({ type: LIBRARY_SCAN_JOB }).length
    s.clock.advance(9 * MINUTE)
    await s.jobs.tick()
    expect(scans()).toBe(0)
    s.clock.advance(MINUTE)
    await s.jobs.tick()
    await s.jobs.idle()
    expect(scans()).toBe(1)
    s.clock.advance(SCAN_EVERY_MS - MINUTE)
    await s.jobs.tick()
    await s.jobs.idle()
    expect(scans()).toBe(1)
    s.clock.advance(MINUTE)
    await s.jobs.tick()
    await s.jobs.idle()
    expect(scans()).toBe(2)
    expect(s.jobs.list({ type: LIBRARY_SCAN_JOB }).every((j) => j.status === 'succeeded')).toBe(
      true,
    )
  })
})

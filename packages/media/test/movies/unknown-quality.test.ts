// SPDX-License-Identifier: AGPL-3.0-only
// A release whose name gives no quality (the Internet Archive's "{title} {year}"), grabbed as
// Unknown: the import reads its resolution from the file and judges that, and a release the owner
// grabbed anyway imports at the quality it's found to be, below the cutoff and still wanted.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'
import { type Clips, hasFfmpeg, makeClips, TOOL_LIMIT } from '../clips.ts'
import { SINTEL, setup } from './helpers.ts'

let clipsDir: string
let clips: Clips
/** 854×480 H.264, 3 s: a DVD-sized film, as many of the Archive's are. */
let sd: string
beforeAll(() => {
  clipsDir = mkdtempSync(join(tmpdir(), 'highsea-unknown-clips-'))
  if (!hasFfmpeg) return
  clips = makeClips(clipsDir)
  sd = join(clipsDir, 'sd.mkv')
  execFileSync(
    'ffmpeg',
    [
      ...['-v', 'error', '-y', '-nostdin'],
      ...['-f', 'lavfi', '-i', 'testsrc2=size=854x480:rate=24:duration=3'],
      ...['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3'],
      ...['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac'],
      sd,
    ],
    TOOL_LIMIT,
  )
})
afterAll(() => rmSync(clipsDir, { recursive: true, force: true }))

let cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})

/** The Archive's name for Sintel: no source, no resolution. */
const NAME = 'Sintel 2010'

/** Sintel in HD 1080p (Bluray-1080p, WEB 1080p and HDTV-1080p allowed; cutoff Bluray-1080p). */
async function start() {
  let downloads = ''
  const s = await setup({ importing: { downloadDirs: () => [downloads], sampleSeconds: 2 } })
  cleanups.push(s.cleanup)
  const library = join(s.dir, 'data', 'media', 'movies')
  downloads = join(s.dir, 'data', 'downloads')
  mkdirSync(library, { recursive: true })
  mkdirSync(downloads, { recursive: true })
  s.media.rootFolders.add(library)
  await s.add(SINTEL, { rootFolder: library })
  const row = s.db
    .select()
    .from(schema.mediaItems)
    .where(eq(schema.mediaItems.tmdbId, SINTEL))
    .get()
  if (!row) throw new Error('Sintel wasn’t added.')
  /** A download folder named as the Archive names it, holding a copy of `clip`. */
  const download = (clip: string, file = `${NAME}.mp4`) => {
    const folder = join(downloads, NAME)
    mkdirSync(folder, { recursive: true })
    copyFileSync(clip, join(folder, file))
    return folder
  }
  const item = () =>
    s.db.select().from(schema.mediaItems).where(eq(schema.mediaItems.id, row.id)).get()
  /** As the downloads service hands it over: the grab recorded the release as Unknown. */
  const importIt = (folder: string, grabbedAnyway?: boolean) =>
    s.movies.importDownload({
      itemId: row.id,
      folder,
      releaseTitle: NAME,
      quality: 'Unknown',
      indexer: 'Internet Archive',
      grabbedAnyway,
    })
  return { ...s, row, download, item, importIt }
}

describe.skipIf(!hasFfmpeg)('a release whose name gives no quality', () => {
  test('a 1080-line file is judged as HDTV-1080p, not as the Unknown it was grabbed as', async () => {
    const s = await start()
    const r = await s.importIt(s.download(clips.main))
    expect(r).toMatchObject({ status: 'imported', quality: 'HDTV-1080p' })
    expect(s.movies.files(SINTEL).map((f) => f.quality.name)).toEqual(['HDTV-1080p'])
    // HD 1080p's cutoff is Bluray-1080p: the film stays wanted for an upgrade
    expect(s.item()).toMatchObject({ status: 'available', cutoffUnmet: true })
  })

  test('a 480-line file is SDTV, which HD 1080p refuses when the grab wasn’t forced', async () => {
    const s = await start()
    const r = await s.importIt(s.download(sd))
    expect(r).toMatchObject({ status: 'blocked', reason: 'SDTV isn’t allowed in HD 1080p' })
    expect(s.movies.files(SINTEL)).toEqual([])
    expect(s.item()?.status).not.toBe('available')
  })

  test('grabbed anyway, it imports as SDTV, below the cutoff and still wanted', async () => {
    const s = await start()
    const r = await s.importIt(s.download(sd), true)
    expect(r).toMatchObject({ status: 'imported', quality: 'SDTV' })
    expect(s.movies.files(SINTEL).map((f) => f.quality.name)).toEqual(['SDTV'])
    expect(s.item()).toMatchObject({ status: 'available', cutoffUnmet: true })
    const imported = s.movies.history(SINTEL).items.find((h) => h.type === 'imported')
    expect(imported).toMatchObject({ sourceTitle: NAME, quality: 'SDTV' })
  })

  test('grabbed anyway, a download that holds only a sample is still refused', async () => {
    const s = await start()
    const r = await s.importIt(s.download(clips.sample, `${NAME}-sample.mp4`), true)
    expect(r.status).toBe('blocked')
    expect(s.movies.files(SINTEL)).toEqual([])
  })
})

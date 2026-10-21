// SPDX-License-Identifier: AGPL-3.0-only
// The import pipeline end to end on generated clips: a download into the library, named, linked
// and recorded, twice to prove it's safe to repeat; what's skipped, blocked and refused; a
// replacement through the recycle bin; and manual import's scan and run.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { schema } from '@highsea/db'
import { eq } from 'drizzle-orm'
import { type Clips, hasFfmpeg, makeClips } from '../clips.ts'
import { reason, SINTEL, setup } from './helpers.ts'

let clipsDir: string
let clips: Clips
beforeAll(() => {
  clipsDir = mkdtempSync(join(tmpdir(), 'highsea-import-clips-'))
  if (hasFfmpeg) clips = makeClips(clipsDir)
})
afterAll(() => rmSync(clipsDir, { recursive: true, force: true }))

let cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})

/** A library at `<dir>/data/media/movies` and downloads at `<dir>/data/downloads`, Sintel added. */
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
  /** A download folder holding copies of the named clips. */
  const download = (name: string, files: Record<string, string>) => {
    const folder = join(downloads, name)
    mkdirSync(folder, { recursive: true })
    for (const [file, from] of Object.entries(files)) {
      mkdirSync(join(folder, file, '..'), { recursive: true })
      if (existsSync(from)) copyFileSync(from, join(folder, file))
      else writeFileSync(join(folder, file), from)
    }
    return folder
  }
  const status = () =>
    s.db.select().from(schema.mediaItems).where(eq(schema.mediaItems.id, row.id)).get()?.status
  return { ...s, library, downloads, row, download, status }
}

describe.skipIf(!hasFfmpeg)('importing a download', () => {
  test('Sintel.2010.1080p.BluRay.x264-GRP becomes Sintel (2010) Bluray-1080p.mkv, once', async () => {
    const s = await start()
    const name = 'Sintel.2010.1080p.BluRay.x264-GRP'
    const folder = s.download(name, {
      [`${name}.mkv`]: clips.main,
      [`Sample/${name}-sample.mkv`]: clips.sample,
      [`${name}.nfo`]: 'release notes',
    })
    s.seen.length = 0
    const input = {
      itemId: s.row.id,
      folder,
      releaseTitle: name,
      quality: 'Bluray-1080p',
      indexer: 'Fake',
      downloadId: 'dl-1',
    }

    const first = await s.movies.importDownload(input)
    const dest = join(s.library, 'Sintel (2010)', 'Sintel (2010) Bluray-1080p.mkv')
    expect(first).toMatchObject({
      status: 'imported',
      path: dest,
      transfer: 'hardlink',
      quality: 'Bluray-1080p',
      already: false,
    })
    expect(statSync(dest).ino).toBe(statSync(join(folder, `${name}.mkv`)).ino)
    expect(s.status()).toBe('available')
    expect(s.seen.map((e) => e.topic)).toEqual(
      expect.arrayContaining(['movies.updated', 'item.updated', 'history.updated']),
    )

    const [file] = s.movies.files(SINTEL)
    expect(file).toMatchObject({
      path: dest,
      sceneName: name,
      releaseGroup: 'GRP',
      transfer: 'hardlink',
      quality: { name: 'Bluray-1080p', resolution: '1080p', codec: 'h264' },
    })
    expect(file?.streams.map((x) => x.type)).toEqual(['video', 'audio', 'audio', 'subtitle'])

    const again = await s.movies.importDownload(input)
    expect(again).toMatchObject({ status: 'imported', path: dest, already: true })
    expect(s.movies.files(SINTEL)).toHaveLength(1)
    const history = s.movies.history(SINTEL)
    expect(history.items).toHaveLength(1)
    expect(history.items[0]).toMatchObject({
      itemId: SINTEL,
      type: 'imported',
      sourceTitle: name,
      quality: 'Bluray-1080p',
      indexer: 'Fake',
      downloadId: 'dl-1',
    })
    expect(readdirSync(join(s.library, 'Sintel (2010)'))).toEqual([
      'Sintel (2010) Bluray-1080p.mkv',
    ])
  })

  test('a download that holds only a sample has nothing to import', async () => {
    const s = await start()
    const folder = s.download('Sintel.2010.1080p.BluRay.x264-GRP', { 'sintel.mkv': clips.sample })
    const r = await s.movies.importDownload({
      itemId: s.row.id,
      folder,
      releaseTitle: 'Sintel.2010.1080p.BluRay.x264-GRP',
    })
    expect(r.status).toBe('blocked')
    expect(r.status === 'blocked' && r.reason).toMatch(/^Nothing to import: a sample \(/)
    expect(s.movies.history(SINTEL).items[0]).toMatchObject({ type: 'import-failed' })
  })

  test('an executable in the release blocks it, with the state’s copy', async () => {
    const s = await start()
    const folder = s.download('Sintel.2010.1080p.BluRay.x264-GRP', {
      'sintel.mkv': clips.main,
      'Codec.Installer.exe': 'MZ',
    })
    const r = await s.movies.importDownload({
      itemId: s.row.id,
      folder,
      releaseTitle: 'Sintel.2010.1080p.BluRay.x264-GRP',
    })
    expect(r).toEqual({
      status: 'blocked',
      reason:
        'The release contains an executable file (Codec.Installer.exe). It wasn’t downloaded, and it has been blocklisted.',
    })
    expect(existsSync(join(s.library, 'Sintel (2010)', 'Sintel (2010) Bluray-1080p.mkv'))).toBe(
      false,
    )
  })

  test('a quality the profile doesn’t allow is refused', async () => {
    const s = await start()
    const name = 'Sintel.2010.720p.WEB-DL.x264-GRP'
    const folder = s.download(name, { [`${name}.mkv`]: clips.main })
    const r = await s.movies.importDownload({ itemId: s.row.id, folder, releaseTitle: name })
    expect(r.status).toBe('blocked')
    expect(s.status()).not.toBe('available')
  })

  test('a better release replaces the file, and the old one goes to the recycle bin', async () => {
    const s = await start()
    const bin = join(s.dir, 'data', 'recycle')
    s.media.mediaManagement.save({ recycleBin: bin })
    const web = 'Sintel.2010.1080p.WEB-DL.x264-GRP'
    const bluray = 'Sintel.2010.1080p.BluRay.x264-GRP'
    const first = await s.movies.importDownload({
      itemId: s.row.id,
      folder: s.download(web, { [`${web}.mkv`]: clips.main }),
      releaseTitle: web,
    })
    expect(first).toMatchObject({ status: 'imported', quality: 'WEBDL-1080p' })
    s.clock.advance(60_000)
    const second = await s.movies.importDownload({
      itemId: s.row.id,
      folder: s.download(bluray, { [`${bluray}.mkv`]: clips.main }),
      releaseTitle: bluray,
    })
    expect(second).toMatchObject({ status: 'imported', quality: 'Bluray-1080p' })
    expect(readdirSync(join(s.library, 'Sintel (2010)'))).toEqual([
      'Sintel (2010) Bluray-1080p.mkv',
    ])
    expect(existsSync(join(bin, 'Sintel (2010)', 'Sintel (2010) WEBDL-1080p.mkv'))).toBe(true)
    expect(s.movies.files(SINTEL).map((f) => f.quality.name)).toEqual(['Bluray-1080p'])
    expect(s.movies.history(SINTEL).items.map((h) => h.sourceTitle)).toEqual([bluray, web])

    // the same Bluray again isn't an upgrade over itself, and changes nothing
    const third = await s.movies.importDownload({
      itemId: s.row.id,
      folder: join(s.downloads, bluray),
      releaseTitle: bluray,
    })
    expect(third).toMatchObject({ status: 'imported', already: true })
  })

  test('a folder outside the root folders and downloads is refused', async () => {
    const s = await start()
    const outside = join(s.dir, 'elsewhere', 'Sintel.2010.1080p.BluRay.x264-GRP')
    mkdirSync(outside, { recursive: true })
    copyFileSync(clips.main, join(outside, 'sintel.mkv'))
    const r = await s.movies.importDownload({
      itemId: s.row.id,
      folder: outside,
      releaseTitle: 'Sintel.2010.1080p.BluRay.x264-GRP',
    })
    expect(r.status).toBe('blocked')
    expect(r.status === 'blocked' && r.reason).toContain('isn’t inside a root folder')
    expect(await reason(() => s.movies.manualImport.scan(outside))).toBe('invalid:outside-roots')
  })
})

describe.skipIf(!hasFfmpeg)('manual import', () => {
  test('scan matches by name and says what each file becomes; run imports the picked ones', async () => {
    const s = await start()
    const folder = s.download('Unsorted', {
      'Sintel (2010)/movie.mkv': clips.main,
      'Unknown Film 1999.mkv': clips.main,
      'Sintel.2010.Short.mkv': clips.sample,
      'setup.exe': 'MZ',
      'notes.txt': 'notes',
    })
    const found = await s.movies.manualImport.scan(folder)
    const by = (end: string) => found.find((c) => c.path.endsWith(end))
    expect(found).toHaveLength(4)
    expect(by('movie.mkv')).toMatchObject({
      itemId: SINTEL,
      quality: 'HDTV-1080p',
      language: 'English',
      skip: null,
      becomes: 'Sintel (2010)/Sintel (2010) HDTV-1080p.mkv',
    })
    expect(by('Unknown Film 1999.mkv')).toMatchObject({
      itemId: null,
      skip: 'Didn’t match a movie. Choose one.',
      becomes: null,
    })
    expect(by('Sintel.2010.Short.mkv')?.skip).toMatch(/^A sample/)
    expect(by('setup.exe')).toMatchObject({ skip: 'An executable file. It won’t be imported.' })

    const picked = by('movie.mkv')?.path as string
    const results = await s.movies.manualImport.run([{ path: picked, itemId: SINTEL }])
    expect(results).toEqual([
      {
        path: picked,
        result: expect.objectContaining({
          status: 'imported',
          path: join(s.library, 'Sintel (2010)', 'Sintel (2010) HDTV-1080p.mkv'),
        }),
      },
    ])
    expect(s.status()).toBe('available')
    expect(
      await reason(() =>
        s.movies.manualImport.run([{ path: join(s.dir, 'x.mkv'), itemId: SINTEL }]),
      ),
    ).toBe('invalid:outside-roots')
  })
})

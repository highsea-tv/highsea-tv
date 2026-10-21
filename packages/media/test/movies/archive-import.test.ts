// SPDX-License-Identifier: AGPL-3.0-only
// The import pipeline's extraction step on generated clips, with a stand-in for unar: a release in
// archives is extracted beside the download, imported, and the extracted copy removed while the
// archives stay to seed; a password-protected one is blocked and marked for replacement; unar
// missing blocks with its reason. The real unar is tested in test/shared/extract.test.ts.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { schema } from '@highsea/db'
import { eq } from 'drizzle-orm'
import type { ImportOptions } from '../../src/movies/index.ts'
import {
  createExtractor,
  EXTRACT_MESSAGES,
  type Extract,
  ExtractError,
  unpackedFolder,
} from '../../src/shared/extract.ts'
import { type Clips, hasFfmpeg, makeClips } from '../clips.ts'
import { SINTEL, setup } from './helpers.ts'

let clipsDir: string
let clips: Clips
beforeAll(() => {
  clipsDir = mkdtempSync(join(tmpdir(), 'highsea-archive-clips-'))
  if (hasFfmpeg) clips = makeClips(clipsDir)
})
afterAll(() => rmSync(clipsDir, { recursive: true, force: true }))

let cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})

const NAME = 'Sintel.2010.1080p.BluRay.x264-GRP'

async function start(extract: Extract) {
  let downloads = ''
  const importing: ImportOptions = { downloadDirs: () => [downloads], sampleSeconds: 2, extract }
  const s = await setup({ importing })
  cleanups.push(s.cleanup)
  downloads = join(s.dir, 'downloads')
  await s.add(SINTEL)
  const row = s.db
    .select()
    .from(schema.mediaItems)
    .where(eq(schema.mediaItems.tmdbId, SINTEL))
    .get()
  if (!row) throw new Error('Sintel wasn’t added.')
  // a scene release: a RAR set and its NFO
  const folder = join(downloads, NAME)
  mkdirSync(folder, { recursive: true })
  for (const f of [`${NAME}.rar`, `${NAME}.r00`, `${NAME}.r01`, `${NAME}.nfo`])
    writeFileSync(join(folder, f), f)
  const input = {
    itemId: row.id,
    folder,
    releaseTitle: NAME,
    quality: 'Bluray-1080p',
    indexer: 'Fake',
    downloadId: 'dl-1',
  }
  return { ...s, row, folder, input }
}

describe.skipIf(!hasFfmpeg)('a release in archives', () => {
  test('is extracted beside the download, imported, and the extracted copy removed', async () => {
    const calls: string[] = []
    const s = await start(async (archive, into) => {
      calls.push(archive)
      copyFileSync(clips.main, join(into, `${NAME}.mkv`))
    })
    const result = await s.movies.importDownload(s.input)
    const dest = join(s.row.path, 'Sintel (2010) Bluray-1080p.mkv')
    expect(result).toMatchObject({ status: 'imported', path: dest, already: false })
    expect(calls).toEqual([join(s.folder, `${NAME}.rar`)])
    expect(existsSync(dest)).toBe(true)
    // the archives stay to seed; the extracted copy is gone
    expect(readdirSync(s.folder).sort()).toEqual(
      [`${NAME}.nfo`, `${NAME}.r00`, `${NAME}.r01`, `${NAME}.rar`].sort(),
    )
    expect(existsSync(unpackedFolder(s.folder))).toBe(false)

    // imported again, it's already done: nothing is extracted twice into the library
    const again = await s.movies.importDownload(s.input)
    expect(again).toMatchObject({ status: 'imported', path: dest })
    expect(s.movies.files(SINTEL)).toHaveLength(1)
  })

  test('a password-protected one is blocked, and marked to be replaced', async () => {
    const s = await start(async () => {
      throw new ExtractError('password', EXTRACT_MESSAGES.password, 'requires a password')
    })
    const result = await s.movies.importDownload(s.input)
    expect(result).toEqual({
      status: 'blocked',
      reason: 'The release is a password-protected archive.',
      replace: true,
    })
    expect(existsSync(unpackedFolder(s.folder))).toBe(false)
    expect(s.movies.files(SINTEL)).toEqual([])
  })

  test('without unar it’s blocked with how to fix it, and not replaced', async () => {
    const s = await start(createExtractor({ binary: join(tmpdir(), 'highsea-no-such-unar') }))
    const result = await s.movies.importDownload(s.input)
    expect(result).toMatchObject({ status: 'blocked', reason: EXTRACT_MESSAGES.missing })
    expect((result as { replace?: boolean }).replace).toBeFalsy()
  })
})

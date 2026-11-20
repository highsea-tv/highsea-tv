// SPDX-License-Identifier: AGPL-3.0-only
// A show's download into the library (Phase 5 C1, ADR 0039's 2026-11-19 section): the files a
// release brings filed into the show's season folder under its episode naming, a multi-episode
// file once for every episode it holds, and what the download has that wasn't grabbed for (another
// episode, a name with no number) left where it is, Activity saying so once per file. A root
// folder highsea only reads takes nothing. The probe is the fixture's fake, so no ffmpeg is needed;
// TMDB is replayed (Chernobyl, 87108).
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { schema } from '@highsea-tv/db'
import { and, eq } from 'drizzle-orm'
import { CHERNOBYL, cleanup, setup } from './fixture.ts'

afterEach(cleanup)

async function added() {
  const t = await setup()
  const { show } = await t.shows.add({
    tmdbId: CHERNOBYL,
    title: '',
    year: 0,
    qualityProfileId: 'qp-hd',
    languageProfileId: '',
    rootFolder: t.root,
    monitor: 'all',
    seasonFolders: true,
    search: false,
  })
  const row = t.showRow(CHERNOBYL)
  if (!row) throw new Error('no show')
  /** The episode items, by number in season 1. */
  const episode = (n: number) => {
    const e = t.db
      .select()
      .from(schema.mediaItems)
      .where(
        and(
          eq(schema.mediaItems.showId, row.id),
          eq(schema.mediaItems.seasonNumber, 1),
          eq(schema.mediaItems.episodeNumber, n),
        ),
      )
      .get()
    if (!e) throw new Error(`no episode ${n}`)
    return e.id
  }
  /** A download's folder under the shows category, its files written. */
  const download = (name: string, files: Record<string, string>) => {
    const folder = join(t.downloads, name)
    mkdirSync(folder, { recursive: true })
    for (const [f, body] of Object.entries(files)) writeFileSync(join(folder, f), body)
    return folder
  }
  const leftInHistory = () =>
    t.db
      .select()
      .from(schema.history)
      .where(and(eq(schema.history.itemId, row.id), eq(schema.history.type, 'import-failed')))
      .all()
      .map((h) => ({ file: h.sourceTitle, message: h.message }))
  return { ...t, show, row, episode, download, leftInHistory }
}

describe('a show’s download, into the library', () => {
  test('a multi-episode file once; another episode and a name with no number left, and said', async () => {
    const t = await added()
    const name = 'Chernobyl.S01E02E03.1080p.WEB-DL.DDP5.1.H.264-GRP'
    const folder = t.download(name, {
      [`${name}.mkv`]: 'episode',
      'Chernobyl.S01E05.1080p.WEB-DL.DDP5.1.H.264-GRP.mkv': 'episode',
      'Chernobyl - Behind the Scenes.mkv': 'episode',
      'readme.txt': 'not a video',
    })
    const input = {
      showItemId: t.row.id,
      episodeIds: [t.episode(2), t.episode(3)],
      folder,
      releaseTitle: name,
      indexer: 'Fake',
      downloadId: 'dl-1',
    }
    const r = await t.shows.importDownload(input)
    if (r.status !== 'imported') throw new Error(r.reason)
    expect(r.files).toHaveLength(1)
    expect(r.files[0]?.episodes).toHaveLength(2)
    expect(r.files[0]?.path).toMatch(
      /\/Chernobyl \(2019\)\/Season 01\/Chernobyl - S01E02-E03 - .+ WEBDL-1080p\.mkv$/,
    )
    expect(t.episodes(CHERNOBYL)).toMatchObject({
      S01E02: { status: 'available' },
      S01E03: { status: 'available' },
      S01E05: { file: null },
    })
    // the others stay in the download, and Activity says why, once each
    expect(r.left.map((l) => l.path.split('/').pop()).sort()).toEqual([
      'Chernobyl - Behind the Scenes.mkv',
      'Chernobyl.S01E05.1080p.WEB-DL.DDP5.1.H.264-GRP.mkv',
    ])
    expect(existsSync(join(folder, 'Chernobyl - Behind the Scenes.mkv'))).toBe(true)
    const said = t.leftInHistory()
    expect(said).toHaveLength(2)
    for (const s of said) expect(s.message).toStartWith('Left in the download: ')
    // safe to repeat: the file is already in place, and nothing is said twice
    await t.shows.importDownload(input)
    expect(t.leftInHistory()).toHaveLength(2)
  })

  test('nothing to import when no file is for the episodes grabbed', async () => {
    const t = await added()
    const folder = t.download('Chernobyl.S01E01.1080p.WEB-DL-GRP', {
      'Chernobyl.S01E04.1080p.WEB-DL-GRP.mkv': 'episode',
    })
    const r = await t.shows.importDownload({
      showItemId: t.row.id,
      episodeIds: [t.episode(1)],
      folder,
      releaseTitle: 'Chernobyl.S01E01.1080p.WEB-DL-GRP',
    })
    expect(r.status).toBe('blocked')
    if (r.status === 'imported') return
    expect(r.reason).toStartWith('Nothing to import: ')
    expect(t.episodes(CHERNOBYL)).toMatchObject({ S01E01: { file: null }, S01E04: { file: null } })
  })

  test('a root folder highsea only reads takes nothing', async () => {
    const t = await added()
    const folder = t.download('Chernobyl.S01E01.1080p.WEB-DL-GRP', {
      'Chernobyl.S01E01.1080p.WEB-DL-GRP.mkv': 'episode',
    })
    const root = t.media.rootFolders.list('shows')[0]
    if (!root) throw new Error('no root folder')
    t.media.rootFolders.setReadOnly(root.id, true)
    const r = await t.shows.importDownload({
      showItemId: t.row.id,
      episodeIds: [t.episode(1)],
      folder,
      releaseTitle: 'Chernobyl.S01E01.1080p.WEB-DL-GRP',
    })
    expect(r.status).not.toBe('imported')
    expect(t.episodes(CHERNOBYL)).toMatchObject({ S01E01: { file: null } })
  })
})

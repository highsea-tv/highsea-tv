// SPDX-License-Identifier: AGPL-3.0-only
// What the import couldn't place, resolved in the admin (Phase 5 B): an episode file matched to its
// episodes, a show folder matched to a show and imported, one dismissed (kept, off the list, not
// offered again), and a show's refresh. TMDB is replayed; nothing reaches the network.
import { afterEach, describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { AppError } from '@highsea-tv/core'
import { CHERNOBYL, chernobyl, cleanup, setup } from './fixture.ts'

afterEach(cleanup)

async function imported() {
  const t = await setup()
  chernobyl(t)
  const found = await t.shows.libraryImport.scan(t.root)
  t.shows.libraryImport.run(
    found
      .filter((c) => c.match)
      .map((c) => ({ folder: c.folder, tmdbId: c.match?.tmdbId as number })),
  )
  await t.runJobs()
  return t
}

const reasonOf = async (fn: () => unknown) => {
  try {
    await fn()
  } catch (e) {
    if (e instanceof AppError)
      return `${e.code}:${(e.details as { reason?: string })?.reason ?? ''}`
    throw e
  }
  return 'no error'
}

describe('unmatched in the admin', () => {
  test('an episode file is matched to the episodes picked and leaves the list', async () => {
    const t = await imported()
    const recap = join(t.root, 'Chernobyl (2019)/Season 01/Chernobyl Recap.mkv')
    expect(t.shows.admin.unmatched().map((u) => u.path)).toContain(recap)
    const row = t.shows.admin.unmatched().find((u) => u.path === recap)
    expect(row).toMatchObject({ kind: 'episode-file', show: String(CHERNOBYL) })

    await t.shows.matchUnmatched({ path: recap, episodes: [{ season: 1, episode: 4 }] })
    expect(t.episodes(CHERNOBYL).S01E04).toEqual({
      file: 'Chernobyl (2019)/Season 01/Chernobyl Recap.mkv',
      status: 'available',
    })
    expect(t.shows.admin.unmatched().map((u) => u.path)).not.toContain(recap)
    // it isn't unmatched any more
    expect(
      await reasonOf(() =>
        t.shows.matchUnmatched({ path: recap, episodes: [{ season: 1, episode: 4 }] }),
      ),
    ).toBe('not-found:')
  })

  test('an episode the show doesn’t have, or none, is refused', async () => {
    const t = await imported()
    const recap = join(t.root, 'Chernobyl (2019)/Season 01/Chernobyl Recap.mkv')
    expect(
      await reasonOf(() =>
        t.shows.matchUnmatched({ path: recap, episodes: [{ season: 3, episode: 1 }] }),
      ),
    ).toBe('not-found:unknown-episode')
    expect(await reasonOf(() => t.shows.matchUnmatched({ path: recap, episodes: [] }))).toBe(
      'invalid:no-episodes',
    )
  })

  test('dismissed: off the list, kept, and the scan leaves it as it is', async () => {
    const t = await imported()
    const recap = join(t.root, 'Chernobyl (2019)/Season 01/Chernobyl Recap.mkv')
    const before = t.shows.admin.unmatched().length
    t.shows.dismissUnmatched(recap)
    expect(t.shows.admin.unmatched().map((u) => u.path)).not.toContain(recap)
    expect(t.shows.admin.unmatched()).toHaveLength(before - 1)
    // still known, so the scan doesn't put it back
    expect(t.unmatched().some((u) => u.path.endsWith('Chernobyl Recap.mkv'))).toBe(true)
    await t.shows.libraryScan.scan()
    expect(t.shows.admin.unmatched().map((u) => u.path)).not.toContain(recap)
    // twice is the same
    t.shows.dismissUnmatched(recap)
    expect(await reasonOf(() => t.shows.dismissUnmatched(join(t.root, 'nothing.mkv')))).toBe(
      'not-found:',
    )
  })

  test('a show folder is matched to the show picked: the library import adds it', async () => {
    const t = await setup()
    // the folder's name alone is ambiguous on TMDB, with no nfo to give its ids
    t.put('Chernobyl/Season 01/Chernobyl.S01E01.mkv')
    await t.shows.libraryScan.scan()
    const folder = join(t.root, 'Chernobyl')
    expect(t.shows.admin.unmatched().find((u) => u.path === folder)).toMatchObject({
      kind: 'show-folder',
      show: null,
    })
    expect(await reasonOf(() => t.shows.matchUnmatched({ path: folder }))).toBe('invalid:no-show')
    await t.shows.matchUnmatched({ path: folder, tmdbId: CHERNOBYL })
    await t.runJobs()
    expect(t.showRow(CHERNOBYL)?.path).toBe(folder)
    expect(t.shows.admin.unmatched().some((u) => u.path === folder)).toBe(false)
    expect(t.episodes(CHERNOBYL).S01E01?.status).toBe('available')
  })

  test('refresh queues TMDB’s refresh of a show here, and refuses one that isn’t', async () => {
    const t = await imported()
    await t.shows.refresh(CHERNOBYL)
    expect(await reasonOf(() => t.shows.refresh(1))).toBe('not-found:')
  })
})

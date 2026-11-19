// SPDX-License-Identifier: AGPL-3.0-only
// What's in hand on a library item, over HTTP (HT-106): a show's refresh and an episode's subtitle
// search are the show's work, read for the whole library at once and for the show alone; a failed
// job stays in the show's read with its reason for a while. TMDB answers from the recordings
// (Chernobyl, 87108); the episode's file is a row, so nothing reads it. The queue isn't ticking
// here: each job stays queued until the test runs it.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { schema } from '@highsea-tv/db'
import { createApi } from '../src/api/app.ts'
import { bootRuntime, cleanup, clientFor, withOwner } from './helpers.ts'

const CHERNOBYL = 87108
const E1 = 1725580

const dirs: string[] = []
afterEach(async () => {
  await cleanup()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

async function withShow() {
  const runtime = await bootRuntime()
  const { token } = await withOwner(runtime)
  await runtime.metadata.settings.setKey('test-key-for-replay-0001')
  const dir = mkdtempSync(join(tmpdir(), 'highsea-item-work-'))
  dirs.push(dir)
  const root = join(dir, 'shows')
  mkdirSync(root)
  runtime.media.rootFolders.add({ path: root, kind: 'shows' })
  const api = clientFor(createApi(runtime), { token })
  await api.series.add({
    body: {
      tmdbId: CHERNOBYL,
      qualityProfileId: runtime.media.profiles.list()[0]?.id as string,
      rootFolder: root,
      monitor: 'all',
      seasonFolders: true,
      search: false,
    },
  })
  const episode = runtime.db
    .select()
    .from(schema.mediaItems)
    .all()
    .find((r) => r.type === 'episode' && r.tmdbId === E1)
  if (!episode) throw new Error('no episode')
  runtime.db
    .insert(schema.mediaFiles)
    .values({
      id: 'fil_e1',
      itemId: episode.id,
      path: join(root, 'Chernobyl (2019)', 'Season 01', 'Chernobyl.S01E01.mkv'),
      size: 10,
      addedAt: Date.now(),
    } as typeof schema.mediaFiles.$inferInsert)
    .run()
  // what the boot queued on its own (a catch-up, a scan) isn't this test's
  for (const j of runtime.jobs.list({ status: ['queued'] })) runtime.jobs.cancel(j.id)
  return { runtime, api }
}

describe('an item’s work', () => {
  test('a show carries its episodes’ work; its read says how what finished went', async () => {
    const { runtime, api } = await withShow()
    expect(await api.system.work()).toEqual([])

    await api.series.refresh({ params: { id: String(CHERNOBYL) } })
    const search = runtime.jobs.enqueue('subtitles.search', { fileId: 'fil_e1' })

    const work = await api.system.work()
    expect(work).toMatchObject([
      {
        kind: 'show',
        id: String(CHERNOBYL),
        jobs: [
          {
            type: 'metadata.refresh',
            state: 'queued',
            subject: { kind: 'show', id: String(CHERNOBYL) },
            progress: null,
            retryAt: null,
            error: null,
          },
          {
            id: search,
            type: 'subtitles.search',
            state: 'queued',
            subject: { kind: 'episode', id: String(E1) },
          },
        ],
      },
    ])
    expect(Date.parse(work[0]?.jobs[0]?.since ?? '')).not.toBeNaN()

    const show = await api.system.itemWork({ params: { kind: 'show', id: String(CHERNOBYL) } })
    expect(show.active.map((j) => j.type)).toEqual(['metadata.refresh', 'subtitles.search'])
    expect(show.finished).toEqual([])

    // the search is stopped: it leaves the work, and the show's read keeps it a while
    runtime.jobs.cancel(search)
    expect((await api.system.work())[0]?.jobs.map((j) => j.type)).toEqual(['metadata.refresh'])
    const after = await api.system.itemWork({ params: { kind: 'show', id: String(CHERNOBYL) } })
    expect(after.finished).toMatchObject([{ id: search, state: 'cancelled' }])

    // nothing in hand on a film here is an empty read, not a 404
    expect(await api.system.itemWork({ params: { kind: 'movie', id: '603' } })).toEqual({
      kind: 'movie',
      id: '603',
      active: [],
      finished: [],
    })
  })
})

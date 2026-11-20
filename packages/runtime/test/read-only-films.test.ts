// SPDX-License-Identifier: AGPL-3.0-only
// HT-113: a film in a root folder highsea only reads (ADR 0063) is never searched, grabbed or
// upgraded on its own, as a show there isn't (HT-109). A monitored, missing film and one under its
// cutoff, in a folder switched to read-only: RSS targets neither, the sweep takes neither, Search
// all finds nothing to queue, a held or queued search grabs nothing, a Search on it is refused, and
// the download queue stays empty; Wanted's lists are empty and the calendar keeps their dates.
// Switched back to managed, both are wanted and searched again at once.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Fetch } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { createFakeIndexer, FAKE_CREDENTIALS, FAKE_ORIGIN } from '@highsea-tv/indexers/fake'
import { createReplayFetch } from '@highsea-tv/metadata/replay'
import { eq } from 'drizzle-orm'
import { boot, getRuntime, hasRuntime, loadConfig } from '../src/index.ts'

const SINTEL = 45745
const BIG_BUCK_BUNNY = 10378
const GB = 1024 ** 3
const dirs: string[] = []

afterEach(async () => {
  if (hasRuntime()) await getRuntime().shutdown()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

async function start() {
  const dir = mkdtempSync(join(tmpdir(), 'highsea-rt-read-only-films-'))
  dirs.push(dir)
  const fake = createFakeIndexer()
  const replay = createReplayFetch()
  const fetch: Fetch = (input, init) =>
    String(input instanceof Request ? input.url : input).startsWith(FAKE_ORIGIN)
      ? fake.fetch(input, init)
      : replay(input, init)
  const rt = await boot({
    config: loadConfig({
      HIGHSEA_CONFIG_DIR: join(dir, 'config'),
      HIGHSEA_DATA_DIR: join(dir, 'data'),
    }),
    version: '0.1.0',
    quiet: true,
    memory: true,
    manualTicks: true,
    indexerTimeoutMs: 2000,
    torrent: { offline: true },
    fetch,
  })
  await rt.metadata.settings.setKey('test-tmdb-key')
  rt.metadata.settings.update({ region: 'US' })
  const root = join(dir, 'data', 'media', 'movies')
  mkdirSync(root, { recursive: true })
  const folder = rt.media.rootFolders.add(root)
  await rt.indexers.add('generic-torznab', {
    settings: { baseUrl: `${FAKE_ORIGIN}/torznab`, apiKey: FAKE_CREDENTIALS.torznabKey },
  })
  const add = (tmdbId: number) =>
    rt.movies.add({
      tmdbId,
      rootFolder: root,
      monitored: true,
      minimumAvailability: 'released',
      languageProfileId: null,
      versions: [{ label: '1080p', qualityProfileId: 'qp-hd' }],
    })
  const grabs = () => rt.downloads.queue().map((q) => q.release)
  return { rt, folder, add, grabs }
}

/** Big Buck Bunny with a WEB 1080p file: HD 1080p's cutoff is Bluray-1080p, so it's unmet. */
async function underCutoff(rt: Awaited<ReturnType<typeof start>>['rt'], versionId: string) {
  const row = rt.db
    .select()
    .from(schema.mediaItems)
    .where(eq(schema.mediaItems.tmdbId, BIG_BUCK_BUNNY))
    .get()
  if (!row) throw new Error('not added')
  rt.db
    .insert(schema.mediaFiles)
    .values({
      id: 'fil_web',
      itemId: row.id,
      versionId,
      path: `${row.path}/Big Buck Bunny (2008) WEBDL-1080p.mkv`,
      size: 3 * GB,
      quality: 'WEB 1080p',
      sceneName: 'Big.Buck.Bunny.2008.1080p.WEB-DL.x264-GRP',
      addedAt: rt.clock.now(),
    })
    .run()
  rt.db
    .update(schema.versions)
    .set({ fileId: 'fil_web' })
    .where(eq(schema.versions.id, versionId))
    .run()
  rt.db
    .update(schema.mediaItems)
    .set({ status: 'available' })
    .where(eq(schema.mediaItems.id, row.id))
    .run()
  rt.movies.wanted.backfill()
}

describe('films in a read-only root folder', () => {
  test('are never searched or grabbed on their own, and come back when it’s managed', async () => {
    const { rt, folder, add, grabs } = await start()
    const sintel = await add(SINTEL)
    const bunny = await add(BIG_BUCK_BUNNY)
    const bunnyVersion = bunny.movie.versions[0]?.id
    const sintelVersion = sintel.movie.versions[0]?.id
    if (!bunnyVersion || !sintelVersion) throw new Error('no version')
    await underCutoff(rt, bunnyVersion)
    // on a managed folder both are wanted: one missing, one under its cutoff
    expect(rt.movies.wanted.missing().items.map((m) => m.id)).toEqual([SINTEL])
    expect(rt.movies.wanted.cutoff().items.map((m) => m.id)).toEqual([BIG_BUCK_BUNNY])

    rt.media.rootFolders.setReadOnly(folder.id, true)

    // RSS has no film to read the feeds for
    expect(rt.movies.wanted.rssTargets()).toEqual([])
    expect((await rt.automation.rss()).matched).toEqual([])
    // the sweep takes neither, so neither uses up a run
    expect(await rt.automation.sweep()).toEqual([])
    // Wanted's lists and their counts are empty, so Search all has nothing to queue
    const missing = rt.movies.wanted.missing()
    const cutoff = rt.movies.wanted.cutoff()
    expect([missing.items, missing.total, cutoff.items, cutoff.total]).toEqual([[], 0, [], 0])
    // nothing is wanted, so a held release or a search queued before the switch grabs nothing
    expect(rt.movies.wanted.wants(SINTEL)).toEqual([])
    expect(rt.movies.wanted.wants(BIG_BUCK_BUNNY)).toEqual([])
    expect(await rt.automation.searchMovie(SINTEL)).toBe(false)
    expect(await rt.automation.searchMovie(BIG_BUCK_BUNNY)).toBe(false)
    rt.jobs.enqueue('movies.held', { tmdbId: SINTEL, versionId: sintelVersion })
    rt.jobs.enqueue('movies.search', { tmdbId: BIG_BUCK_BUNNY })
    await rt.jobs.tick()
    await rt.jobs.idle()
    // a Search on them is refused, as a show's is, and queues nothing
    const searches = rt.jobs.list({ type: 'movies.search' }).length
    expect(() => rt.movies.bulk({ action: 'search', ids: [SINTEL, BIG_BUCK_BUNNY] })).toThrow(
      expect.objectContaining({ code: 'conflict', details: { reason: 'read-only' } }),
    )
    expect(rt.jobs.list({ type: 'movies.search' })).toHaveLength(searches)
    // the download queue stays empty
    expect(grabs()).toEqual([])
    // both stay monitored, and the calendar keeps their dates
    expect(rt.movies.wanted.calendar('2008-01-01', '2008-12-31').map((e) => e.movie.id)).toContain(
      BIG_BUCK_BUNNY,
    )
    expect(rt.movies.wanted.calendar('2010-01-01', '2010-12-31').map((e) => e.movie.id)).toContain(
      SINTEL,
    )

    // switched to managed: both are wanted again at once, and the sweep searches and grabs them
    rt.media.rootFolders.setReadOnly(folder.id, false)
    expect(rt.movies.wanted.rssTargets().map((t) => t.tmdbId)).toEqual(
      expect.arrayContaining([SINTEL, BIG_BUCK_BUNNY]),
    )
    expect(rt.movies.wanted.missing().items.map((m) => m.id)).toEqual([SINTEL])
    expect(rt.movies.wanted.cutoff().items.map((m) => m.id)).toEqual([BIG_BUCK_BUNNY])
    expect((await rt.automation.sweep()).sort()).toEqual([BIG_BUCK_BUNNY, SINTEL].sort())
    expect(grabs().sort()).toEqual([
      'Big.Buck.Bunny.2008.1080p.BluRay.x264-GRP',
      'Sintel.2010.1080p.BluRay.x264-GRP',
    ])
  })
})

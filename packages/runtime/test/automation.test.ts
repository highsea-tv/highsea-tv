// SPDX-License-Identifier: AGPL-3.0-only
// Automation (checkpoint 8a) in the booted runtime, against the fake indexer and TMDB's recordings:
// RSS grabs a release once across two runs and only what's new, a blocklisted release is refused,
// a file under the cutoff is upgraded by a search, the sweep searches what's due, and a movie
// deleted with "Don't add it again" is excluded from lists; and a profile's Wait before grabbing
// (8c) holds RSS's find back until its wait is up.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFakeClock, type FakeClock, type Fetch } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import {
  createFakeIndexer,
  FAKE_CREDENTIALS,
  FAKE_NOW,
  FAKE_ORIGIN,
} from '@highsea-tv/indexers/fake'
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

async function start({ clock }: { clock?: FakeClock } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'highsea-rt-automation-'))
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
    clock,
  })
  await rt.metadata.settings.setKey('test-tmdb-key')
  rt.metadata.settings.update({ region: 'US' })
  const root = join(dir, 'data', 'media', 'movies')
  mkdirSync(root, { recursive: true })
  rt.media.rootFolders.add(root)
  const { indexer } = await rt.indexers.add('generic-torznab', {
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
  return { rt, fake, indexer, root, add, grabs }
}

describe('RSS', () => {
  test('grabs a new release once across two runs, and only what’s new', async () => {
    const { rt, fake, add, grabs } = await start()
    await add(SINTEL)
    const first = await rt.automation.rss()
    expect(first.matched).toEqual([SINTEL])
    // HD 1080p's best: the Bluray (the 2160p isn't in the profile, the DVDRip below it)
    expect(grabs()).toEqual(['Sintel.2010.1080p.BluRay.x264-GRP'])

    // the feed again: nothing new, nothing grabbed
    await add(BIG_BUCK_BUNNY)
    const second = await rt.automation.rss()
    expect(second.matched).toEqual([])
    expect(grabs()).toHaveLength(1)

    // a new upload for a wanted movie is grabbed on the next run
    fake.publish({
      id: 900,
      name: 'Big.Buck.Bunny.2008.1080p.WEB-DL.DDP5.1.H.264-NEW',
      size: 3 * GB,
      seeders: 40,
      leechers: 1,
      category: 2040,
      tmdbId: BIG_BUCK_BUNNY,
      imdbId: 'tt1254207',
      ageMinutes: 1,
      freeleech: false,
      grabs: 0,
    })
    const third = await rt.automation.rss()
    expect(third.matched).toEqual([BIG_BUCK_BUNNY])
    expect(grabs()).toContain('Big.Buck.Bunny.2008.1080p.WEB-DL.DDP5.1.H.264-NEW')
    expect(grabs()).not.toContain('Big.Buck.Bunny.2008.1080p.BluRay.x264-GRP')
  })

  test('a blocklisted release is refused', async () => {
    const { rt, add, grabs } = await start()
    await add(SINTEL)
    await rt.automation.rss()
    const [first] = rt.downloads.queue()
    if (!first) throw new Error('nothing grabbed')
    await rt.downloads.remove(first.id, { deleteData: true, blocklist: true })
    // the same releases come round again (as if re-posted): the blocklisted one is judged so
    rt.db.delete(schema.rssSeen).run()
    // nothing else in the feed suits HD 1080p, so nothing matches and nothing is grabbed
    expect((await rt.automation.rss()).matched).toEqual([])
    // the removed download left the queue, and nothing took its place
    expect(grabs()).toEqual([])
    // a search judges with the blocklist too, so the release shows why
    const input = rt.automation.inputFor(SINTEL)
    if (!input) throw new Error('not in the library')
    const found = await rt.indexers.search(input)
    const blocked = found.releases.find((r) => r.title === 'Sintel.2010.1080p.BluRay.x264-GRP')
    expect(blocked?.approved).toBe(false)
    expect(blocked?.reasons).toContainEqual({
      kind: 'rejected',
      message: 'On this movie’s blocklist',
    })
  })
})

describe('wait before grabbing', () => {
  test('RSS holds a new release back, and the held job grabs it once the wait is up', async () => {
    // the fake indexer's uploads are dated from its fixed now, so the server's clock is too
    const clock = createFakeClock(FAKE_NOW)
    const { rt, fake, add, grabs } = await start({ clock })
    // a first run reads the feed, so only what's published after it is new
    await add(SINTEL)
    await rt.automation.rss()
    expect(grabs()).toEqual(['Sintel.2010.1080p.BluRay.x264-GRP'])
    const { id: _, builtIn: __, ...hd } = rt.media.profiles.get('qp-hd')
    rt.media.profiles.save('qp-hd', { ...hd, waitMinutes: 120 })
    await add(BIG_BUCK_BUNNY)
    const release = (id: number, name: string) =>
      fake.publish({
        id,
        name,
        size: 3 * GB,
        seeders: 40,
        leechers: 1,
        category: 2040,
        tmdbId: BIG_BUCK_BUNNY,
        imdbId: 'tt1254207',
        ageMinutes: 1,
        freeleech: false,
        grabs: 0,
      })
    // a WEB-DL, below HD 1080p's most preferred Bluray-1080p, uploaded a minute ago
    release(901, 'Big.Buck.Bunny.2008.1080p.WEB-DL.DDP5.1.H.264-NEW')
    expect((await rt.automation.rss()).matched).toEqual([BIG_BUCK_BUNNY])
    expect(grabs()).toEqual(['Sintel.2010.1080p.BluRay.x264-GRP'])
    const heldJobs = () =>
      rt.db.select().from(schema.jobs).where(eq(schema.jobs.type, 'movies.held')).all()
    // two hours from the upload, not from now
    expect(heldJobs().map((j) => j.runAt)).toEqual([FAKE_NOW + 119 * 60_000])

    // another upload for it: still held, under the same job
    release(902, 'Big.Buck.Bunny.2008.720p.WEB-DL.DDP5.1.H.264-NEW')
    await rt.automation.rss()
    expect(heldJobs()).toHaveLength(1)
    expect(grabs()).toHaveLength(1)

    // the wait is up: the job grabs the best release found
    clock.advance(120 * 60_000)
    await rt.jobs.tick()
    await rt.jobs.idle()
    expect(grabs()).toContain('Big.Buck.Bunny.2008.1080p.WEB-DL.DDP5.1.H.264-NEW')
  })
})

describe('upgrades and the sweep', () => {
  test('a file under the cutoff is upgraded by a search; nothing worse is grabbed', async () => {
    const { rt, add, grabs } = await start()
    const { movie } = await add(SINTEL)
    // a WEB 1080p file: HD 1080p's cutoff is Bluray-1080p
    const row = rt.db
      .select()
      .from(schema.mediaItems)
      .where(eq(schema.mediaItems.tmdbId, SINTEL))
      .get()
    const version = movie.versions[0]
    if (!row || !version) throw new Error('not added')
    rt.db
      .insert(schema.mediaFiles)
      .values({
        id: 'fil_web',
        itemId: row.id,
        versionId: version.id,
        path: `${row.path}/Sintel (2010) WEBDL-1080p.mkv`,
        size: 3 * GB,
        quality: 'WEB 1080p',
        sceneName: 'Sintel.2010.1080p.WEB-DL.x264-GRP',
        addedAt: rt.clock.now(),
      })
      .run()
    rt.db
      .update(schema.versions)
      .set({ fileId: 'fil_web' })
      .where(eq(schema.versions.id, version.id))
      .run()
    rt.db
      .update(schema.mediaItems)
      .set({ status: 'available' })
      .where(eq(schema.mediaItems.id, row.id))
      .run()
    rt.movies.wanted.backfill()
    expect(rt.movies.wanted.cutoff().items.map((m) => m.id)).toEqual([SINTEL])
    expect(rt.movies.wanted.wants(SINTEL)).toEqual([{ versionId: version.id, upgrade: true }])

    expect(await rt.automation.searchMovie(SINTEL)).toBe(true)
    expect(grabs()).toEqual(['Sintel.2010.1080p.BluRay.x264-GRP'])
    const judged = rt.indexers.releases(SINTEL)
    // the 720p WEB-DL is worse than the file, so it isn't an upgrade
    expect(judged.find((r) => r.title.includes('720p'))?.approved).toBe(false)
  })

  test('the sweep searches what’s due and pushes it back', async () => {
    const { rt, add, grabs } = await start()
    await add(SINTEL)
    const due = await rt.automation.sweep()
    expect(due).toEqual([SINTEL])
    expect(grabs()).toEqual(['Sintel.2010.1080p.BluRay.x264-GRP'])
    // searched just now: not due again yet
    expect(await rt.automation.sweep()).toEqual([])
  })
})

describe('lists in the runtime', () => {
  test('a movie deleted with “Don’t add it again” is excluded', async () => {
    const { rt, add } = await start()
    await add(SINTEL)
    rt.excludeFromLists([SINTEL, 999])
    expect(rt.lists.exclusions()).toEqual([
      { tmdbId: SINTEL, title: 'Sintel', year: 2010, createdAt: expect.any(String) },
    ])
    expect(rt.lists.trakt.status()).toEqual({ available: false, account: null })
    expect(rt.jobs.tasks().map((t) => t.type)).toEqual(
      expect.arrayContaining(['indexers.rss', 'movies.wanted', 'lists.sync']),
    )
  })
})

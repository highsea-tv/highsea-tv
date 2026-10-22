// SPDX-License-Identifier: AGPL-3.0-only
// Tags in the booted runtime (checkpoint 8c), against the fake indexer, the lists' fake, the
// channels' fake and TMDB's recordings, scoped as Radarr scopes them
// (wiki.servarr.com/radarr/settings#tags): an indexer with tags serves only movies sharing one, in
// a search and in RSS; a list gives its tags to the movies it adds, and its folder's default
// language profile when it has none of its own; a connection with tags hears a movie's events only
// for movies sharing one, and everything else as before.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Fetch } from '@highsea/core'
import { schema } from '@highsea/db'
import { createFakeIndexer, FAKE_CREDENTIALS, FAKE_ORIGIN } from '@highsea/indexers/fake'
import { createFakeLists, GENERIC_LIST } from '@highsea/lists/fake'
import { createReplayFetch } from '@highsea/metadata/replay'
import { createFakeNotifications } from '@highsea/notifications/fake'
import { NOTIFICATION_EVENTS } from '@highsea/notifications/shared'
import { boot, getRuntime, hasRuntime, loadConfig, UPDATES_TOPIC } from '../src/index.ts'

const SINTEL = 45745
const GENERIC_URL = 'https://lists.example/blender.json'
const dirs: string[] = []

afterEach(async () => {
  if (hasRuntime()) await getRuntime().shutdown()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

async function start() {
  const dir = mkdtempSync(join(tmpdir(), 'highsea-rt-tags-'))
  dirs.push(dir)
  const fake = createFakeIndexer()
  const replay = createReplayFetch()
  const fetch: Fetch = (input, init) =>
    String(input instanceof Request ? input.url : input).startsWith(FAKE_ORIGIN)
      ? fake.fetch(input, init)
      : replay(input, init)
  const channels = createFakeNotifications()
  const lists = createFakeLists()
  lists.generic.set(GENERIC_URL, { body: GENERIC_LIST })
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
    lists: { fetch: lists.fetch },
    notifications: { fetch: channels.fetch },
  })
  await rt.metadata.settings.setKey('test-tmdb-key')
  rt.metadata.settings.update({ region: 'US' })
  const root = join(dir, 'data', 'media', 'movies')
  mkdirSync(root, { recursive: true })
  const folder = rt.media.rootFolders.add(root)
  const { indexer } = await rt.indexers.add('generic-torznab', {
    settings: { baseUrl: `${FAKE_ORIGIN}/torznab`, apiKey: FAKE_CREDENTIALS.torznabKey },
  })
  const kids = rt.media.tags.add('kids')
  const add = (tmdbId: number, tags: string[] = []) =>
    rt.movies.add({
      tmdbId,
      rootFolder: root,
      monitored: true,
      minimumAvailability: 'released',
      languageProfileId: null,
      tags,
      versions: [{ label: '1080p', qualityProfileId: 'qp-hd' }],
    })
  return { rt, root, folder, indexer, kids, add }
}

describe('indexers', () => {
  test('a tagged indexer searches only for movies sharing a tag', async () => {
    const { rt, indexer, kids, add } = await start()
    await add(SINTEL)
    rt.indexers.update(indexer.id, { tags: [kids.id] })
    const input = rt.automation.inputFor(SINTEL)
    if (!input) throw new Error('not in the library')
    expect((await rt.indexers.search(input)).searched).toBe(0)

    rt.movies.update(SINTEL, { tags: [kids.id] })
    const tagged = rt.automation.inputFor(SINTEL)
    if (!tagged) throw new Error('not in the library')
    expect(tagged.tags).toEqual([kids.id])
    expect((await rt.indexers.search(tagged)).searched).toBe(1)
  })

  test('RSS takes a tagged indexer’s releases only for movies sharing a tag', async () => {
    const { rt, indexer, kids, add } = await start()
    await add(SINTEL)
    rt.indexers.update(indexer.id, { tags: [kids.id] })
    expect((await rt.automation.rss()).matched).toEqual([])
    // the same feed again, now that Sintel shares the tag
    rt.db.delete(schema.rssSeen).run()
    rt.movies.update(SINTEL, { tags: [kids.id] })
    expect((await rt.automation.rss()).matched).toEqual([SINTEL])
  })
})

describe('lists', () => {
  test('a list gives its tags, and its folder’s language profile when it has none', async () => {
    const { rt, root, folder, kids } = await start()
    const [profile] = rt.subtitles.profiles.list()
    if (!profile) throw new Error('no seeded language profile')
    rt.media.rootFolders.setLanguageProfile(folder.id, profile.id)
    const list = rt.lists.add({
      name: 'Blender',
      enabled: false,
      settings: { kind: 'generic', url: GENERIC_URL },
      rootFolder: root,
      qualityProfileId: 'qp-hd',
      languageProfileId: null,
      monitored: true,
      minimumAvailability: 'released',
      searchOnAdd: false,
      tags: [kids.id],
    })
    expect(list.tags).toEqual([kids.id])
    expect((await rt.lists.sync(list.id)).added).toBeGreaterThan(0)
    const added = rt.movies.list({}).items
    expect(added.length).toBeGreaterThan(0)
    for (const m of added) {
      expect(m.tags).toEqual([kids.id])
      expect(m.languageProfileId).toBe(profile.id)
    }
    expect(() =>
      rt.lists.update(list.id, { ...list, settings: list.settings, tags: ['tag_gone'] }),
    ).toThrow('doesn’t exist')
  })
})

describe('connections', () => {
  test('a tagged connection hears a movie’s events only for movies sharing a tag', async () => {
    const { rt, kids, add } = await start()
    const hook = rt.notifications.add({
      kind: 'webhook',
      name: 'Kids',
      enabled: true,
      events: [...NOTIFICATION_EVENTS],
      settings: { url: 'https://hooks.example.org/kids' },
      tags: [kids.id],
    })
    const sent = () =>
      rt.notifications
        .log({ connectionId: hook.id })
        .map((e) => e.event)
        .reverse()
    await add(SINTEL)
    rt.notifications.movieAdded(SINTEL, 'Owner')
    expect(sent()).toEqual([])
    // events about no movie reach it as before
    rt.events.emit({ topic: UPDATES_TOPIC, ids: ['9.9.9'] })
    expect(sent()).toEqual(['update'])
  })

  test('…and does hear them for a movie that shares one', async () => {
    const { rt, kids, add } = await start()
    const hook = rt.notifications.add({
      kind: 'webhook',
      name: 'Kids',
      enabled: true,
      events: [...NOTIFICATION_EVENTS],
      settings: { url: 'https://hooks.example.org/kids' },
      tags: [kids.id],
    })
    await add(SINTEL, [kids.id])
    rt.notifications.movieAdded(SINTEL, 'Owner')
    expect(rt.notifications.log({ connectionId: hook.id }).map((e) => e.event)).toEqual([
      'movie-added',
    ])
    expect(rt.media.tags.get(kids.id).usage).toEqual({
      movies: 1,
      indexers: 0,
      lists: 0,
      connections: 1,
    })
  })
})

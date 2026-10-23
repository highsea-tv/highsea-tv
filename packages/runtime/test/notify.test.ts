// SPDX-License-Identifier: AGPL-3.0-only
// Notifications in the booted runtime (8b, ADR 0046), against the fake indexer, TMDB's recordings,
// a fake probe and the channels' fake: each thing that happens queues one message per connection
// that hears it, and the same thing again queues nothing. A grab, an import and an upgrade (one
// message to a connection that hears both), a download given up on, a subtitle once it's synced,
// a health issue and its clearing, an update, and a list run as one message. A poster's address is
// signed, and only a matching signature passes.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Fetch } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { DOWNLOADS_REPLACE_JOB } from '@highsea-tv/downloads'
import { createFakeIndexer, FAKE_CREDENTIALS, FAKE_ORIGIN } from '@highsea-tv/indexers/fake'
import { createFakeLists, GENERIC_LIST } from '@highsea-tv/lists/fake'
import type { MediaInfo } from '@highsea-tv/media/shared'
import { createReplayFetch } from '@highsea-tv/metadata/replay'
import { createFakeNotifications } from '@highsea-tv/notifications/fake'
import { NOTIFICATION_EVENTS } from '@highsea-tv/notifications/shared'
import { eq } from 'drizzle-orm'
import { boot, getRuntime, hasRuntime, loadConfig, UPDATES_TOPIC } from '../src/index.ts'

const SINTEL = 45745
const GENERIC_URL = 'https://lists.example/blender.json'
const HOOK = 'https://hooks.example.org/highsea'
const dirs: string[] = []

afterEach(async () => {
  if (hasRuntime()) await getRuntime().shutdown()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** A two-hour 1080p film, whatever the file holds. */
const probe = async (): Promise<MediaInfo> => ({
  duration: 7200,
  container: 'matroska,webm',
  video: {
    index: 0,
    codec: 'h264',
    codecTag: null,
    profile: 'High',
    width: 1920,
    height: 1080,
    bitDepth: 8,
    bitrate: 8_000_000,
    colorPrimaries: null,
    colorTransfer: null,
    hdr: 'none',
    dolbyVision: null,
  },
  audio: [],
  subtitles: [],
})

async function start() {
  const dir = mkdtempSync(join(tmpdir(), 'highsea-rt-notify-'))
  dirs.push(dir)
  const indexer = createFakeIndexer()
  const replay = createReplayFetch()
  const fetch: Fetch = (input, init) =>
    String(input instanceof Request ? input.url : input).startsWith(FAKE_ORIGIN)
      ? indexer.fetch(input, init)
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
    importing: { probe, sampleSeconds: 1 },
    lists: { fetch: lists.fetch },
    notifications: { fetch: channels.fetch },
  })
  await rt.metadata.settings.setKey('test-tmdb-key')
  rt.metadata.settings.update({ region: 'US' })
  const root = join(dir, 'data', 'media', 'movies')
  mkdirSync(root, { recursive: true })
  rt.media.rootFolders.add(root)
  await rt.indexers.add('generic-torznab', {
    settings: { baseUrl: `${FAKE_ORIGIN}/torznab`, apiKey: FAKE_CREDENTIALS.torznabKey },
  })
  // a webhook that hears everything
  const hook = rt.notifications.add({
    kind: 'webhook',
    name: 'Everything',
    enabled: true,
    events: [...NOTIFICATION_EVENTS],
    settings: { url: HOOK },
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
  /** The events queued for a connection, oldest first. */
  const sent = (connectionId = hook.id) =>
    rt.notifications
      .log({ connectionId })
      .map((e) => e.event)
      .reverse()
  /** A finished download's folder, holding one file. */
  const download = (release: string) => {
    const folder = join(rt.folders().downloads, release)
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, `${release}.mkv`), Buffer.alloc(1024 * 1024))
    return folder
  }
  return { rt, hook, add, sent, channels, download, root }
}

const itemOf = (rt: Awaited<ReturnType<typeof start>>['rt'], tmdbId: number) => {
  const row = rt.db
    .select()
    .from(schema.mediaItems)
    .where(eq(schema.mediaItems.tmdbId, tmdbId))
    .get()
  if (!row) throw new Error('not in the library')
  return row
}

describe('downloads and imports', () => {
  test('a grab, an import and an upgrade, each once', async () => {
    const { rt, add, sent, download, channels } = await start()
    rt.network.save({
      ...rt.network.settings(),
      remoteAccess: 'reverse-proxy',
      externalUrl: 'https://harbor.example.net',
      tls: 'proxy',
    })
    // a connection for first imports only
    const imports = rt.notifications.add({
      kind: 'webhook',
      name: 'Imports',
      enabled: true,
      events: ['imported'],
      settings: { url: `${HOOK}/imports` },
    })
    await add(SINTEL)
    await rt.automation.rss()
    expect(sent()).toEqual(['grabbed'])
    const item = itemOf(rt, SINTEL)

    const web = 'Sintel.2010.1080p.WEB-DL.x264-GRP'
    const first = { itemId: item.id, releaseTitle: web, quality: 'WEB 1080p', downloadId: 'dl_web' }
    expect((await rt.movies.importDownload({ ...first, folder: download(web) })).status).toBe(
      'imported',
    )
    // the same import again: already done, nothing new
    await rt.movies.importDownload({ ...first, folder: download(web) })
    expect(sent()).toEqual(['grabbed', 'imported'])

    const bluray = 'Sintel.2010.1080p.BluRay.x264-GRP'
    const upgrade = await rt.movies.importDownload({
      itemId: item.id,
      releaseTitle: bluray,
      quality: 'Bluray-1080p',
      downloadId: 'dl_bluray',
      folder: download(bluray),
    })
    expect(upgrade.status).toBe('imported')
    // one message for a connection that hears both: Upgraded
    expect(sent()).toEqual(['grabbed', 'imported', 'upgraded'])
    expect(sent(imports.id)).toEqual(['imported', 'imported'])

    // sent through the webhook, the upgrade names what it replaced, with a signed poster
    await rt.jobs.tick()
    await rt.jobs.idle()
    const bodies = channels
      .to(HOOK)
      .filter((r) => !r.url.endsWith('/imports'))
      .map((r) => r.json() as { event: string; text: string; image: string | null; url: string })
    const upgraded = bodies.find((b) => b.event === 'upgraded')
    expect(upgraded?.text).toContain('to Bluray-1080p')
    expect(upgraded?.url).toBe(`https://harbor.example.net/movies/${SINTEL}`)
    const image = new URL(upgraded?.image ?? '')
    expect(image.origin).toBe('https://harbor.example.net')
    const sig = image.searchParams.get('sig')
    expect(rt.notifications.verifyImage(image.pathname, sig)).toBe(true)
    expect(rt.notifications.verifyImage(image.pathname, 'forged')).toBe(false)
    expect(rt.notifications.verifyImage(`${image.pathname}x`, sig)).toBe(false)
  })

  test('a stalled download given up on, once, and not a person’s Find another', async () => {
    const { rt, add, sent } = await start()
    await add(SINTEL)
    await rt.automation.rss()
    const [grabbed] = rt.downloads.queue()
    const torrentId = rt.db
      .select({ torrentId: schema.downloads.torrentId })
      .from(schema.downloads)
      .where(eq(schema.downloads.id, grabbed?.id ?? ''))
      .get()?.torrentId
    if (!torrentId) throw new Error('nothing grabbed')
    rt.jobs.enqueue(DOWNLOADS_REPLACE_JOB, { torrentId, reason: 'No seeds for 3 hours.' })
    await rt.jobs.tick()
    await rt.jobs.idle()
    const log = rt.notifications.log({ connectionId: undefined })
    const failed = log.filter((e) => e.event === 'download-failed')
    expect(failed).toHaveLength(1)
    // the replacement's grab is its own message
    expect(sent().filter((e) => e === 'grabbed').length).toBeGreaterThanOrEqual(1)

    // a person's Find another isn't a failure to announce
    const [next] = rt.downloads.queue().filter((q) => q.id !== grabbed?.id)
    if (next) {
      await rt.downloads.searchAlternative(next.id, 'Wrong language.')
      expect(sent().filter((e) => e === 'download-failed')).toHaveLength(1)
    }
  })
})

describe('subtitles', () => {
  test('one message once the sync is done; a re-sync sends nothing', async () => {
    const { rt, add, sent } = await start()
    await add(SINTEL)
    const item = itemOf(rt, SINTEL)
    const now = rt.clock.now()
    rt.db
      .insert(schema.mediaFiles)
      .values({
        id: 'fil_sintel',
        itemId: item.id,
        versionId: null,
        path: `${item.path}/Sintel (2010).mkv`,
        size: 1,
        quality: 'Bluray-1080p',
        addedAt: now,
      })
      .run()
    const track = {
      id: 'sub_fr',
      mediaFileId: 'fil_sintel',
      itemId: item.id,
      language: 'fr',
      forced: false,
      hi: false,
      format: 'srt' as const,
      kind: 'external' as const,
      path: `${item.path}/Sintel (2010).fr.srt`,
      provider: 'opensubtitles',
      providerSubtitleId: '42',
      score: 90,
      syncStatus: 'queued' as const,
      createdAt: now,
      updatedAt: now,
    }
    rt.db.insert(schema.subtitleFiles).values(track).run()
    const write = (type: 'subtitle-downloaded' | 'subtitle-synced', key: string) =>
      rt.media.history.write({
        itemId: item.id,
        type,
        sourceTitle: 'Sintel.2010.fr',
        data: { key, trackId: track.id },
      })
    // downloaded with Sync to the audio on: the sync says the rest
    write('subtitle-downloaded', 'k1')
    expect(sent()).toEqual([])
    write('subtitle-synced', 'job1')
    expect(sent()).toEqual(['subtitle-added'])
    // synced again later: the same subtitle, no new message
    write('subtitle-synced', 'job2')
    expect(sent()).toEqual(['subtitle-added'])
  })
})

describe('health, updates and lists', () => {
  test('an issue once when it appears and once when it clears', async () => {
    const { rt, sent } = await start()
    rt.notifications.checkHealth()
    const before = sent().length
    const network = rt.network.settings()
    // an external URL that isn't HTTPS is a warning
    rt.network.save({
      ...network,
      remoteAccess: 'reverse-proxy',
      externalUrl: 'http://harbor.example.net',
    })
    expect(rt.notifications.checkHealth()).toBe(1)
    expect(rt.notifications.checkHealth()).toBe(0)
    rt.network.save(network)
    expect(rt.notifications.checkHealth()).toBe(1)
    expect(sent().slice(before)).toEqual(['health', 'health'])
    await rt.jobs.tick()
    await rt.jobs.idle()
  })

  test('a new version once, however often it’s announced', async () => {
    const { rt, sent } = await start()
    rt.events.emit({ topic: UPDATES_TOPIC, ids: ['9.9.9'] })
    rt.events.emit({ topic: UPDATES_TOPIC, ids: ['9.9.9'] })
    expect(sent()).toEqual(['update'])
  })

  test('a list run is one message, however many it added', async () => {
    const { rt, sent, root, channels } = await start()
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
    })
    const result = await rt.lists.sync(list.id)
    expect(result.added).toBeGreaterThan(1)
    expect(sent()).toEqual(['movie-added'])
    // checked again: nothing new, nothing sent
    await rt.lists.sync(list.id)
    expect(sent()).toEqual(['movie-added'])
    await rt.jobs.tick()
    await rt.jobs.idle()
    const [body] = channels.to(HOOK).map((r) => r.json() as { title: string; payload: object })
    expect(body?.title).toBe(`${result.added} movies were added`)
    expect(body?.payload).toMatchObject({ count: result.added, source: 'Blender', by: 'list' })
  })
})

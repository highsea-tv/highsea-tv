// SPDX-License-Identifier: AGPL-3.0-only
// A downloads service on a real engine, with the fake indexer behind it, a movie in the library,
// and an importer that records what it was asked. A second engine seeds on loopback when a test
// wants the download to finish. Nothing leaves the machine.
import {
  createEventBus,
  createFakeClock,
  createSealer,
  generateSecretKey,
  type ServerEvent,
  silentLogger,
} from '@highsea-tv/core'
import { migrate, openDatabase, schema } from '@highsea-tv/db'
import { createIndexers, type SearchInput } from '@highsea-tv/indexers'
import {
  createFakeIndexer,
  FAKE_CREDENTIALS,
  FAKE_NOW,
  FAKE_ORIGIN,
  fakeJson,
  MOVIES,
} from '@highsea-tv/indexers/fake'
import { createJobQueue } from '@highsea-tv/jobs'
import {
  defaultQualitySizes,
  type QualityProfile,
  seedFormats,
  seedProfiles,
} from '@highsea-tv/quality'
import type { Definition } from '@highsea-tv/schemas/indexers'
import type { EngineEvent } from '@highsea-tv/torrent'
import {
  LOOPBACK,
  makeTorrent,
  startTracker,
  tempDir,
  testEngine,
  until,
  writeFiles,
} from '@highsea-tv/torrent/testing'
import {
  createDownloads,
  type HistoryEntry,
  type ImportInput,
  type ImportOutcome,
} from '../src/index.ts'

export { LOOPBACK, makeTorrent, tempDir, testEngine, until, writeFiles }

/** HD 1080p with every quality allowed, so a replaced release has others to fall back on. */
const hd = seedProfiles().find((p) => p.id === 'qp-hd') as QualityProfile
const everything: QualityProfile = {
  ...hd,
  items: hd.items.map((i) => ({ ...i, allowed: true })),
}

export const ITEM = 'itm_sintel'
export const VERSION = 'ver_sintel'

export function sintelSearch(): SearchInput {
  return {
    tmdbId: MOVIES.sintel.tmdbId,
    imdbId: MOVIES.sintel.imdbId,
    title: MOVIES.sintel.title,
    year: MOVIES.sintel.year,
    movie: { title: 'Sintel', year: 2010, runtimeMinutes: 15, originalLanguage: 'en' },
    profile: everything,
    formats: seedFormats(),
    sizes: defaultQualitySizes(),
  }
}

const blockedVet = (files: { path: string }[]) => {
  const exe = files.find((f) => /\.(bat|cmd|exe|sh)$/i.test(f.path))
  return exe
    ? `The release contains an executable file (${exe.path.split('/').pop()}). It wasn’t downloaded, and it has been blocklisted.`
    : null
}

export async function setup(
  options: { importer?: (input: ImportInput) => Promise<ImportOutcome> } = {},
) {
  const database = openDatabase(':memory:')
  migrate(database.raw)
  const { db } = database
  const clock = createFakeClock(Date.now())
  const events = createEventBus({ now: clock.now })
  const seen: ServerEvent[] = []
  events.subscribe((e) => seen.push(e))
  const jobs = createJobQueue({ db, clock, events })

  const indexerClock = createFakeClock(FAKE_NOW)
  const fake = createFakeIndexer()
  const definition: Definition = fakeJson(FAKE_ORIGIN)
  const indexers = createIndexers({
    db,
    jobs,
    clock: indexerClock,
    logger: silentLogger,
    events,
    sealer: createSealer(generateSecretKey()),
    fetch: fake.fetch,
    definitions: {
      definitions: () => [{ definition, origin: 'main', logo: null }],
      definition: (id) =>
        id === definition.id ? { definition, origin: 'main', logo: null } : null,
      onDefinitionsChanged: () => () => {},
    },
    sleep: async (ms) => indexerClock.advance(ms),
    random: () => 0.5,
    timeoutMs: 2000,
  })
  const { indexer } = await indexers.add(definition.id, {
    settings: { passkey: FAKE_CREDENTIALS.jsonPasskey },
  })

  const now = clock.now()
  db.insert(schema.mediaItems)
    .values({
      id: ITEM,
      type: 'movie',
      tmdbId: MOVIES.sintel.tmdbId,
      title: 'Sintel',
      sortTitle: 'sintel',
      year: 2010,
      status: 'wanted',
      monitored: true,
      minimumAvailability: 'released',
      qualityProfileId: 'qp-any',
      rootFolder: '/data/media/movies',
      path: '/data/media/movies/Sintel (2010)',
      addedAt: now,
      updatedAt: now,
    })
    .run()
  db.insert(schema.versions)
    .values({
      id: VERSION,
      itemId: ITEM,
      label: 'Any',
      qualityProfileId: 'qp-any',
      position: 0,
      createdAt: now,
    })
    .run()

  const history: HistoryEntry[] = []
  const imports: ImportInput[] = []
  const searches: string[] = []
  const downloadsDir = tempDir('downloads')
  let onEvent: (e: EngineEvent) => void = () => {}
  const leech = testEngine({ db: database, vet: blockedVet, onEvent: (e) => onEvent(e) })
  await leech.engine.start()
  await leech.engine.setBinding(LOOPBACK)

  const downloads = createDownloads({
    db,
    clock,
    logger: silentLogger,
    events,
    jobs,
    engine: leech.engine,
    indexers,
    fetch: fake.fetch,
    movie: (itemId) =>
      itemId === ITEM ? { tmdbId: MOVIES.sintel.tmdbId, title: 'Sintel', year: 2010 } : null,
    search: async (itemId) => {
      searches.push(itemId)
      return (await indexers.search(sintelSearch())).releases
    },
    downloadsFolder: () => downloadsDir,
    history: (entry) => history.push(entry),
    importer: async (input) => {
      imports.push(input)
      return options.importer ? options.importer(input) : { ok: true, transfer: 'hardlink' }
    },
  })
  onEvent = downloads.onEngineEvent
  downloads.defineJobs()
  const stop = downloads.start()

  /** Runs every job that's due, until none is. */
  async function drain() {
    for (let i = 0; i < 20; i++) {
      await jobs.tick()
      await jobs.idle()
      if (!jobs.list({ status: ['queued'] }).some((j) => j.runAt <= clock.now())) return
    }
  }

  const closers: (() => Promise<void> | void)[] = [stop, () => leech.engine.close()]

  /** A second engine seeding these files, with the fake indexer serving its `.torrent` as `releaseId`. */
  async function seed(
    releaseId: number,
    files: { path: string; data: Uint8Array }[],
    name: string,
  ) {
    const tracker = await startTracker()
    closers.push(() => tracker.close())
    const t = makeTorrent({ name, files, announce: [tracker.httpUrl] })
    const dir = tempDir('seed')
    writeFiles(dir, files)
    const seeder = testEngine()
    closers.push(() => seeder.engine.close())
    await seeder.engine.start()
    await seeder.engine.setBinding(LOOPBACK)
    const { id } = await seeder.engine.add({
      source: { torrent: t.torrent },
      savePath: dir,
      category: 'movies',
    })
    await until(() => seeder.engine.get(id).state === 'seeding', 10_000, 'the seeder')
    fake.serve(releaseId, t.torrent)
    return { ...t, tracker, seeder }
  }

  return {
    db,
    clock,
    events,
    seen,
    jobs,
    fake,
    indexers,
    indexer,
    engine: leech.engine,
    downloads,
    downloadsDir,
    history,
    imports,
    searches,
    drain,
    seed,
    async close() {
      for (const c of closers.reverse()) await c()
    },
  }
}

// SPDX-License-Identifier: AGPL-3.0-only
// A subtitles service over an in-memory database and the fake providers, with movies and files
// written straight into the library's tables: these tests are about subtitles, not the import.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  AppError,
  createEventBus,
  createFakeClock,
  createSealer,
  generateSecretKey,
  type ServerEvent,
  silentLogger,
} from '@highsea/core'
import { migrate, openDatabase, schema } from '@highsea/db'
import { createJobQueue } from '@highsea/jobs'
import type { SubtitleInfo } from '@highsea/media/shared'
import { createMedia } from '@highsea/media/shared'
import { createSubtitles } from '../../src/movies/index.ts'
import type { SyncOutcome, SyncTask } from '../../src/sync/index.ts'
import { createFakeSubtitles, FAKE_ACCOUNTS, FAKE_OPENSUBTITLES_KEY } from '../fake/index.ts'

export const DAY = 24 * 60 * 60 * 1000

export const SINTEL = { tmdbId: 45745, imdbId: 'tt1727587', title: 'Sintel', year: 2010 }

type ProviderName = 'opensubtitles' | 'subdl' | 'subsource'

/** What the fake engine answers unless a test says otherwise: 1.2 seconds early, 92% sure. */
export const syncedOutcome = (over: Partial<SyncOutcome> = {}): SyncOutcome => ({
  correction: { ratio: 1, sections: [{ from: 0, fromMs: 0, offsetMs: 1_200 }] },
  offsetMs: 1_200,
  confidence: 0.92,
  measures: { overlap: 1, clarity: 0.92, coverage: 1 },
  raw: { lift: 0.4, significance: 9, clarity: 0.18, coverage: 1 },
  cues: 3,
  reference: 'audio',
  ...over,
})

export function setup({
  generate = true,
  providers = ['opensubtitles', 'subdl'],
}: {
  generate?: boolean
  providers?: ProviderName[]
} = {}) {
  const { db, raw } = openDatabase(':memory:')
  migrate(raw)
  const clock = createFakeClock()
  const events = createEventBus({ now: clock.now })
  const seen: ServerEvent[] = []
  events.subscribe((e) => seen.push(e))
  const jobs = createJobQueue({ db, clock, events })
  const fake = createFakeSubtitles({ clock, generate })
  const dir = mkdtempSync(join(tmpdir(), 'highsea-subtitles-'))
  const media = createMedia({ db, clock, logger: silentLogger })
  media.seed()
  // the engine is tested on real audio in test/sync; here it answers what a test sets
  const engine = {
    outcome: syncedOutcome() as SyncOutcome | Error,
    tasks: [] as SyncTask[],
    /** The engine never answers, as a sync cut short by a crash. */
    hold: false,
  }
  const service = (queue: typeof jobs) =>
    createSubtitles({
      db,
      clock,
      logger: silentLogger,
      sealer,
      fetch: fake.fetch,
      userAgent: 'highsea v0.0.0',
      openSubtitlesKey: FAKE_OPENSUBTITLES_KEY,
      jobs: queue,
      events,
      media,
      sync: (task) => {
        engine.tasks.push(task)
        if (engine.hold) return new Promise<SyncOutcome>(() => {})
        if (engine.outcome instanceof Error) return Promise.reject(engine.outcome)
        return Promise.resolve(engine.outcome)
      },
    })
  const sealer = createSealer(generateSecretKey())
  const subtitles = service(jobs)
  subtitles.seed()
  subtitles.defineJobs()
  for (const id of providers) {
    subtitles.providers.save(id, { ...FAKE_ACCOUNTS[id] })
    subtitles.providers.toggle(id, true)
  }

  let n = 0
  /** A movie in the library with one file on disk, `available`. */
  function movie({
    tmdbId = SINTEL.tmdbId,
    imdbId = SINTEL.imdbId,
    title = SINTEL.title,
    year = SINTEL.year,
    embedded = [],
    profile = 'lp-en',
    status = 'available',
    sceneName,
  }: {
    tmdbId?: number
    imdbId?: string
    title?: string
    year?: number
    embedded?: Partial<SubtitleInfo>[]
    profile?: string | null
    status?: 'available' | 'wanted'
    sceneName?: string
  } = {}) {
    const i = ++n
    const now = clock.now()
    const folder = join(dir, `${title} (${year}) ${i}`)
    mkdirSync(folder, { recursive: true })
    const path = join(folder, `${title} (${year}) Bluray-1080p.mkv`)
    writeFileSync(path, Buffer.alloc(200_000, i))
    const itemId = `itm${i}`
    db.insert(schema.movieMetadata)
      .values({
        tmdbId,
        title,
        originalTitle: title,
        year,
        language: 'en',
        data: { imdbId },
        fetchedAt: now,
      })
      .onConflictDoNothing()
      .run()
    db.insert(schema.mediaItems)
      .values({
        id: itemId,
        type: 'movie',
        tmdbId,
        title,
        sortTitle: title.toLowerCase(),
        year,
        status,
        monitored: true,
        minimumAvailability: 'released',
        qualityProfileId: 'qp-hd',
        languageProfileId: profile,
        rootFolder: dir,
        path: folder,
        addedAt: now,
        updatedAt: now,
      })
      .run()
    const fileId = `fil${i}`
    db.insert(schema.mediaFiles)
      .values({
        id: fileId,
        itemId,
        path,
        size: 200_000,
        sceneName: sceneName ?? `${title}.${year}.1080p.BluRay.x264-GRP`,
        mediaInfo: {
          probe: {
            duration: 60,
            container: 'matroska,webm',
            video: { index: 0, codec: 'h264', codecTag: null },
            audio: [
              {
                index: 1,
                codec: 'aac',
                codecTag: null,
                profile: null,
                channels: 2,
                layout: 'stereo',
                language: 'eng',
                title: null,
                default: true,
                bitrate: 128_000,
              },
            ],
            subtitles: embedded.map((s, index) => ({
              index: index + 2,
              codec: 'subrip',
              language: 'eng',
              title: null,
              forced: false,
              hi: false,
              default: false,
              ...s,
            })),
          },
        },
        addedAt: now,
      } as typeof schema.mediaFiles.$inferInsert)
      .run()
    return { itemId, fileId, path, folder, tmdbId }
  }

  /** Runs every job that's due, until none is. */
  async function drain(queue = jobs) {
    for (let i = 0; i < 20; i++) {
      await queue.tick()
      await queue.idle()
      if (!queue.list({ status: ['queued'] }).some((j) => j.runAt <= clock.now())) return
    }
  }

  /**
   * A second boot on the same database, as after a crash: a new queue recovers what was running,
   * and a new service starts. The first one's work is abandoned, not finished.
   */
  function restart() {
    const queue = createJobQueue({ db, clock, events })
    const again = service(queue)
    again.defineJobs()
    queue.recover()
    const stop = again.start()
    return { jobs: queue, subtitles: again, drain: () => drain(queue), stop }
  }

  const rows = () => db.select().from(schema.subtitleFiles).all()
  const wantedRows = () => db.select().from(schema.subtitleWanted).all()
  const history = () => db.select().from(schema.history).all()

  return {
    db,
    raw,
    clock,
    events,
    seen,
    jobs,
    fake,
    dir,
    media,
    subtitles,
    engine,
    movie,
    drain,
    restart,
    rows,
    wantedRows,
    history,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

/** `code:reason` of the AppError a call throws, or `no error`. */
export async function reason(fn: () => unknown): Promise<string> {
  try {
    await fn()
  } catch (e) {
    if (e instanceof AppError) return `${e.code}:${(e.details as { reason?: string })?.reason}`
    throw e
  }
  return 'no error'
}

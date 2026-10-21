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
import { createFakeSubtitles, FAKE_ACCOUNTS, FAKE_OPENSUBTITLES_KEY } from '../fake/index.ts'

export const DAY = 24 * 60 * 60 * 1000

export const SINTEL = { tmdbId: 45745, imdbId: 'tt1727587', title: 'Sintel', year: 2010 }

type ProviderName = 'opensubtitles' | 'subdl' | 'subsource'

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
  const subtitles = createSubtitles({
    db,
    clock,
    logger: silentLogger,
    sealer: createSealer(generateSecretKey()),
    fetch: fake.fetch,
    userAgent: 'highsea v0.0.0',
    openSubtitlesKey: FAKE_OPENSUBTITLES_KEY,
    jobs,
    events,
    media,
  })
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
            audio: [],
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
  async function drain() {
    for (let i = 0; i < 20; i++) {
      await jobs.tick()
      await jobs.idle()
      if (!jobs.list({ status: ['queued'] }).some((j) => j.runAt <= clock.now())) return
    }
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
    movie,
    drain,
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

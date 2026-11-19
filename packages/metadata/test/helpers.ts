// SPDX-License-Identifier: AGPL-3.0-only
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createEventBus,
  createFakeClock,
  createSealer,
  generateSecretKey,
  type ServerEvent,
  silentLogger,
} from '@highsea-tv/core'
import { migrate, migrations, openDatabase, type RawDatabase, schema } from '@highsea-tv/db'
import { createJobQueue } from '@highsea-tv/jobs'
import type { MetadataDeps } from '../src/context.ts'
import { createMetadata } from '../src/index.ts'
import { createReplayFetch, type ReplayOptions } from '../src/replay.ts'

/** Not a real key: the replay accepts anything that doesn't start with `invalid`. */
export const TEST_KEY = 'test-key-for-replay-0001'

export const DAY = 24 * 60 * 60 * 1000

export async function setup({
  key = true,
  builtInKey,
  onRequest,
  resizeImage,
  fanartKey,
  before,
}: {
  key?: boolean
  /** highsea's fanart.tv project key, as the image would carry it (HT-74). */
  fanartKey?: string
  /**
   * A database from an earlier release: migrated up to and including `before.tag`, then `fill`
   * writes its rows in that release's shape, then the rest of the migrations run, as an update's
   * boot does.
   */
  before?: { tag: string; fill: (raw: RawDatabase) => void }
  /** highsea's own key, as the image carries it. */
  builtInKey?: string
  onRequest?: ReplayOptions['onRequest']
  /** Uploaded artwork's sizes; none serves the original at every size. */
  resizeImage?: MetadataDeps['resizeImage']
} = {}) {
  const { db, raw } = openDatabase(':memory:')
  if (before) {
    const upTo = migrations.findIndex((m) => m.tag === before.tag)
    if (upTo < 0) throw new Error(`No migration ${before.tag}`)
    migrate(raw, { all: migrations.slice(0, upTo + 1) })
    before.fill(raw)
  }
  migrate(raw)
  const clock = createFakeClock()
  const events = createEventBus({ now: clock.now })
  const seen: ServerEvent[] = []
  events.subscribe((e) => seen.push(e))
  const jobs = createJobQueue({ db, clock, events })
  const fetch = createReplayFetch({ onRequest })
  const waits: number[] = []
  const imagesDir = mkdtempSync(join(tmpdir(), 'highsea-images-'))
  const metadata = createMetadata({
    db,
    jobs,
    clock,
    logger: silentLogger,
    events,
    sealer: createSealer(generateSecretKey()),
    fetch,
    imagesDir,
    builtInKey,
    fanartKey,
    resizeImage,
    sleep: async (ms) => {
      waits.push(ms)
      clock.advance(ms)
    },
  })
  if (key) await metadata.settings.setKey(TEST_KEY)
  fetch.requests.length = 0

  /** Runs every due job, and the jobs they queue, to the end. */
  async function drain() {
    for (let i = 0; i < 20; i++) {
      await jobs.tick()
      await jobs.idle()
      if (!jobs.list({ status: ['queued'] }).some((j) => j.runAt <= clock.now())) return
    }
  }

  let n = 0
  /** A library movie, as the movie service would add it. */
  function addToLibrary(tmdbId: number) {
    const now = clock.now()
    db.insert(schema.mediaItems)
      .values({
        id: `itm_${++n}`,
        type: 'movie',
        tmdbId,
        title: `Movie ${tmdbId}`,
        sortTitle: `movie ${tmdbId}`,
        status: 'wanted',
        monitored: true,
        minimumAvailability: 'released',
        qualityProfileId: 'qp_hd',
        rootFolder: '/data/movies',
        path: `/data/movies/${tmdbId}`,
        addedAt: now,
        updatedAt: now,
      })
      .run()
  }

  return {
    db,
    raw,
    clock,
    events,
    seen,
    jobs,
    fetch,
    waits,
    imagesDir,
    metadata,
    drain,
    addToLibrary,
    cleanup: () => rmSync(imagesDir, { recursive: true, force: true }),
  }
}

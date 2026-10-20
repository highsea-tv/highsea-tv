// SPDX-License-Identifier: AGPL-3.0-only
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddMovieInput } from '@highsea/api-contract'
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
import { createMetadata } from '@highsea/metadata'
import { createReplayFetch } from '@highsea/metadata/replay'
import { createMovies } from '../../src/movies/index.ts'
import { createMedia } from '../../src/shared/index.ts'

/** Not a real key: the replay accepts anything that doesn't start with `invalid`. */
export const TEST_KEY = 'test-key-for-replay-0001'

export const DAY = 24 * 60 * 60 * 1000

/** Recorded movies (packages/metadata/test/fixtures/tmdb). */
export const SINTEL = 45745
export const BIG_BUCK_BUNNY = 10378
export const TEARS_OF_STEEL = 133701
export const ELEPHANTS_DREAM = 9761
export const METROPOLIS = 19
export const NOSFERATU = 653
export const M = 832
export const TRIP_TO_THE_MOON = 775
export const CAT_IN_THE_HAT = 1117898
export const LLAMA_DRAMA = 253777
export const GRAN_DILLAMA = 253774
export const LLAMIGOS = 406956
export const MABUSE = 5998

/** The shared media services and a movie service on an in-memory database, TMDB replayed from the recordings. */
export async function setup({ key = true }: { key?: boolean } = {}) {
  const { db, raw } = openDatabase(':memory:')
  migrate(raw)
  const clock = createFakeClock()
  const events = createEventBus({ now: clock.now })
  const seen: ServerEvent[] = []
  events.subscribe((e) => seen.push(e))
  const jobs = createJobQueue({ db, clock, events })
  const fetch = createReplayFetch()
  const dir = mkdtempSync(join(tmpdir(), 'highsea-movies-'))
  const imagesDir = join(dir, 'images')
  const library = join(dir, 'movies')
  mkdirSync(imagesDir)
  mkdirSync(library)
  const metadata = createMetadata({
    db,
    jobs,
    clock,
    logger: silentLogger,
    events,
    sealer: createSealer(generateSecretKey()),
    fetch,
    imagesDir,
    sleep: async (ms) => clock.advance(ms),
  })
  if (key) await metadata.settings.setKey(TEST_KEY)
  fetch.requests.length = 0
  const media = createMedia({ db, clock, logger: silentLogger })
  media.seed()
  const folder = media.rootFolders.add(library)
  const movies = createMovies({ db, jobs, clock, events, logger: silentLogger, metadata }, media)
  seen.length = 0

  const input = (tmdbId: number, patch: Partial<AddMovieInput> = {}): AddMovieInput => ({
    tmdbId,
    rootFolder: folder.path,
    monitored: true,
    minimumAvailability: 'released',
    languageProfileId: 'lp-en',
    versions: [{ label: '1080p', qualityProfileId: 'qp-hd' }],
    ...patch,
  })
  const add = async (tmdbId: number, patch: Partial<AddMovieInput> = {}) =>
    (await movies.add(input(tmdbId, patch))).movie

  let users = 0
  const person = (id = `u${++users}`) => {
    const now = clock.now()
    db.insert(schema.users)
      .values({
        id,
        username: id,
        displayName: id,
        role: 'user',
        webauthnId: `w-${id}`,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    return id
  }

  return {
    db,
    raw,
    clock,
    events,
    seen,
    jobs,
    fetch,
    metadata,
    media,
    movies,
    dir,
    folder,
    input,
    add,
    person,
    cleanup: () => {
      movies.close()
      rmSync(dir, { recursive: true, force: true })
    },
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

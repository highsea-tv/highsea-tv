// SPDX-License-Identifier: AGPL-3.0-only
// Collection rules' facts (checkpoint 8d): written with the movie, derived again when the region
// changes, and filled once for rows cached before 8d.
import { afterEach, describe, expect, test } from 'bun:test'
import { schema } from '@highsea/db'
import { asc, eq } from 'drizzle-orm'
import { deriveAllFacts, FACTS_STATE_KEY, movieTermsOf, readFactsState } from '../src/facts.ts'
import { JOB_TYPES } from '../src/index.ts'
import type { TmdbMovie } from '../src/tmdb/types.ts'
import { setup } from './helpers.ts'

const { movieMetadata, movieTerms } = schema

let cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})
const open = async () => {
  const t = await setup()
  cleanups.push(t.cleanup)
  return t
}

const termsOf = (db: Awaited<ReturnType<typeof open>>['db'], id: number) =>
  db
    .select({ kind: movieTerms.kind, value: movieTerms.value, label: movieTerms.label })
    .from(movieTerms)
    .where(eq(movieTerms.movieId, id))
    .orderBy(asc(movieTerms.kind), asc(movieTerms.value))
    .all()

describe('a movie’s facts', () => {
  test('written with the movie: language, runtime, certification and terms', async () => {
    const { db, metadata } = await open()
    await metadata.settings.update({ region: 'DE' })
    await metadata.movie(19)
    const row = db.select().from(movieMetadata).where(eq(movieMetadata.tmdbId, 19)).get()
    expect(row).toMatchObject({ originalLanguage: 'de', runtime: 148, certification: '6' })
    expect(termsOf(db, 19)).toEqual([
      { kind: 'country', value: 'DE', label: 'Germany' },
      { kind: 'genre', value: '18', label: 'Drama' },
      { kind: 'genre', value: '878', label: 'Science Fiction' },
      { kind: 'studio', value: '12372', label: 'UFA' },
    ])
  })

  test('the request appends keywords', async () => {
    const { metadata, fetch } = await open()
    await metadata.movie(19)
    expect(fetch.requests[0]).toContain('keywords')
  })

  test('terms: keywords by TMDB id, countries upper case, a repeat kept once', () => {
    const movie = {
      id: 7,
      title: 'x',
      original_title: 'x',
      original_language: 'en',
      genres: [{ id: 18, name: 'Drama' }],
      keywords: {
        keywords: [
          { id: 9715, name: 'superhero' },
          { id: 9715, name: 'superhero' },
        ],
      },
      production_countries: [{ iso_3166_1: 'us', name: 'United States of America' }],
    } as TmdbMovie
    expect(movieTermsOf(movie).map((t) => `${t.kind}:${t.value}`)).toEqual([
      'genre:18',
      'keyword:9715',
      'country:US',
    ])
  })

  test('a refresh replaces the terms whole', async () => {
    const { db, metadata, addToLibrary } = await open()
    addToLibrary(19)
    await metadata.movie(19)
    db.insert(movieTerms).values({ movieId: 19, kind: 'keyword', value: '1', label: 'stale' }).run()
    await metadata.refreshNow('movie', 19)
    expect(termsOf(db, 19).some((t) => t.label === 'stale')).toBe(false)
  })
})

describe('metadata.facts', () => {
  test('a region change queues it, and it follows the new region', async () => {
    const { db, metadata, jobs, drain } = await open()
    await metadata.settings.update({ region: 'US' })
    await drain()
    await metadata.movie(19)
    expect(db.select().from(movieMetadata).get()?.certification).toBe('NR')
    await metadata.settings.update({ region: 'DE' })
    expect(jobs.list({ status: ['queued'] }).map((j) => j.type)).toContain(JOB_TYPES.facts)
    await drain()
    expect(db.select().from(movieMetadata).get()?.certification).toBe('6')
    expect(readFactsState(db)).toEqual({ version: 1, region: 'DE' })
  })

  test('at boot: queued for rows from before 8d, and not again once they’re current', async () => {
    const { db, metadata, jobs, drain, clock } = await open()
    await metadata.settings.update({ region: 'US' })
    await drain()
    await metadata.movie(19)
    // as a row cached before 8d: no facts, and no record of which region they follow
    db.update(movieMetadata)
      .set({ originalLanguage: null, runtime: null, certification: null })
      .run()
    db.delete(movieTerms).run()
    db.delete(schema.settings).where(eq(schema.settings.key, FACTS_STATE_KEY)).run()
    metadata.jobs.schedule(clock.now())
    expect(
      jobs.list({ status: ['queued'] }).filter((j) => j.type === JOB_TYPES.facts),
    ).toHaveLength(1)
    await drain()
    expect(db.select().from(movieMetadata).get()).toMatchObject({
      originalLanguage: 'de',
      runtime: 148,
      certification: 'NR',
    })
    expect(termsOf(db, 19)).toHaveLength(4)
    metadata.jobs.schedule(clock.now())
    expect(jobs.list({ status: ['queued'] }).some((j) => j.type === JOB_TYPES.facts)).toBe(false)
  })

  test('safe to repeat, in batches', async () => {
    const { db, metadata, clock } = await open()
    for (const id of [19, 653, 234]) await metadata.movie(id)
    let yields = 0
    const opts = { batch: 2, yieldFn: async () => void yields++ }
    expect(await deriveAllFacts(db, 'US', clock.now(), opts)).toBe(3)
    const first = db.select().from(movieTerms).orderBy(asc(movieTerms.movieId)).all()
    expect(await deriveAllFacts(db, 'US', clock.now(), opts)).toBe(3)
    expect(db.select().from(movieTerms).orderBy(asc(movieTerms.movieId)).all()).toEqual(first)
    expect(yields).toBe(4)
  })
})

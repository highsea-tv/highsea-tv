// SPDX-License-Identifier: AGPL-3.0-only
// The movie screens' data (A4 Discover, the add dialog, A5 Movies): the dialog's starting values
// from what it remembers, what it sends, the missing-key check, and the library's paged loading.
// The screens themselves are covered by the browser sweeps (scripts/sweeps).
import { describe, expect, test } from 'bun:test'
import type {
  LanguageProfile,
  Movie,
  MoviePage,
  QualityProfile,
  RootFolder,
} from '@highsea/api-contract'
import { ApiError } from '@highsea/sdk'
import {
  type AddOptions,
  addInput,
  defaultsOf,
  initialForm,
  isNoMetadataKey,
  loadMovies,
} from '../src/admin/movie-data.ts'

const folder = (path: string): RootFolder => ({
  id: path,
  path,
  free: null,
  total: null,
  device: null,
  accessible: true,
  movies: 0,
  languageProfileId: null,
})
const profile = (id: string, name: string) => ({ id, name }) as QualityProfile
const languages = (id: string) => ({ id, name: id }) as LanguageProfile

const options = (defaults: AddOptions['defaults']): AddOptions => ({
  folders: [folder('/data/movies'), folder('/data/kids')],
  quality: [profile('qp-hd', 'HD 1080p'), profile('qp-uhd', 'Ultra HD')],
  language: [languages('lp-en'), languages('lp-pt')],
  defaults,
})

describe('the add dialog', () => {
  test('starts from the first folder and profiles, released, monitored', () => {
    expect(initialForm(options(null))).toEqual({
      rootFolder: '/data/movies',
      qualityProfileId: 'qp-hd',
      languageProfileId: 'lp-en',
      minimumAvailability: 'released',
      searchNow: false,
      monitored: true,
    })
  })

  test('remembers the last-used values while they still exist', () => {
    const remembered = {
      rootFolder: '/data/kids',
      qualityProfileId: 'qp-uhd',
      languageProfileId: 'lp-pt',
      minimumAvailability: 'in-cinemas' as const,
      searchNow: true,
    }
    expect(initialForm(options(remembered))).toMatchObject({
      rootFolder: '/data/kids',
      qualityProfileId: 'qp-uhd',
      languageProfileId: 'lp-pt',
      minimumAvailability: 'in-cinemas',
      // decision 2: off while no indexer is enabled, whatever was remembered
      searchNow: false,
    })
    // with an enabled indexer, the remembered choice
    expect(initialForm({ ...options(remembered), canSearch: true }).searchNow).toBe(true)
    const gone = { ...remembered, rootFolder: '/mnt/old', qualityProfileId: 'qp-deleted' }
    expect(initialForm(options(gone))).toMatchObject({
      rootFolder: '/data/movies',
      qualityProfileId: 'qp-hd',
    })
  })

  test('with no folders or profiles, nothing is picked', () => {
    const f = initialForm({ folders: [], quality: [], language: [], defaults: null })
    expect(f).toMatchObject({ rootFolder: '', qualityProfileId: '', languageProfileId: null })
  })

  test('sends one version named after its profile, and remembers all but Monitored', () => {
    const f = { ...initialForm(options(null)), qualityProfileId: 'qp-uhd', monitored: false }
    expect(addInput(603, f, options(null).quality)).toEqual({
      tmdbId: 603,
      rootFolder: '/data/movies',
      monitored: false,
      minimumAvailability: 'released',
      languageProfileId: 'lp-en',
      versions: [{ label: 'Ultra HD', qualityProfileId: 'qp-uhd' }],
    })
    expect(defaultsOf(f)).toEqual({
      rootFolder: '/data/movies',
      qualityProfileId: 'qp-uhd',
      languageProfileId: 'lp-en',
      minimumAvailability: 'released',
      searchNow: false,
    })
  })

  test('tells a missing TMDB key from other failures', () => {
    const noKey = new ApiError('unavailable', 'No key.', 503, { reason: 'no-tmdb-key' })
    const down = new ApiError('unavailable', 'TMDB is down.', 503, {
      reason: 'tmdb-unreachable',
    })
    expect(isNoMetadataKey(noKey)).toBe(true)
    expect(isNoMetadataKey(down)).toBe(false)
    expect(isNoMetadataKey(new Error('boom'))).toBe(false)
    expect(isNoMetadataKey(undefined)).toBe(false)
  })
})

describe('the library', () => {
  /** A fake `movies.list` over `total` movies, cursor-paged as the server is. */
  function fakeClient(total: number) {
    const calls: { cursor?: string; limit?: number; sort?: string }[] = []
    const movie = (i: number) => ({ id: i + 1, title: `Movie ${i + 1}` }) as Movie
    const list = async ({ query }: { query: (typeof calls)[number] }): Promise<MoviePage> => {
      calls.push(query)
      const start = query.cursor ? Number(query.cursor) : 0
      const end = Math.min(total, start + (query.limit ?? 60))
      return {
        items: Array.from({ length: end - start }, (_, i) => movie(start + i)),
        next: end < total ? String(end) : null,
        total,
        counts: {
          all: total,
          available: 0,
          wanted: total,
          downloading: 0,
          'not-released': 0,
          unmonitored: 0,
        },
      }
    }
    return { client: { movies: { list } } as never, calls }
  }

  test('one page is one request', async () => {
    const { client, calls } = fakeClient(500)
    const page = await loadMovies(client, { sort: 'title' }, 60)
    expect(page.items).toHaveLength(60)
    expect(page.next).toBe('60')
    expect(calls).toEqual([{ sort: 'title', cursor: undefined, limit: 60 }])
  })

  test('Show more follows the cursor in requests of at most 200', async () => {
    const { client, calls } = fakeClient(500)
    const page = await loadMovies(client, { sort: 'added' }, 300)
    expect(page.items.map((m) => m.id)).toEqual(Array.from({ length: 300 }, (_, i) => i + 1))
    expect(calls.map((c) => [c.cursor, c.limit])).toEqual([
      [undefined, 200],
      ['200', 100],
    ])
    expect(page.next).toBe('300')
  })

  test('stops at the end of the library', async () => {
    const { client, calls } = fakeClient(70)
    const page = await loadMovies(client, { sort: 'title' }, 300)
    expect(page.items).toHaveLength(70)
    expect(page.next).toBeNull()
    expect(calls).toHaveLength(1)
  })
})

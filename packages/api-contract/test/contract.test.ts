// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import {
  ACCESS,
  AddMovieInput,
  accessOf,
  BulkInput,
  ClientDetail,
  CustomFormat,
  DEPARTMENTS,
  DiscoverPage,
  ErrorBody,
  errors,
  MetadataSettings,
  MovieMetadata,
  MoviePage,
  ParseResult,
  Person,
  PublicInfo,
  QualityProfile,
  routes,
  SearchResults,
  TMDB_ATTRIBUTION,
  VIDEO_KINDS,
} from '../src/index.ts'

describe('contract', () => {
  test('every route has a method, a path under /api and a summary', () => {
    for (const [group, rs] of Object.entries(routes))
      for (const [name, r] of Object.entries(rs)) {
        expect(r.path, `${group}.${name}`).toMatch(/^\/api\//)
        expect(r.summary, `${group}.${name}`).toBeTruthy()
      }
  })

  test('every route declares who may call it, with matching security', () => {
    for (const [group, rs] of Object.entries(routes))
      for (const [name, r] of Object.entries(rs)) {
        const level = accessOf(r)
        expect(ACCESS, `${group}.${name}`).toContain(level as never)
        expect('security' in r, `${group}.${name}`).toBe(level !== 'public')
      }
  })

  test('no two routes share a method and path', () => {
    const seen = new Set<string>()
    for (const rs of Object.values(routes))
      for (const r of Object.values(rs)) {
        const key = `${r.method} ${r.path}`
        expect(seen.has(key), key).toBe(false)
        seen.add(key)
      }
  })

  test('errors() maps codes to statuses with the shared body', () => {
    const e = errors('not-found', 'forbidden')
    expect(Object.keys(e).sort()).toEqual(['403', '404'])
    expect(e[404].content['application/json'].schema).toBe(ErrorBody)
  })

  test('schemas validate what the server sends', () => {
    expect(
      PublicInfo.safeParse({
        id: 'srv_1',
        name: 'Harbor',
        version: '0.1.0',
        localAddresses: [],
        publicUrl: null,
        setupComplete: true,
        auth: { local: true, oidc: null, passkeys: false },
        sources: ['system', 'movies'],
        attributions: [TMDB_ATTRIBUTION],
      }).success,
    ).toBe(true)
    expect(ErrorBody.safeParse({ error: { code: 'nope', message: 'x' } }).success).toBe(false)
  })

  test('a static path comes before a parameter path that would match it', () => {
    // The server's guard and Hono both take the first route that matches.
    for (const [group, rs] of Object.entries(routes)) {
      const list = Object.entries(rs)
      list.forEach(([name, r], i) => {
        const pattern = new RegExp(`^${r.path.replace(/\{\w+\}/g, '[^/]+')}$`)
        for (const [later, l] of list.slice(i + 1))
          if (l.method === r.method && !l.path.includes('{') && r.path.includes('{'))
            expect(pattern.test(l.path), `${group}.${name} before ${group}.${later}`).toBe(false)
      })
    }
  })

  test('movie routes: reading needs a sign-in, changing needs Manage the library', () => {
    for (const [name, r] of Object.entries(routes.movies))
      expect(accessOf(r), name).toBe(r.method === 'get' && name !== 'discover' ? 'user' : 'library')
    expect(accessOf(routes.rootFolders.add)).toBe('staff')
    expect(accessOf(routes.settings.saveMetadata)).toBe('owner')
    for (const r of Object.values(routes.metadata)) expect(accessOf(r)).toBe('user')
  })

  test('TMDB’s vocabularies and notice', () => {
    expect(DEPARTMENTS).toHaveLength(12)
    expect(VIDEO_KINDS).toHaveLength(7)
    expect(TMDB_ATTRIBUTION.notice).toBe(
      'This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.',
    )
  })

  const art = { poster: '/api/v1/images/movie/603/poster/w342/a.jpg', backdrop: null }
  const discover = {
    id: 603,
    title: 'The Matrix',
    year: 1999,
    runtimeMinutes: null,
    genres: ['Action'],
    synopsis: 'A hacker learns the truth.',
    rating: 4.1,
    voteCount: 26000,
    releaseDate: '1999-03-30',
    art,
    inLibrary: true,
  }
  const credit = {
    id: '52fe425bc3a36847f80181c1',
    personId: 6384,
    name: 'Keanu Reeves',
    photo: null,
    department: 'Acting',
    character: 'Neo',
    job: null,
  }
  const movie = {
    id: 603,
    type: 'movie',
    title: 'The Matrix',
    originalTitle: 'The Matrix',
    sortTitle: 'matrix',
    year: 1999,
    runtimeMinutes: 136,
    genres: ['Action'],
    synopsis: '',
    rating: 4.1,
    voteCount: 26000,
    releaseDate: '1999-03-30',
    art,
    status: 'wanted',
    monitored: true,
    minimumAvailability: 'released',
    languageProfileId: null,
    qualityProfileId: 'qp-hd',
    rootFolder: '/data/media/movies',
    path: '/data/media/movies/The Matrix (1999)',
    addedAt: '2026-10-20T08:00:00.000Z',
    versions: [{ id: 'v1', label: '1080p', qualityProfileId: 'qp-hd', fileId: null }],
    gone: false,
  }

  test('the media shapes take what the server sends', () => {
    const ok = (schema: { safeParse(v: unknown): { success: boolean } }, value: unknown) =>
      expect(schema.safeParse(value).success).toBe(true)
    ok(DiscoverPage, { items: [discover], page: 1, totalPages: 3, totalResults: 41 })
    ok(MovieMetadata, {
      ...discover,
      runtimeMinutes: 136,
      originalTitle: 'The Matrix',
      originalLanguage: 'en',
      tagline: null,
      certification: null,
      budget: 63000000,
      revenue: null,
      studios: ['Warner Bros. Pictures'],
      imdbId: 'tt0133093',
      wikidataId: null,
      cast: [credit],
      crew: [
        {
          ...credit,
          id: 'c2',
          department: 'Costume & Make-Up',
          character: null,
          job: 'Costume Design',
        },
      ],
      videos: [
        {
          id: 'v',
          name: 'Trailer',
          kind: 'Behind the Scenes',
          site: 'YouTube',
          key: 'abc',
          official: true,
          publishedAt: null,
          still: null,
        },
      ],
      collection: { id: 2344, name: 'The Matrix Collection' },
      gone: false,
      fetchedAt: '2026-10-20T08:00:00.000Z',
    })
    ok(Person, {
      id: 6384,
      name: 'Keanu Reeves',
      photo: null,
      knownFor: 'Acting',
      bio: null,
      born: { date: '1964-09-02', place: 'Beirut, Lebanon' },
      died: null,
      imdbId: null,
      wikidataId: null,
      credits: [{ ...discover, creditId: 'c1', role: 'Neo', department: 'Acting' }],
    })
    ok(MoviePage, {
      items: [movie],
      next: null,
      total: 1,
      counts: {
        all: 1,
        available: 0,
        wanted: 1,
        downloading: 0,
        'not-released': 0,
        unmonitored: 0,
      },
    })
    ok(ClientDetail, {
      item: {
        ...discover,
        type: 'movie',
        addedAt: movie.addedAt,
        status: 'wanted',
        playable: false,
        progress: null,
        position: 0,
      },
      originalTitle: 'The Matrix',
      tagline: null,
      certification: 'R',
      studios: [],
      cast: [credit],
      directors: [],
      videos: [],
      collection: null,
      versions: [{ id: 'v1', label: '1080p', detail: null, playable: false }],
      related: [],
    })
    ok(SearchResults, {
      sections: [
        { kind: 'people', items: [{ id: 6384, name: 'Keanu Reeves', photo: null, titles: 2 }] },
        { kind: 'discover', items: [discover] },
      ],
    })
    ok(MetadataSettings, { key: { set: true, last4: '9f2c' }, language: 'en-US', region: 'GB' })
    expect(MovieMetadata.safeParse({ ...discover, rating: 8.2 }).success).toBe(false)
  })

  test('the inputs refuse what the server shouldn’t take', () => {
    const add = {
      tmdbId: 603,
      rootFolder: '/data/media/movies',
      monitored: true,
      minimumAvailability: 'released',
      versions: [{ label: '1080p', qualityProfileId: 'qp-hd' }],
    }
    expect(AddMovieInput.safeParse(add).success).toBe(true)
    expect(AddMovieInput.safeParse({ ...add, versions: [] }).success).toBe(false)
    expect(BulkInput.safeParse({ action: 'setQualityProfile', ids: [603] }).success).toBe(false)
    expect(BulkInput.safeParse({ action: 'refresh', ids: [603, 604] }).success).toBe(true)
  })

  test('the quality shapes', () => {
    expect(
      QualityProfile.safeParse({
        id: 'qp-hd',
        name: 'HD 1080p',
        items: [
          { name: 'Bluray-1080p', qualities: ['Bluray-1080p'], allowed: true },
          { name: 'WEB 1080p', qualities: ['WEBDL-1080p', 'WEBRip-1080p'], allowed: true },
        ],
        cutoff: 'Bluray-1080p',
        upgradeAllowed: true,
        minFormatScore: 0,
        cutoffFormatScore: 100,
        minUpgradeFormatScore: 1,
        formats: [{ formatId: 'cf-x265', score: 100 }],
        language: 'original',
      }).success,
    ).toBe(true)
    const condition = { name: 'c', negate: false, required: true }
    expect(
      CustomFormat.safeParse({
        id: 'cf',
        name: 'Remux 2160p',
        source: 'preset',
        conditions: [
          { ...condition, kind: 'resolution', value: 2160 },
          { ...condition, kind: 'modifier', value: 'remux' },
          { ...condition, kind: 'size', value: { min: 20, max: 200 } },
          { ...condition, kind: 'language', value: { language: 'original', except: true } },
          { ...condition, kind: 'indexerFlag', value: 'freeleech' },
        ],
        trashId: null,
      }).success,
    ).toBe(true)
    expect(
      CustomFormat.safeParse({
        id: 'cf',
        name: 'x',
        source: 'custom',
        trashId: null,
        conditions: [{ ...condition, kind: 'resolution', value: 1000 }],
      }).success,
    ).toBe(false)
    expect(
      ParseResult.safeParse({
        release: {
          name: 'The.Matrix.1999.1080p.BluRay.x264-GROUP',
          title: 'The Matrix',
          year: 1999,
          edition: null,
          quality: {
            source: 'bluray',
            resolution: 1080,
            modifier: 'none',
            revision: { version: 1, real: 0, proper: false, repack: false },
          },
          languages: [],
          multi: false,
          subtitles: [],
          releaseGroup: 'GROUP',
          hardcodedSubs: null,
          ids: { imdb: null, tmdb: null },
          codec: 'avc',
          hdr: [],
          threeD: false,
        },
        quality: 'Bluray-1080p',
        formats: [],
        scores: [{ profileId: 'qp-hd', name: 'HD 1080p', score: 0 }],
        movie: { id: 603, title: 'The Matrix', year: 1999 },
      }).success,
    ).toBe(true)
  })
})

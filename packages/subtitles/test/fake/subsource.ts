// SPDX-License-Identifier: AGPL-3.0-only
// The fake SubSource. Its reference (https://subsource.net/api-docs) documents the base URL, the
// `X-API-Key` header, the endpoints, the status codes and the free limits (60 a minute); the
// parameters and fields follow Bazarr's SubSource provider, as the adapter's do (subsource.ts).
// It counts requests per minute on the clock and answers 429 past 60, with rate-limit headers.
import { LANGUAGE_CODES, languageName } from '../../src/shared/languages.ts'
import { FAKE_ACCOUNTS, type FakeEntry } from './fixtures.ts'
import { type FakeWorld, json } from './world.ts'
import { makeZip } from './zip.ts'

const SPECIAL: Record<string, string> = {
  'pt-BR': 'brazilian_portuguese',
  fa: 'farsi_persian',
  zh: 'chinese_bg_code',
  'zh-Hans': 'chinese_bg_code',
  'zh-Hant': 'chinese_bg_code',
}

/** SubSource's name for a profile code, lowercased as queries send it. */
export function subsourceLanguage(code: string): string {
  return SPECIAL[code] ?? languageName(code).toLowerCase()
}

const capitalized = (name: string) => name.charAt(0).toUpperCase() + name.slice(1)

export const FAKE_SUBSOURCE_LIMIT = 60

export function createFakeSubSource(world: FakeWorld) {
  let windowStart = -1
  let count = 0
  /** movieId → the movie it stands for. */
  const movies = new Map<number, { tmdbId: number; imdbId: string }>()

  const headers = () => {
    const reset = new Date(windowStart + 60_000).toISOString()
    return {
      'x-ratelimit-limit': String(FAKE_SUBSOURCE_LIMIT),
      'x-ratelimit-remaining': String(Math.max(0, FAKE_SUBSOURCE_LIMIT - count)),
      'x-ratelimit-reset': reset,
    }
  }

  return async function handle(url: URL, request: Request): Promise<Response> {
    if (request.headers.get('x-api-key') !== FAKE_ACCOUNTS.subsource.apiKey)
      return json({ success: false, message: 'Invalid API key' }, 401)
    const now = world.clock.now()
    const minute = Math.floor(now / 60_000) * 60_000
    if (minute !== windowStart) {
      windowStart = minute
      count = 0
    }
    count++
    if (count > FAKE_SUBSOURCE_LIMIT)
      return json(
        {
          success: false,
          message: 'Rate limit exceeded',
          retryAfter: Math.ceil((windowStart + 60_000 - now) / 1000),
        },
        429,
        { ...headers(), 'retry-after': String(Math.ceil((windowStart + 60_000 - now) / 1000)) },
      )
    const p = url.searchParams
    const path = url.pathname

    if (path === '/api/v1/movies/search') {
      const imdb = p.get('imdb')
      if (p.get('searchType') !== 'imdb' || !imdb || !/^tt\d+$/.test(imdb))
        return json({ success: true, data: [] }, 200, headers())
      const known = world.added.find((s) => s.provider === 'subsource' && s.imdbId === imdb)
      if (!known && !world.generate) return json({ success: true, data: [] }, 200, headers())
      const tmdbId = known?.tmdbId ?? Number(imdb.slice(2))
      const movieId = 500_000 + (tmdbId % 1_000_000)
      movies.set(movieId, { tmdbId, imdbId: imdb })
      return json(
        {
          success: true,
          data: [
            {
              movieId,
              title: 'Fake Movie',
              type: 'movie',
              releaseYear: 2010,
              imdbId: imdb,
              link: `/subtitles/fake-movie-${movieId}`,
            },
          ],
        },
        200,
        headers(),
      )
    }

    if (path === '/api/v1/subtitles') {
      const movie = movies.get(Number(p.get('movieId')))
      const name = (p.get('language') ?? '').toLowerCase()
      if (!movie || !name) return json({ success: true, data: [] }, 200, headers())
      // Every profile code SubSource names this way (Chinese has three, all `chinese_bg_code`).
      const languages = LANGUAGE_CODES.filter((c) => subsourceLanguage(c) === name)
      const found: FakeEntry[] = world.find(
        'subsource',
        { tmdbId: movie.tmdbId, imdbId: movie.imdbId, year: null },
        languages,
      )
      return json(
        {
          success: true,
          data: found.map((e) => ({
            subtitleId: e.id,
            link: `/subtitle/fake-movie/${name}/${e.id}`,
            language: capitalized(subsourceLanguage(e.language)),
            releaseInfo: e.releases,
            hearingImpaired: e.hi,
            foreignParts: e.forced,
            commentary: '',
            uploaderId: 1,
            contributors: [{ id: 1, displayname: 'highsea-fake' }],
          })),
        },
        200,
        headers(),
      )
    }

    const dl = /^\/api\/v1\/subtitles\/(\d+)\/download$/.exec(path)
    if (dl) {
      const entry = world.byId('subsource', Number(dl[1]))
      if (!entry) return json({ success: false, message: 'Not found' }, 404, headers())
      const zip = makeZip([
        {
          name: `${entry.releaseName}.${entry.format}`,
          bytes: new TextEncoder().encode(entry.content),
        },
      ])
      return new Response(new Uint8Array(zip), {
        headers: { 'content-type': 'application/zip', ...headers() },
      })
    }

    return json({ success: false, message: 'Not found' }, 404, headers())
  }
}

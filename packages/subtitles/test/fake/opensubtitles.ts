// SPDX-License-Identifier: AGPL-3.0-only
// The fake OpenSubtitles.com, from its OpenAPI document
// (https://stoplight.io/api/v1/projects/opensubtitles/opensubtitles-api/nodes/open_api.json) and
// guides: `Api-Key` and `User-Agent` on every call, `POST /login` handing out a token and a
// `base_url` (vip-api for VIP members), `GET /infos/user`, `GET /subtitles` redirecting when its
// parameters aren't sorted and lowercase, `POST /download` counting the day's downloads (406 when
// they're spent) and answering a link on www.opensubtitles.com that serves the file.
import { toLanguageCode } from '../../src/shared/languages.ts'
import { FAKE_ACCOUNTS, FAKE_OPENSUBTITLES_KEY, type FakeEntry, hash } from './fixtures.ts'
import { type FakeWorld, json } from './world.ts'

const DAY_MS = 86_400_000

/** A profile code as OpenSubtitles.com's language code. */
export function osLanguage(code: string): string {
  if (code === 'pt') return 'pt-pt'
  if (code === 'pt-BR') return 'pt-br'
  if (code === 'zh-Hans' || code === 'zh') return 'zh-cn'
  if (code === 'zh-Hant') return 'zh-tw'
  return code
}

function profileCode(os: string): string | null {
  return os === 'pt-pt' ? 'pt' : toLanguageCode(os)
}

const error = (status: number, message: string) => json({ message, status }, status)

/** The query string as the API wants it: keys sorted, values lowercase. */
function canonical(params: URLSearchParams): string {
  const entries = [...params.entries()].map(([k, v]) => [k, v.toLowerCase()] as const)
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return new URLSearchParams(entries.map(([k, v]): [string, string] => [k, v]))
    .toString()
    .replace(/%2C/gi, ',')
}

export function createFakeOpenSubtitles(world: FakeWorld) {
  const links = new Map<string, FakeEntry>()
  let tokenCount = 0

  const nextReset = () => Math.floor(world.clock.now() / DAY_MS) * DAY_MS + DAY_MS
  const allowed = () => (world.vip ? 1000 : 20)
  const signedIn = (request: Request) => {
    const auth = request.headers.get('authorization') ?? ''
    const token = /^Bearer (.+)$/.exec(auth)?.[1]
    return token !== undefined && world.tokens.has(token)
  }

  function item(entry: FakeEntry, moviehash: string | null) {
    const file = `${entry.releaseName}.${entry.format}`
    return {
      id: String(entry.id),
      type: 'subtitle',
      attributes: {
        subtitle_id: String(entry.id),
        language: osLanguage(entry.language),
        download_count: entry.downloads,
        new_download_count: Math.floor(entry.downloads / 10),
        hearing_impaired: entry.hi,
        hd: /1080p|2160p|720p/.test(entry.releaseName),
        fps: 23.976,
        votes: 0,
        ratings: 0,
        from_trusted: false,
        foreign_parts_only: entry.forced,
        upload_date: '2024-06-26T07:02:57Z',
        ai_translated: entry.translated,
        nb_cd: 1,
        slug: `fake-${entry.id}`,
        machine_translated: false,
        release: entry.releaseName,
        comments: '',
        legacy_subtitle_id: entry.id,
        uploader: { uploader_id: 1, name: 'highsea-fake', rank: 'member' },
        feature_details: {
          feature_id: entry.tmdbId,
          feature_type: 'Movie',
          year: 2010,
          title: 'Fake Movie',
          movie_name: 'Fake Movie',
          imdb_id: entry.imdbId ? Number(entry.imdbId.replace(/^tt/, '')) : null,
          tmdb_id: entry.tmdbId,
        },
        url: `https://www.opensubtitles.com/en/subtitles/fake-${entry.id}`,
        related_links: [],
        files: [{ file_id: entry.id, cd_number: 1, file_name: file }],
        moviehash_match: moviehash !== null && entry.moviehash === moviehash,
      },
    }
  }

  return async function handle(url: URL, request: Request, body: string): Promise<Response> {
    if (url.hostname === 'www.opensubtitles.com') {
      const m = /^\/download\/([0-9a-f]+)\/subfile\/[^/]+$/.exec(url.pathname)
      const entry = m ? links.get(m[1] as string) : undefined
      if (!entry) return new Response('Not found', { status: 404 })
      return new Response(new TextEncoder().encode(entry.content), {
        headers: { 'content-type': 'application/x-subrip; charset=utf-8' },
      })
    }

    if (request.headers.get('api-key') !== FAKE_OPENSUBTITLES_KEY)
      return error(403, 'You cannot consume this service')
    if (!request.headers.get('user-agent')) return error(403, 'User-Agent is required')
    const path = url.pathname

    if (path === '/api/v1/login' && request.method === 'POST') {
      world.logins++
      let creds: { username?: unknown; password?: unknown } = {}
      try {
        creds = JSON.parse(body)
      } catch {
        return error(400, 'Bad request')
      }
      const account = FAKE_ACCOUNTS.opensubtitles
      if (creds.username !== account.username || creds.password !== account.password)
        return error(401, 'Error, invalid username/password')
      const token = `fake-jwt-${++tokenCount}`
      world.tokens.add(token)
      return json({
        user: {
          allowed_downloads: allowed(),
          allowed_translations: 5,
          level: world.vip ? 'VIP Member' : 'Sub leecher',
          user_id: 4242,
          ext_installed: false,
          vip: world.vip,
        },
        base_url: world.vip ? 'vip-api.opensubtitles.com' : 'api.opensubtitles.com',
        token,
        status: 200,
      })
    }

    if (path === '/api/v1/infos/user' && request.method === 'GET') {
      if (!signedIn(request)) return error(401, 'Unauthorized')
      return json({
        data: {
          allowed_downloads: allowed(),
          allowed_translations: 5,
          level: world.vip ? 'VIP Member' : 'Sub leecher',
          user_id: 4242,
          ext_installed: false,
          vip: world.vip,
          downloads_count: allowed() - world.remaining,
          remaining_downloads: world.remaining,
        },
      })
    }

    if (path === '/api/v1/subtitles' && request.method === 'GET') {
      // Searching needs no sign-in, but a token that's sent must be good.
      if (request.headers.has('authorization') && !signedIn(request))
        return error(401, 'Unauthorized')
      const sorted = canonical(url.searchParams)
      if (url.search.slice(1) !== sorted) {
        const location = new URL(url)
        location.search = sorted
        return new Response(null, { status: 301, headers: { location: location.toString() } })
      }
      const p = url.searchParams
      const tmdbId = Number(p.get('tmdb_id'))
      if (!tmdbId) return json({ total_pages: 0, total_count: 0, per_page: 60, page: 1, data: [] })
      const languages = [
        ...new Set(
          (p.get('languages') ?? '')
            .split(',')
            .filter(Boolean)
            .map(profileCode)
            .filter((c): c is string => c !== null),
        ),
      ]
      const moviehash = p.get('moviehash')
      const year = p.get('year') ? Number(p.get('year')) : null
      const imdb = p.get('imdb_id')
      const rule = (name: string, fallback: string) => p.get(name) ?? fallback
      const found = world
        .find(
          'opensubtitles',
          { tmdbId, imdbId: imdb ? `tt${imdb}` : null, year },
          languages,
          moviehash,
        )
        .filter((e) => {
          const hi = rule('hearing_impaired', 'include')
          if (hi === 'exclude' && e.hi) return false
          if (hi === 'only' && !e.hi) return false
          const fp = rule('foreign_parts_only', 'include')
          if (fp === 'exclude' && e.forced) return false
          if (fp === 'only' && !e.forced) return false
          if (rule('ai_translated', 'include') === 'exclude' && e.translated) return false
          return true
        })
      return json({
        total_pages: 1,
        total_count: found.length,
        per_page: 60,
        page: 1,
        data: found.map((e) => item(e, moviehash)),
      })
    }

    if (path === '/api/v1/download' && request.method === 'POST') {
      if (!signedIn(request)) return error(401, 'Unauthorized')
      let fileId: unknown
      try {
        fileId = JSON.parse(body).file_id
      } catch {
        return error(400, 'Bad request')
      }
      const entry = typeof fileId === 'number' ? world.byId('opensubtitles', fileId) : undefined
      if (!entry) return error(404, 'Invalid file_id')
      const resetUtc = new Date(nextReset()).toISOString()
      if (world.remaining <= 0)
        return json(
          {
            requests: allowed(),
            remaining: 0,
            message: `You have downloaded your allowed ${allowed()} subtitles for 24h.`,
            reset_time: 'a few hours',
            reset_time_utc: resetUtc,
          },
          406,
        )
      world.remaining--
      world.downloads++
      const key = (hash(`${entry.id}|${world.downloads}`) >>> 0).toString(16).padStart(8, '0')
      links.set(key, entry)
      const fileName = `${entry.releaseName}.${entry.format}`
      return json({
        link: `https://www.opensubtitles.com/download/${key}/subfile/${encodeURIComponent(fileName)}`,
        file_name: fileName,
        requests: allowed() - world.remaining,
        remaining: world.remaining,
        message: 'Your quota will be renewed at midnight UTC.',
        reset_time: 'a few hours',
        reset_time_utc: resetUtc,
      })
    }

    return error(404, 'Not found')
  }
}

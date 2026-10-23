// SPDX-License-Identifier: AGPL-3.0-only
// The fake Subdl, from its API doc (https://subdl.com/api-doc): `GET /api/v1/subtitles` with an
// `api_key` and an id, answering `{ status, results, subtitles }` or `{ status: false, error }`;
// `GET /api/v1/me` for the key's account; zips from dl.subdl.com. `releases` and `hi` are only in
// the answer when they're asked for, as the doc describes.
import { languageName, toLanguageCode } from '../../src/shared/languages.ts'
import { FAKE_ACCOUNTS, type FakeEntry } from './fixtures.ts'
import { type FakeWorld, json } from './world.ts'
import { makeZip } from './zip.ts'

/** A profile code as Subdl's language code. */
export function subdlLanguage(code: string): string {
  if (code === 'pt-BR') return 'BR_PT'
  if (code === 'zh-Hant') return 'ZH_BG'
  if (code === 'zh-Hans' || code === 'zh') return 'ZH'
  return code.toUpperCase()
}

function profileCode(subdl: string): string | null {
  if (subdl === 'BR_PT') return 'pt-BR'
  if (subdl === 'ZH_BG') return 'zh-Hant'
  if (subdl === 'ZH') return 'zh-Hans'
  return toLanguageCode(subdl)
}

export function createFakeSubdl(world: FakeWorld) {
  const zipOf = (entry: FakeEntry) =>
    makeZip([
      {
        name: `${entry.releaseName}.${entry.format}`,
        bytes: new TextEncoder().encode(entry.content),
      },
    ])

  return async function handle(url: URL): Promise<Response> {
    if (url.hostname === 'dl.subdl.com') {
      const m = /^\/subtitle\/\d+-(\d+)\.zip$/.exec(url.pathname)
      const entry = m ? world.byId('subdl', Number(m[1])) : undefined
      if (!entry) return new Response('Not found', { status: 404 })
      return new Response(new Uint8Array(zipOf(entry)), {
        headers: { 'content-type': 'application/zip' },
      })
    }

    const p = url.searchParams
    if (p.get('api_key') !== FAKE_ACCOUNTS.subdl.apiKey)
      return json({ status: false, error: 'Invalid API key' })

    if (url.pathname === '/api/v1/me') return json({ status: true })

    if (url.pathname === '/api/v1/subtitles') {
      const tmdb = p.get('tmdb_id')
      const imdb = p.get('imdb_id')
      if (!tmdb && !imdb && !p.get('film_name') && !p.get('file_name') && !p.get('sd_id'))
        return json({ status: false, error: 'Missing search parameter' })
      const known = world.added.find(
        (s) => s.provider === 'subdl' && ((tmdb && s.tmdbId === Number(tmdb)) || s.imdbId === imdb),
      )
      const tmdbId = tmdb ? Number(tmdb) : (known?.tmdbId ?? null)
      if (tmdbId === null) return json({ status: false, error: "can't find movie or tv" })
      const year = p.get('year') ? Number(p.get('year')) : null
      const languages = (p.get('languages') ?? '')
        .split(',')
        .filter(Boolean)
        .map(profileCode)
        .filter((c): c is string => c !== null)
      const found = world.find('subdl', { tmdbId, imdbId: imdb, year }, languages)
      if (found.length === 0) return json({ status: false, error: "can't find movie or tv" })
      const perPage = Math.min(30, Number(p.get('subs_per_page') ?? 10) || 10)
      const sdId = 3_000_000 + (tmdbId % 1_000_000)
      return json({
        status: true,
        results: [
          {
            imdb_id: found[0]?.imdbId ?? imdb ?? null,
            tmdb_id: tmdbId,
            type: 'movie',
            name: 'Fake Movie',
            sd_id: sdId,
            first_air_date: null,
            year: year ?? 2010,
          },
        ],
        subtitles: found.slice(0, perPage).map((e) => ({
          release_name: e.releaseName,
          name: `SUBDL.com::${e.releaseName}.zip`,
          lang: languageName(e.language).toLowerCase(),
          author: 'highsea-fake',
          url: `/subtitle/${sdId}-${e.id}.zip`,
          subtitle_page: `/s/info/fake/${e.id}`,
          season: 0,
          episode: null,
          language: subdlLanguage(e.language),
          framerate: 0,
          fps: null,
          full_season: false,
          ...(p.get('hi') === '1' ? { hi: e.hi } : {}),
          ...(p.get('releases') === '1' ? { releases: e.releases } : {}),
        })),
      })
    }

    return json({ status: false, error: 'Not found' }, 404)
  }
}

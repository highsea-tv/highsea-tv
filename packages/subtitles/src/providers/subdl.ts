// SPDX-License-Identifier: AGPL-3.0-only
// Subdl's API, v1, with the owner's own free key (https://subdl.com/api-doc):
//
//   GET https://api.subdl.com/api/v1/subtitles?api_key=…&tmdb_id=…&type=movie&year=…
//       &languages=EN,FR&releases=1&hi=1&subs_per_page=30&client=custom_integration
//     → { status: true, results: [{ imdb_id, tmdb_id, type, name, sd_id, year }],
//         subtitles: [{ release_name, name, lang, language, author, url: '/subtitle/….zip',
//                       hi, releases, … }] }  (the subtitles are for results[0])
//     → { status: false, error }
//   GET https://api.subdl.com/api/v1/me?api_key=…   the key's account status ("Account Status")
//   GET https://dl.subdl.com{url}                    the zip
//
// `client` takes one of the documented values (`bazarr`, `stremio`, `kodi`, `subdl_player`,
// `custom_integration`, `other`), so highsea sends `custom_integration`. Free keys get 2,000
// requests a day, account-wide. The doc links its language list (`api-files/language_list.json`,
// which answered 404 when this was written); the codes are uppercase ISO 639-1 with a few of
// Subdl's own, as Bazarr's Subdl converter lists them: `BR_PT` (Brazilian Portuguese) and `ZH_BG`
// (Chinese, Big 5: traditional script).
import { toLanguageCode } from '../shared/languages.ts'
import {
  type Provider,
  type ProviderDeps,
  ProviderError,
  type ProviderResult,
} from '../shared/types.ts'
import {
  bool,
  maskKey,
  num,
  readBytes,
  readJson,
  record,
  send,
  statusError,
  str,
  wantedCode,
} from './http.ts'
import { readSubtitleZip } from './zip.ts'

export const SUBDL_API = 'https://api.subdl.com/api/v1'
export const SUBDL_DOWNLOADS = 'https://dl.subdl.com'
const NAME = 'Subdl'

/** Profile codes to Subdl's. Plain `zh` asks for both scripts. */
export function toSubdlLanguages(code: string): string[] {
  switch (code) {
    case 'pt-BR':
      return ['BR_PT']
    case 'zh-Hans':
      return ['ZH']
    case 'zh-Hant':
      return ['ZH_BG']
    case 'zh':
      return ['ZH', 'ZH_BG']
    default:
      return [code.toUpperCase()]
  }
}

/** Subdl's language code back to a profile code. */
export function fromSubdlLanguage(tag: string): string | null {
  const upper = tag.trim().toUpperCase()
  if (upper === 'BR_PT') return 'pt-BR'
  if (upper === 'ZH_BG') return 'zh-Hant'
  if (upper === 'ZH') return 'zh-Hans'
  // Pairs such as `EN_DE` (two languages in one file) aren't one language.
  if (upper.includes('_')) return null
  return toLanguageCode(upper)
}

const keyError = (error: string) => /api[\s_-]*key|unauthori[sz]ed|invalid key/i.test(error)
const notFound = (error: string) => /not found|can.?t find|cannot find|no subtitle/i.test(error)

export function createSubdl(deps: ProviderDeps): Provider {
  const { fetch, clock, store, userAgent } = deps

  function apiKey(): string {
    const key = store.credentials()?.apiKey
    if (!key) throw new ProviderError('no-account', 'Add your Subdl API key first.')
    return key
  }

  async function get(url: URL, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const response = await send(
      fetch,
      NAME,
      url,
      { method: 'GET', headers: { Accept: 'application/json', 'User-Agent': userAgent } },
      signal,
    )
    const error = statusError(NAME, response, clock.now())
    if (error) throw error
    const body = record(await readJson(NAME, response))
    if (!body) throw new ProviderError('invalid', 'Subdl answered something highsea can’t read.')
    if (body.status === false) {
      const message = str(body.error) ?? str(body.message) ?? ''
      if (keyError(message)) throw new ProviderError('auth', 'Subdl refused the API key.')
      if (notFound(message)) return { status: true, results: [], subtitles: [] }
      throw new ProviderError('invalid', `Subdl answered: ${message || 'an error'}.`)
    }
    return body
  }

  return {
    id: 'subdl',

    async search(query, signal) {
      const key = apiKey()
      const languages = [...new Set(query.languages.flatMap(toSubdlLanguages))]
      if (languages.length === 0) return []
      const url = new URL(`${SUBDL_API}/subtitles`)
      url.searchParams.set('api_key', key)
      url.searchParams.set('tmdb_id', String(query.tmdbId))
      url.searchParams.set('type', 'movie')
      if (query.year) url.searchParams.set('year', String(query.year))
      url.searchParams.set('languages', languages.join(','))
      url.searchParams.set('subs_per_page', '30')
      url.searchParams.set('releases', '1')
      url.searchParams.set('hi', '1')
      url.searchParams.set('client', 'custom_integration')
      const body = await get(url, signal)
      const film = record(Array.isArray(body.results) ? body.results[0] : null)
      // The search falls back to broader matches when there's no exact one (the doc's Notes), so
      // the id counts only when the film it found is this one.
      const idMatch =
        num(film?.tmdb_id) === query.tmdbId ||
        (query.imdbId !== null && str(film?.imdb_id) === query.imdbId)
      const subtitles = Array.isArray(body.subtitles) ? body.subtitles : []
      return subtitles.flatMap((item): ProviderResult[] => {
        const s = record(item)
        const path = str(s?.url)
        if (!s || !path?.startsWith('/subtitle/')) return []
        const language = wantedCode(
          fromSubdlLanguage(str(s.language) ?? '') ?? toLanguageCode(str(s.lang)),
          query.languages,
        )
        if (!language) return []
        const releaseName = str(s.release_name) ?? str(s.name) ?? ''
        const others = Array.isArray(s.releases) ? s.releases.flatMap((r) => str(r) ?? []) : []
        return [
          {
            provider: 'subdl',
            ref: path,
            language,
            releaseName,
            releases: [releaseName, ...others.filter((r) => r !== releaseName)],
            forced: false,
            hi: bool(s.hi),
            hashMatch: false,
            idMatch,
            format: null,
            downloads: 0,
            rating: 0,
            translated: false,
          },
        ]
      })
    },

    async download(result, signal) {
      apiKey()
      const path = result.ref
      if (!/^\/subtitle\/[A-Za-z0-9._\-/]+$/.test(path) || path.split('/').includes('..'))
        throw new ProviderError('invalid', 'That isn’t a Subdl download.')
      const response = await send(
        fetch,
        NAME,
        `${SUBDL_DOWNLOADS}${path}`,
        { method: 'GET', headers: { 'User-Agent': userAgent } },
        signal,
      )
      const error = statusError(NAME, response, clock.now())
      if (error) throw error
      return readSubtitleZip(await readBytes(NAME, response))
    },

    async account(signal) {
      const key = apiKey()
      const url = new URL(`${SUBDL_API}/me`)
      url.searchParams.set('api_key', key)
      await get(url, signal)
      return { account: maskKey(key), remaining: null, limit: 2000, resetsAt: null }
    },
  }
}

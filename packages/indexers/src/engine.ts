// SPDX-License-Identifier: AGPL-3.0-only
// Runs a definition: builds each request from its templates, signs in when it needs to, reads the
// answer by its kind, and returns normalized releases (ADR 0033). It holds no state: the caller
// passes the capabilities and the session it has, and keeps what comes back.

import type { Fetch } from '@highsea-tv/core'
import {
  type Definition,
  isMovieCategory,
  isTvCategory,
  MOVIE_CATEGORIES,
  parentCategory,
  type RequestTemplate,
  renderTemplate,
  type TemplateInputs,
  TV_CATEGORIES,
} from '@highsea-tv/schemas/indexers'
import { type Caps, movieCategoryIds, readCaps, readItems, tvCategoryIds } from './feed.ts'
import { type Answer, checkStatus, IndexerError, joinUrl, send } from './http.ts'
import type { IndexerRelease } from './release.ts'
import { loadHtml, scrapeHtml, scrapeJson } from './scrape.ts'

export type SettingValue = string | number | boolean

export type RunContext = {
  definition: Definition
  /** The settings, secrets opened. */
  settings: Readonly<Record<string, SettingValue>>
  /** A form sign-in's cookies from an earlier run. */
  session: string | null
  /** Capabilities from an earlier run, for Torznab and Newznab. */
  caps: Caps | null
  fetch: Fetch
  timeoutMs: number
  now: () => number
  /** Waits for the indexer's rate limit before each request. */
  beforeRequest: () => Promise<void>
}

/** What a search is for. A test sends only `keywords`; a show's search sends `tv`. */
export type SearchQuery = {
  keywords?: string
  title?: string
  year?: number | null
  imdbId?: string | null
  tmdbId?: number | null
  /**
   * A show's season, or one episode in it (Phase 5 C1). `imdbId` and `tmdbId` are then the show's,
   * and `year` isn't sent: a show's releases don't carry it.
   */
  tv?: { season: number; episode?: number | null; tvdbId?: number | null }
}

export type RunResult = {
  releases: IndexerRelease[]
  /** Set when the run signed in, so the caller can keep it. */
  session: string | null
  caps: Caps | null
  /** Successful requests' total time. */
  ms: number
  /** Which query found the releases: `tmdbid`, `imdbid`, `title` or `keywords`. */
  by: string
}

/** The base URL: a generic definition's comes from a setting, others' is their first link. */
export function baseUrlOf(definition: Definition, config: TemplateInputs['Config']): string {
  const base = definition.baseUrl
    ? renderTemplate(definition.baseUrl, { Config: config })
    : definition.links[0]
  if (!base) throw new IndexerError('config', 'The indexer has no address. Fill in its URL.')
  return base.trim()
}

/** The site's id for a standard category, and back. */
function categoryMapper(definition: Definition) {
  return {
    toStandard(text: string): number | null {
      const t = text.toLowerCase()
      const hit =
        definition.categories.find((c) => c.id === text) ??
        definition.categories.find((c) => c.id.toLowerCase() === t || c.name?.toLowerCase() === t)
      return hit ? hit.standard : null
    },
    siteIds(standard: readonly number[]): string[] {
      return definition.categories
        .filter(
          (c) =>
            standard.includes(c.standard) || standard.includes(parentCategory(c.standard) ?? -1),
        )
        .map((c) => c.id)
    },
  }
}

type Tier = { by: string; query: Record<string, string> }

/**
 * Queries in the order a movie search tries them: the strongest id the indexer understands (TMDB,
 * then IMDb), then the title and year, as the Torznab caps describe. A test asks for the keywords.
 */
function tiers(query: SearchQuery, supports: readonly string[]): Tier[] {
  if (query.keywords !== undefined) return [{ by: 'keywords', query: { q: query.keywords } }]
  const out: Tier[] = []
  if (query.tmdbId && supports.includes('tmdbid'))
    out.push({ by: 'tmdbid', query: { tmdbid: String(query.tmdbId) } })
  else if (query.imdbId && supports.includes('imdbid'))
    out.push({ by: 'imdbid', query: { imdbid: query.imdbId } })
  if (query.title) {
    const year = query.year ? String(query.year) : ''
    out.push(
      supports.includes('year') && year
        ? { by: 'title', query: { q: query.title, year } }
        : { by: 'title', query: { q: year ? `${query.title} ${year}` : query.title } },
    )
  }
  return out
}

const pad = (n: number) => String(n).padStart(2, '0')

/** `S01E02`, or `S01` for a season: how Sonarr's own releases and naming number them. */
export function episodeTag(tv: { season: number; episode?: number | null }): string {
  return tv.episode != null ? `S${pad(tv.season)}E${pad(tv.episode)}` : `S${pad(tv.season)}`
}

/**
 * Queries in the order a show's search tries them (Torznab's tv-search, torznab.github.io
 * spec-1.3-draft): the show's strongest id the indexer takes, with `season` and `ep`; then the
 * title with `season` and `ep`; and where the indexer doesn't take `season`, the title with
 * `S01E02` (or `S01`) in the keywords, as a release names it. An id without a season would bring
 * every episode, so an id goes alone only to a site that takes nothing else (EZTV's API looks a
 * show up by its IMDb id alone): the parser picks the episodes out of what it lists.
 */
function tvTiers(
  query: SearchQuery & { tv: NonNullable<SearchQuery['tv']> },
  supports: readonly string[],
): Tier[] {
  const { tv } = query
  const seasonParams = supports.includes('season')
  const numbered: Record<string, string> = { season: String(tv.season) }
  if (tv.episode != null) {
    // without `ep` the season comes whole and the decision picks the episode out of it
    if (supports.includes('ep')) numbered.ep = String(tv.episode)
  }
  const out: Tier[] = []
  if (seasonParams) {
    if (tv.tvdbId && supports.includes('tvdbid'))
      out.push({ by: 'tvdbid', query: { tvdbid: String(tv.tvdbId), ...numbered } })
    else if (query.tmdbId && supports.includes('tmdbid'))
      out.push({ by: 'tmdbid', query: { tmdbid: String(query.tmdbId), ...numbered } })
    else if (query.imdbId && supports.includes('imdbid'))
      out.push({ by: 'imdbid', query: { imdbid: query.imdbId, ...numbered } })
  } else if (query.imdbId && supports.includes('imdbid') && !supports.includes('q')) {
    out.push({ by: 'imdbid', query: { imdbid: query.imdbId } })
  }
  if (query.title) {
    // `ep` without a season isn't asked: the episode then goes in the keywords
    const whole = seasonParams && (tv.episode == null || numbered.ep !== undefined)
    out.push(
      whole
        ? { by: 'title', query: { q: query.title, ...numbered } }
        : { by: 'title', query: { q: `${query.title} ${episodeTag(tv)}` } },
    )
  }
  return out
}

/**
 * Drops repeats, and what the categories say is neither the kind searched nor unknown. `all` keeps
 * every kind: a test or a read of the newest releases on a site that lists no films (Nyaa's are
 * all TV/Anime), where a film's filter would leave nothing.
 */
const keepKind = (releases: IndexerRelease[], tv: boolean, all = false) => {
  const seen = new Set<string>()
  const wanted = tv ? isTvCategory : isMovieCategory
  return releases.filter((r) => {
    if (seen.has(r.guid)) return false
    seen.add(r.guid)
    return all || r.categories.length === 0 || r.categories.some(wanted)
  })
}

export async function runSearch(ctx: RunContext, query: SearchQuery): Promise<RunResult> {
  const def = ctx.definition
  return def.kind === 'torznab' || def.kind === 'newznab'
    ? feedSearch(ctx, def, query)
    : siteSearch(ctx, def, query)
}

// ------------------------------------------------------------------ Torznab and Newznab

async function feedSearch(
  ctx: RunContext,
  def: Extract<Definition, { kind: 'torznab' | 'newznab' }>,
  query: SearchQuery,
): Promise<RunResult> {
  const config = ctx.settings
  const base = baseUrlOf(def, config)
  const apikey = def.api.apiKey ? renderTemplate(def.api.apiKey, { Config: config }) : ''
  const path = renderTemplate(def.api.path, { Config: config })
  let ms = 0
  const get = async (params: Record<string, string>) => {
    await ctx.beforeRequest()
    const answer = await send(ctx.fetch, joinUrl(base, path, { ...params, apikey }), {
      timeoutMs: ctx.timeoutMs,
      now: ctx.now,
    })
    checkStatus(answer, ctx.now())
    ms += answer.ms
    return answer
  }

  const caps = ctx.caps ?? readCaps((await get({ t: 'caps' })).body)
  const tv = query.tv && query.keywords === undefined ? query.tv : null
  // a show's search uses tv-search where the caps list it, else the plain search with its keywords
  const special = tv
    ? caps.tv?.available === true
    : caps.movie.available && query.keywords === undefined
  const mode = special ? (tv ? caps.tv : caps.movie) : caps.search
  const supports = mode.params.length ? mode.params : ['q']
  const cats = tv ? tvCategoryIds(caps) : movieCategoryIds(caps)
  const cat = (cats.length ? cats : [tv ? TV_CATEGORIES[0] : MOVIE_CATEGORIES[0]]).join(',')
  const t = special ? (tv ? 'tvsearch' : 'movie') : 'search'
  let by = 'none'
  let releases: IndexerRelease[] = []
  const list = tv ? tvTiers({ ...query, tv }, supports) : tiers(query, supports)
  for (const tier of list) {
    const params: Record<string, string> = { t, cat, ...tier.query }
    // Newznab takes the IMDb id without its "tt" (e.g. 0058935); Torznab follows Newznab
    if (params.imdbid) params.imdbid = params.imdbid.replace(/^tt/i, '')
    if (query.keywords === '') delete params.q
    releases = keepKind(readItems((await get(params)).body, { now: ctx.now() }), tv !== null)
    by = tier.by
    if (releases.length) break
  }
  return { releases, session: null, caps, ms, by }
}

// ------------------------------------------------------------------ JSON, HTML and RSS

function renderRequest(request: RequestTemplate, inputs: TemplateInputs) {
  const render = (t: string) => renderTemplate(t, inputs)
  const map = (o: Record<string, string> | undefined) =>
    o ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, render(v)])) : undefined
  return {
    method: request.method,
    path: render(request.path),
    query: map(request.query) ?? {},
    form: map(request.form),
    headers: map(request.headers),
  }
}

/** Cookies from `Set-Cookie` headers, as one `Cookie` header (RFC 6265 § 4.2.1). */
function cookiesOf(answer: Answer): string {
  return answer.headers
    .getSetCookie()
    .map((c) => c.split(';')[0]?.trim() ?? '')
    .filter((c) => c.includes('='))
    .join('; ')
}

async function signIn(ctx: RunContext, def: Definition, base: string): Promise<string> {
  const login = def.login
  if (login.method !== 'form') return ''
  const req = renderRequest(login.request, { Config: ctx.settings })
  await ctx.beforeRequest()
  const answer = await send(ctx.fetch, joinUrl(base, req.path, req.query), {
    method: req.method,
    form: req.form,
    headers: req.headers,
    // a sign-in usually answers with a redirect that carries the cookie
    redirect: 'manual',
    timeoutMs: ctx.timeoutMs,
    now: ctx.now,
  })
  if (answer.status < 300 || answer.status >= 400) checkStatus(answer, ctx.now())
  if (login.error && answer.body) {
    const el = loadHtml(answer.body)(login.error.selector).first()
    if (el.length)
      throw new IndexerError(
        'auth',
        `The site refused the sign-in: ${el.text().replace(/\s+/g, ' ').trim() || 'no message'}`,
      )
  }
  const cookies = cookiesOf(answer)
  if (!cookies)
    throw new IndexerError(
      'auth',
      'The site didn’t sign highsea in. Check the username and password.',
    )
  return cookies
}

/** Signs in to a site with a form sign-in, for a grab whose session ran out. */
export function signInTo(ctx: RunContext): Promise<string> {
  return signIn(ctx, ctx.definition, baseUrlOf(ctx.definition, ctx.settings))
}

/** The cookie a site with a cookie sign-in takes, from its settings. */
export function cookieOf(ctx: Pick<RunContext, 'definition' | 'settings'>): string | null {
  const login = ctx.definition.login
  return login.method === 'cookie' ? renderTemplate(login.cookie, { Config: ctx.settings }) : null
}

async function siteSearch(
  ctx: RunContext,
  def: Extract<Definition, { kind: 'json' | 'html' | 'rss' }>,
  query: SearchQuery,
): Promise<RunResult> {
  const config = ctx.settings
  const base = baseUrlOf(def, config)
  const mapper = categoryMapper(def)
  const tv = query.tv && query.keywords === undefined ? query.tv : null
  const categories = mapper.siteIds(tv ? TV_CATEGORIES : MOVIE_CATEGORIES).join(',')
  let session = def.login.method === 'form' ? ctx.session : null
  let signedIn = false
  let ms = 0

  const fetchPage = async (inputs: TemplateInputs): Promise<Answer> => {
    if (def.login.method === 'form' && !session) {
      session = await signIn(ctx, def, base)
      signedIn = true
    }
    const req = renderRequest(def.search.request, inputs)
    const headers: Record<string, string> = { ...req.headers }
    if (def.login.method === 'cookie') headers.cookie = renderTemplate(def.login.cookie, inputs)
    if (session) headers.cookie = session
    await ctx.beforeRequest()
    const answer = await send(ctx.fetch, joinUrl(base, req.path, req.query), {
      method: req.method,
      form: req.form,
      headers,
      timeoutMs: ctx.timeoutMs,
      now: ctx.now,
    })
    checkStatus(answer, ctx.now())
    ms += answer.ms
    return answer
  }

  /** A form session that's run out shows as a page without the signed-in marker. */
  const sessionExpired = (answer: Answer) =>
    def.kind === 'html' &&
    def.login.method === 'form' &&
    def.login.loggedIn !== undefined &&
    loadHtml(answer.body)(def.login.loggedIn.selector).length === 0

  const read = (answer: Answer): IndexerRelease[] => {
    const now = ctx.now()
    if (def.kind === 'rss')
      return readItems(answer.body, {
        mapCategory: mapper.toStandard,
        elements: def.search.elements,
        now,
      })
    const sctx = {
      definition: def,
      config,
      pageUrl: answer.url,
      mapCategory: mapper.toStandard,
      now,
    }
    return def.kind === 'json'
      ? scrapeJson(sctx, answer.body)
      : scrapeHtml(sctx, loadHtml(answer.body))
  }

  let by = 'none'
  let releases: IndexerRelease[] = []
  const list = tv
    ? tvTiers({ ...query, tv }, def.search.supports)
    : tiers(query, def.search.supports)
  const everyKind =
    tv === null &&
    query.keywords !== undefined &&
    !def.categories.some((c) => isMovieCategory(c.standard))
  // keywords go only to a site that takes them; an empty search asks for the newest releases
  const takesKeywords = def.search.supports.includes('q')
  for (const tier of list) {
    const q = tier.query
    if (q.q && !takesKeywords) continue
    const inputs: TemplateInputs = {
      Config: config,
      Query: {
        Keywords: q.q ?? '',
        Title: query.title ?? '',
        Year: tv
          ? ''
          : (q.year ?? (query.year && tier.by !== 'keywords' ? String(query.year) : '')),
        IMDBID: q.imdbid ?? '',
        IMDBIDShort: q.imdbid?.replace(/^tt/i, '') ?? '',
        TMDBID: q.tmdbid ?? '',
        Season: q.season ?? '',
        Episode: q.ep ?? '',
        Categories: categories,
      },
    }
    let answer = await fetchPage(inputs)
    if (sessionExpired(answer)) {
      if (signedIn)
        throw new IndexerError(
          'auth',
          'The site signed highsea out straight away. Check the account.',
        )
      session = null
      answer = await fetchPage(inputs)
      if (sessionExpired(answer))
        throw new IndexerError('auth', 'The site didn’t keep highsea signed in.')
    }
    releases = keepKind(read(answer), tv !== null, everyKind)
    by = tier.by
    if (releases.length) break
  }
  return { releases, session: signedIn ? session : null, caps: null, ms, by }
}

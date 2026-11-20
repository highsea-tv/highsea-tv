// SPDX-License-Identifier: AGPL-3.0-only
// A show's interactive search (Phase 5 C1, ADR 0064 § C1): a season, or one episode in it, asked of
// every usable indexer (Torznab's tv-search with `season` and `ep` where the caps list it, else the
// title with `S01E02` or `S01`). Each result is numbered by the parser (one episode, several, or a
// season pack), matched to the show and its episodes, and judged by the decision engine against
// the show's profile with the episode sizes, for the runtime of every episode it brings.
//
// The season-pack rule is Sonarr's documented one (wiki.servarr.com/sonarr/troubleshooting: "Season
// Packs will only be grabbed if all episodes in the season are monitored and the season pack
// upgrades all existing episodes or all episodes are missing"): a release is approved only when
// every episode it brings is monitored and either has no file or has one the release upgrades
// (HT-109: the decision engine's upgrade checks against each file it would replace, so one file at
// its cutoff, or one the release isn't better than, rejects it). A pack also needs every episode in
// it aired, so a season still airing is fetched an episode at a time. The same rule holds for a
// multi-episode release. Where both an approved pack and single episodes are found, the automatic
// search takes the pack (`chooseReleases`).
//
// The results are kept for 30 minutes per show and scope, apart from the films', so a grab can take
// one by its guid without searching again. RSS (HT-109, ADR 0045 § C1) judges the feeds' new
// episode releases the same way, per show and season, and keeps them as that season's results.
import type { Clock, Logger } from '@highsea-tv/core'
import { type Db, schema } from '@highsea-tv/db'
import { type ParsedEpisode, parse, parseEpisode } from '@highsea-tv/parser'
import {
  type CustomFormat,
  compareReleases,
  type DecisionReason,
  decide,
  type ExistingFile,
  type IndexerRankable,
  indexerTiebreakers,
  type QualityProfile,
  type QualitySize,
  qualityT,
  sizeLimits,
} from '@highsea-tv/quality'
import type { Definition } from '@highsea-tv/schemas/indexers'
import { and, asc, eq, gt, lte } from 'drizzle-orm'
import type { RunResult, SearchQuery } from './engine.ts'
import type { IndexerRelease } from './release.ts'
import {
  DEFAULT_MINIMUM_SEEDERS,
  flagsOf,
  onlyAnime,
  RELEASES_TTL_MS,
  type ReleaseView,
  type SearchResult,
  searchable,
  servesMovie,
} from './search.ts'

const { showReleases } = schema

/** A runtime TMDB doesn't give, for sizes: a drama's hour less its breaks (TMDB's usual). */
export const ASSUMED_EPISODE_MINUTES = 45

/** One of the show's episodes, as the search weighs a release against it. */
export type EpisodeFacts = {
  /** The episode's item id. */
  id: string
  season: number
  episode: number
  runtimeMinutes: number | null
  monitored: boolean
  hasFile: boolean
  /** Its air date has come. */
  aired: boolean
  /**
   * Its file as the decision engine weighs an upgrade (HT-109): the quality, revision and format
   * score. Null with a file means it can't be judged, so nothing replaces it.
   */
  existing?: ExistingFile | null
}

/** What a show's search is for: a season, or one episode in it. */
export type EpisodeScope = { season: number; episode?: number | null }

export type ShowSearchInput = {
  tmdbId: number
  tvdbId: number | null
  imdbId: string | null
  title: string
  year: number | null
  originalLanguage: string | null
  scope: EpisodeScope
  /** The show's episodes, every season's. */
  episodes: readonly EpisodeFacts[]
  profile: QualityProfile
  formats: readonly CustomFormat[]
  /** The episode sizes (Settings › Quality's per-minute sizes for episodes). */
  sizes: readonly QualitySize[]
  locale?: string
  tags?: readonly string[]
  /**
   * An automatic search (Search, the add dialog's Start searching, a failed download's next try),
   * whose best releases are grabbed without a person choosing: a site that lists only anime is
   * passed by (`onlyAnime`). Interactive search still asks it.
   */
  automatic?: boolean
  /** Whether the show's blocklist has the release: it's rejected. */
  blocked?: (release: {
    indexerId: string
    guid: string
    infoHash: string | null
    title: string
  }) => boolean
}

/** A show's release: the film's view, with the episodes it brings. */
export type EpisodeReleaseView = ReleaseView & {
  /** The item ids of the episodes it brings, in order. */
  episodeIds: string[]
  season: number
  /** Its episode numbers in that season; every one for a pack. */
  episodes: number[]
  /** A whole season. */
  pack: boolean
}

export type EpisodeLeftOutReason = 'other-show' | 'other-episode' | 'not-episode' | 'duplicate'

export type EpisodeSearchResult = Omit<SearchResult, 'releases' | 'leftOut'> & {
  releases: EpisodeReleaseView[]
  leftOut: {
    indexerId: string
    indexer: string
    reason: EpisodeLeftOutReason
    count: number
    found: number
  }[]
}

/** The cache's key for a scope: `s1` for season 1, `s1e2` for its second episode. */
export const scopeKey = (scope: EpisodeScope) =>
  scope.episode != null ? `s${scope.season}e${scope.episode}` : `s${scope.season}`

const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\(\d{4}\)$/, '')
    .replace(/[^a-z0-9]+/g, '')

/** Whether a release is this show: by TVDB id when the feed gives one, else by its title. */
export function matchesShow(
  release: Pick<IndexerRelease, 'tvdbId' | 'imdbId'>,
  parsed: Pick<ParsedEpisode, 'title' | 'year'>,
  show: Pick<ShowSearchInput, 'tvdbId' | 'imdbId' | 'title' | 'year'>,
): boolean {
  if (release.tvdbId !== null && show.tvdbId) return release.tvdbId === show.tvdbId
  if (release.imdbId !== null && show.imdbId) return release.imdbId === show.imdbId
  // a feed's tmdbid is a film's or a show's, which share numbers, so it isn't trusted here
  if (norm(parsed.title) !== norm(show.title)) return false
  return parsed.year === null || show.year === null || Math.abs(parsed.year - show.year) <= 1
}

/** A show RSS matches releases against (HT-109): one still wanting an episode or an upgrade. */
export type ShowRssTarget = {
  tmdbId: number
  tvdbId: number | null
  imdbId: string | null
  title: string
  year: number | null
}

/** Finds the show a release is for among many, as `matchesShow` would for each. Built once a run. */
export function showMatcher(targets: readonly ShowRssTarget[]) {
  const byTvdb = new Map<number, ShowRssTarget>()
  const byImdb = new Map<string, ShowRssTarget>()
  const byTitle = new Map<string, ShowRssTarget[]>()
  for (const t of targets) {
    if (t.tvdbId) byTvdb.set(t.tvdbId, t)
    if (t.imdbId) byImdb.set(t.imdbId, t)
    const title = norm(t.title)
    if (title) byTitle.set(title, [...(byTitle.get(title) ?? []), t])
  }
  return (
    release: Pick<IndexerRelease, 'tvdbId' | 'imdbId'>,
    parsed: Pick<ParsedEpisode, 'title' | 'year'>,
  ): ShowRssTarget | null => {
    if (release.tvdbId !== null) {
      const t = byTvdb.get(release.tvdbId)
      if (t) return t
    }
    if (release.imdbId !== null) {
      const t = byImdb.get(release.imdbId)
      if (t) return t
    }
    const same = byTitle.get(norm(parsed.title)) ?? []
    return same.find((t) => matchesShow(release, parsed, t)) ?? null
  }
}

const code = (season: number, episode: number) =>
  `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`

/**
 * The episodes a parsed release brings, as the show lists them, or why it can't be placed: a pack
 * brings each listed episode of its seasons, an episode release the ones it names.
 */
export function episodesOf(
  parsed: ParsedEpisode,
  episodes: readonly EpisodeFacts[],
): { covered: EpisodeFacts[]; unknown: string[] } {
  if (parsed.fullSeason) {
    const covered = episodes
      .filter((e) => parsed.seasons.includes(e.season))
      .sort((a, b) => a.season - b.season || a.episode - b.episode)
    return { covered, unknown: [] }
  }
  const covered: EpisodeFacts[] = []
  const unknown: string[] = []
  for (const n of parsed.episodes) {
    const e = episodes.find((x) => x.season === parsed.season && x.episode === n)
    if (e) covered.push(e)
    else unknown.push(code(parsed.season, n))
  }
  return { covered, unknown }
}

/** Whether a release's episodes touch what was searched. */
const inScope = (covered: readonly EpisodeFacts[], scope: EpisodeScope) =>
  covered.some(
    (e) => e.season === scope.season && (scope.episode == null || e.episode === scope.episode),
  )

/** The reasons a release's episodes give: the season-pack rule above, for packs and the rest. */
export function episodeReasons(
  parsed: Pick<ParsedEpisode, 'fullSeason' | 'season'>,
  covered: readonly EpisodeFacts[],
  unknown: readonly string[],
  locale = 'en',
): DecisionReason[] {
  const t = qualityT(locale)
  const list = (es: readonly EpisodeFacts[]) => es.map((e) => code(e.season, e.episode)).join(', ')
  const out: DecisionReason[] = []
  if (unknown.length)
    out.push({ kind: 'rejected', message: t('episodes.unknown', { episodes: unknown.join(', ') }) })
  const unmonitored = covered.filter((e) => !e.monitored)
  if (unmonitored.length)
    out.push({
      kind: 'rejected',
      message: t('episodes.notMonitored', { episodes: list(unmonitored) }),
    })
  // a file the decision engine can weigh is judged as an upgrade; one it can't is left alone
  const filed = covered.filter((e) => e.hasFile && !e.existing)
  if (filed.length)
    out.push({ kind: 'rejected', message: t('episodes.hasFile', { episodes: list(filed) }) })
  if (parsed.fullSeason) {
    const unaired = covered.filter((e) => !e.aired)
    if (unaired.length)
      out.push({ kind: 'rejected', message: t('episodes.notAired', { episodes: list(unaired) }) })
  }
  if (!out.length) {
    if (parsed.fullSeason)
      out.push({
        kind: 'accepted',
        message: t('episodes.pack', { count: covered.length, season: parsed.season }),
      })
    else if (covered.length > 1)
      out.push({ kind: 'accepted', message: t('episodes.several', { episodes: list(covered) }) })
  }
  return out
}

/** Minutes of every episode a release brings, for its size limits. */
export const runtimeOf = (covered: readonly EpisodeFacts[]) =>
  covered.reduce((sum, e) => sum + (e.runtimeMinutes || ASSUMED_EPISODE_MINUTES), 0)

/**
 * What an automatic search grabs from a scope's results, best first: the best approved pack, when
 * there is one; otherwise, for each wanted episode in turn, the best approved release that brings
 * it and nothing already taken. A release is approved only when everything it brings is missing or
 * upgraded by it, so a pack approved is the whole season wanted.
 */
export function chooseReleases(
  releases: readonly EpisodeReleaseView[],
  wanted: readonly string[],
): EpisodeReleaseView[] {
  const approved = releases.filter((r) => r.approved)
  const pack = approved.find((r) => r.pack)
  if (pack) return [pack]
  const taken = new Set<string>()
  const out: EpisodeReleaseView[] = []
  for (const id of wanted) {
    if (taken.has(id)) continue
    const best = approved.find(
      (r) => !r.pack && r.episodeIds.includes(id) && r.episodeIds.every((e) => !taken.has(e)),
    )
    if (!best) continue
    out.push(best)
    for (const e of best.episodeIds) taken.add(e)
  }
  return out
}

type Candidate<R> = { row: R; definition: Definition; blocked: boolean }
type IndexerRow = { id: string; name: string; priority: number; tags: string[] }

export function createEpisodeSearch<R extends IndexerRow>(deps: {
  db: Db
  clock: Clock
  logger: Logger
  candidates: () => Candidate<R>[]
  run: (row: R, definition: Definition, query: SearchQuery) => Promise<RunResult>
  isFailing: (id: string) => boolean
}) {
  const { db, clock } = deps

  function judge(input: ShowSearchInput, c: Candidate<R>, r: IndexerRelease, now: number) {
    const numbered = parseEpisode(r.title)
    if (!numbered) return 'not-episode' as const
    if (!matchesShow(r, numbered, input)) return 'other-show' as const
    const { covered, unknown } = episodesOf(numbered, input.episodes)
    if (!inScope(covered, input.scope)) return 'other-episode' as const
    const parsed = parse(r.title)
    const runtime = runtimeOf(covered)
    const ageMinutes = r.published ? Math.max(0, (now - Date.parse(r.published)) / 60_000) : null
    const flags = flagsOf(r)
    const blocked =
      input.blocked?.({
        indexerId: c.row.id,
        guid: r.guid,
        infoHash: r.infohash,
        title: r.title,
      }) ?? false
    // one decision per file the release would replace (Sonarr's "upgrades all existing episodes"),
    // or one with nothing to replace; every one must approve
    const replaced = [
      ...new Map(
        covered
          .flatMap((e) => (e.hasFile && e.existing ? [e.existing] : []))
          .map((x) => [
            `${x.quality}|${x.formatScore}|${x.revision.version}|${x.revision.real}`,
            x,
          ]),
      ).values(),
    ]
    const decisions = (replaced.length ? replaced : [null]).map((existing) =>
      decide(
        {
          release: parsed,
          size: r.size,
          movie: {
            title: input.title,
            year: input.year,
            runtimeMinutes: runtime,
            originalLanguage: input.originalLanguage,
          },
          profile: input.profile,
          formats: input.formats,
          sizes: input.sizes,
          existing,
          blocklisted: false,
          indexer: {
            indexerId: c.row.id,
            indexerName: c.row.name,
            protocol: 'torrent',
            flags,
            seeders: r.seeders,
            ageMinutes,
            minimumSeeders: DEFAULT_MINIMUM_SEEDERS,
            blocked: deps.isFailing(c.row.id),
          },
        },
        { locale: input.locale },
      ),
    )
    const decision = {
      ...(decisions[0] as (typeof decisions)[number]),
      approved: decisions.every((d) => d.approved),
      reasons: [
        ...new Map(decisions.flatMap((d) => d.reasons).map((x) => [x.message, x])).values(),
      ],
    }
    const episodes = episodeReasons(numbered, covered, unknown, input.locale)
    if (blocked)
      episodes.unshift({
        kind: 'rejected',
        message: qualityT(input.locale)('episodes.blocklisted'),
      })
    const reasons = [...episodes, ...decision.reasons]
    const view: EpisodeReleaseView = {
      guid: r.guid,
      title: r.title,
      indexerId: c.row.id,
      indexer: c.row.name,
      protocol: 'torrent',
      size: r.size,
      seeders: r.seeders,
      leechers: r.leechers,
      grabs: r.grabs,
      publishedAt: r.published,
      ageHours: ageMinutes === null ? null : Math.round(ageMinutes / 60),
      details: r.details,
      quality: decision.quality,
      customFormats: decision.formats.map((f) => f.name),
      formatScore: decision.formatScore,
      flags,
      languages: parsed.languages,
      approved: decision.approved && !reasons.some((x) => x.kind === 'rejected'),
      reasons,
      episodeIds: covered.map((e) => e.id),
      season: numbered.season,
      episodes: numbered.fullSeason ? covered.map((e) => e.episode) : numbered.episodes,
      pack: numbered.fullSeason,
    }
    const rank: IndexerRankable = {
      quality: decision.quality,
      revision: parsed.quality.revision,
      formatScore: decision.formatScore,
      protocol: 'torrent',
      indexerPriority: c.row.priority,
      seeders: r.seeders,
      size: r.size,
      preferredSize: sizeLimits(input.sizes, decision.quality, runtime).preferred,
    }
    return {
      view,
      rank,
      download: { download: r.download, magnet: r.magnet, infohash: r.infohash },
    }
  }

  type Judged = Exclude<ReturnType<typeof judge>, string>

  /** Ranks a scope's judged releases and keeps them as its results, replacing the last ones. */
  function keep(input: ShowSearchInput, judged: Judged[], now: number): string {
    const byRank = compareReleases<IndexerRankable>(input.profile, indexerTiebreakers())
    judged.sort(
      (a, b) => Number(b.view.approved) - Number(a.view.approved) || byRank(a.rank, b.rank),
    )
    const scope = scopeKey(input.scope)
    db.transaction((tx) => {
      tx.delete(showReleases)
        .where(and(eq(showReleases.showTmdbId, input.tmdbId), eq(showReleases.scope, scope)))
        .run()
      judged.forEach((j, rank) => {
        tx.insert(showReleases)
          .values({
            showTmdbId: input.tmdbId,
            scope,
            indexerId: j.view.indexerId,
            guid: j.view.guid,
            data: { ...j.view, rank },
            download: j.download,
            fetchedAt: now,
            expiresAt: now + RELEASES_TTL_MS,
          })
          .onConflictDoNothing()
          .run()
      })
    })
    return scope
  }

  return {
    /**
     * RSS for shows (HT-109): the films' RSS hands each new release from a feed here first. One
     * that's numbered as an episode or a season is taken (a film never matches it), matched to a
     * show still wanting something, and judged against that show's season; `finish` keeps each
     * season's releases as its results and returns the seasons with an approved one, for the
     * caller to grab from.
     */
    rss(
      targets: readonly ShowRssTarget[],
      inputFor: (tmdbId: number, scope: EpisodeScope) => ShowSearchInput | null,
    ) {
      const match = showMatcher(targets)
      const inputs = new Map<string, ShowSearchInput | null>()
      const bySeason = new Map<string, Judged[]>()
      return {
        /** Whether the release was an episode's: the films' matching skips it then. */
        take(c: Candidate<R>, r: IndexerRelease, now: number): boolean {
          const numbered = parseEpisode(r.title)
          if (!numbered) return false
          const target = match(r, numbered)
          if (!target) return true
          const key = `${target.tmdbId}|${numbered.season}`
          if (!inputs.has(key))
            inputs.set(key, inputFor(target.tmdbId, { season: numbered.season }))
          const input = inputs.get(key)
          // an indexer's tags scope RSS too, as they do a film's
          if (!input || !servesMovie(c.row, input.tags)) return true
          const j = judge(input, c, r, now)
          if (typeof j !== 'string') bySeason.set(key, [...(bySeason.get(key) ?? []), j])
          return true
        },
        finish(now: number): { tmdbId: number; scope: EpisodeScope }[] {
          const out: { tmdbId: number; scope: EpisodeScope }[] = []
          for (const [key, judged] of bySeason) {
            const input = inputs.get(key)
            if (!input || !judged.some((j) => j.view.approved)) continue
            keep(input, judged, now)
            out.push({ tmdbId: input.tmdbId, scope: input.scope })
          }
          return out
        },
      }
    },

    async search(input: ShowSearchInput): Promise<EpisodeSearchResult> {
      const candidates = deps
        .candidates()
        .filter(
          (c) =>
            servesMovie(c.row, input.tags) &&
            searchable(c.definition) &&
            !(input.automatic && onlyAnime(c.definition)),
        )
      const query: SearchQuery = {
        title: input.title,
        imdbId: input.imdbId,
        tmdbId: input.tmdbId,
        tv: { season: input.scope.season, episode: input.scope.episode, tvdbId: input.tvdbId },
      }
      const settled = await Promise.allSettled(
        candidates.map((c) => deps.run(c.row, c.definition, query)),
      )
      const now = clock.now()
      const failed: EpisodeSearchResult['failed'] = []
      const leftOut: EpisodeSearchResult['leftOut'] = []
      const judged: Judged[] = []
      const asked: Record<string, unknown>[] = []
      settled.forEach((s, i) => {
        const c = candidates[i] as Candidate<R>
        if (s.status === 'rejected') {
          const message = (s.reason as Error).message
          failed.push({ indexerId: c.row.id, indexer: c.row.name, message })
          asked.push({ indexer: c.row.name, failed: message })
          return
        }
        const seen = new Set<string>()
        const dropped: Record<EpisodeLeftOutReason, number> = {
          'other-show': 0,
          'other-episode': 0,
          'not-episode': 0,
          duplicate: 0,
        }
        for (const r of s.value.releases) {
          if (seen.has(r.guid)) {
            dropped.duplicate++
            continue
          }
          seen.add(r.guid)
          const j = judge(input, c, r, now)
          if (typeof j === 'string') dropped[j]++
          else judged.push(j)
        }
        const found = s.value.releases.length
        for (const [reason, count] of Object.entries(dropped) as [EpisodeLeftOutReason, number][])
          if (count > 0)
            leftOut.push({ indexerId: c.row.id, indexer: c.row.name, reason, count, found })
        asked.push({ indexer: c.row.name, by: s.value.by, found, ...dropped })
      })
      const scope = keep(input, judged, now)
      deps.logger.info('searched for episodes', {
        tmdbId: input.tmdbId,
        title: input.title,
        scope,
        indexers: asked,
        releases: judged.length,
        approved: judged.filter((j) => j.view.approved).length,
      })
      return {
        releases: judged.map((j) => j.view),
        searched: candidates.length,
        failed,
        leftOut,
      }
    },

    /** The last search's releases for a show's scope, best first, while they're fresh. */
    cached(tmdbId: number, scope: EpisodeScope): EpisodeReleaseView[] {
      return db
        .select({ data: showReleases.data })
        .from(showReleases)
        .where(
          and(
            eq(showReleases.showTmdbId, tmdbId),
            eq(showReleases.scope, scopeKey(scope)),
            gt(showReleases.expiresAt, clock.now()),
          ),
        )
        .orderBy(asc(showReleases.fetchedAt))
        .all()
        .map((r) => r.data as EpisodeReleaseView & { rank: number })
        .sort((a, b) => a.rank - b.rank)
        .map(({ rank: _rank, ...view }) => view)
    },

    /** One cached release, for a grab, with where it's fetched from. */
    find(tmdbId: number, scope: EpisodeScope, indexerId: string, guid: string) {
      const row = db
        .select()
        .from(showReleases)
        .where(
          and(
            eq(showReleases.showTmdbId, tmdbId),
            eq(showReleases.scope, scopeKey(scope)),
            eq(showReleases.indexerId, indexerId),
            eq(showReleases.guid, guid),
            gt(showReleases.expiresAt, clock.now()),
          ),
        )
        .get()
      if (!row) return null
      const { rank: _rank, ...release } = row.data as EpisodeReleaseView & { rank: number }
      return {
        release,
        download: row.download as {
          download: string | null
          magnet: string | null
          infohash: string | null
        },
      }
    },

    prune() {
      db.delete(showReleases).where(lte(showReleases.expiresAt, clock.now())).run()
    },
  }
}

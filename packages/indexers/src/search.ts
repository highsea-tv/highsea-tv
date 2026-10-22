// SPDX-License-Identifier: AGPL-3.0-only
// Interactive search (ADR 0035): one query fans out to every usable indexer at once, each bounded
// by its timeout. Each result is parsed, matched to the movie, judged by the decision engine with
// the indexer's facts, and ranked. The results are kept for 30 minutes so checkpoint 6's Grab can
// take one by its guid without searching again.
//
// RSS sync (checkpoint 8a, ADR 0045) reads each indexer's newest releases (an empty search, which
// Torznab defines as the latest items: https://torznab.github.io/spec-1.3-draft/), parses each once,
// matches it to the movies still wanted, and judges it for each as a search would, so nothing RSS
// grabs couldn't be grabbed by hand. Guids already read are remembered per indexer for 14 days.
import type { Clock, Logger } from '@highsea/core'
import { type Db, schema } from '@highsea/db'
import { type ParsedRelease, parse } from '@highsea/parser'
import {
  type CustomFormat,
  compareReleases,
  type DecisionReason,
  decide,
  type ExistingFile,
  type IndexerFlag,
  type IndexerRankable,
  indexerTiebreakers,
  type MovieFacts,
  type QualityProfile,
  type QualitySize,
  sizeLimits,
} from '@highsea/quality'
import type { Definition } from '@highsea/schemas/indexers'
import { and, asc, eq, gt, inArray, lte } from 'drizzle-orm'
import type { RunResult, SearchQuery } from './engine.ts'
import type { IndexerRelease } from './release.ts'

const { releases: releasesTable, rssSeen } = schema

/** How long RSS remembers a guid it read (the plan's 14 days). */
export const RSS_SEEN_MS = 14 * 24 * 60 * 60 * 1000

/** How long a search's results can be grabbed by guid. */
export const RELEASES_TTL_MS = 30 * 60 * 1000
/** Radarr's default Minimum Seeders is 1 (wiki.servarr.com/radarr/settings#indexers). */
export const DEFAULT_MINIMUM_SEEDERS = 1

export type SearchInput = {
  tmdbId: number
  imdbId: string | null
  /** The title an indexer is searched by, and the year. */
  title: string
  year: number | null
  movie: MovieFacts
  profile: QualityProfile
  formats: readonly CustomFormat[]
  sizes: readonly QualitySize[]
  existing?: ExistingFile | null
  locale?: string
  /**
   * The movie's tag ids (checkpoint 8c). An indexer with tags is asked only for movies sharing one,
   * as Radarr's are: "Only use this indexer for movies with at least one matching tag. Leave blank
   * to use with all movies." (wiki.servarr.com/radarr/settings#indexers).
   */
  tags?: readonly string[]
  /** Whether the movie's blocklist has the release (checkpoint 6's downloads); it's rejected. */
  blocked?: (release: {
    indexerId: string
    guid: string
    infoHash: string | null
    title: string
  }) => boolean
}

/** A movie RSS can match a release to. */
export type RssTarget = {
  tmdbId: number
  imdbId: string | null
  title: string
  originalTitle: string | null
  year: number | null
}

export type RssResult = {
  /** How many indexers were read. */
  read: number
  /** Releases the feeds held, and those not read before. */
  fetched: number
  fresh: number
  /** Movies with a new approved release, best first in their cached results. */
  matched: number[]
  failed: { indexerId: string; indexer: string; message: string }[]
}

/** A release as the API returns it: the decision, its reasons, and nothing that holds a passkey. */
export type ReleaseView = {
  guid: string
  title: string
  indexerId: string
  indexer: string
  protocol: 'torrent' | 'usenet'
  size: number | null
  seeders: number | null
  leechers: number | null
  grabs: number | null
  publishedAt: string | null
  ageHours: number | null
  /** The release's page on the site. */
  details: string | null
  quality: string
  customFormats: string[]
  formatScore: number
  flags: IndexerFlag[]
  languages: string[]
  approved: boolean
  reasons: DecisionReason[]
}

export type SearchResult = {
  releases: ReleaseView[]
  /** How many indexers were asked. */
  searched: number
  /** The indexers that didn't answer, with why. */
  failed: { indexerId: string; indexer: string; message: string }[]
}

/** SQLite's limit on bound variables is 32766 (https://sqlite.org/limits.html); 500 a statement is safe. */
const chunk = <T>(xs: readonly T[], size = 500): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size))
  return out
}

type Candidate<R> = { row: R; definition: Definition; blocked: boolean }
type IndexerRow = { id: string; name: string; priority: number; tags: string[] }

/** Whether an indexer may be used for a movie: it has no tags, or shares one with the movie. */
export const servesMovie = (indexer: Pick<IndexerRow, 'tags'>, movieTags: readonly string[] = []) =>
  indexer.tags.length === 0 || indexer.tags.some((t) => movieTags.includes(t))

/**
 * Indexer flags from Torznab's volume factors: what share of the download counts against the
 * account, and how much the upload counts (Torznab 1.3, "Predefined attributes").
 */
export function flagsOf(
  r: Pick<IndexerRelease, 'downloadVolumeFactor' | 'uploadVolumeFactor'>,
): IndexerFlag[] {
  const flags: IndexerFlag[] = []
  const d = r.downloadVolumeFactor
  if (d === 0) flags.push('freeleech')
  else if (d === 0.25) flags.push('freeleech75')
  else if (d === 0.5) flags.push('halfleech')
  else if (d === 0.75) flags.push('freeleech25')
  if (r.uploadVolumeFactor !== null && r.uploadVolumeFactor >= 2) flags.push('doubleUpload')
  return flags
}

/** A title as releases and movies are compared: no accents, case or punctuation. */
const norm = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')

// a year a release names may be one off, as release dates differ by country
const nearYear = (a: number | null, b: number | null) =>
  a === null || b === null || Math.abs(a - b) <= 1

/** Whether a result is this movie: by id when both sides have one, else by title and year. */
export function matchesMovie(
  release: IndexerRelease,
  parsedTitle: string,
  parsedYear: number | null,
  input: SearchInput,
): boolean {
  if (release.tmdbId !== null) return release.tmdbId === input.tmdbId
  if (release.imdbId !== null && input.imdbId) return release.imdbId === input.imdbId
  if (norm(parsedTitle) !== norm(input.title)) return false
  return nearYear(parsedYear, input.year)
}

/**
 * Finds the movie a release is for among many, as `matchesMovie` would for each: by TMDB or IMDb
 * id when the indexer gives one, else by title (or original title) and year. Built once per run.
 */
export function rssMatcher(targets: readonly RssTarget[]) {
  const byTmdb = new Map<number, RssTarget>()
  const byImdb = new Map<string, RssTarget>()
  const byTitle = new Map<string, RssTarget[]>()
  for (const t of targets) {
    byTmdb.set(t.tmdbId, t)
    if (t.imdbId) byImdb.set(t.imdbId, t)
    for (const title of new Set([norm(t.title), t.originalTitle ? norm(t.originalTitle) : ''])) {
      if (!title) continue
      byTitle.set(title, [...(byTitle.get(title) ?? []), t])
    }
  }
  return (release: IndexerRelease, parsed: ParsedRelease): RssTarget | null => {
    if (release.tmdbId !== null) return byTmdb.get(release.tmdbId) ?? null
    if (release.imdbId !== null) {
      const t = byImdb.get(release.imdbId)
      if (t) return t
    }
    const same = byTitle.get(norm(parsed.title)) ?? []
    return same.find((t) => nearYear(parsed.year, t.year)) ?? null
  }
}

export function createSearch<R extends IndexerRow>(deps: {
  db: Db
  clock: Clock
  logger: Logger
  candidates: () => Candidate<R>[]
  run: (row: R, definition: Definition, query: SearchQuery) => Promise<RunResult>
  isFailing: (id: string) => boolean
}) {
  const { db, clock } = deps

  function judge(
    input: SearchInput,
    c: Candidate<R>,
    r: IndexerRelease,
    now: number,
    parsed = parse(r.title),
  ) {
    if (!matchesMovie(r, parsed.title, parsed.year, input)) return null
    const ageMinutes = r.published ? Math.max(0, (now - Date.parse(r.published)) / 60_000) : null
    const flags = flagsOf(r)
    const decision = decide(
      {
        release: parsed,
        size: r.size,
        movie: input.movie,
        profile: input.profile,
        formats: input.formats,
        sizes: input.sizes,
        existing: input.existing ?? null,
        blocklisted:
          input.blocked?.({
            indexerId: c.row.id,
            guid: r.guid,
            infoHash: r.infohash,
            title: r.title,
          }) ?? false,
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
    )
    const view: ReleaseView = {
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
      approved: decision.approved,
      reasons: decision.reasons,
    }
    const rank: IndexerRankable = {
      quality: decision.quality,
      revision: parsed.quality.revision,
      formatScore: decision.formatScore,
      protocol: 'torrent',
      indexerPriority: c.row.priority,
      seeders: r.seeders,
      size: r.size,
      preferredSize: sizeLimits(input.sizes, decision.quality, input.movie.runtimeMinutes)
        .preferred,
    }
    return {
      view,
      rank,
      download: { download: r.download, magnet: r.magnet, infohash: r.infohash },
    }
  }

  type Judged = NonNullable<ReturnType<typeof judge>>

  /** Ranks judged releases, approved first, and makes them the movie's cached results. */
  function keep(input: SearchInput, judged: Judged[], now: number) {
    const byRank = compareReleases<IndexerRankable>(input.profile, indexerTiebreakers())
    judged.sort(
      (a, b) => Number(b.view.approved) - Number(a.view.approved) || byRank(a.rank, b.rank),
    )
    db.transaction((tx) => {
      tx.delete(releasesTable).where(eq(releasesTable.tmdbId, input.tmdbId)).run()
      judged.forEach((j, rank) => {
        tx.insert(releasesTable)
          .values({
            tmdbId: input.tmdbId,
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
  }

  return {
    count: () => deps.candidates().length,

    async search(input: SearchInput): Promise<SearchResult> {
      const candidates = deps.candidates().filter((c) => servesMovie(c.row, input.tags))
      const query: SearchQuery = {
        title: input.title,
        year: input.year,
        imdbId: input.imdbId,
        tmdbId: input.tmdbId,
      }
      const settled = await Promise.allSettled(
        candidates.map((c) => deps.run(c.row, c.definition, query)),
      )
      const now = clock.now()
      const failed: SearchResult['failed'] = []
      const judged: Judged[] = []
      settled.forEach((s, i) => {
        const c = candidates[i] as Candidate<R>
        if (s.status === 'rejected') {
          failed.push({
            indexerId: c.row.id,
            indexer: c.row.name,
            message: (s.reason as Error).message,
          })
          return
        }
        const seen = new Set<string>()
        for (const r of s.value.releases) {
          if (seen.has(r.guid)) continue
          seen.add(r.guid)
          const j = judge(input, c, r, now)
          if (j) judged.push(j)
        }
      })
      keep(input, judged, now)
      return { releases: judged.map((j) => j.view), searched: candidates.length, failed }
    },

    /**
     * RSS sync: every usable indexer's newest releases, each new one matched to a target and judged
     * for it. A movie with an approved release gets the run's releases as its cached results, for
     * `grabBest` to take; the caller grabs. The guids are remembered before this returns.
     */
    async rss(
      targets: readonly RssTarget[],
      inputFor: (tmdbId: number) => SearchInput | null,
    ): Promise<RssResult> {
      const candidates = deps.candidates()
      const settled = await Promise.allSettled(
        candidates.map((c) => deps.run(c.row, c.definition, { keywords: '' })),
      )
      const now = clock.now()
      const match = rssMatcher(targets)
      const inputs = new Map<number, SearchInput | null>()
      const byMovie = new Map<number, Judged[]>()
      const result: RssResult = {
        read: candidates.length,
        fetched: 0,
        fresh: 0,
        matched: [],
        failed: [],
      }
      settled.forEach((s, i) => {
        const c = candidates[i] as Candidate<R>
        if (s.status === 'rejected') {
          result.failed.push({
            indexerId: c.row.id,
            indexer: c.row.name,
            message: (s.reason as Error).message,
          })
          return
        }
        const releases = s.value.releases
        result.fetched += releases.length
        const seen = new Set<string>()
        for (const part of chunk(releases.map((r) => r.guid)))
          for (const row of db
            .select({ guid: rssSeen.guid })
            .from(rssSeen)
            .where(and(eq(rssSeen.indexerId, c.row.id), inArray(rssSeen.guid, part)))
            .all())
            seen.add(row.guid)
        const fresh: string[] = []
        for (const r of releases) {
          if (seen.has(r.guid)) continue
          seen.add(r.guid)
          fresh.push(r.guid)
          const parsed = parse(r.title)
          const target = match(r, parsed)
          if (!target) continue
          if (!inputs.has(target.tmdbId)) inputs.set(target.tmdbId, inputFor(target.tmdbId))
          const input = inputs.get(target.tmdbId)
          // an indexer's tags scope RSS too: Radarr rejects a release from an indexer whose tags
          // the movie doesn't share (its IndexerTagSpecification)
          if (!input || !servesMovie(c.row, input.tags)) continue
          const j = judge(input, c, r, now, parsed)
          if (j) byMovie.set(target.tmdbId, [...(byMovie.get(target.tmdbId) ?? []), j])
        }
        result.fresh += fresh.length
        db.transaction((tx) => {
          for (const part of chunk(fresh))
            tx.insert(rssSeen)
              .values(part.map((guid) => ({ indexerId: c.row.id, guid, seenAt: now })))
              .onConflictDoNothing()
              .run()
        })
      })
      for (const [tmdbId, judged] of byMovie) {
        const input = inputs.get(tmdbId)
        if (!input || !judged.some((j) => j.view.approved)) continue
        keep(input, judged, now)
        result.matched.push(tmdbId)
      }
      return result
    },

    /** The last search's releases for a movie, best first, while they're fresh. */
    cached(tmdbId: number): ReleaseView[] {
      return db
        .select({ data: releasesTable.data })
        .from(releasesTable)
        .where(and(eq(releasesTable.tmdbId, tmdbId), gt(releasesTable.expiresAt, clock.now())))
        .orderBy(asc(releasesTable.fetchedAt))
        .all()
        .map((r) => r.data as ReleaseView & { rank: number })
        .sort((a, b) => a.rank - b.rank)
        .map(({ rank: _rank, ...view }) => view)
    },

    prune() {
      db.delete(releasesTable).where(lte(releasesTable.expiresAt, clock.now())).run()
      db.delete(rssSeen)
        .where(lte(rssSeen.seenAt, clock.now() - RSS_SEEN_MS))
        .run()
    },
  }
}

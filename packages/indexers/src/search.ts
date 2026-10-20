// SPDX-License-Identifier: AGPL-3.0-only
// Interactive search (ADR 0035): one query fans out to every usable indexer at once, each bounded
// by its timeout. Each result is parsed, matched to the movie, judged by the decision engine with
// the indexer's facts, and ranked. The results are kept for 30 minutes so checkpoint 6's Grab can
// take one by its guid without searching again.
import type { Clock, Logger } from '@highsea/core'
import { type Db, schema } from '@highsea/db'
import { parse } from '@highsea/parser'
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
import { and, asc, eq, gt, lte } from 'drizzle-orm'
import type { RunResult, SearchQuery } from './engine.ts'
import type { IndexerRelease } from './release.ts'

const { releases: releasesTable } = schema

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

type Candidate<R> = { row: R; definition: Definition; blocked: boolean }
type IndexerRow = { id: string; name: string; priority: number }

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

/** Whether a result is this movie: by id when both sides have one, else by title and year. */
export function matchesMovie(
  release: IndexerRelease,
  parsedTitle: string,
  parsedYear: number | null,
  input: SearchInput,
): boolean {
  if (release.tmdbId !== null) return release.tmdbId === input.tmdbId
  if (release.imdbId !== null && input.imdbId) return release.imdbId === input.imdbId
  const norm = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '')
  if (norm(parsedTitle) !== norm(input.title)) return false
  // a year a release names may be one off, as release dates differ by country
  return parsedYear === null || input.year === null || Math.abs(parsedYear - input.year) <= 1
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

  function judge(input: SearchInput, c: Candidate<R>, r: IndexerRelease, now: number) {
    const parsed = parse(r.title)
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

  return {
    count: () => deps.candidates().length,

    async search(input: SearchInput): Promise<SearchResult> {
      const candidates = deps.candidates()
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
      const judged: NonNullable<ReturnType<typeof judge>>[] = []
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
      return { releases: judged.map((j) => j.view), searched: candidates.length, failed }
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
    },
  }
}

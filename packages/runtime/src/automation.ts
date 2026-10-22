// SPDX-License-Identifier: AGPL-3.0-only
// Automation (checkpoint 8a, ADR 0045): finding releases without the owner pressing Search. The
// runtime joins the movie library, the indexers and downloads here, since none of them depends on
// another:
// - `movies.search`: one movie's search, queued by Search, Search all and the add dialog's Search
//   now, grabbing for each version that still wants a file or an upgrade;
// - `indexers.rss`, every 15 minutes: each indexer's newest releases, matched to the movies still
//   wanted (Radarr's RSS sync, whose default interval is also 15 minutes:
//   https://wiki.servarr.com/radarr/settings);
// - `movies.wanted`, every 6 hours: the backlog sweep, the 20 movies searched longest ago, each
//   pushed back 1, 3, 7, then 14 days (the owner's answer 3).
// Every search judges releases with the movie's blocklist and its version's file, so a release
// that's blocklisted or isn't an upgrade is never grabbed.
import { AppError, type EventBus, type Logger } from '@highsea/core'
import type { Downloads } from '@highsea/downloads'
import type { Indexers, SearchInput } from '@highsea/indexers'
import type { JobQueue } from '@highsea/jobs'
import { type Movies, WANTED_TOPIC } from '@highsea/media/movies'
import { z } from 'zod'

/** Searches indexers for a movie in the background: Search, Search all and Search now queue it. */
export const MOVIE_SEARCH_JOB = 'movies.search'
export const RSS_JOB = 'indexers.rss'
export const WANTED_JOB = 'movies.wanted'

const MINUTE = 60_000
export const RSS_EVERY_MS = 15 * MINUTE
export const WANTED_EVERY_MS = 6 * 60 * MINUTE

export function createAutomation(deps: {
  jobs: JobQueue
  events: EventBus
  logger: Logger
  movies: Movies
  indexers: Indexers
  downloads: Downloads
  /** A library movie's row id, or null when it isn't in the library. */
  itemId: (tmdbId: number) => string | null
}) {
  const { jobs, events, movies, indexers, downloads } = deps
  const log = deps.logger.child('automation')

  /**
   * What a search for a movie's version is judged by, with its blocklist. Null when the movie
   * isn't in the library.
   */
  function inputFor(tmdbId: number, versionId?: string | null): SearchInput | null {
    const itemId = deps.itemId(tmdbId)
    if (!itemId) return null
    let input: ReturnType<Movies['searchInput']>
    try {
      input = movies.searchInput(tmdbId, versionId)
    } catch (e) {
      if (e instanceof AppError && e.code === 'not-found') return null
      throw e
    }
    return { ...input, blocked: (r) => downloads.isBlocked(itemId, r) }
  }

  /**
   * Searches for a movie and grabs for each version that wants something: a file, or (cutoff
   * unmet) a better one. Without a version, the first's search is shown in the movie's Search tab.
   * Returns whether anything was grabbed. Safe to repeat: `grabBest` skips a version already
   * downloading and releases tried before.
   */
  async function searchMovie(tmdbId: number, versionId?: string | null): Promise<boolean> {
    const itemId = deps.itemId(tmdbId)
    if (!itemId) return false
    const wants = movies.wanted.wants(tmdbId).filter((w) => !versionId || w.versionId === versionId)
    // nothing wanted: the search still runs, so its results show in the Search tab
    const targets = wants.length ? wants.map((w) => w.versionId) : [versionId ?? null]
    let grabbed = false
    for (const version of targets) {
      const input = inputFor(tmdbId, version)
      if (!input) return grabbed
      const result = await indexers.search(input)
      log.info('searched for a movie', {
        tmdbId,
        releases: result.releases.length,
        approved: result.releases.filter((r) => r.approved).length,
        searched: result.searched,
      })
      if (!wants.length || !result.releases.some((r) => r.approved)) continue
      if (await downloads.grabBest(itemId, version)) grabbed = true
    }
    return grabbed
  }

  jobs.define({
    type: MOVIE_SEARCH_JOB,
    payload: z.object({ tmdbId: z.number().int(), versionId: z.string().optional() }),
    attempts: 2,
    async run({ tmdbId, versionId }) {
      if (await searchMovie(tmdbId, versionId)) movies.wanted.found(tmdbId)
    },
  })

  /** RSS: the indexers' newest releases against every movie still wanted. */
  async function rss() {
    const targets = movies.wanted.rssTargets()
    if (!targets.length || !indexers.hasEnabled()) return { read: 0, matched: [] as number[] }
    // each movie is judged by the first version that wants something, as the sweep searches it
    const result = await indexers.rss(targets, (tmdbId) =>
      inputFor(tmdbId, movies.wanted.wants(tmdbId)[0]?.versionId),
    )
    for (const f of result.failed)
      log.warn('couldn’t read an indexer’s newest releases', {
        indexer: f.indexer,
        error: f.message,
      })
    let grabbed = 0
    for (const tmdbId of result.matched) {
      const itemId = deps.itemId(tmdbId)
      if (!itemId) continue
      for (const want of movies.wanted.wants(tmdbId).slice(0, 1))
        if (await downloads.grabBest(itemId, want.versionId)) {
          grabbed++
          movies.wanted.found(tmdbId)
        }
    }
    log.info('read the indexers’ newest releases', {
      indexers: result.read,
      releases: result.fetched,
      new: result.fresh,
      matched: result.matched.length,
      grabbed,
    })
    if (result.matched.length) events.emit({ topic: WANTED_TOPIC })
    return { read: result.read, matched: result.matched }
  }

  jobs.define({
    type: RSS_JOB,
    payload: z.object({}),
    attempts: 1,
    timeoutMs: 10 * MINUTE,
    async run() {
      await rss()
    },
  })

  /** The backlog sweep: the movies due a search, one at a time so indexers aren't hammered. */
  async function sweep() {
    if (!indexers.hasEnabled()) return []
    const due = movies.wanted.takeDue()
    for (const tmdbId of due)
      try {
        if (await searchMovie(tmdbId)) movies.wanted.found(tmdbId)
      } catch (e) {
        log.warn('a sweep search failed', { tmdbId, error: (e as Error).message })
      }
    if (due.length) {
      log.info('searched the backlog', { movies: due.length })
      events.emit({ topic: WANTED_TOPIC })
    }
    return due
  }

  jobs.define({
    type: WANTED_JOB,
    payload: z.object({}),
    attempts: 1,
    timeoutMs: 60 * MINUTE,
    async run() {
      await sweep()
    },
  })

  return {
    inputFor,
    searchMovie,
    rss,
    sweep,
    /** Queues a search for each movie: Search, Search all and Search now. */
    queue(tmdbIds: number[]) {
      for (const tmdbId of tmdbIds)
        jobs.enqueue(MOVIE_SEARCH_JOB, { tmdbId }, { dedupeKey: `movie:${tmdbId}` })
    },
    /** RSS every 15 minutes, the sweep every 6 hours, both first a few minutes after boot. */
    schedule(now: number) {
      jobs.schedule(RSS_JOB, RSS_EVERY_MS, { firstRunAt: now + 2 * MINUTE })
      jobs.schedule(WANTED_JOB, WANTED_EVERY_MS, { firstRunAt: now + 20 * MINUTE })
    },
  }
}

export type Automation = ReturnType<typeof createAutomation>

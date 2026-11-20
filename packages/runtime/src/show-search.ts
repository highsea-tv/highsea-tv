// SPDX-License-Identifier: AGPL-3.0-only
// A show's search (Phase 5 C1): Search on a show, a season or an episode, and the add dialog's
// "Start searching", queued as a job as a film's is (automation.ts). Each season with wanted
// episodes is searched as a season first, since a pack may bring all of it; `chooseReleases` takes
// an approved pack, or the best single and multi-episode releases. An episode still wanted after
// that is searched on its own (at most 25 a run), since indexers often answer a season's query with
// packs alone; that fallback is highsea's own call, not a documented Sonarr rule. Every grab goes
// through downloads, so the blocklist, the releases tried before and the VPN's rules apply as for
// films.
//
// Shows run by themselves (HT-109, ADR 0045 § C1), as films do in automation.ts:
// - RSS: the one read of the feeds (`indexers.rssAll`) numbers each release; one for a monitored
//   show's wanted episodes is judged against its season and kept, and the season's best is
//   grabbed from what RSS kept (Sonarr's RSS sync, https://wiki.servarr.com/sonarr/settings);
// - `shows.wanted`, every 6 hours: the backlog sweep, the shows due a search (never searched
//   first), each pushed back 1, 3, 7, then 14 days as films are, with at most 20 indexer searches
//   a run between them (films' sweep searches 20 movies, one search each);
// - `shows.held`: a season whose best release waits on its profile, looked at again when the wait
//   is up. RSS and the sweep wait as films' do; Search someone asked for never does
//   (https://wiki.servarr.com/sonarr/settings#delay-profiles).
// Upgrades come with the wanted episodes: one with a file under its cutoff is looked for too.

import { WANTED_TOPICS } from '@highsea-tv/api-contract'
import { AppError, type EventBus, type Logger } from '@highsea-tv/core'
import type { Downloads } from '@highsea-tv/downloads'
import type { EpisodeScope, Indexers } from '@highsea-tv/indexers'
import type { JobQueue } from '@highsea-tv/jobs'
import type { Shows } from '@highsea-tv/media/shows'
import { holdUntil } from '@highsea-tv/quality'
import { z } from 'zod'

export const SHOW_SEARCH_JOB = 'shows.search'
export const SHOW_WANTED_JOB = 'shows.wanted'
export const SHOW_HELD_JOB = 'shows.held'

/** Episode searches after a season's, at most: a long show's backlog waits for the next Search. */
const MAX_EPISODE_SEARCHES = 25
/** Indexer searches one sweep makes across its shows, at most (films' sweep makes 20). */
export const SHOW_SWEEP_SEARCHES = 20

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
export const SHOW_WANTED_EVERY_MS = 6 * 60 * MINUTE

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function createShowSearchJobs(deps: {
  jobs: JobQueue
  events: EventBus
  logger: Logger
  shows: Shows
  indexers: Indexers
  downloads: Downloads
  now: () => number
}) {
  const { jobs, events, shows, indexers, downloads } = deps
  const log = deps.logger.child('show-search')

  /**
   * What a search of a show's scope is judged by, with the show's blocklist. `airedBy` (RSS)
   * counts an episode airing by then as wanted.
   */
  function inputFor(tmdbId: number, scope: EpisodeScope, opts: { airedBy?: string } = {}) {
    const found = shows.search.input(tmdbId, scope, opts)
    if (!found) return null
    return {
      ...found,
      search: {
        ...found.search,
        blocked: (r: { indexerId: string; guid: string; infoHash: string | null; title: string }) =>
          downloads.isBlocked(found.showItemId, r),
      },
    }
  }

  /**
   * How a grab of a show's scope waits on its profile, for RSS, the sweep and `shows.held`: a
   * release still inside the wait is held, and `shows.held` looks at the scope again then.
   */
  function holding(tmdbId: number, scope: EpisodeScope) {
    const profile = shows.search.input(tmdbId, scope)?.search.profile
    return {
      hold: (r: { quality: string; publishedAt: string | number | null }) =>
        profile ? holdUntil(profile, r, deps.now()) : null,
      onHold: (until: number) =>
        jobs.enqueue(
          SHOW_HELD_JOB,
          { tmdbId, season: scope.season, episode: scope.episode ?? null },
          {
            runAt: until,
            dedupeKey: `shows-held:${tmdbId}:${scope.season}:${scope.episode ?? '*'}`,
          },
        ),
    }
  }

  /**
   * Searches a show's wanted episodes, a season at a time, then single episodes. `automatic` (the
   * sweep) waits on the profile; `budget` caps its indexer searches. Returns how many releases it
   * grabbed and how many searches it made.
   */
  async function run(
    tmdbId: number,
    within?: EpisodeScope,
    { automatic = false, budget = Number.POSITIVE_INFINITY } = {},
  ): Promise<{ grabbed: number; searches: number }> {
    const plan = shows.search.plan(tmdbId, within)
    // the show's item id: any scope's input carries it
    const item = shows.search.input(tmdbId, { season: plan[0]?.scope.season ?? 0 })
    if (!item) return { grabbed: 0, searches: 0 }
    let episodeSearches = 0
    let searches = 0
    let total = 0
    const grab = async (scope: EpisodeScope, wanted: string[]) => {
      searches += 1
      const got = await downloads.grabBestEpisodes(
        item.showItemId,
        scope,
        wanted,
        automatic ? holding(tmdbId, scope) : {},
      )
      total += got.length
      return got
    }
    for (const step of plan) {
      if (searches >= budget) break
      const grabbed = await grab(step.scope, step.wanted)
      log.info('searched a show', { tmdbId, scope: step.scope, grabbed: grabbed.length })
      if (step.scope.episode != null) continue
      const busy = downloads.activeEpisodes(item.showItemId)
      const after = shows.search.plan(tmdbId, { season: step.scope.season })[0]
      const left = (after?.wanted ?? []).filter((id) => step.wanted.includes(id) && !busy.has(id))
      const numbers = shows.search.input(tmdbId, step.scope)?.search.episodes ?? []
      for (const id of left) {
        if (episodeSearches >= MAX_EPISODE_SEARCHES || searches >= budget) break
        const e = numbers.find((x) => x.id === id)
        if (!e) continue
        episodeSearches += 1
        await grab({ season: e.season, episode: e.episode }, [id])
      }
    }
    return { grabbed: total, searches }
  }

  /** RSS's side for shows: the targets and what a season's release is judged by. */
  function rssInput() {
    const airedBy = dayOf(deps.now() + DAY)
    return {
      targets: shows.wanted.rssTargets(),
      inputFor: (tmdbId: number, scope: EpisodeScope) =>
        inputFor(tmdbId, scope, { airedBy })?.search ?? null,
    }
  }

  /**
   * Grabs for the seasons RSS found an approved release for, from what RSS kept: a pack where it's
   * better, else the best release per wanted episode. Returns how many releases were grabbed.
   */
  async function grabFromRss(found: readonly { tmdbId: number; scope: EpisodeScope }[]) {
    const airedBy = dayOf(deps.now() + DAY)
    let grabbed = 0
    for (const { tmdbId, scope } of found) {
      const input = shows.search.input(tmdbId, scope, { airedBy })
      if (!input?.wanted.length) continue
      try {
        const got = await downloads.grabBestEpisodes(input.showItemId, scope, input.wanted, {
          cached: true,
          ...holding(tmdbId, scope),
        })
        if (got.length) {
          grabbed += got.length
          shows.wanted.found(tmdbId)
        }
      } catch (e) {
        log.warn('couldn’t grab a show’s release from RSS', {
          tmdbId,
          scope,
          error: (e as Error).message,
        })
      }
    }
    if (found.length) events.emit({ topic: WANTED_TOPICS.wanted })
    return grabbed
  }

  /** The backlog sweep: the shows due a search, within one budget of indexer searches. */
  async function sweep() {
    if (!indexers.hasEnabled()) return []
    const due = shows.wanted.takeDue()
    let budget = SHOW_SWEEP_SEARCHES
    const searched: number[] = []
    for (const tmdbId of due) {
      // a show the budget didn't reach is due again next run, not pushed back
      if (budget <= 0) {
        shows.wanted.reschedule(tmdbId)
        continue
      }
      try {
        const r = await run(tmdbId, undefined, { automatic: true, budget })
        budget -= r.searches
        searched.push(tmdbId)
        if (r.grabbed) shows.wanted.found(tmdbId)
      } catch (e) {
        log.warn('a show’s sweep search failed', { tmdbId, error: (e as Error).message })
      }
    }
    if (searched.length) {
      log.info('searched the shows’ backlog', {
        shows: searched.length,
        searches: SHOW_SWEEP_SEARCHES - budget,
      })
      events.emit({ topic: WANTED_TOPICS.wanted })
    }
    return searched
  }

  jobs.define({
    type: SHOW_WANTED_JOB,
    payload: z.object({}),
    attempts: 1,
    timeoutMs: 60 * MINUTE,
    async run() {
      await sweep()
    },
  })

  jobs.define({
    type: SHOW_HELD_JOB,
    payload: z.object({
      tmdbId: z.number().int(),
      season: z.number().int(),
      episode: z.number().int().nullable(),
    }),
    attempts: 2,
    // safe to repeat: an episode downloading by then is skipped, and a release still held (a
    // better one turned up) queues the job again for its own time
    async run({ tmdbId, season, episode }) {
      const scope = { season, episode }
      const input = shows.search.input(tmdbId, scope)
      if (!input?.wanted.length) return
      const got = await downloads.grabBestEpisodes(input.showItemId, scope, input.wanted, {
        cached: true,
        ...holding(tmdbId, scope),
      })
      if (got.length) {
        shows.wanted.found(tmdbId)
        events.emit({ topic: WANTED_TOPICS.wanted })
      }
    },
  })

  jobs.define({
    type: SHOW_SEARCH_JOB,
    payload: z.object({
      tmdbId: z.number().int(),
      season: z.number().int().nullable().optional(),
      episode: z.number().int().nullable().optional(),
    }),
    attempts: 2,
    timeoutMs: 30 * 60_000,
    async run({ tmdbId, season, episode }) {
      await run(tmdbId, season == null ? undefined : { season, episode: episode ?? null })
    },
  })

  return {
    inputFor,
    rssInput,
    grabFromRss,
    sweep,
    run,
    /** The shows' sweep every 6 hours, first half an hour after boot (after films'). */
    schedule(now: number) {
      jobs.schedule(SHOW_WANTED_JOB, SHOW_WANTED_EVERY_MS, { firstRunAt: now + 30 * MINUTE })
    },
    /**
     * Search on a show, a season or an episode: how many wanted episodes it looks for, the search
     * queued when there are any. Interactive search's list is `indexers.searchEpisodes`'s.
     */
    queue(tmdbId: number, within?: EpisodeScope): number {
      if (!indexers.hasEnabled())
        throw new AppError('conflict', 'Add an indexer to search for releases.', {
          reason: 'no-indexers',
        })
      const wanted = shows.search.plan(tmdbId, within).reduce((n, s) => n + s.wanted.length, 0)
      if (wanted)
        jobs.enqueue(
          SHOW_SEARCH_JOB,
          { tmdbId, season: within?.season ?? null, episode: within?.episode ?? null },
          {
            dedupeKey: `shows-search:${tmdbId}:${within?.season ?? '*'}:${within?.episode ?? '*'}`,
          },
        )
      return wanted
    },
    /** Interactive search: every usable indexer for a season or an episode, judged. */
    async interactive(tmdbId: number, scope: EpisodeScope) {
      if (!indexers.hasEnabled())
        throw new AppError('conflict', 'Add an indexer to search for releases.', {
          reason: 'no-indexers',
        })
      const input = inputFor(tmdbId, scope)
      if (!input) throw new AppError('not-found', 'That show isn’t in the library.')
      return indexers.searchEpisodes(input.search)
    },
  }
}

export type ShowSearchJobs = ReturnType<typeof createShowSearchJobs>

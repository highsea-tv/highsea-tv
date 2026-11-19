// SPDX-License-Identifier: AGPL-3.0-only
// A show's search (Phase 5 C1): Search on a show, a season or an episode, and the add dialog's
// "Start searching", queued as a job as a film's is (automation.ts). Each season with wanted
// episodes is searched as a season first, since a pack may bring all of it; `chooseReleases` takes
// an approved pack, or the best single and multi-episode releases. An episode still wanted after
// that is searched on its own (at most 25 a run), since indexers often answer a season's query with
// packs alone; that fallback is highsea's own call, not a documented Sonarr rule. Every grab goes
// through downloads, so the blocklist, the releases tried before and the VPN's rules apply as for
// films.
import { AppError, type Logger } from '@highsea-tv/core'
import type { Downloads } from '@highsea-tv/downloads'
import type { EpisodeScope, Indexers } from '@highsea-tv/indexers'
import type { JobQueue } from '@highsea-tv/jobs'
import type { Shows } from '@highsea-tv/media/shows'
import { z } from 'zod'

export const SHOW_SEARCH_JOB = 'shows.search'

/** Episode searches after a season's, at most: a long show's backlog waits for the next Search. */
const MAX_EPISODE_SEARCHES = 25

export function createShowSearchJobs(deps: {
  jobs: JobQueue
  logger: Logger
  shows: Shows
  indexers: Indexers
  downloads: Downloads
}) {
  const { jobs, shows, indexers, downloads } = deps
  const log = deps.logger.child('show-search')

  /** What a search of a show's scope is judged by, with the show's blocklist. */
  function inputFor(tmdbId: number, scope: EpisodeScope) {
    const found = shows.search.input(tmdbId, scope)
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

  async function run(tmdbId: number, within?: EpisodeScope) {
    const plan = shows.search.plan(tmdbId, within)
    // the show's item id: any scope's input carries it
    const item = shows.search.input(tmdbId, { season: plan[0]?.scope.season ?? 0 })
    if (!item) return
    let episodeSearches = 0
    for (const step of plan) {
      const grabbed = await downloads.grabBestEpisodes(item.showItemId, step.scope, step.wanted)
      log.info('searched a show', { tmdbId, scope: step.scope, grabbed: grabbed.length })
      if (step.scope.episode != null) continue
      const busy = downloads.activeEpisodes(item.showItemId)
      const after = shows.search.plan(tmdbId, { season: step.scope.season })[0]
      const left = (after?.wanted ?? []).filter((id) => step.wanted.includes(id) && !busy.has(id))
      const numbers = shows.search.input(tmdbId, step.scope)?.search.episodes ?? []
      for (const id of left) {
        if (episodeSearches >= MAX_EPISODE_SEARCHES) break
        const e = numbers.find((x) => x.id === id)
        if (!e) continue
        episodeSearches += 1
        await downloads.grabBestEpisodes(
          item.showItemId,
          { season: e.season, episode: e.episode },
          [id],
        )
      }
    }
  }

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

// SPDX-License-Identifier: AGPL-3.0-only
// The shows' backlog sweep (HT-109): its limits against fakes of the shows, indexers and downloads,
// since the TMDB recordings hold only two shows. Ten shows due, each a season search then one
// search per episode still wanted, within one budget of 20 indexer searches: the shows it reaches
// are searched, the ones it doesn't are due again next run. The backoff itself is the booted
// runtime's (automation.test.ts).
import { describe, expect, test } from 'bun:test'
import { silentLogger } from '@highsea-tv/core'
import { createShowSearchJobs, SHOW_SWEEP_SEARCHES } from '../src/show-search.ts'

/** Ten shows due, each one season with two wanted episodes that no search grabs. */
function fakes(due = 10) {
  const searches: { tmdbId: string; scope: { season: number; episode?: number | null } }[] = []
  const rescheduled: number[] = []
  const ids = Array.from({ length: due }, (_, i) => 1000 + i)
  const episodes = (tmdbId: number) => [
    { id: `${tmdbId}-1`, season: 1, episode: 1 },
    { id: `${tmdbId}-2`, season: 1, episode: 2 },
  ]
  const shows = {
    wanted: {
      takeDue: () => ids,
      reschedule: (tmdbId: number) => rescheduled.push(tmdbId),
      found: () => {},
    },
    search: {
      plan: (tmdbId: number) => [
        { scope: { season: 1 }, wanted: episodes(tmdbId).map((e) => e.id) },
      ],
      input: (tmdbId: number) => ({
        showItemId: String(tmdbId),
        wanted: episodes(tmdbId).map((e) => e.id),
        search: { episodes: episodes(tmdbId), profile: undefined },
      }),
    },
  }
  const downloads = {
    grabBestEpisodes: async (
      showItemId: string,
      scope: { season: number; episode?: number | null },
    ) => {
      searches.push({ tmdbId: showItemId, scope })
      return []
    },
    activeEpisodes: () => new Set<string>(),
    isBlocked: () => false,
  }
  const jobs = { define: () => {}, enqueue: () => {}, schedule: () => {} }
  const sweep = createShowSearchJobs({
    jobs: jobs as never,
    events: { emit: () => {}, subscribe: () => () => {} } as never,
    logger: silentLogger,
    shows: shows as never,
    indexers: { hasEnabled: () => true } as never,
    downloads: downloads as never,
    now: () => Date.UTC(2026, 10, 19),
  })
  return { sweep, searches, rescheduled, ids }
}

describe('the shows’ sweep', () => {
  test('searches the shows its budget reaches, and leaves the rest due', async () => {
    const { sweep, searches, rescheduled, ids } = fakes()
    const searched = await sweep.sweep()
    // each show: its season, then each episode still wanted, 3 searches; 20 reach six shows and
    // the seventh's season and first episode
    expect(searches).toHaveLength(SHOW_SWEEP_SEARCHES)
    expect(searched).toEqual(ids.slice(0, 7))
    expect(searches.slice(0, 3).map((s) => s.scope)).toEqual([
      { season: 1 },
      { season: 1, episode: 1 },
      { season: 1, episode: 2 },
    ])
    expect(searches.at(-1)).toEqual({ tmdbId: '1006', scope: { season: 1, episode: 1 } })
    // the three the budget didn't reach are due again next run, not pushed back
    expect(rescheduled).toEqual(ids.slice(7))
  })

  test('nothing is searched without an enabled indexer', async () => {
    const { searches } = fakes()
    const none = createShowSearchJobs({
      jobs: { define: () => {}, enqueue: () => {}, schedule: () => {} } as never,
      events: { emit: () => {} } as never,
      logger: silentLogger,
      shows: {} as never,
      indexers: { hasEnabled: () => false } as never,
      downloads: {} as never,
      now: () => 0,
    })
    expect(await none.sweep()).toEqual([])
    expect(searches).toHaveLength(0)
  })
})

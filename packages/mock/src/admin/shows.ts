// SPDX-License-Identifier: AGPL-3.0-only
// The admin's shows routes (one-client-platform-d.md › D3, the owner's answer 5), drafted in the
// contract (`series`, api-contract's series.ts) and answered here from the mock's shows as the
// admin keeps them (show-admin.ts): the library, a show with its seasons and episodes, Edit and
// the bulk bar, monitoring a season or an episode, Search, Remove, Discover's shows and Add a show.
// The real server serves them since Phase 5 B, all but Search (part C1).
//
// What the mock doesn't keep, and what stands in for it here:
// - Remove's `deleteFiles`: the mock keeps no files, so the show only leaves the library;
// - the unmatched list: two made-up paths under the first show's root folder, a show folder TMDB
//   couldn't name and an episode file without a number in the first show's folder, so Unmatched
//   draws; Match and Dismiss take them off the list;
// - the times: `addedAt` is moved to the wall clock, as every answer gives them, and each air
//   date by the same whole days, so "next airing" stays as far away as the mock has it.
import type {
  Series,
  SeriesDetail,
  SeriesEpisode,
  SeriesSeason,
  UnmatchedShowPath,
} from '@highsea-tv/api-contract'
import type { AdminEpisode, AdminSeason, AdminShow, AdminShowDetail } from '../types.ts'
import type { AdminKit, Answers } from './kit.ts'

const DAY = 86_400_000
const TOPIC = 'shows.updated'

export function showsAnswers(kit: AdminKit): Answers {
  /** A mock day ("2026-11-05") on the wall clock's calendar: moved by whole days only. */
  const day = (d: string) => {
    const noon = Date.parse(`${d}T12:00:00Z`)
    const offset = Date.parse(kit.wallMs(noon)) - noon
    return new Date(noon + Math.round(offset / DAY) * DAY).toISOString().slice(0, 10)
  }
  const episodeOf = (e: AdminEpisode): SeriesEpisode => ({ ...e, aired: day(e.aired) })
  const seasonOf = (s: AdminSeason): SeriesSeason => ({
    ...s,
    episodes: s.episodes.map(episodeOf),
  })
  const showOf = (s: AdminShow): Series => ({
    ...s,
    addedAt: kit.wall(s.addedAt),
    nextAiring: s.nextAiring && { ...s.nextAiring, aired: day(s.nextAiring.aired) },
  })
  const detailOf = (s: AdminShowDetail): SeriesDetail => ({
    ...showOf(s),
    seasonList: s.seasonList.map(seasonOf),
  })
  const changed = <R>(r: R): R => {
    kit.emit(TOPIC)
    return r
  }

  /** The paths matched or dismissed this session. */
  const settled = new Set<string>()
  const unmatched = (shows: Series[]): UnmatchedShowPath[] => {
    const first = shows[0]
    if (!first) return []
    const root = first.path.slice(0, first.path.lastIndexOf('/'))
    const rows: UnmatchedShowPath[] = [
      {
        path: `${root}/The Office Holiday Specials`,
        kind: 'show-folder',
        rootFolder: root,
        show: null,
        reason: 'no-match',
        message: 'TMDB has no show by this name.',
        size: 4_831_838_208,
        foundAt: kit.wall('2026-11-17T09:12:00Z'),
      },
      {
        path: `${first.path}/Season 01/${first.title} - Behind the Scenes.mkv`,
        kind: 'episode-file',
        rootFolder: root,
        show: first.id,
        reason: 'no-episode-number',
        message: 'Its name gives no season and episode.',
        size: 734_003_200,
        foundAt: kit.wall('2026-11-18T21:40:00Z'),
      },
    ]
    return rows.filter((r) => !settled.has(r.path))
  }

  return {
    series: {
      discover: ({ query }, ctx) => ctx.api.shows.discover(query?.query ?? ''),
      rootFolders: (_, ctx) => ctx.api.shows.rootFolders(),
      unmatched: ({ query }, ctx) =>
        unmatched(ctx.api.shows.list().map(showOf)).filter(
          (r) => !query?.rootFolder || r.rootFolder === query.rootFolder,
        ),
      matchUnmatched: ({ body }) => {
        settled.add(body.path)
        return changed(undefined)
      },
      dismissUnmatched: ({ body }) => {
        settled.add(body.path)
        return changed(undefined)
      },
      refresh: ({ params }, ctx) => {
        kit.work?.queue(ctx, 'metadata.refresh', { kind: 'show', id: params.id })
        return changed(undefined)
      },
      list: (_, ctx) => ctx.api.shows.list().map(showOf),
      add: ({ body }, ctx) => changed(detailOf(ctx.api.shows.add(body))),
      get: ({ params }, ctx) => detailOf(ctx.api.shows.get(params.id)),
      update: ({ params, body }, ctx) => changed(detailOf(ctx.api.shows.edit(params.id, body))),
      remove: ({ params }, ctx) => {
        ctx.api.shows.remove(params.id)
        return changed(undefined)
      },
      monitorSeason: ({ params, body }, ctx) => {
        ctx.api.shows.monitorSeason(params.id, params.season, body.monitored)
        return changed(undefined)
      },
      monitorEpisode: ({ params, body }, ctx) => {
        ctx.api.shows.monitorEpisode(params.id, params.episodeId, body.monitored)
        return changed(undefined)
      },
      search: ({ params, body }, ctx) => {
        const { found } = ctx.api.shows.search(params.id, body ?? {})
        return changed({ found })
      },
    },
  }
}

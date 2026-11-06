// SPDX-License-Identifier: AGPL-3.0-only
// The admin's shows routes (one-client-platform-d.md › D3, the owner's answer 5), drafted in the
// contract (`series`, api-contract's series.ts) and answered here from the mock's shows as the
// admin keeps them (show-admin.ts): the library, a show with its seasons and episodes, Edit and
// the bulk bar, monitoring a season or an episode, Search, Remove, Discover's shows and Add a show.
// The real server answers every one 501 until it has shows.
//
// What the mock doesn't keep, and what stands in for it here:
// - Remove's `deleteFiles`: the mock keeps no files, so the show only leaves the library;
// - the times: `addedAt` is moved to the wall clock, as every answer gives them, and each air
//   date by the same whole days, so "next airing" stays as far away as the mock has it.
import type { Series, SeriesDetail, SeriesEpisode, SeriesSeason } from '@highsea-tv/api-contract'
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

  return {
    series: {
      discover: ({ query }, ctx) => ctx.api.shows.discover(query?.query ?? ''),
      rootFolders: (_, ctx) => ctx.api.shows.rootFolders(),
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

// SPDX-License-Identifier: AGPL-3.0-only
// The admin's shows routes (one-client-platform-d.md › D3, the owner's answer 5), drafted in the
// contract (`series`, api-contract's series.ts) and answered here from the mock's shows as the
// admin keeps them (show-admin.ts): the library, a show with its seasons and episodes, Edit and
// the bulk bar, monitoring a season or an episode, Search, Remove, Discover's shows and Add a show,
// and since Phase 5 C1 the release search for a season or an episode and its grab. The real server
// serves them all.
//
// What the mock doesn't keep, and what stands in for it here:
// - Remove's `deleteFiles`: the mock keeps no files, so the show only leaves the library;
// - the unmatched list: two made-up paths under the first show's root folder, a show folder TMDB
//   couldn't name and an episode file without a number in the first show's folder, so Unmatched
//   draws; Match and Dismiss take them off the list;
// - a season's or an episode's releases: made up from the show's title, a season pack and each
//   episode in two qualities, judged only by whether the episodes are monitored and missing;
//   a grab marks its episodes downloading and answers with a queue row that has no torrent;
// - the times: `addedAt` is moved to the wall clock, as every answer gives them, and each air
//   date by the same whole days, so "next airing" stays as far away as the mock has it;
// - Wanted's episodes (HT-109): the mock's own statuses, `missing` (aired) and `cutoff-unmet`, of
//   monitored episodes of monitored shows; the calendar's are every monitored one by its air date,
//   and Wanted's Search marks them downloading as a show's Search does.
import type {
  EpisodeCalendarEntry,
  EpisodeRelease,
  QueueItem,
  Series,
  SeriesDetail,
  SeriesEpisode,
  SeriesSeason,
  UnmatchedShowPath,
  WantedEpisode,
  WantedEpisodePage,
  WantedSearchInput,
} from '@highsea-tv/api-contract'
import type { AdminEpisode, AdminSeason, AdminShow, AdminShowDetail } from '../types.ts'
import { chosenShowArt } from './artwork.ts'
import { type AdminKit, type Answers, type Ctx, refuse } from './kit.ts'
import { t } from './movies-shared.ts'

const DAY = 86_400_000
const TOPIC = 'shows.updated'
const GB = 1024 ** 3
/** How long a search's releases stay grabbable (the indexers' service's 30 minutes). */
const FRESH_MS = 30 * 60_000
const pad = (n: number) => String(n).padStart(2, '0')

/** A mock day ("2026-11-05") on the wall clock's calendar: moved by whole days only. */
const dayOn = (kit: AdminKit, d: string) => {
  const noon = Date.parse(`${d}T12:00:00Z`)
  const offset = Date.parse(kit.wallMs(noon)) - noon
  return new Date(noon + Math.round(offset / DAY) * DAY).toISOString().slice(0, 10)
}

/**
 * Wanted's episodes from the mock's shows (HT-109): Missing, Cutoff unmet, the calendar's air
 * dates and Wanted's Search. Movies' Wanted answers (movies.ts) take the calendar and Search from
 * here, so the two kinds answer as the server's one route does.
 */
export function episodeWanted(kit: AdminKit) {
  const rows = (ctx: Ctx) =>
    ctx.api.shows.list().flatMap((s) => {
      if (!s.monitored) return []
      const detail = ctx.api.shows.get(s.id)
      const art = chosenShowArt(kit, s.tmdbId, s.art)
      return detail.seasonList.flatMap((season) =>
        season.episodes
          .filter((e) => e.monitored)
          .map(
            (e): WantedEpisode => ({
              show: {
                id: s.id,
                title: s.title,
                year: s.year,
                poster: art.poster || null,
                qualityProfileId: s.qualityProfileId,
              },
              episode: {
                id: e.id,
                season: e.season,
                number: e.number,
                title: e.title,
                aired: dayOn(kit, e.aired),
                status: e.status,
                quality: e.file?.quality ?? null,
              },
            }),
          ),
      )
    })
  const newest = (a: WantedEpisode, b: WantedEpisode) =>
    (b.episode.aired ?? '').localeCompare(a.episode.aired ?? '') ||
    a.show.title.localeCompare(b.show.title) ||
    a.episode.number - b.episode.number
  const page = (all: WantedEpisode[], query: { cursor?: string; limit?: number }) => {
    const at = Number(query.cursor ?? 0) || 0
    const limit = query.limit ?? 50
    const items = all.sort(newest).slice(at, at + limit)
    const next = at + items.length < all.length ? String(at + items.length) : null
    return { items, total: all.length, next } satisfies WantedEpisodePage
  }
  const of = (ctx: Ctx, list: 'missing' | 'cutoff') =>
    rows(ctx).filter((r) =>
      list === 'missing' ? r.episode.status === 'missing' : r.episode.status === 'cutoff-unmet',
    )
  return {
    missing: (ctx: Ctx, query: { cursor?: string; limit?: number }) =>
      page(of(ctx, 'missing'), query),
    cutoff: (ctx: Ctx, query: { cursor?: string; limit?: number }) =>
      page(of(ctx, 'cutoff'), query),
    calendar: (ctx: Ctx, from: string, to: string): EpisodeCalendarEntry[] =>
      rows(ctx)
        .filter((r) => r.episode.aired && r.episode.aired >= from && r.episode.aired <= to)
        .map((episode) => ({
          date: episode.episode.aired ?? '',
          kind: 'episode' as const,
          episode,
        })),
    /** Wanted's Search for episodes: how many it looks for. */
    search: (ctx: Ctx, body: WantedSearchInput): number => {
      let found = 0
      if (body.all && body.kind !== 'movies') {
        const eps = of(ctx, body.all)
        for (const show of new Set(eps.map((e) => e.show.id))) ctx.api.shows.search(show, {})
        found += eps.length
      }
      for (const e of body.episodes ?? []) {
        const hit = rows(ctx).find(
          (r) =>
            r.show.id === e.show && r.episode.season === e.season && r.episode.number === e.episode,
        )
        if (hit) found += ctx.api.shows.search(e.show, { episode: hit.episode.id }).found
      }
      if (found) kit.emit(TOPIC)
      return found
    },
  }
}

export function showsAnswers(kit: AdminKit): Answers {
  const wanted = episodeWanted(kit)
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
    art: chosenShowArt(kit, s.tmdbId, s.art),
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

  /** A season's or an episode's made-up releases: the season pack, then each episode's. */
  const releasesFor = (
    ctx: Ctx,
    show: AdminShowDetail,
    scope: { season: number; episode?: string },
  ): EpisodeRelease[] => {
    const season = show.seasonList.find((s) => s.number === scope.season)
    if (!season) throw refuse('not-found', `This show has no season ${scope.season}.`)
    const eps = season.episodes.filter((e) => !scope.episode || e.id === scope.episode)
    if (scope.episode && !eps.length) throw refuse('not-found', 'That episode isn’t in this show.')
    const indexers = ctx.srv.state.indexers.filter((i) => i.enabled)
    const name = show.title.replace(/[^\w\s]/g, '').replace(/\s+/g, '.')
    const wanted = (e: AdminEpisode) => e.monitored && e.status === 'missing'
    const release = (
      n: number,
      tag: string,
      held: AdminEpisode[],
      quality: string,
      size: number,
      pack: boolean,
    ): EpisodeRelease => {
      const ix = indexers[n % Math.max(indexers.length, 1)]
      const missing = held.filter((e) => !wanted(e))
      const approved = held.length > 0 && missing.length === 0
      const age = 6 + n * 11
      return {
        guid: `rel-${show.id}-${tag}-${quality.replace(/\W/g, '')}`,
        title: `${name}.${tag}.${quality === 'WEB 2160p' ? '2160p' : '1080p'}.WEB-DL.DDP5.1.H.264-GRP`,
        indexerId: ix?.id ?? 'ix-none',
        indexer: ix?.name ?? 'Anchorage',
        protocol: 'torrent',
        size,
        seeders: 40 - n * 3,
        leechers: 4,
        grabs: null,
        publishedAt: kit.wallMs(ctx.srv.clock.now() - age * 3_600_000),
        ageHours: age,
        details: null,
        quality,
        customFormats: [],
        formatScore: 0,
        flags: [],
        languages: [],
        approved,
        reasons: approved
          ? [
              { kind: 'accepted', message: `Matches ${quality}` },
              ...(pack
                ? [
                    {
                      kind: 'accepted' as const,
                      message: `Season pack: all ${held.length} episodes of season ${scope.season}`,
                    },
                  ]
                : []),
            ]
          : [
              {
                kind: 'rejected',
                message: `Not monitored or already has a file: ${missing
                  .map((e) => `S${pad(e.season)}E${pad(e.number)}`)
                  .join(', ')}`,
              },
            ],
        season: scope.season,
        episodes: held.map((e) => e.number),
        pack,
      }
    }
    const out: EpisodeRelease[] = []
    if (!scope.episode)
      out.push(
        release(
          0,
          `S${pad(scope.season)}`,
          season.episodes,
          'WEB 1080p',
          (2.1 * GB * season.episodes.length) / 4,
          true,
        ),
      )
    eps.forEach((e, i) => {
      const tag = `S${pad(e.season)}E${pad(e.number)}`
      out.push(release(i + 1, tag, [e], 'WEB 1080p', 2.1 * GB, false))
      out.push(release(i + 2, tag, [e], 'WEB 2160p', 6.4 * GB, false))
    })
    return out.sort(
      (a, b) => Number(b.approved) - Number(a.approved) || Number(b.pack) - Number(a.pack),
    )
  }

  /** The last search per show and scope: when, and its releases. */
  const searches = new Map<string, { at: number; releases: EpisodeRelease[] }>()
  const keyOf = (id: string, scope: { season: number; episode?: string }) =>
    `${id}:${scope.season}:${scope.episode ?? ''}`
  const fresh = (id: string, scope: { season: number; episode?: string }) => {
    const s = searches.get(keyOf(id, scope))
    return s && Date.now() - s.at <= FRESH_MS ? s.releases : []
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
    wanted: {
      missingEpisodes: ({ query }, ctx) => wanted.missing(ctx, query ?? {}),
      cutoffEpisodes: ({ query }, ctx) => wanted.cutoff(ctx, query ?? {}),
    },
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
      setMarkers: ({ params, body }, ctx) => {
        ctx.api.shows.setMarkers(params.id, params.episodeId, body)
        return changed(undefined)
      },
      findMarkers: ({ params }, ctx) => {
        ctx.api.shows.findMarkers(params.id, params.episodeId)
        return changed(undefined)
      },
      search: ({ params, body }, ctx) => {
        const { found } = ctx.api.shows.search(params.id, body ?? {})
        return changed({ found })
      },
      interactiveSearch: ({ params, body }, ctx) => {
        const show = ctx.api.shows.get(params.id)
        const searched = ctx.srv.state.indexers.filter((i) => i.enabled).length
        if (!searched) throw refuse('conflict', t('movies.noIndexers'), { reason: 'no-indexers' })
        const releases = releasesFor(ctx, show, body)
        searches.set(keyOf(params.id, body), { at: Date.now(), releases })
        return { releases, searched, failed: [], leftOut: [] }
      },
      releases: ({ params, query }) => fresh(params.id, query),
      grabRelease: ({ params, body }, ctx) => {
        const show = ctx.api.shows.get(params.id)
        const r = fresh(params.id, body).find(
          (x) => x.guid === params.guid && x.indexerId === body.indexerId,
        )
        if (!r) throw refuse('not-found', t('movies.releaseGone'))
        if (!body.force && !r.approved) {
          const why = r.reasons.find((x) => x.kind === 'rejected')?.message
          throw refuse('conflict', t('movies.rejected', { why: why ? `: ${why}` : '' }))
        }
        const season = show.seasonList.find((s) => s.number === r.season)
        for (const e of season?.episodes ?? [])
          if (r.episodes.includes(e.number))
            ctx.api.shows.search(params.id, { season: r.season, episode: e.id })
        const item: QueueItem = {
          id: `q-${r.guid}`,
          torrentId: null,
          movieId: null,
          show: { id: show.id, season: r.season, episodes: r.episodes },
          title: show.title,
          year: show.year || null,
          release: r.title,
          quality: r.quality,
          size: r.size ?? 0,
          progress: 0,
          downRate: 0,
          upRate: 0,
          eta: null,
          peers: { connected: 0, total: 0 },
          seeds: { connected: 0, total: r.seeders ?? 0 },
          ratio: 0,
          webSeeds: { connected: 0, total: 0, hosts: [], downRate: 0 },
          state: 'downloading',
          stateReason: null,
        }
        return changed(item)
      },
    },
  }
}

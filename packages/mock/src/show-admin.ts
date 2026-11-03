// SPDX-License-Identifier: AGPL-3.0-only
// Shows as the admin keeps them (stage 6 of docs/plans/prototype-gaps.md, drawn for the TV series
// phase): Sonarr's series, seasons and episodes, monitored or not, each episode with its file. Built
// once from the shows library the apps see (shows.ts), so the two agree on what's here; the admin
// adds what the apps don't show: the episodes still to air, the ones missing or downloading, and
// files below their profile's cutoff. Every case is seeded so the pages have each to show.
import { backdropArt, posterArt } from '@highsea-tv/fixtures'
import type { ShowSeed } from './shows.ts'
import type {
  AddShowInput,
  AdminEpisode,
  AdminSeason,
  AdminShow,
  AdminShowDetail,
  DiscoverShow,
  EpisodeStatus,
  ShowMonitor,
} from './types.ts'

const DAY = 86_400_000
const MB = 1e6

export type ShowAdminDeps = {
  seeds: () => ShowSeed[]
  now: () => number
  requireStaff: () => void
  emit: () => void
  fail: (status: number, code: string, message: string) => Error
  /** Settings › Media management's root folders for shows. */
  folders: () => string[]
}

type Kept = Omit<AdminShow, 'episodes' | 'size' | 'nextAiring' | 'seasons'> & {
  seasonList: AdminSeason[]
}

const networks = ['Northlight', 'BBC Two', 'Apple TV+', 'HBO', 'Channel 4', 'Netflix', 'FX']
const day = (t: number) => new Date(t).toISOString().slice(0, 10)
const code = (s: number, e: number) =>
  `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`

/**
 * Episodes the apps don't list yet, for shows still airing: what's next, a day or a week away, and
 * the two that aired this week, one missing and one downloading.
 */
const upcoming: Record<string, { season: number; from: number; count: number; first: number }> = {
  'night-shift-at-hollow-creek': { season: 3, from: 5, count: 6, first: -8 },
  'ghost-signal': { season: 2, from: 1, count: 6, first: -10 },
  'the-lantern-keepers': { season: 4, from: 1, count: 8, first: 12 },
  orbital: { season: 3, from: 1, count: 10, first: 40 },
}
const newTitles = [
  'Fresh Start',
  'Whatever Comes Next',
  'Out of Season',
  'The Long Night',
  'Borrowed Time',
  'A Clean Break',
  'Higher Ground',
  'The Turn',
  'Afterglow',
  'Last Orders',
]

/** Shows TMDB knows that aren't here: Add a show's results beside the library's own. */
const elsewhere: Omit<DiscoverShow, 'inLibrary' | 'art'>[] = [
  {
    id: 'tmdb-tv-91001',
    tmdbId: 91001,
    title: 'The Glass Orchard',
    year: 2024,
    endYear: null,
    seasons: 2,
    network: 'Channel 4',
    genres: ['Drama'],
    synopsis: 'Three sisters inherit a failing orchard and the debts that come with it.',
    rating: 4.1,
  },
  {
    id: 'tmdb-tv-91002',
    tmdbId: 91002,
    title: 'Deep Field',
    year: 2021,
    endYear: 2023,
    seasons: 3,
    network: 'Apple TV+',
    genres: ['Science Fiction', 'Drama'],
    synopsis: 'An observatory crew hears something in the noise and can’t stop listening.',
    rating: 4.3,
  },
  {
    id: 'tmdb-tv-91003',
    tmdbId: 91003,
    title: 'Kitchen Porters',
    year: 2019,
    endYear: null,
    seasons: 5,
    network: 'BBC Two',
    genres: ['Comedy'],
    synopsis: 'The back of house at a restaurant that has seen better decades.',
    rating: 3.9,
  },
  {
    id: 'tmdb-tv-91004',
    tmdbId: 91004,
    title: 'Low Country',
    year: 2016,
    endYear: 2018,
    seasons: 2,
    network: 'FX',
    genres: ['Crime', 'Thriller'],
    synopsis: 'A sheriff in a river county runs out of people she can trust.',
    rating: 4.0,
  },
]

export function showAdminApi(d: ShowAdminDeps) {
  let kept: Kept[] | undefined
  let added = 0

  const quality = (profile: string, season: number, show: string) =>
    show === 'saltmarsh' && season === 1
      ? 'HDTV-720p'
      : profile === 'qp-uhd'
        ? 'Bluray-2160p'
        : 'WEBDL-1080p'

  function build(): Kept[] {
    const now = d.now()
    return d.seeds().map((s, i) => {
      const show = s.show
      const profile = i % 4 === 3 ? 'qp-uhd' : 'qp-hd'
      const rootFolder = '/data/media/tv'
      const path = `${rootFolder}/${show.title} (${show.year})`
      const monitored = show.id !== 'small-town-radio'
      const seasonList: AdminSeason[] = s.seasons.map((season) => {
        const n = season.number
        const episodes: AdminEpisode[] = season.episodes.map((e) => {
          const q = quality(profile, n, show.id)
          // the first two episodes of Small Town Radio share one file, as a double episode does
          const double = show.id === 'small-town-radio' && n === 1 && e.number <= 2
          const name = double
            ? `${show.title} - S01E01-E02 - ${s.seasons[1]?.episodes[0]?.title ?? e.title}`
            : `${show.title} - ${code(n, e.number)} - ${e.title}`
          return {
            id: e.id,
            show: show.id,
            season: n,
            number: e.number,
            title: e.title,
            aired: e.aired,
            runtimeMinutes: e.runtimeMinutes,
            monitored: monitored && n !== 0,
            status: q === 'HDTV-720p' ? 'cutoff-unmet' : 'available',
            file: {
              path: `${path}/${n === 0 ? 'Specials' : `Season ${String(n).padStart(2, '0')}`}/${name} ${q}.mkv`,
              size: Math.round(
                e.runtimeMinutes * (q.includes('2160') ? 110 : q.includes('720') ? 18 : 36) * MB,
              ),
              quality: q,
              releaseGroup: q.includes('2160') ? 'FRAMESTOR' : q.includes('720') ? 'TLA' : 'NTb',
              episodes: double ? [1, 2] : [e.number],
            },
          }
        })
        return {
          number: n,
          title: season.title,
          monitored: monitored && n !== 0,
          poster: season.poster,
          episodes,
        }
      })
      const more = upcoming[show.id]
      if (more) {
        let season = seasonList.find((x) => x.number === more.season)
        if (!season) {
          season = {
            number: more.season,
            title: `Season ${more.season}`,
            monitored: true,
            poster: posterArt(`${show.title} Season ${more.season}`),
            episodes: [],
          }
          seasonList.push(season)
        }
        for (let k = 0; k < more.count; k++) {
          const number = more.from + k
          const aired = now + (more.first + k * 7) * DAY
          const status: EpisodeStatus =
            aired > now ? 'unaired' : k === 0 ? 'missing' : 'downloading'
          season.episodes.push({
            id: `${show.id}-s${more.season}e${number}`,
            show: show.id,
            season: more.season,
            number,
            title: newTitles[(number + more.season) % newTitles.length] as string,
            aired: day(aired),
            runtimeMinutes: show.runtimeMinutes,
            monitored: true,
            status,
            file: null,
            ...(status === 'downloading' ? { progress: 64 } : {}),
          })
        }
      }
      return {
        id: show.id,
        tmdbId: 90000 + i,
        title: show.title,
        sortTitle: show.sortTitle,
        year: show.year,
        endYear: show.endYear,
        airing: show.endYear === null,
        network: networks[i % networks.length] as string,
        genres: show.genres,
        synopsis: show.synopsis,
        rating: show.rating,
        certification: show.certification,
        runtimeMinutes: show.runtimeMinutes,
        monitored,
        qualityProfileId: profile,
        languageProfileId: 'lp-default',
        rootFolder,
        path,
        seasonFolders: true,
        addedAt: show.addedAt,
        art: { poster: show.art.poster, backdrop: show.art.backdrop },
        seasonList,
      }
    })
  }

  const all = () => {
    kept ??= build()
    return kept
  }
  const find = (id: string) => {
    const s = all().find((x) => x.id === id)
    if (!s) throw d.fail(404, 'not-found', 'That show isn’t in the library.')
    return s
  }
  const episodes = (s: Kept) => s.seasonList.flatMap((x) => x.episodes)

  /** The list's row: counts and size from its episodes, as Sonarr's series index has them. */
  function row(s: Kept): AdminShow {
    const { seasonList, ...rest } = s
    const now = d.now()
    const eps = episodes(s).filter((e) => e.season !== 0)
    const aired = eps.filter((e) => e.status !== 'unaired')
    const next = eps
      .filter((e) => e.monitored && Date.parse(e.aired) > now)
      .sort((a, b) => a.aired.localeCompare(b.aired))[0]
    return {
      ...rest,
      seasons: seasonList.filter((x) => x.number !== 0).length,
      // Sonarr's count: monitored or on disk, so a show no longer monitored still shows its files
      episodes: {
        monitored: aired.filter((e) => e.monitored || e.file).length,
        have: aired.filter((e) => e.file).length,
        total: eps.length,
      },
      size: episodes(s).reduce(
        // a double episode's file counts once
        (n, e) => n + (e.file && e.file.episodes[0] === e.number ? e.file.size : 0),
        0,
      ),
      nextAiring: next
        ? {
            id: next.id,
            code: code(next.season, next.number),
            title: next.title,
            aired: next.aired,
          }
        : null,
    }
  }
  const detail = (s: Kept): AdminShowDetail => ({
    ...row(s),
    // specials first, as Sonarr lists them, then the seasons newest first
    seasonList: [...s.seasonList].sort((a, b) =>
      a.number === 0 ? -1 : b.number === 0 ? 1 : b.number - a.number,
    ),
  })

  /** Who's looking: a missing or below-cutoff episode starts downloading, as a grab would. */
  const look = (eps: AdminEpisode[]) => {
    let found = 0
    for (const e of eps)
      if (e.monitored && (e.status === 'missing' || e.status === 'cutoff-unmet')) {
        e.status = 'downloading'
        e.progress = 0
        found++
      }
    d.emit()
    return { searched: eps.length, found }
  }

  const monitorFor = (monitor: ShowMonitor, e: AdminEpisode, now: number) =>
    e.season !== 0 &&
    (monitor === 'all' ||
      (monitor === 'future' && Date.parse(e.aired) > now) ||
      (monitor === 'missing' && !e.file) ||
      (monitor === 'first-season' && e.season === 1))

  return {
    list: (): AdminShow[] => all().map(row),
    /** The folders shows are kept in, for Add a show and Edit: Settings' Shows folders. */
    rootFolders: (): string[] => d.folders(),
    get: (id: string): AdminShowDetail => detail(find(id)),
    /** One episode by its id, with its show: for the queue, history and imports that name it. */
    episode: (episodeId: string): { show: AdminShow; episode: AdminEpisode } | null => {
      for (const s of all()) {
        const e = episodes(s).find((x) => x.id === episodeId)
        if (e) return { show: row(s), episode: e }
      }
      return null
    },
    /** Every monitored episode airing between two dates, for the calendar and the dashboard. */
    airing: (from: number, to: number) =>
      all()
        .flatMap((s) =>
          episodes(s)
            .filter((e) => e.monitored && s.monitored)
            .filter((e) => {
              const t = Date.parse(e.aired)
              return t >= from && t < to
            })
            .map((e) => ({ show: row(s), episode: e })),
        )
        .sort((a, b) => a.episode.aired.localeCompare(b.episode.aired)),
    /** Monitored, aired episodes with no file, or with one below the cutoff. */
    wanted: (status: 'missing' | 'cutoff-unmet') =>
      all()
        .filter((s) => s.monitored)
        .flatMap((s) =>
          episodes(s)
            .filter((e) => e.monitored && e.status === status)
            .map((e) => ({ show: row(s), episode: e })),
        ),
    /** TMDB's shows for a search: the library's marked as here, then the others. */
    discover: (query = ''): DiscoverShow[] => {
      const q = query.trim().toLowerCase()
      const here = all().map((s) => {
        const r = row(s)
        return {
          id: r.id,
          tmdbId: r.tmdbId,
          title: r.title,
          year: r.year,
          endYear: r.endYear,
          seasons: r.seasons,
          network: r.network,
          genres: r.genres,
          synopsis: r.synopsis,
          rating: r.rating,
          art: r.art,
          inLibrary: true,
        }
      })
      const there = elsewhere
        .filter((x) => !all().some((s) => s.tmdbId === x.tmdbId))
        .map((x) => ({
          ...x,
          art: { poster: posterArt(x.title), backdrop: backdropArt(x.title) },
          inLibrary: false,
        }))
      return [...there, ...here].filter(
        (x) =>
          !q ||
          x.title.toLowerCase().includes(q) ||
          x.genres.some((g) => g.toLowerCase().includes(q)),
      )
    },
    add: (input: AddShowInput): AdminShowDetail => {
      d.requireStaff()
      const existing = all().find((s) => s.tmdbId === input.tmdbId)
      if (existing) return detail(existing)
      const meta = elsewhere.find((x) => x.tmdbId === input.tmdbId)
      const now = d.now()
      const id = meta?.id ?? `added-show-${++added}`
      const path = `${input.rootFolder}/${input.title} (${input.year})`
      const count = meta?.seasons ?? 1
      const seasonList: AdminSeason[] = Array.from({ length: count }, (_, i) => {
        const n = i + 1
        const episodes: AdminEpisode[] = Array.from({ length: 8 }, (_, k) => {
          // the last season is still airing for a show that hasn't ended
          const t =
            meta?.endYear === null && n === count
              ? now + (k - 3) * 7 * DAY
              : Date.UTC(input.year + i, 2, 1) + k * 7 * DAY
          return {
            id: `${id}-s${n}e${k + 1}`,
            show: id,
            season: n,
            number: k + 1,
            title: newTitles[(k + n) % newTitles.length] as string,
            aired: day(t),
            runtimeMinutes: 45,
            monitored: false,
            status: t > now ? 'unaired' : 'missing',
            file: null,
          }
        })
        for (const e of episodes) e.monitored = monitorFor(input.monitor, e, now)
        return {
          number: n,
          title: `Season ${n}`,
          monitored: episodes.some((e) => e.monitored),
          poster: posterArt(`${input.title} Season ${n}`),
          episodes,
        }
      })
      const show: Kept = {
        id,
        tmdbId: input.tmdbId,
        title: input.title,
        sortTitle: input.title.replace(/^(the|a)\s+/i, ''),
        year: input.year,
        endYear: meta?.endYear ?? null,
        airing: (meta?.endYear ?? null) === null,
        network: meta?.network ?? '',
        genres: meta?.genres ?? [],
        synopsis: meta?.synopsis ?? '',
        rating: meta?.rating ?? 0,
        certification: '',
        runtimeMinutes: 45,
        monitored: input.monitor !== 'none',
        qualityProfileId: input.qualityProfileId,
        languageProfileId: input.languageProfileId,
        rootFolder: input.rootFolder,
        path,
        seasonFolders: input.seasonFolders,
        addedAt: new Date(now).toISOString(),
        art: { poster: posterArt(input.title), backdrop: backdropArt(input.title) },
        seasonList,
      }
      all().push(show)
      if (input.search) look(episodes(show))
      else d.emit()
      return detail(show)
    },
    edit: (
      id: string,
      patch: Partial<
        Pick<
          AdminShow,
          'monitored' | 'qualityProfileId' | 'languageProfileId' | 'rootFolder' | 'seasonFolders'
        >
      >,
    ): AdminShowDetail => {
      d.requireStaff()
      const s = find(id)
      Object.assign(s, patch)
      if (patch.rootFolder) s.path = `${patch.rootFolder}/${s.title} (${s.year})`
      d.emit()
      return detail(s)
    },
    /** A season on or off, with every episode in it. */
    monitorSeason: (id: string, season: number, monitored: boolean) => {
      d.requireStaff()
      const x = find(id).seasonList.find((s) => s.number === season)
      if (!x) throw d.fail(404, 'not-found', 'That season isn’t in this show.')
      x.monitored = monitored
      for (const e of x.episodes) e.monitored = monitored
      d.emit()
    },
    monitorEpisode: (id: string, episodeId: string, monitored: boolean) => {
      d.requireStaff()
      const s = find(id)
      const e = episodes(s).find((x) => x.id === episodeId)
      if (!e) throw d.fail(404, 'not-found', 'That episode isn’t in this show.')
      e.monitored = monitored
      const season = s.seasonList.find((x) => x.number === e.season)
      if (season) season.monitored = season.episodes.some((x) => x.monitored)
      d.emit()
    },
    /** Search for a whole show, a season, or one episode: what's missing or below the cutoff. */
    search: (id: string, scope: { season?: number; episode?: string } = {}) => {
      d.requireStaff()
      const eps = episodes(find(id)).filter(
        (e) =>
          (scope.season === undefined || e.season === scope.season) &&
          (scope.episode === undefined || e.id === scope.episode),
      )
      return look(eps)
    },
    remove: (id: string) => {
      d.requireStaff()
      find(id)
      kept = all().filter((s) => s.id !== id)
      d.emit()
    },
  }
}

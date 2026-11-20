// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Migration (ADR 0041), as packages/importers answers it: a Radarr 5 with 412 movies,
// a Sonarr 4 with 96 series and a qBittorrent 5 with 64 torrents, each seen under its own paths
// (`/movies`, `/tv`, `/downloads`), so their folders are usable only once a path mapping puts them
// under `/data`. An
// address with "wrong" in it doesn't answer, and a key or password with "wrong" in it is refused.
// An import runs on the simulated clock and is read from it; the owner's alone.
import { iso } from './clock.ts'
import type { Settings, SettingsDeps } from './settings.ts'

export type PathMapping = { from: string; to: string }
export type RadarrConnection = { url: string; apiKey: string }
export type SonarrConnection = { url: string; apiKey: string }
export type QbittorrentConnection = { url: string; username: string; password: string }

export type RadarrPreview = {
  version: string
  movies: { total: number; withFiles: number; inLibrary: number; ready: number }
  profiles: { radarrId: number; name: string; cutoff: string; movies: number; options: string[] }[]
  rootFolders: {
    radarr: string
    path: string
    status: 'root-folder' | 'add' | 'outside'
    movies: number
  }[]
  tags: number
  blocklist: number
  naming: { rename: boolean; folderFormat: string; fileFormat: string; problem: string | null }
  kept: { indexers: string[]; downloadClients: string[] }
  problems: { title: string; message: string }[]
}

export type SonarrPreview = {
  version: string
  series: {
    total: number
    withFiles: number
    inLibrary: number
    ready: number
    episodes: number
    files: number
  }
  profiles: { sonarrId: number; name: string; cutoff: string; series: number; options: string[] }[]
  rootFolders: {
    sonarr: string
    path: string
    status: 'root-folder' | 'add' | 'outside'
    series: number
  }[]
  tags: number
  numbering: { daily: number; anime: number }
  problems: { title: string; message: string }[]
}

export type QbittorrentPreview = {
  version: string
  webApi: string
  torrents: { total: number; ready: number; inDownloads: number; outside: number; linked: number }
  categories: { qbittorrent: string; name: string; folder: string | null }[]
  savePaths: { qbittorrent: string; path: string; ok: boolean; torrents: number }[]
}

export type ImportStatus = {
  state: 'idle' | 'running' | 'done' | 'failed'
  total: number
  done: number
  imported: number
  skipped: number
  failures: { name: string; message: string }[]
  startedAt: string | null
  finishedAt: string | null
}

export type SonarrImportStatus = ImportStatus & {
  files: number
  unmatched: { name: string; message: string }[]
}

export type QbittorrentImportStatus = ImportStatus & {
  paused: number
  checking: number
  resumedAt: string | null
}

/** The profile option that brings Radarr's profile across as it is. */
export const COPY_PROFILE = 'copy'

const RADARR_ROOTS = [
  { radarr: '/movies', movies: 381 },
  { radarr: '/movies-4k', movies: 31 },
]
const RADARR_IN_LIBRARY = 24
const RADARR_FAILURES = [
  {
    name: 'The Wandering Earth II (2023)',
    message: 'TMDB has no movie with the id Radarr gave (842675).',
  },
]
const SONARR_ROOTS = [
  { sonarr: '/tv', series: 84, files: 3912 },
  { sonarr: '/anime', series: 12, files: 640 },
]
const SONARR_IN_LIBRARY = 9
const SONARR_FAILURES = [
  {
    name: 'Harbour Lights (1998)',
    message: 'TMDB has no show for TheTVDB’s id 71354, and Sonarr has no TMDB id.',
  },
]
const SONARR_UNMATCHED = [
  {
    name: 'Night Ferry (2015): S00E04',
    message: 'TMDB lists no S00E04 for this show, so its monitoring stays behind.',
  },
  {
    name: 'Night Ferry (2015): Specials/Night Ferry - S00E04 - Behind the Scenes.mkv',
    message: 'TMDB lists no S00E04 for this show.',
  },
]

const QBT_PATHS = [
  { qbittorrent: '/downloads/movies', torrents: 51 },
  { qbittorrent: '/downloads/incomplete', torrents: 4 },
  { qbittorrent: '/srv/old-seeds', torrents: 9 },
]

/** Items an import gets through per simulated second. */
const PACE = { radarr: 14, sonarr: 3, qbittorrent: 4 }

type Run = { startedAt: number; total: number; skipped: number; failures: ImportStatus['failures'] }
type Runs = {
  radarr: Run | null
  sonarr: (Run & { files: number }) | null
  qbittorrent: (Run & { resumedAt: number | null }) | null
  /** What an earlier run brought across: a second run skips it. */
  imported: { radarr: number; sonarr: number; qbittorrent: number }
}

// kept with the server's settings, so a run carries on when the toolbar's role changes
const runsOf = new WeakMap<Settings, Runs>()

const mapped = (path: string, maps: PathMapping[]) => {
  for (const m of maps) {
    const from = m.from.replace(/\/+$/, '')
    if (path === from || path.startsWith(`${from}/`))
      return m.to.replace(/\/+$/, '') + path.slice(from.length)
  }
  return path
}

export function migrationApi(d: SettingsDeps) {
  const s = d.settings
  const runs = (() => {
    let r = runsOf.get(s)
    if (!r) {
      r = {
        radarr: null,
        sonarr: null,
        qbittorrent: null,
        imported: { radarr: 0, sonarr: 0, qbittorrent: 0 },
      }
      runsOf.set(s, r)
    }
    return r
  })()

  const reach = (program: string, url: string) => {
    if (!/^https?:\/\/[^/]+/.test(url.trim()))
      throw d.fail(400, 'invalid', 'Use an address that starts with http:// or https://.', {
        field: 'url',
        reason: 'invalid',
      })
    if (/wrong/i.test(url)) {
      const host = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      throw d.fail(503, 'unavailable', `Nothing answered at ${host}. Is ${program} running?`, {
        field: 'url',
        reason: 'unreachable',
      })
    }
  }

  const arr = (program: 'Radarr' | 'Sonarr') => (c: RadarrConnection | SonarrConnection) => {
    d.requireOwner()
    reach(program, c.url)
    if (!c.apiKey.trim())
      throw d.fail(400, 'invalid', `Enter ${program}’s API key.`, {
        field: 'apiKey',
        reason: 'no-key',
      })
    if (/wrong/i.test(c.apiKey))
      throw d.fail(
        400,
        'invalid',
        `${program} refused the API key. It’s in ${program} under Settings › General › Security.`,
        { field: 'apiKey', reason: 'bad-credentials' },
      )
  }
  const radarr = arr('Radarr')
  const sonarr = arr('Sonarr')

  const qbittorrent = (c: QbittorrentConnection) => {
    d.requireOwner()
    reach('qBittorrent', c.url)
    if (/wrong/i.test(c.password) || (c.username.trim() && !c.password))
      throw d.fail(400, 'invalid', 'qBittorrent refused the username and password.', {
        field: 'password',
        reason: 'bad-credentials',
      })
  }

  const radarrPreview = (maps: PathMapping[]): RadarrPreview => {
    // Radarr's folders are movies': only the Movies folders count
    const roots = s.rootFolders.filter((f) => f.kind === 'movies').map((f) => f.path)
    const rootFolders = RADARR_ROOTS.map((r) => {
      const path = mapped(r.radarr, maps)
      const status: RadarrPreview['rootFolders'][number]['status'] = roots.includes(path)
        ? 'root-folder'
        : path === '/data' || path.startsWith('/data/')
          ? 'add'
          : 'outside'
      return { radarr: r.radarr, path, status, movies: r.movies }
    })
    const usable = rootFolders
      .filter((r) => r.status !== 'outside')
      .reduce((n, r) => n + r.movies, 0)
    const total = RADARR_ROOTS.reduce((n, r) => n + r.movies, 0)
    return {
      version: '5.14.0.9383',
      movies: {
        total,
        withFiles: 396,
        inLibrary: RADARR_IN_LIBRARY + runs.imported.radarr,
        ready: Math.max(0, usable - RADARR_IN_LIBRARY - runs.imported.radarr),
      },
      profiles: [
        {
          radarrId: 1,
          name: 'HD-1080p',
          cutoff: 'Bluray-1080p',
          movies: 302,
          options: ['qp-hd', 'qp-uhd', 'qp-any', COPY_PROFILE],
        },
        {
          radarrId: 5,
          name: 'Ultra-HD',
          cutoff: 'Remux-2160p',
          movies: 31,
          options: ['qp-uhd', 'qp-hd', 'qp-any', COPY_PROFILE],
        },
        {
          radarrId: 7,
          name: 'Any',
          cutoff: 'WEBDL-720p',
          movies: 79,
          options: ['qp-any', 'qp-hd', 'qp-uhd', COPY_PROFILE],
        },
      ],
      rootFolders,
      tags: 3,
      blocklist: 17,
      naming: {
        rename: true,
        folderFormat: '{Movie Title} ({Release Year})',
        fileFormat: '{Movie Title} ({Release Year}) {Quality Full}',
        problem: null,
      },
      kept: { indexers: ['Driftnet', 'Keel', 'Anchorage'], downloadClients: ['qBittorrent'] },
      problems: [
        ...rootFolders
          .filter((r) => r.status === 'outside')
          .map((r) => ({
            title: `${r.movies} movies in ${r.radarr}`,
            message: `${r.path} is outside the folders highsea may use. Map it to a path under /data.`,
          })),
        {
          title: 'Kiki’s Delivery Service (1989)',
          message: 'Radarr has it twice, in two folders. The one with a file comes across.',
        },
      ],
    }
  }

  const sonarrPreview = (maps: PathMapping[]): SonarrPreview => {
    // Sonarr's folders are shows': only the Shows folders count
    const roots = s.rootFolders.filter((f) => f.kind === 'shows').map((f) => f.path)
    const rootFolders = SONARR_ROOTS.map((r) => {
      const path = mapped(r.sonarr, maps)
      const status: SonarrPreview['rootFolders'][number]['status'] = roots.includes(path)
        ? 'root-folder'
        : path === '/data' || path.startsWith('/data/')
          ? 'add'
          : 'outside'
      return { sonarr: r.sonarr, path, status, series: r.series }
    })
    const usable = rootFolders
      .filter((r) => r.status !== 'outside')
      .reduce((n, r) => n + r.series, 0)
    const total = SONARR_ROOTS.reduce((n, r) => n + r.series, 0)
    return {
      version: '4.0.14.2939',
      series: {
        total,
        withFiles: 91,
        inLibrary: SONARR_IN_LIBRARY + runs.imported.sonarr,
        ready: Math.max(0, usable - SONARR_IN_LIBRARY - runs.imported.sonarr - 1),
        episodes: 5210,
        files: SONARR_ROOTS.reduce((n, r) => n + r.files, 0),
      },
      profiles: [
        {
          sonarrId: 4,
          name: 'HD-1080p',
          cutoff: 'WEBDL-1080p',
          series: 71,
          options: ['qp-hd', 'qp-uhd', 'qp-any', COPY_PROFILE],
        },
        {
          sonarrId: 6,
          name: 'Ultra-HD',
          cutoff: 'Remux-2160p',
          series: 8,
          options: ['qp-uhd', 'qp-hd', 'qp-any', COPY_PROFILE],
        },
        {
          sonarrId: 1,
          name: 'Any',
          cutoff: 'HDTV-720p',
          series: 17,
          options: ['qp-any', 'qp-hd', 'qp-uhd', COPY_PROFILE],
        },
      ],
      rootFolders,
      tags: 4,
      numbering: { daily: 3, anime: 12 },
      problems: [
        ...rootFolders
          .filter((r) => r.status === 'outside')
          .map((r) => ({
            title: `${r.series} series in ${r.sonarr}`,
            message: `${r.path} is outside the folders highsea may use. Map it to a path under /data.`,
          })),
        ...SONARR_FAILURES.map((f) => ({ title: f.name, message: f.message })),
      ],
    }
  }

  const qbtPreview = (maps: PathMapping[]): QbittorrentPreview => {
    const savePaths = QBT_PATHS.map((p) => {
      const path = mapped(p.qbittorrent, maps)
      return { ...p, path, ok: path === '/data' || path.startsWith('/data/') }
    })
    const total = QBT_PATHS.reduce((n, p) => n + p.torrents, 0)
    const outside = savePaths.filter((p) => !p.ok).reduce((n, p) => n + p.torrents, 0)
    const inDownloads = Math.min(total - outside, 6 + runs.imported.qbittorrent)
    return {
      version: '5.0.4',
      webApi: '2.11.2',
      torrents: {
        total,
        ready: total - outside - inDownloads,
        inDownloads,
        outside,
        linked: Math.min(38, total - outside),
      },
      categories: [
        { qbittorrent: 'radarr', name: 'radarr', folder: '/downloads/movies' },
        { qbittorrent: 'manual', name: 'manual', folder: null },
      ],
      savePaths,
    }
  }

  const statusOf = (run: Run | null, pace: number): ImportStatus => {
    if (!run)
      return {
        state: 'idle',
        total: 0,
        done: 0,
        imported: 0,
        skipped: 0,
        failures: [],
        startedAt: null,
        finishedAt: null,
      }
    const took = Math.ceil(run.total / pace) * 1000
    const finished = d.now() >= run.startedAt + took
    const done = finished ? run.total : Math.floor(((d.now() - run.startedAt) / 1000) * pace)
    return {
      state: finished ? 'done' : 'running',
      total: run.total,
      done,
      imported: finished ? run.total - run.failures.length : 0,
      skipped: run.skipped,
      failures: finished ? run.failures : [],
      startedAt: iso(run.startedAt),
      finishedAt: finished ? iso(run.startedAt + took) : null,
    }
  }

  const radarrStatus = () => statusOf(runs.radarr, PACE.radarr)
  const sonarrStatus = (): SonarrImportStatus => {
    const base = statusOf(runs.sonarr, PACE.sonarr)
    const done = base.state === 'done'
    return {
      ...base,
      files: done && runs.sonarr ? runs.sonarr.files : 0,
      unmatched: done && runs.sonarr && runs.sonarr.files > 0 ? SONARR_UNMATCHED : [],
    }
  }
  const qbtStatus = (): QbittorrentImportStatus => {
    const base = statusOf(runs.qbittorrent, PACE.qbittorrent)
    const run = runs.qbittorrent
    const paused = base.state === 'done' && run && !run.resumedAt ? base.imported : 0
    // each torrent's data is checked once, just after it comes across
    const sinceDone = base.finishedAt ? d.now() - Date.parse(base.finishedAt) : 0
    return {
      ...base,
      paused,
      checking: paused > 0 && sinceDone < 8000 ? Math.min(paused, 3) : 0,
      resumedAt: run?.resumedAt ? iso(run.resumedAt) : null,
    }
  }

  return {
    radarrTest: (c: RadarrConnection) => {
      radarr(c)
      return { version: '5.14.0.9383', movies: 412 }
    },
    radarrPreview: (c: RadarrConnection & { pathMappings: PathMapping[] }) => {
      radarr(c)
      return radarrPreview(c.pathMappings)
    },
    radarrRun: (
      c: RadarrConnection & {
        pathMappings: PathMapping[]
        profiles?: Record<string, string>
        settings?: boolean
      },
    ) => {
      radarr(c)
      if (radarrStatus().state === 'running')
        throw d.fail(409, 'conflict', 'A Radarr import is already running.')
      const p = radarrPreview(c.pathMappings)
      // the first run meets one movie it can't bring; a second brings it with the rest
      const failures = runs.imported.radarr === 0 && p.movies.ready > 0 ? RADARR_FAILURES : []
      runs.radarr = {
        startedAt: d.now(),
        total: p.movies.ready,
        skipped: p.movies.inLibrary,
        failures,
      }
      runs.imported.radarr += p.movies.ready - failures.length
      d.emit({ type: 'settings.updated' })
    },
    radarrStatus: () => {
      d.requireOwner()
      return radarrStatus()
    },
    sonarrTest: (c: SonarrConnection) => {
      sonarr(c)
      return { version: '4.0.14.2939', series: 96 }
    },
    sonarrPreview: (c: SonarrConnection & { pathMappings: PathMapping[] }) => {
      sonarr(c)
      return sonarrPreview(c.pathMappings)
    },
    sonarrRun: (
      c: SonarrConnection & { pathMappings: PathMapping[]; profiles?: Record<string, string> },
    ) => {
      sonarr(c)
      if (sonarrStatus().state === 'running')
        throw d.fail(409, 'conflict', 'A Sonarr import is already running.')
      const p = sonarrPreview(c.pathMappings)
      // one series TMDB can't find, on every run, as the importer would
      const failures = p.series.ready > 0 ? SONARR_FAILURES : []
      const share = p.series.total ? p.series.ready / p.series.total : 0
      runs.sonarr = {
        startedAt: d.now(),
        total: p.series.ready + failures.length,
        skipped: p.series.inLibrary,
        failures,
        files: Math.round(p.series.files * share),
      }
      runs.imported.sonarr += p.series.ready
      d.emit({ type: 'settings.updated' })
    },
    sonarrStatus: () => {
      d.requireOwner()
      return sonarrStatus()
    },
    qbittorrentTest: (c: QbittorrentConnection) => {
      qbittorrent(c)
      return { version: '5.0.4', webApi: '2.11.2', torrents: 64 }
    },
    qbittorrentPreview: (c: QbittorrentConnection & { pathMappings: PathMapping[] }) => {
      qbittorrent(c)
      return qbtPreview(c.pathMappings)
    },
    qbittorrentRun: (c: QbittorrentConnection & { pathMappings: PathMapping[] }) => {
      qbittorrent(c)
      if (qbtStatus().state === 'running')
        throw d.fail(409, 'conflict', 'A qBittorrent import is already running.')
      const p = qbtPreview(c.pathMappings)
      runs.qbittorrent = {
        startedAt: d.now(),
        total: p.torrents.ready,
        skipped: p.torrents.inDownloads,
        failures: [],
        resumedAt: null,
      }
      runs.imported.qbittorrent += p.torrents.ready
      d.emit({ type: 'settings.updated' })
    },
    qbittorrentStatus: () => {
      d.requireOwner()
      return qbtStatus()
    },
    qbittorrentResume: () => {
      d.requireOwner()
      const st = qbtStatus()
      if (st.state === 'running')
        throw d.fail(409, 'conflict', 'Wait for the qBittorrent import to finish.')
      if (runs.qbittorrent) runs.qbittorrent.resumedAt = d.now()
      d.emit({ type: 'settings.updated' })
      d.emit({ type: 'torrents.updated' })
    },
  }
}

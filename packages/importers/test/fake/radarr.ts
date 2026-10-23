// SPDX-License-Identifier: AGPL-3.0-only
// A fake Radarr on 127.0.0.1: the API v3 routes the importer reads, answering JSON in the shapes
// Radarr's API docs give (https://radarr.video/docs/api/), behind `X-Api-Key`. The data is written
// by hand from those shapes, with the recorded TMDB movies (Sintel, Big Buck Bunny, Tears of
// Steel); no real instance's data or keys. Secrets come back as `********`, as Radarr's
// SchemaBuilder.cs masks them.
import http from 'node:http'
import type { AddressInfo } from 'node:net'

export const FAKE_RADARR_KEY = 'fake-radarr-api-key-0001'

/** Radarr's quality ids (Quality.cs), for the ones the fixtures use. */
const Q = {
  SDTV: { id: 1, name: 'SDTV', source: 'television', resolution: 480 },
  'WEBDL-1080p': { id: 3, name: 'WEBDL-1080p', source: 'webdl', resolution: 1080 },
  'Bluray-720p': { id: 6, name: 'Bluray-720p', source: 'bluray', resolution: 720 },
  'Bluray-1080p': { id: 7, name: 'Bluray-1080p', source: 'bluray', resolution: 1080 },
  'WEBRip-1080p': { id: 15, name: 'WEBRip-1080p', source: 'webrip', resolution: 1080 },
  'Bluray-2160p': { id: 19, name: 'Bluray-2160p', source: 'bluray', resolution: 2160 },
  'Remux-2160p': { id: 31, name: 'Remux-2160p', source: 'bluray', resolution: 2160 },
} as const

const item = (q: keyof typeof Q, allowed = true) => ({ quality: Q[q], items: [], allowed })

export type FakeRadarrState = {
  apiKey: string
  appName: string
  version: string
  movies: Record<string, unknown>[]
  profiles: Record<string, unknown>[]
  rootFolders: { id: number; path: string; accessible: boolean; freeSpace: number }[]
  tags: { id: number; label: string }[]
  naming: Record<string, unknown>
  mediaManagement: Record<string, unknown>
  blocklist: Record<string, unknown>[]
  history: Record<string, unknown>[]
  indexers: Record<string, unknown>[]
  downloadClients: Record<string, unknown>[]
}

export const SINTEL_HASH = '0123456789abcdef0123456789abcdef01234567'

/**
 * A small Radarr library under `root` (Radarr's own path, e.g. `/movies`): Sintel with a file,
 * Big Buck Bunny without one, Tears of Steel in a second root folder.
 */
export function radarrLibrary(root = '/movies', second = '/movies-4k'): FakeRadarrState {
  const sintelFile = `${root}/Sintel (2010)/Sintel.2010.1080p.BluRay.x264-GRP.mkv`
  return {
    apiKey: FAKE_RADARR_KEY,
    appName: 'Radarr',
    version: '5.14.0.9383',
    movies: [
      {
        id: 1,
        title: 'Sintel',
        year: 2010,
        tmdbId: 45745,
        imdbId: 'tt1727587',
        monitored: true,
        minimumAvailability: 'released',
        qualityProfileId: 4,
        path: `${root}/Sintel (2010)`,
        rootFolderPath: root,
        folderName: `${root}/Sintel (2010)`,
        hasFile: true,
        sizeOnDisk: 1_000,
        tags: [1],
        movieFile: {
          id: 11,
          movieId: 1,
          relativePath: 'Sintel.2010.1080p.BluRay.x264-GRP.mkv',
          path: sintelFile,
          size: 1_000,
          dateAdded: '2024-02-01T10:00:00Z',
          sceneName: 'Sintel.2010.1080p.BluRay.x264-GRP',
          releaseGroup: 'GRP',
          quality: {
            quality: Q['Bluray-1080p'],
            revision: { version: 1, real: 0, isRepack: false },
          },
          originalFilePath:
            'Sintel.2010.1080p.BluRay.x264-GRP/Sintel.2010.1080p.BluRay.x264-GRP.mkv',
        },
      },
      {
        id: 2,
        title: 'Big Buck Bunny',
        year: 2008,
        tmdbId: 10378,
        imdbId: 'tt1254207',
        monitored: false,
        minimumAvailability: 'inCinemas',
        qualityProfileId: 5,
        path: `${root}/Big Buck Bunny (2008)`,
        rootFolderPath: root,
        hasFile: false,
        sizeOnDisk: 0,
        tags: [1, 2],
      },
      {
        id: 3,
        title: 'Tears of Steel',
        year: 2012,
        tmdbId: 133701,
        imdbId: 'tt2285752',
        monitored: true,
        minimumAvailability: 'announced',
        qualityProfileId: 1,
        path: `${second}/Tears of Steel (2012)`,
        rootFolderPath: second,
        hasFile: false,
        sizeOnDisk: 0,
        tags: [],
      },
    ],
    profiles: [
      {
        id: 1,
        name: 'Any',
        upgradeAllowed: false,
        cutoff: 1,
        items: [item('SDTV'), item('Bluray-720p'), item('Bluray-1080p')],
      },
      {
        id: 4,
        name: 'HD-1080p',
        upgradeAllowed: true,
        cutoff: 7,
        items: [
          item('Bluray-720p', false),
          {
            id: 1001,
            name: 'WEB 1080p',
            items: [item('WEBDL-1080p'), item('WEBRip-1080p')],
            allowed: true,
          },
          item('Bluray-1080p'),
        ],
      },
      {
        id: 5,
        name: 'Ultra-HD',
        upgradeAllowed: true,
        cutoff: 31,
        items: [item('Bluray-2160p'), item('Remux-2160p')],
      },
    ],
    rootFolders: [
      { id: 1, path: root, accessible: true, freeSpace: 1_000_000 },
      { id: 2, path: second, accessible: true, freeSpace: 1_000_000 },
    ],
    tags: [
      { id: 1, label: 'family' },
      { id: 2, label: 'animation' },
    ],
    naming: {
      id: 1,
      renameMovies: true,
      replaceIllegalCharacters: true,
      colonReplacementFormat: 'spaceDash',
      standardMovieFormat: '{Movie Title} ({Release Year}) {Quality Full}',
      movieFolderFormat: '{Movie Title} ({Release Year}) {tmdb-{TmdbId}}',
    },
    mediaManagement: {
      id: 1,
      autoUnmonitorPreviouslyDownloadedMovies: false,
      recycleBin: '',
      recycleBinCleanupDays: 14,
      copyUsingHardlinks: true,
      setPermissionsLinux: false,
      chmodFolder: '775',
    },
    blocklist: [
      {
        id: 1,
        movieId: 1,
        sourceTitle: 'Sintel.2010.1080p.WEB-DL.DD5.1.H264-BAD',
        quality: { quality: Q['WEBDL-1080p'], revision: { version: 1, real: 0, isRepack: false } },
        date: '2024-01-15T08:00:00Z',
        protocol: 'torrent',
        indexer: 'Nyaa',
        message: 'Stalled with no peers',
      },
    ],
    history: [
      {
        id: 1,
        movieId: 1,
        sourceTitle: 'Sintel.2010.1080p.BluRay.x264-GRP',
        eventType: 'grabbed',
        downloadId: SINTEL_HASH.toUpperCase(),
        date: '2024-02-01T09:00:00Z',
      },
    ],
    indexers: [
      {
        id: 1,
        name: 'Nyaa',
        implementation: 'Torznab',
        fields: [
          { name: 'baseUrl', value: 'https://indexer.invalid' },
          { name: 'apiKey', value: '********' },
        ],
      },
    ],
    downloadClients: [
      {
        id: 1,
        name: 'qBittorrent',
        implementation: 'QBittorrent',
        fields: [
          { name: 'host', value: 'qbittorrent' },
          { name: 'password', value: '********' },
        ],
      },
    ],
  }
}

export async function startFakeRadarr(initial: FakeRadarrState = radarrLibrary()) {
  const state = initial
  const requests: string[] = []
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake')
    requests.push(`${req.method} ${url.pathname}${url.search}`)
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    if (req.headers['x-api-key'] !== state.apiKey) return send(401, { message: 'Unauthorized' })
    const paged = (records: unknown[]) => {
      const page = Number(url.searchParams.get('page') ?? 1)
      const size = Number(url.searchParams.get('pageSize') ?? 10)
      send(200, {
        page,
        pageSize: size,
        sortKey: 'date',
        sortDirection: 'descending',
        totalRecords: records.length,
        records: records.slice((page - 1) * size, page * size),
      })
    }
    switch (url.pathname) {
      case '/api/v3/system/status':
        return send(200, { appName: state.appName, version: state.version, isDocker: true })
      case '/api/v3/movie':
        return send(200, state.movies)
      case '/api/v3/moviefile': {
        const id = Number(url.searchParams.get('movieId'))
        const m = state.movies.find((x) => x.id === id)
        return send(200, m?.movieFile ? [m.movieFile] : [])
      }
      case '/api/v3/qualityprofile':
        return send(200, state.profiles)
      case '/api/v3/rootfolder':
        return send(200, state.rootFolders)
      case '/api/v3/tag':
        return send(200, state.tags)
      case '/api/v3/config/naming':
        return send(200, state.naming)
      case '/api/v3/config/mediamanagement':
        return send(200, state.mediaManagement)
      case '/api/v3/blocklist':
        return paged(state.blocklist)
      case '/api/v3/history': {
        const type = url.searchParams.get('eventType')
        return paged(
          type === '1' ? state.history.filter((h) => h.eventType === 'grabbed') : state.history,
        )
      }
      case '/api/v3/indexer':
        return send(200, state.indexers)
      case '/api/v3/downloadclient':
        return send(200, state.downloadClients)
    }
    send(404, { message: 'NotFound' })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    state,
    requests,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}

export type FakeRadarr = Awaited<ReturnType<typeof startFakeRadarr>>

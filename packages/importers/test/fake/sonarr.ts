// SPDX-License-Identifier: AGPL-3.0-only
// A fake Sonarr on 127.0.0.1: the API v3 routes the importer reads, answering JSON in the shapes
// Sonarr's API docs give (https://sonarr.tv/docs/api/: SeriesResource, EpisodeResource,
// EpisodeFileResource, QualityProfileResource, RootFolderResource, TagResource, SystemResource),
// behind `X-Api-Key`. Written by hand from those shapes with the recorded TMDB shows (The Office,
// TMDB 2996 and TheTVDB 78107; Chernobyl, TheTVDB 360893); nothing from Sonarr's code, and no
// real instance's data or keys. It answers GET only: anything else is 405, and is recorded, so a
// test can prove the importer never asked to change anything.
import http from 'node:http'
import type { AddressInfo } from 'node:net'

export const FAKE_SONARR_KEY = 'fake-sonarr-api-key-0001'

/** Sonarr's quality ids, for the ones the fixtures use (Servarr wiki's Qualities Defined names). */
const Q = {
  SDTV: { id: 1, name: 'SDTV', source: 'television', resolution: 480 },
  'HDTV-720p': { id: 4, name: 'HDTV-720p', source: 'television', resolution: 720 },
  'WEBDL-1080p': { id: 3, name: 'WEBDL-1080p', source: 'web', resolution: 1080 },
  'Bluray-1080p': { id: 7, name: 'Bluray-1080p', source: 'bluray', resolution: 1080 },
  'Bluray-1080p Remux': {
    id: 20,
    name: 'Bluray-1080p Remux',
    source: 'blurayRaw',
    resolution: 1080,
  },
  'Bluray-2160p Remux': {
    id: 21,
    name: 'Bluray-2160p Remux',
    source: 'blurayRaw',
    resolution: 2160,
  },
} as const

const item = (q: keyof typeof Q, allowed = true) => ({ quality: Q[q], items: [], allowed })

export type FakeSonarrState = {
  apiKey: string
  appName: string
  version: string
  series: Record<string, unknown>[]
  episodes: Record<string, unknown>[]
  episodeFiles: Record<string, unknown>[]
  profiles: Record<string, unknown>[]
  rootFolders: { id: number; path: string; accessible: boolean; freeSpace: number }[]
  tags: { id: number; label: string }[]
}

/** The files the fake's library holds, relative to its root, for a test to write on disk. */
export const SONARR_FILES = {
  pilot: 'The Office (UK) (2001)/Season 01/The Office (UK) - S01E01-E02 - Downsize.mkv',
  s01e03: 'The Office (UK) (2001)/Season 01/The Office (UK) - S01E03 - Work Experience.mkv',
  s01e07: 'The Office (UK) (2001)/Season 01/The Office (UK) - S01E07 - Not On TMDB.mkv',
  special: 'The Office (UK) (2001)/Specials/The Office (UK) - S00E01 - Christmas Special (1).mkv',
  chernobyl: 'Chernobyl (2019)/Season 01/Chernobyl - S01E01 - 1-23-45.mkv',
} as const

/**
 * A small Sonarr library under `root` (Sonarr's own path, e.g. `/tv`):
 * - The Office (UK), TMDB and TheTVDB ids, three seasons: specials (one file, monitored), season 1
 *   (monitored; a multi-episode file for E01–E02, one for E03, and an E07 TMDB doesn't list),
 *   season 2 unmonitored with no files; tagged `uk`;
 * - Chernobyl with TheTVDB's id and no TMDB id, so it's found through TMDB's Find; one file;
 * - a daily show with only a TheTVDB id TMDB has no show for, so it can't come across.
 */
export function sonarrLibrary(root = '/tv'): FakeSonarrState {
  let episodeId = 100
  const episodes: Record<string, unknown>[] = []
  const add = (
    seriesId: number,
    season: number,
    numbers: number[],
    monitored: boolean,
    fileOf: (n: number) => number = () => 0,
  ) => {
    for (const n of numbers) {
      const fileId = fileOf(n)
      episodes.push({
        id: episodeId++,
        seriesId,
        tvdbId: 0,
        episodeFileId: fileId,
        seasonNumber: season,
        episodeNumber: n,
        title: `Episode ${n}`,
        airDate: '2001-07-09',
        hasFile: fileId > 0,
        monitored,
      })
    }
  }
  // The Office: specials 1–2 (1 has a file, 2 unmonitored), season 1 with E07 extra, season 2
  add(1, 0, [1], true, () => 11)
  add(1, 0, [2], false)
  add(1, 1, [1, 2, 3, 4, 5, 6, 7], true, (n) => (n <= 2 ? 12 : n === 3 ? 13 : n === 7 ? 14 : 0))
  add(1, 2, [1, 2, 3, 4, 5, 6], false)
  // episode 4 of season 1 unmonitored by hand in Sonarr
  const s1e4 = episodes.find(
    (e) => e.seriesId === 1 && e.seasonNumber === 1 && e.episodeNumber === 4,
  )
  if (s1e4) s1e4.monitored = false
  // Chernobyl: one season of five, the first with a file
  add(2, 1, [1, 2, 3, 4, 5], true, (n) => (n === 1 ? 21 : 0))
  // the daily show
  add(3, 1, [1], true)

  const file = (id: number, seriesId: number, season: number, rel: string, sceneName: string) => ({
    id,
    seriesId,
    seasonNumber: season,
    relativePath: rel.slice(rel.indexOf('/') + 1),
    path: `${root}/${rel}`,
    size: 7,
    dateAdded: '2024-02-01T10:00:00Z',
    sceneName,
    releaseGroup: 'GRP',
    languages: [{ id: 1, name: 'English' }],
    quality: { quality: Q['WEBDL-1080p'], revision: { version: 1, real: 0, isRepack: false } },
    customFormats: [],
    customFormatScore: 0,
    qualityCutoffNotMet: false,
  })

  return {
    apiKey: FAKE_SONARR_KEY,
    appName: 'Sonarr',
    version: '4.0.14.2939',
    series: [
      {
        id: 1,
        title: 'The Office (UK)',
        year: 2001,
        tvdbId: 78107,
        tmdbId: 2996,
        imdbId: 'tt0290978',
        monitored: true,
        monitorNewItems: 'all',
        qualityProfileId: 4,
        seasonFolder: true,
        seriesType: 'standard',
        path: `${root}/The Office (UK) (2001)`,
        rootFolderPath: root,
        tags: [1],
        seasons: [
          {
            seasonNumber: 0,
            monitored: true,
            statistics: { episodeFileCount: 1, episodeCount: 1 },
          },
          {
            seasonNumber: 1,
            monitored: true,
            statistics: { episodeFileCount: 4, episodeCount: 7 },
          },
          {
            seasonNumber: 2,
            monitored: false,
            statistics: { episodeFileCount: 0, episodeCount: 0 },
          },
        ],
        statistics: { seasonCount: 2, episodeFileCount: 4, episodeCount: 7, sizeOnDisk: 28 },
      },
      {
        id: 2,
        title: 'Chernobyl',
        year: 2019,
        tvdbId: 360893,
        tmdbId: 0,
        monitored: true,
        monitorNewItems: 'all',
        qualityProfileId: 6,
        seasonFolder: true,
        seriesType: 'standard',
        path: `${root}/Chernobyl (2019)`,
        rootFolderPath: root,
        tags: [],
        seasons: [
          {
            seasonNumber: 1,
            monitored: true,
            statistics: { episodeFileCount: 1, episodeCount: 5 },
          },
        ],
        statistics: { seasonCount: 1, episodeFileCount: 1, episodeCount: 5, sizeOnDisk: 7 },
      },
      {
        id: 3,
        title: 'A Daily Show',
        year: 1964,
        tvdbId: 14296,
        tmdbId: 0,
        monitored: false,
        monitorNewItems: 'none',
        qualityProfileId: 4,
        seasonFolder: true,
        seriesType: 'daily',
        path: `${root}/A Daily Show`,
        rootFolderPath: root,
        tags: [],
        seasons: [{ seasonNumber: 1, monitored: false }],
        statistics: { seasonCount: 1, episodeFileCount: 0, episodeCount: 1, sizeOnDisk: 0 },
      },
    ],
    episodes,
    episodeFiles: [
      file(11, 1, 0, SONARR_FILES.special, 'The.Office.UK.Christmas.Special.WEB-DL.1080p-GRP'),
      file(12, 1, 1, SONARR_FILES.pilot, 'The.Office.UK.S01E01E02.1080p.WEB-DL-GRP'),
      file(13, 1, 1, SONARR_FILES.s01e03, 'The.Office.UK.S01E03.1080p.WEB-DL-GRP'),
      file(14, 1, 1, SONARR_FILES.s01e07, ''),
      file(21, 2, 1, SONARR_FILES.chernobyl, 'Chernobyl.S01E01.1080p.WEB-DL-GRP'),
    ],
    profiles: [
      {
        id: 4,
        name: 'HD-1080p',
        upgradeAllowed: true,
        cutoff: 7,
        items: [item('SDTV', false), item('HDTV-720p'), item('WEBDL-1080p'), item('Bluray-1080p')],
        minFormatScore: 0,
        cutoffFormatScore: 0,
        minUpgradeFormatScore: 1,
        formatItems: [],
      },
      {
        id: 6,
        name: 'Remux',
        upgradeAllowed: true,
        cutoff: 21,
        items: [item('Bluray-1080p Remux'), item('Bluray-2160p Remux')],
        minFormatScore: 0,
        cutoffFormatScore: 0,
        minUpgradeFormatScore: 1,
        formatItems: [],
      },
    ],
    rootFolders: [{ id: 1, path: root, accessible: true, freeSpace: 1_000_000 }],
    tags: [
      { id: 1, label: 'uk' },
      { id: 2, label: 'kids' },
    ],
  }
}

export async function startFakeSonarr(initial: FakeSonarrState = sonarrLibrary()) {
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
    if (req.method !== 'GET') return send(405, { message: 'Only reads here' })
    const seriesId = Number(url.searchParams.get('seriesId'))
    switch (url.pathname) {
      case '/api/v3/system/status':
        return send(200, { appName: state.appName, version: state.version, isDocker: true })
      case '/api/v3/series':
        return send(200, state.series)
      case '/api/v3/episode':
        return send(
          200,
          state.episodes.filter((e) => e.seriesId === seriesId),
        )
      case '/api/v3/episodefile':
        return send(
          200,
          state.episodeFiles.filter((f) => f.seriesId === seriesId),
        )
      case '/api/v3/qualityprofile':
        return send(200, state.profiles)
      case '/api/v3/rootfolder':
        return send(200, state.rootFolders)
      case '/api/v3/tag':
        return send(200, state.tags)
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

export type FakeSonarr = Awaited<ReturnType<typeof startFakeSonarr>>

// SPDX-License-Identifier: AGPL-3.0-only
// Sonarr's API v3, read with its URL and API key in the `X-Api-Key` header (Sonarr API docs:
// https://sonarr.tv/docs/api/, whose v3 reference "applies to both v3 and v4 versions of
// Sonarr"). Only GET requests: the importer never changes, pauses or deletes anything in Sonarr.
// The shapes are the resources' fields this importer uses, as the docs' schemas name them
// (SeriesResource, SeasonResource, EpisodeResource, EpisodeFileResource, QualityProfileResource,
// RootFolderResource, TagResource, SystemResource). Written from the documentation, not Sonarr's
// code.
import { AppError, type Fetch } from '@highsea-tv/core'
import { baseUrl, jsonOf, request } from '../shared/http.ts'

export type SonarrConnection = { url: string; apiKey: string }

export type SonarrQuality = { id: number; name: string; source?: string; resolution?: number }

/** `SeriesTypes`: standard (SxxEyy), daily (by air date) or anime (absolute numbers). */
export type SonarrSeriesType = 'standard' | 'daily' | 'anime'

export type SonarrSeason = {
  seasonNumber: number
  monitored: boolean
  statistics?: { episodeFileCount?: number; episodeCount?: number; totalEpisodeCount?: number }
}

export type SonarrSeries = {
  id: number
  title: string
  year?: number
  tvdbId?: number
  /** Sonarr v4 keeps TMDB's id; 0 or absent when it has none. */
  tmdbId?: number
  imdbId?: string | null
  monitored: boolean
  qualityProfileId: number
  seasonFolder: boolean
  seriesType?: SonarrSeriesType
  path: string
  rootFolderPath?: string
  tags?: number[]
  seasons?: SonarrSeason[]
  statistics?: {
    seasonCount?: number
    episodeFileCount?: number
    episodeCount?: number
    totalEpisodeCount?: number
    sizeOnDisk?: number
  }
}

export type SonarrEpisode = {
  id: number
  seriesId: number
  seasonNumber: number
  episodeNumber: number
  title?: string
  monitored: boolean
  hasFile?: boolean
  /** 0 when the episode has no file. */
  episodeFileId?: number
}

export type SonarrEpisodeFile = {
  id: number
  seriesId: number
  seasonNumber: number
  relativePath?: string
  path?: string
  size: number
  sceneName?: string | null
  quality?: { quality: SonarrQuality }
}

export type SonarrProfileItem = {
  id?: number
  name?: string
  quality?: SonarrQuality
  items?: SonarrProfileItem[]
  allowed: boolean
}

export type SonarrProfile = {
  id: number
  name: string
  cutoff: number
  items: SonarrProfileItem[]
  upgradeAllowed?: boolean
  minFormatScore?: number
  cutoffFormatScore?: number
  minUpgradeFormatScore?: number
  formatItems?: { format: number; name: string; score: number }[]
}

export type SonarrRootFolder = { id: number; path: string; accessible?: boolean }
export type SonarrTag = { id: number; label: string }

export function createSonarrClient(fetch: Fetch, conn: SonarrConnection) {
  const base = baseUrl(conn.url)
  const apiKey = conn.apiKey.trim()
  if (!apiKey)
    throw new AppError('invalid', 'Enter Sonarr’s API key.', { field: 'apiKey', reason: 'no-key' })

  /** The one way this client talks to Sonarr: a GET. */
  async function get<T>(path: string): Promise<T> {
    const res = await request(fetch, 'Sonarr', `${base}/api/v3/${path}`, {
      method: 'GET',
      headers: { 'X-Api-Key': apiKey, accept: 'application/json' },
    })
    if (res.status === 401 || res.status === 403)
      throw new AppError(
        'invalid',
        'Sonarr refused the API key. It’s in Sonarr under Settings › General › Security.',
        { field: 'apiKey', reason: 'bad-credentials' },
      )
    if (!res.ok)
      throw new AppError('unavailable', `Sonarr answered ${res.status} for ${path}.`, {
        reason: 'bad-answer',
      })
    return jsonOf<T>('Sonarr', res)
  }

  return {
    status: () => get<{ appName?: string; version: string }>('system/status'),
    series: () => get<SonarrSeries[]>('series'),
    /** A series' episodes (`GET /api/v3/episode?seriesId=`). */
    episodes: (seriesId: number) => get<SonarrEpisode[]>(`episode?seriesId=${seriesId}`),
    /** A series' files (`GET /api/v3/episodefile?seriesId=`). */
    episodeFiles: (seriesId: number) =>
      get<SonarrEpisodeFile[]>(`episodefile?seriesId=${seriesId}`),
    profiles: () => get<SonarrProfile[]>('qualityprofile'),
    rootFolders: () => get<SonarrRootFolder[]>('rootfolder'),
    tags: () => get<SonarrTag[]>('tag'),
  }
}

export type SonarrClient = ReturnType<typeof createSonarrClient>

/** Everything the preview reads, in one go: no per-series requests. */
export async function readSonarr(client: SonarrClient) {
  const [status, series, profiles, rootFolders, tags] = await Promise.all([
    client.status(),
    client.series(),
    client.profiles(),
    client.rootFolders(),
    client.tags(),
  ])
  return { status, series, profiles, rootFolders, tags }
}

export type SonarrData = Awaited<ReturnType<typeof readSonarr>>

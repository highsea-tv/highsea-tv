// SPDX-License-Identifier: AGPL-3.0-only
// Radarr's API v3, read with its URL and API key in the `X-Api-Key` header (Radarr API docs:
// https://radarr.video/docs/api/). Only reads: the importer never changes anything in Radarr.
// The shapes are the resources' fields this importer uses, as the docs' schemas name them
// (MovieResource, MovieFileResource, QualityProfileResource, RootFolderResource, TagResource,
// NamingConfigResource, MediaManagementConfigResource, BlocklistResource, HistoryResource).
import { AppError, type Fetch } from '@highsea-tv/core'
import { baseUrl, jsonOf, request } from '../shared/http.ts'

export type RadarrConnection = { url: string; apiKey: string }

export type RadarrQuality = { id: number; name: string; source?: string; resolution?: number }

export type RadarrMovieFile = {
  id: number
  movieId: number
  relativePath?: string
  path?: string
  size: number
  sceneName?: string | null
  originalFilePath?: string | null
  quality?: { quality: RadarrQuality }
}

export type RadarrMovie = {
  id: number
  title: string
  year: number
  tmdbId: number
  monitored: boolean
  minimumAvailability: string
  qualityProfileId: number
  path: string
  rootFolderPath?: string
  hasFile?: boolean
  movieFile?: RadarrMovieFile
  tags?: number[]
}

export type RadarrProfileItem = {
  id?: number
  name?: string
  quality?: RadarrQuality
  items?: RadarrProfileItem[]
  allowed: boolean
}

export type RadarrProfile = {
  id: number
  name: string
  cutoff: number
  items: RadarrProfileItem[]
  upgradeAllowed?: boolean
  minFormatScore?: number
  cutoffFormatScore?: number
  minUpgradeFormatScore?: number
  /** Each custom format's score here, by Radarr's format id and name. */
  formatItems?: { format: number; name: string; score: number }[]
  /** Radarr's `Language`: id -1 is Any, -2 Original. */
  language?: { id: number; name: string }
}

export type RadarrRootFolder = { id: number; path: string; accessible?: boolean }
export type RadarrTag = { id: number; label: string }

export type RadarrNaming = {
  renameMovies: boolean
  colonReplacementFormat?: string
  standardMovieFormat: string
  movieFolderFormat: string
}

export type RadarrMediaManagement = {
  autoUnmonitorPreviouslyDownloadedMovies?: boolean
  recycleBin?: string
  recycleBinCleanupDays?: number
  copyUsingHardlinks?: boolean
  setPermissionsLinux?: boolean
  chmodFolder?: string
}

export type RadarrBlocklistItem = {
  id: number
  movieId: number
  sourceTitle: string
  quality?: { quality: RadarrQuality }
  date: string
  indexer?: string | null
  message?: string | null
}

export type RadarrHistoryItem = {
  id: number
  movieId: number
  sourceTitle: string
  eventType: string
  downloadId?: string | null
}

/** An indexer or download client: only its name and how many fields Radarr keeps back. */
export type RadarrProvider = { id: number; name: string; implementation?: string }

type Paged<T> = { page: number; pageSize: number; totalRecords: number; records: T[] }

/** Paged reads stop here: 50 pages of 1,000 is more history than any library has. */
const PAGE_SIZE = 1000
const MAX_PAGES = 50

export function createRadarrClient(fetch: Fetch, conn: RadarrConnection) {
  const base = baseUrl(conn.url)
  const apiKey = conn.apiKey.trim()
  if (!apiKey)
    throw new AppError('invalid', 'Enter Radarr’s API key.', { field: 'apiKey', reason: 'no-key' })

  async function get<T>(path: string): Promise<T> {
    const res = await request(fetch, 'Radarr', `${base}/api/v3/${path}`, {
      headers: { 'X-Api-Key': apiKey, accept: 'application/json' },
    })
    if (res.status === 401 || res.status === 403)
      throw new AppError(
        'invalid',
        'Radarr refused the API key. It’s in Radarr under Settings › General › Security.',
        { field: 'apiKey', reason: 'bad-credentials' },
      )
    if (!res.ok)
      throw new AppError('unavailable', `Radarr answered ${res.status} for ${path}.`, {
        reason: 'bad-answer',
      })
    return jsonOf<T>('Radarr', res)
  }

  async function paged<T>(path: string): Promise<T[]> {
    const out: T[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const sep = path.includes('?') ? '&' : '?'
      const p = await get<Paged<T>>(`${path}${sep}page=${page}&pageSize=${PAGE_SIZE}`)
      out.push(...(p.records ?? []))
      if (out.length >= (p.totalRecords ?? 0) || !p.records?.length) break
    }
    return out
  }

  return {
    status: () => get<{ appName?: string; version: string }>('system/status'),
    movies: () => get<RadarrMovie[]>('movie'),
    movieFiles: (movieId: number) => get<RadarrMovieFile[]>(`moviefile?movieId=${movieId}`),
    profiles: () => get<RadarrProfile[]>('qualityprofile'),
    rootFolders: () => get<RadarrRootFolder[]>('rootfolder'),
    tags: () => get<RadarrTag[]>('tag'),
    naming: () => get<RadarrNaming>('config/naming'),
    mediaManagement: () => get<RadarrMediaManagement>('config/mediamanagement'),
    blocklist: () => paged<RadarrBlocklistItem>('blocklist'),
    /** Grabs only (eventType 1): each carries the download client's id, a torrent's info hash. */
    grabs: () => paged<RadarrHistoryItem>('history?eventType=1'),
    indexers: () => get<RadarrProvider[]>('indexer'),
    downloadClients: () => get<RadarrProvider[]>('downloadclient'),
  }
}

export type RadarrClient = ReturnType<typeof createRadarrClient>

/** Everything the importer reads, in one go. */
export async function readRadarr(client: RadarrClient) {
  const [status, movies, profiles, rootFolders, tags, naming, mediaManagement] = await Promise.all([
    client.status(),
    client.movies(),
    client.profiles(),
    client.rootFolders(),
    client.tags(),
    client.naming(),
    client.mediaManagement(),
  ])
  return { status, movies, profiles, rootFolders, tags, naming, mediaManagement }
}

export type RadarrData = Awaited<ReturnType<typeof readRadarr>>

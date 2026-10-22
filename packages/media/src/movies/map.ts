// SPDX-License-Identifier: AGPL-3.0-only
// A movie's shapes in the API's (@highsea-tv/api-contract): a TMDB list entry, a library movie and a
// client item. The conversions every media type makes alike are @highsea-tv/media/shared's (map.ts).
import type { DiscoverMovie as ApiDiscoverMovie, ClientItem, Movie } from '@highsea-tv/api-contract'
import type { DiscoverMovie, MovieMetadata } from '@highsea-tv/metadata'
import {
  artOf,
  type ItemRow,
  isoOf,
  progressOf,
  stars,
  type VersionRow,
  type WatchState,
} from '../shared/map.ts'

export function toApiDiscoverMovie(m: DiscoverMovie, inLibrary: boolean): ApiDiscoverMovie {
  return {
    id: m.id,
    title: m.title,
    year: m.year,
    runtimeMinutes: m.runtimeMinutes,
    genres: m.genres,
    synopsis: m.synopsis,
    rating: stars(m.rating),
    voteCount: m.voteCount,
    releaseDate: m.releaseDate,
    art: artOf(m.art),
    inLibrary,
  }
}

/**
 * A library movie: its library row and versions, with TMDB's facts from the cache. Without a
 * cached copy (it shouldn't happen: the purge keeps what the library uses) the row's own columns
 * stand in.
 */
export function toApiMovie(
  row: ItemRow,
  versions: VersionRow[],
  meta: MovieMetadata | null,
  tags: string[] = [],
): Movie {
  return {
    id: row.tmdbId,
    type: 'movie',
    title: row.title,
    originalTitle: meta?.originalTitle ?? row.title,
    sortTitle: row.sortTitle,
    year: row.year,
    runtimeMinutes: meta?.runtimeMinutes ?? null,
    genres: meta?.genres ?? [],
    synopsis: meta?.synopsis ?? '',
    rating: stars(row.rating),
    voteCount: meta?.voteCount ?? 0,
    releaseDate: row.releaseDate,
    art: meta ? artOf(meta.art) : { poster: null, backdrop: null },
    status: row.status,
    monitored: row.monitored,
    minimumAvailability: row.minimumAvailability,
    languageProfileId: row.languageProfileId,
    qualityProfileId: row.qualityProfileId,
    rootFolder: row.rootFolder,
    path: row.path,
    addedAt: isoOf(row.addedAt),
    versions: [...versions]
      .sort((a, b) => a.position - b.position)
      .map((v) => ({
        id: v.id,
        label: v.label,
        qualityProfileId: v.qualityProfileId,
        fileId: v.fileId,
      })),
    gone: meta?.goneAt != null,
    tags,
  }
}

export function toClientItem(
  row: ItemRow,
  meta: MovieMetadata | null,
  watch: WatchState,
): ClientItem {
  return {
    id: row.tmdbId,
    type: 'movie',
    title: row.title,
    year: row.year,
    runtimeMinutes: meta?.runtimeMinutes ?? null,
    genres: meta?.genres ?? [],
    synopsis: meta?.synopsis ?? '',
    rating: stars(row.rating),
    voteCount: meta?.voteCount ?? 0,
    releaseDate: row.releaseDate,
    addedAt: isoOf(row.addedAt),
    status: row.status,
    // no version has a file until checkpoint 6
    playable: false,
    art: meta ? artOf(meta.art) : { poster: null, backdrop: null },
    ...progressOf(watch),
  }
}

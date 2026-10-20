// SPDX-License-Identifier: AGPL-3.0-only
// The domain's shapes into the API's (@highsea/api-contract), in one place. The conversions real
// data forces happen here (checkpoint 4, Fields and how they map): TMDB's 0–10 rating becomes five
// stars, times become ISO strings, and art drops the card-size still the lists don't use.
import type {
  Credit as ApiCredit,
  DiscoverMovie as ApiDiscoverMovie,
  Video as ApiVideo,
  ClientItem,
  Movie,
} from '@highsea/api-contract'
import type { schema } from '@highsea/db'
import type { Credit, DiscoverMovie, MovieMetadata, Video } from '@highsea/metadata'

export type ItemRow = typeof schema.mediaItems.$inferSelect
export type VersionRow = typeof schema.versions.$inferSelect

/** TMDB's `vote_average` (0–10) as stars out of 5, to one decimal. */
export const stars = (voteAverage: number) =>
  Math.min(5, Math.max(0, Math.round((Number.isFinite(voteAverage) ? voteAverage : 0) * 5) / 10))

export const isoOf = (ms: number) => new Date(ms).toISOString()

/** A day (`YYYY-MM-DD`) as an ISO time at its start in UTC; a full time passes through. */
const isoTime = (d: string | null) =>
  d === null ? null : d.length === 10 ? `${d}T00:00:00.000Z` : d

const artOf = (art: { poster: string | null; backdrop: string | null }) => ({
  poster: art.poster,
  backdrop: art.backdrop,
})

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
 * A credit's id. TMDB's `credit_id` when the metadata carries it; otherwise one made from its place
 * in the title's list, which is stable for as long as the cached copy is.
 */
const creditId = (c: Credit, movieId: number, kind: 'cast' | 'crew', index: number) =>
  (c as Credit & { id?: string }).id ?? `${movieId}-${kind}-${index}`

export const toApiCredit = (
  c: Credit,
  movieId: number,
  kind: 'cast' | 'crew',
  index: number,
): ApiCredit => ({
  id: creditId(c, movieId, kind, index),
  personId: c.personId,
  name: c.name,
  photo: c.photo,
  department: c.department,
  character: c.character,
  job: c.job,
})

export const toApiVideo = (v: Video): ApiVideo => ({
  id: v.id,
  name: v.name,
  kind: v.kind,
  site: v.site,
  key: v.key,
  official: v.official,
  publishedAt: isoTime(v.publishedAt),
  still: v.still,
})

/**
 * A library movie: its library row and versions, with TMDB's facts from the cache. Without a
 * cached copy (it shouldn't happen: the purge keeps what the library uses) the row's own columns
 * stand in.
 */
export function toApiMovie(
  row: ItemRow,
  versions: VersionRow[],
  meta: MovieMetadata | null,
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
  }
}

/** Where someone is in a title, from `watch_positions`. */
export type WatchState = { positionSeconds: number; durationSeconds: number | null } | null

/**
 * Past 90% a title counts as watched, and Resume goes: Jellyfin's default "maximum resume
 * percentage" (Jellyfin docs, Playback › Resume). Playback writes positions in Phase 4.
 */
export const WATCHED_AT = 0.9

export function progressOf(watch: WatchState): { progress: number | null; position: number } {
  if (!watch || watch.positionSeconds <= 0) return { progress: null, position: 0 }
  const { positionSeconds, durationSeconds } = watch
  if (!durationSeconds || durationSeconds <= 0) return { progress: null, position: positionSeconds }
  const p = positionSeconds / durationSeconds
  if (p >= WATCHED_AT) return { progress: null, position: 0 }
  return { progress: Math.round(p * 1000) / 1000, position: positionSeconds }
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

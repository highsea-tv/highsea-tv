// SPDX-License-Identifier: AGPL-3.0-only
// The conversions into the API's shapes (@highsea-tv/api-contract) that every media type makes the
// same way (checkpoint 4, Fields and how they map): TMDB's 0–10 rating becomes five stars, times
// become ISO strings, art drops the card-size still the lists don't use, and a watch position
// becomes progress. Each type's own shapes are in its folder (movies/map.ts).
import type { Credit as ApiCredit, Video as ApiVideo } from '@highsea-tv/api-contract'
import type { schema } from '@highsea-tv/db'
import type { Credit, Video } from '@highsea-tv/metadata'

export type ItemRow = typeof schema.mediaItems.$inferSelect
export type VersionRow = typeof schema.versions.$inferSelect

/** TMDB's `vote_average` (0–10) as stars out of 5, to one decimal. */
export const stars = (voteAverage: number) =>
  Math.min(5, Math.max(0, Math.round((Number.isFinite(voteAverage) ? voteAverage : 0) * 5) / 10))

export const isoOf = (ms: number) => new Date(ms).toISOString()

/** A day (`YYYY-MM-DD`) as an ISO time at its start in UTC; a full time passes through. */
export const isoTime = (d: string | null) =>
  d === null ? null : d.length === 10 ? `${d}T00:00:00.000Z` : d

export const artOf = (art: { poster: string | null; backdrop: string | null }) => ({
  poster: art.poster,
  backdrop: art.backdrop,
})

/**
 * A credit's id. TMDB's `credit_id` when the metadata carries it; otherwise one made from its place
 * in the title's list, which is stable for as long as the cached copy is.
 */
const creditId = (c: Credit, titleId: number, kind: 'cast' | 'crew', index: number) =>
  (c as Credit & { id?: string }).id ?? `${titleId}-${kind}-${index}`

export const toApiCredit = (
  c: Credit,
  titleId: number,
  kind: 'cast' | 'crew',
  index: number,
): ApiCredit => ({
  id: creditId(c, titleId, kind, index),
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

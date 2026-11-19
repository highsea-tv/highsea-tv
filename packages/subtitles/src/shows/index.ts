// SPDX-License-Identifier: AGPL-3.0-only
// `@highsea-tv/subtitles/shows`: what an episode's subtitles need beyond a film's (Phase 5 B, ADR
// 0064). The service is one for both (`./movies`): an episode's file has the same tracks, sidecars,
// wanted rows, sync and jobs, and these say what differs:
// - the search asks by the show's ids with the season and episode, and scores on Bazarr's episode
//   weights (`episodeOf`, `../shared/scoring.ts`);
// - a season folder holds many episodes, so only the sidecars named after the episode's file are
//   its own, beside it or in `Subs` (`ownSidecar`);
// - the show is what the apps and the admin hear changed (`announceShow`).
import { DRAFT_TOPICS, MEDIA_TOPICS, topicId } from '@highsea-tv/api-contract'
import type { EventBus } from '@highsea-tv/core'
import type { Db } from '@highsea-tv/db'
import { schema } from '@highsea-tv/db'
import { and, asc, eq } from 'drizzle-orm'

const { mediaItems, showDetails, versions } = schema

type ItemRow = typeof mediaItems.$inferSelect

/** An episode's file as the search sees it: its show, and the episodes the file holds. */
export type EpisodeFile = {
  show: { id: string; tmdbId: number; title: string; year: number | null; imdbId: string | null }
  season: number
  /** The episode numbers in the file, in order: one, or several for a multi-episode file. */
  episodes: number[]
}

/** The show and episodes an episode's file holds; null for a film or a row without its show. */
export function episodeOf(db: Db, item: ItemRow, fileId: string): EpisodeFile | null {
  if (item.type !== 'episode' || !item.showId) return null
  const show = db.select().from(mediaItems).where(eq(mediaItems.id, item.showId)).get()
  if (!show) return null
  const details = db
    .select({ imdbId: showDetails.imdbId })
    .from(showDetails)
    .where(eq(showDetails.itemId, show.id))
    .get()
  const held = db
    .select({ season: mediaItems.seasonNumber, episode: mediaItems.episodeNumber })
    .from(versions)
    .innerJoin(mediaItems, eq(mediaItems.id, versions.itemId))
    .where(and(eq(versions.fileId, fileId), eq(mediaItems.type, 'episode')))
    .orderBy(asc(mediaItems.seasonNumber), asc(mediaItems.episodeNumber))
    .all()
  const season = item.seasonNumber ?? held[0]?.season ?? 0
  const episodes = held
    .filter((e) => e.season === season && e.episode !== null)
    .map((e) => e.episode as number)
  if (episodes.length === 0 && item.episodeNumber !== null) episodes.push(item.episodeNumber)
  return {
    show: {
      id: show.id,
      tmdbId: show.tmdbId,
      title: show.title,
      year: show.year,
      imdbId: details?.imdbId ?? null,
    },
    season,
    episodes,
  }
}

/** The show an item belongs to, by TMDB id; null for a film. */
export function showTmdbOf(db: Db, item: ItemRow): number | null {
  if (item.type === 'movie') return null
  const id = item.type === 'show' ? item.id : item.showId
  if (!id) return null
  return (
    db.select({ tmdbId: mediaItems.tmdbId }).from(mediaItems).where(eq(mediaItems.id, id)).get()
      ?.tmdbId ?? null
  )
}

/**
 * Says an episode's subtitles changed, as the show library says its own changes: the show by its
 * TMDB id on `shows.updated` and its layer as `show:{id}`, beside `subtitles.updated`.
 */
export function announceShow(events: EventBus, showTmdbId: number, { history = false } = {}) {
  const layer = topicId('show', showTmdbId)
  events.emit({ topic: 'subtitles.updated', ids: [layer] })
  events.emit({ topic: DRAFT_TOPICS.shows, ids: [String(showTmdbId)] })
  events.emit({ topic: MEDIA_TOPICS.item, ids: [layer] })
  if (history) events.emit({ topic: 'history.updated', ids: [layer] })
}

/**
 * Whether a subtitle found in place belongs to an episode's file: named after it beside it
 * (`Show - S01E02.en.srt`), or in the season folder's `Subs` under the episode's name, as a
 * folder (`Subs/Show.S01E02…/2_English.srt`, the way TV releases keep them) or as the file's own
 * name (`Subs/Show.S01E02….en.srt`). A season folder holds many episodes, so a film's rule (every
 * subtitle in `Subs`) would give one episode's subtitles to all of them.
 */
export function ownSidecar(
  entry: { path: string; name: string },
  video: { folder: string; base: string },
): boolean {
  const parent = dirname(entry.path)
  if (parent === video.folder) return entry.name.startsWith(`${video.base}.`)
  const subs = dirname(parent)
  if (subs === video.folder) return entry.name.startsWith(`${video.base}.`)
  // Subs/<episode>/…: the folder is named after the episode's file
  return dirname(subs) === video.folder && basename(parent) === video.base
}

const dirname = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')))
const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)

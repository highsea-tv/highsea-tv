// SPDX-License-Identifier: AGPL-3.0-only
// A movie's side of playback (checkpoint 4.1a): the file a version plays from, and each person's
// watch state by TMDB id (ADR 0054): positions, played and unplayed, the player's picks, and Next
// up. Every change is heard as `watch.updated` by the person it belongs to, on each of their
// devices, so Resume and Continue watching move at once. Deciding how to play and serving the
// file are the runtime's and `@highsea-tv/stream`'s.
import type { ClientItem } from '@highsea-tv/api-contract'
import { AppError } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { eq, sql } from 'drizzle-orm'
import { probeOf } from '../shared/file-facts.ts'
import type { ItemRow } from '../shared/map.ts'
import type { MediaInfo } from '../shared/probe.ts'
import { createWatch, type PlaybackPrefs, playedOf } from '../shared/watch.ts'
import type { Client } from './client.ts'
import { type Ctx, notInLibrary } from './context.ts'
import type { Library } from './library.ts'

const { mediaFiles, mediaItems } = schema

/** `watch.updated` (`@highsea-tv/api-contract`'s `PLAYBACK_TOPICS`). */
export const WATCH_TOPIC = 'watch.updated'

/** A version's file, as playback reads it. */
export type PlaySource = {
  item: ItemRow
  versionId: string
  file: { id: string; path: string; size: number; info: MediaInfo | null }
  /** Seconds, from the probe; null when it didn't say. */
  duration: number | null
}

const noFile = () =>
  new AppError('conflict', 'That version has no file to play yet.', { reason: 'no-file' })

export function createPlayback(
  ctx: Ctx,
  { library, client }: { library: Library; client: Client },
) {
  const { db, events } = ctx
  const watch = createWatch(ctx)

  const rowOf = (tmdbId: number): ItemRow => {
    const row = library.internal.rowOf(tmdbId)
    if (!row) throw notInLibrary()
    return row
  }

  const announce = (userId: string, tmdbId: number) =>
    events.emit({ topic: WATCH_TOPIC, ids: [`movie:${tmdbId}`], to: [userId] })

  /**
   * The file a version plays from: the version asked for, else the person's pick for the title,
   * else the first version with a file. 404 for a version that isn't the title's; 409 when it has
   * no file.
   */
  function source(tmdbId: number, userId: string, versionId?: string | null): PlaySource {
    const item = rowOf(tmdbId)
    const versions = library.internal.versionsOf([item.id]).get(item.id) ?? []
    const wanted = versionId ?? watch.prefs(userId, item.id).versionId
    const version =
      (wanted ? versions.find((v) => v.id === wanted) : undefined) ??
      (versionId ? undefined : (versions.find((v) => v.fileId) ?? versions[0]))
    if (!version) throw new AppError('not-found', 'That version isn’t here.')
    if (!version.fileId) throw noFile()
    const file = db.select().from(mediaFiles).where(eq(mediaFiles.id, version.fileId)).get()
    if (!file) throw noFile()
    const info = probeOf(file.mediaInfo)
    return {
      item,
      versionId: version.id,
      file: { id: file.id, path: file.path, size: file.size, info },
      duration: info?.duration && info.duration > 0 ? info.duration : null,
    }
  }

  /** Where the person is; past 90% the title is watched. Duration falls back to the probe's. */
  function position(
    userId: string,
    tmdbId: number,
    seconds: number,
    duration?: number | null,
  ): { watched: boolean } {
    const item = rowOf(tmdbId)
    const length = duration ?? lengthOf(item.id)
    const { played } = watch.position(userId, item.id, seconds, length)
    announce(userId, tmdbId)
    return { watched: played }
  }

  /** The first file's length, for a position reported without one. */
  function lengthOf(itemId: string): number | null {
    const versions = library.internal.versionsOf([itemId]).get(itemId) ?? []
    for (const v of versions) {
      if (!v.fileId) continue
      const f = db
        .select({ info: mediaFiles.mediaInfo })
        .from(mediaFiles)
        .where(eq(mediaFiles.id, v.fileId))
        .get()
      const d = probeOf(f?.info)?.duration
      if (d && d > 0) return d
    }
    return null
  }

  function played(userId: string, tmdbId: number) {
    watch.played(userId, rowOf(tmdbId).id)
    announce(userId, tmdbId)
  }

  function unplayed(userId: string, tmdbId: number) {
    watch.unplayed(userId, rowOf(tmdbId).id)
    announce(userId, tmdbId)
  }

  const prefs = (userId: string, tmdbId: number): PlaybackPrefs =>
    watch.prefs(userId, rowOf(tmdbId).id)

  /** Saves the picks sent. A version that isn't the title's is refused. */
  function setPrefs(userId: string, tmdbId: number, patch: Partial<PlaybackPrefs>): PlaybackPrefs {
    const item = rowOf(tmdbId)
    if (patch.versionId) {
      const versions = library.internal.versionsOf([item.id]).get(item.id) ?? []
      if (!versions.some((v) => v.id === patch.versionId))
        throw new AppError('invalid', 'That version isn’t this title’s.', { reason: 'version' })
    }
    const saved = watch.setPrefs(userId, item.id, patch)
    announce(userId, tmdbId)
    return saved
  }

  /**
   * Next up (answer 9 in Phase 4): the films after this one in its collection by release date,
   * with a file, the first the person hasn't watched; when they've watched them all, the next one.
   * Null when the title isn't in a collection or is its last film here.
   */
  function next(userId: string, tmdbId: number): ClientItem | null {
    const item = rowOf(tmdbId)
    const ids = db
      .all<{ id: string }>(sql`
      SELECT mi.id AS id FROM media_items mi
        JOIN movie_metadata mm ON mm.tmdb_id = mi.tmdb_id
      WHERE mi.type = 'movie' AND mi.parent_id IS NULL
        AND mm.collection_id = (SELECT collection_id FROM movie_metadata WHERE tmdb_id = ${tmdbId})
        AND EXISTS (SELECT 1 FROM versions v WHERE v.item_id = mi.id AND v.file_id IS NOT NULL)
      ORDER BY coalesce(mi.release_date, mi.year || '-12-31'), mi.id`)
      .map((r) => r.id)
    const at = ids.indexOf(item.id)
    if (at < 0) return null
    const after = ids.slice(at + 1)
    if (!after.length) return null
    const seen = playedOf(db, userId, after)
    const pick = after.find((id) => !seen.has(id)) ?? (after[0] as string)
    const row = db.select().from(mediaItems).where(eq(mediaItems.id, pick)).get()
    return row ? (client.items([row], userId)[0] ?? null) : null
  }

  return { source, position, played, unplayed, prefs, setPrefs, next }
}

export type Playback = ReturnType<typeof createPlayback>

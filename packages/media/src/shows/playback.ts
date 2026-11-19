// SPDX-License-Identifier: AGPL-3.0-only
// An episode's side of playback (Phase 5 B): the films' interface (`movies/playback.ts`) by the
// episode's TMDB id, so the runtime's play decision, sessions, direct play, direct stream and
// transcode serve an episode as they serve a film. Watch state is the episode's own row's, per
// profile (ADR 0054, 0068); every change is heard as `watch.updated` for the episode and its show
// by the account it belongs to. Next up is the next episode with a file (`client.next`).
import type { ClientItem } from '@highsea-tv/api-contract'
import { AppError } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { asc, eq } from 'drizzle-orm'
import type { PlaySource } from '../movies/playback.ts'
import { probeOf } from '../shared/file-facts.ts'
import type { ItemRow } from '../shared/map.ts'
import { createWatch, type PlaybackPrefs, type Watcher } from '../shared/watch.ts'
import { type ShowClient, WATCH_TOPIC } from './client.ts'
import type { ShowsDeps } from './context.ts'

const { mediaFiles, versions: versionsTable } = schema

const noFile = () =>
  new AppError('conflict', 'That episode has no file to play yet.', { reason: 'no-file' })

export function createShowPlayback(ctx: ShowsDeps, { client }: { client: ShowClient }) {
  const { db, events } = ctx
  const watch = createWatch(ctx)

  const rowsOf = (tmdbId: number): { episode: ItemRow; show: ItemRow } =>
    client.internal.episodeRowOf(tmdbId)

  const versionsOf = (itemId: string) =>
    db
      .select()
      .from(versionsTable)
      .where(eq(versionsTable.itemId, itemId))
      .orderBy(asc(versionsTable.position))
      .all()

  const announce = (who: Watcher, episode: ItemRow, show: ItemRow) =>
    events.emit({
      topic: WATCH_TOPIC,
      ids: [`episode:${episode.tmdbId}`, `show:${show.tmdbId}`],
      to: [who.userId],
    })

  /** The file an episode plays from, as a film's (`movies/playback.ts` `source`). */
  function source(tmdbId: number, who: Watcher, versionId?: string | null): PlaySource {
    const { episode } = rowsOf(tmdbId)
    const versions = versionsOf(episode.id)
    const wanted = versionId ?? watch.prefs(who, episode.id).versionId
    const version =
      (wanted ? versions.find((v) => v.id === wanted) : undefined) ??
      (versionId ? undefined : (versions.find((v) => v.fileId) ?? versions[0]))
    if (!version) throw new AppError('not-found', 'That version isn’t here.')
    if (!version.fileId) throw noFile()
    const file = db.select().from(mediaFiles).where(eq(mediaFiles.id, version.fileId)).get()
    if (!file) throw noFile()
    const info = probeOf(file.mediaInfo)
    return {
      item: episode,
      versionId: version.id,
      file: { id: file.id, path: file.path, size: file.size, info },
      duration: info?.duration && info.duration > 0 ? info.duration : null,
    }
  }

  /**
   * The file's length, for a position reported without one. A multi-episode file's length is the
   * whole file's: past 90% of it marks this episode, as Plex marks a multi-episode file's parts.
   */
  function lengthOf(itemId: string): number | null {
    for (const v of versionsOf(itemId)) {
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

  function position(
    who: Watcher,
    tmdbId: number,
    seconds: number,
    duration?: number | null,
  ): { watched: boolean } {
    const { episode, show } = rowsOf(tmdbId)
    const { played } = watch.position(who, episode.id, seconds, duration ?? lengthOf(episode.id))
    announce(who, episode, show)
    return { watched: played }
  }

  function played(who: Watcher, tmdbId: number) {
    const { episode, show } = rowsOf(tmdbId)
    watch.played(who, episode.id)
    announce(who, episode, show)
  }

  function unplayed(who: Watcher, tmdbId: number) {
    const { episode, show } = rowsOf(tmdbId)
    watch.unplayed(who, episode.id)
    announce(who, episode, show)
  }

  /** Off Continue watching and Next up: the whole show, until it's played again (client.dismiss). */
  const dismiss = (who: Watcher, tmdbId: number) => client.dismiss(who, tmdbId)

  const hasPrefs = (who: Watcher, tmdbId: number) => watch.hasPrefs(who, rowsOf(tmdbId).episode.id)

  const prefs = (who: Watcher, tmdbId: number): PlaybackPrefs =>
    watch.prefs(who, rowsOf(tmdbId).episode.id)

  function setPrefs(who: Watcher, tmdbId: number, patch: Partial<PlaybackPrefs>): PlaybackPrefs {
    const { episode, show } = rowsOf(tmdbId)
    if (patch.versionId && !versionsOf(episode.id).some((v) => v.id === patch.versionId))
      throw new AppError('invalid', 'That version isn’t this title’s.', { reason: 'version' })
    const saved = watch.setPrefs(who, episode.id, patch)
    announce(who, episode, show)
    return saved
  }

  const next = (who: Watcher, tmdbId: number): ClientItem | null =>
    client.next(tmdbId, who.profileId)

  return { source, position, played, unplayed, dismiss, prefs, hasPrefs, setPrefs, next }
}

export type ShowPlayback = ReturnType<typeof createShowPlayback>

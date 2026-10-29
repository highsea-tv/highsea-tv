// SPDX-License-Identifier: AGPL-3.0-only
// Each person's watch state per title, whatever the title's type (ADR 0054): where they stopped
// (`watch_positions`), whether they've watched it, how often and when (`watch_history`), and the
// player's picks (`playback_prefs`). Positions past `WATCHED_AT` count as watched and are cleared,
// so the title isn't resumed. Playback writes them from checkpoint 4.1a.
import type { Clock } from '@highsea-tv/core'
import { type Db, schema } from '@highsea-tv/db'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { WATCHED_AT, type WatchState } from './map.ts'
import { chunks } from './sql.ts'

const { watchPositions, watchHistory, playbackPrefs } = schema

/** The person's watch state for each of the items, by item id; items never started are absent. */
export function watchOf(db: Db, userId: string, itemIds: string[]): Map<string, WatchState> {
  const out = new Map<string, WatchState>()
  for (const ids of chunks(itemIds))
    for (const w of db
      .select()
      .from(watchPositions)
      .where(and(eq(watchPositions.userId, userId), inArray(watchPositions.itemId, ids)))
      .all())
      out.set(w.itemId, { positionSeconds: w.positionSeconds, durationSeconds: w.durationSeconds })
  return out
}

/** Whether the person has watched each item, by item id; items never watched are absent. */
export function playedOf(db: Db, userId: string, itemIds: string[]): Set<string> {
  const out = new Set<string>()
  for (const ids of chunks(itemIds))
    for (const h of db
      .select({ itemId: watchHistory.itemId })
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.userId, userId),
          eq(watchHistory.played, true),
          inArray(watchHistory.itemId, ids),
        ),
      )
      .all())
      out.add(h.itemId)
  return out
}

/** The player's picks for a title (player.md › Data). Null leaves each to the server's default. */
export type PlaybackPrefs = {
  versionId: string | null
  audioId: string | null
  /** Null is off. */
  subtitleId: string | null
  subtitleOffsetMs: number
}

export const NO_PREFS: PlaybackPrefs = {
  versionId: null,
  audioId: null,
  subtitleId: null,
  subtitleOffsetMs: 0,
}

export function createWatch({ db, clock }: { db: Db; clock: Clock }) {
  /** Marks the item watched once more: played, the count up by one, and its position cleared. */
  function played(userId: string, itemId: string) {
    const now = clock.now()
    db.transaction((tx) => {
      tx.insert(watchHistory)
        .values({ userId, itemId, played: true, playCount: 1, lastPlayedAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: [watchHistory.userId, watchHistory.itemId],
          set: {
            played: true,
            playCount: sql`${watchHistory.playCount} + 1`,
            lastPlayedAt: now,
            updatedAt: now,
          },
        })
        .run()
      tx.delete(watchPositions)
        .where(and(eq(watchPositions.userId, userId), eq(watchPositions.itemId, itemId)))
        .run()
    })
  }

  /**
   * Unwatched, as if never started: the history and the position go, as Jellyfin's "mark
   * unplayed" clears the play count and the last-played date with the flag.
   */
  function unplayed(userId: string, itemId: string) {
    db.transaction((tx) => {
      tx.delete(watchHistory)
        .where(and(eq(watchHistory.userId, userId), eq(watchHistory.itemId, itemId)))
        .run()
      tx.delete(watchPositions)
        .where(and(eq(watchPositions.userId, userId), eq(watchPositions.itemId, itemId)))
        .run()
    })
  }

  /**
   * Where the person is. Past `WATCHED_AT` of the duration, the title counts as watched, once per
   * viewing: a viewing that already crossed it (its position cleared) doesn't count again until it
   * starts over. Returns whether this report crossed it.
   */
  function position(
    userId: string,
    itemId: string,
    positionSeconds: number,
    durationSeconds: number | null,
  ): { played: boolean } {
    const seconds = Math.max(0, Math.floor(positionSeconds))
    const duration = durationSeconds && durationSeconds > 0 ? Math.round(durationSeconds) : null
    if (duration && seconds / duration >= WATCHED_AT) {
      const started = db
        .select({ at: watchPositions.positionSeconds })
        .from(watchPositions)
        .where(and(eq(watchPositions.userId, userId), eq(watchPositions.itemId, itemId)))
        .get()
      // the credits after the mark keep reporting; only the first report past it counts
      if (!started) return { played: false }
      played(userId, itemId)
      return { played: true }
    }
    const now = clock.now()
    db.insert(watchPositions)
      .values({
        userId,
        itemId,
        positionSeconds: seconds,
        durationSeconds: duration,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [watchPositions.userId, watchPositions.itemId],
        set: { positionSeconds: seconds, durationSeconds: duration, updatedAt: now },
      })
      .run()
    return { played: false }
  }

  function history(userId: string, itemId: string) {
    return (
      db
        .select()
        .from(watchHistory)
        .where(and(eq(watchHistory.userId, userId), eq(watchHistory.itemId, itemId)))
        .get() ?? null
    )
  }

  function prefs(userId: string, itemId: string): PlaybackPrefs {
    const row = db
      .select()
      .from(playbackPrefs)
      .where(and(eq(playbackPrefs.userId, userId), eq(playbackPrefs.itemId, itemId)))
      .get()
    return row
      ? {
          versionId: row.versionId,
          audioId: row.audioId,
          subtitleId: row.subtitleId,
          subtitleOffsetMs: row.subtitleOffsetMs,
        }
      : { ...NO_PREFS }
  }

  /** Saves the picks that are given; the rest stay as they were. */
  function setPrefs(userId: string, itemId: string, patch: Partial<PlaybackPrefs>): PlaybackPrefs {
    const next = { ...prefs(userId, itemId), ...patch }
    const now = clock.now()
    db.insert(playbackPrefs)
      .values({ userId, itemId, ...next, updatedAt: now })
      .onConflictDoUpdate({
        target: [playbackPrefs.userId, playbackPrefs.itemId],
        set: { ...next, updatedAt: now },
      })
      .run()
    return next
  }

  return { position, played, unplayed, history, prefs, setPrefs }
}

export type Watch = ReturnType<typeof createWatch>

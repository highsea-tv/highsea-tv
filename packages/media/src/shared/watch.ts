// SPDX-License-Identifier: AGPL-3.0-only
// Each profile's watch state per title, whatever the title's type (ADR 0054, per profile since ADR
// 0068): where they stopped (`watch_positions`), whether they've watched it, how often and when
// (`watch_history`), and the player's picks (`playback_prefs`). Positions past `WATCHED_AT` count as
// watched and are cleared, so the title isn't resumed. Playback writes them from checkpoint 4.1a.
// Reads take the profile; writes take the account too, which each row keeps beside it.
import type { Clock } from '@highsea-tv/core'
import { type Db, schema } from '@highsea-tv/db'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { WATCHED_AT, type WatchState } from './map.ts'
import { chunks } from './sql.ts'

const { watchPositions, watchHistory, playbackPrefs } = schema

/**
 * Who's watching: the account, and the profile watching now on the asking device (ADR 0068). The
 * account's own profile's id is the account's.
 */
export type Watcher = { userId: string; profileId: string }

/** The profile's watch state for each of the items, by item id; items never started are absent. */
export function watchOf(db: Db, profileId: string, itemIds: string[]): Map<string, WatchState> {
  const out = new Map<string, WatchState>()
  for (const ids of chunks(itemIds))
    for (const w of db
      .select()
      .from(watchPositions)
      .where(and(eq(watchPositions.profileId, profileId), inArray(watchPositions.itemId, ids)))
      .all())
      out.set(w.itemId, { positionSeconds: w.positionSeconds, durationSeconds: w.durationSeconds })
  return out
}

/** Whether the profile has watched each item, by item id; items never watched are absent. */
export function playedOf(db: Db, profileId: string, itemIds: string[]): Set<string> {
  const out = new Set<string>()
  for (const ids of chunks(itemIds))
    for (const h of db
      .select({ itemId: watchHistory.itemId })
      .from(watchHistory)
      .where(
        and(
          eq(watchHistory.profileId, profileId),
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
  function played(who: Watcher, itemId: string) {
    const now = clock.now()
    db.transaction((tx) => {
      tx.insert(watchHistory)
        .values({
          userId: who.userId,
          profileId: who.profileId,
          itemId,
          played: true,
          playCount: 1,
          lastPlayedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [watchHistory.profileId, watchHistory.itemId],
          set: {
            played: true,
            playCount: sql`${watchHistory.playCount} + 1`,
            lastPlayedAt: now,
            updatedAt: now,
          },
        })
        .run()
      tx.delete(watchPositions)
        .where(and(eq(watchPositions.profileId, who.profileId), eq(watchPositions.itemId, itemId)))
        .run()
    })
  }

  /**
   * Unwatched, as if never started: the history and the position go, as Jellyfin's "mark
   * unplayed" clears the play count and the last-played date with the flag.
   */
  function unplayed(who: Watcher, itemId: string) {
    db.transaction((tx) => {
      tx.delete(watchHistory)
        .where(and(eq(watchHistory.profileId, who.profileId), eq(watchHistory.itemId, itemId)))
        .run()
      tx.delete(watchPositions)
        .where(and(eq(watchPositions.profileId, who.profileId), eq(watchPositions.itemId, itemId)))
        .run()
    })
  }

  /**
   * Off Continue watching: the position goes and the history stays, so the title still counts as
   * started and its plays are kept (apps-catch-up.md › A.2). Starting it again brings it back.
   */
  function dismiss(who: Watcher, itemId: string) {
    db.delete(watchPositions)
      .where(and(eq(watchPositions.profileId, who.profileId), eq(watchPositions.itemId, itemId)))
      .run()
  }

  /**
   * Where the person is. Past `WATCHED_AT` of the duration, the title counts as watched, once per
   * viewing: a viewing that already crossed it (its position cleared) doesn't count again until it
   * starts over. Returns whether this report crossed it.
   */
  function position(
    who: Watcher,
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
        .where(and(eq(watchPositions.profileId, who.profileId), eq(watchPositions.itemId, itemId)))
        .get()
      // the credits after the mark keep reporting; only the first report past it counts
      if (!started) return { played: false }
      played(who, itemId)
      return { played: true }
    }
    const now = clock.now()
    db.insert(watchPositions)
      .values({
        userId: who.userId,
        profileId: who.profileId,
        itemId,
        positionSeconds: seconds,
        durationSeconds: duration,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [watchPositions.profileId, watchPositions.itemId],
        set: { positionSeconds: seconds, durationSeconds: duration, updatedAt: now },
      })
      .run()
    return { played: false }
  }

  function history(who: Watcher, itemId: string) {
    return (
      db
        .select()
        .from(watchHistory)
        .where(and(eq(watchHistory.profileId, who.profileId), eq(watchHistory.itemId, itemId)))
        .get() ?? null
    )
  }

  function prefs(who: Watcher, itemId: string): PlaybackPrefs {
    const row = db
      .select()
      .from(playbackPrefs)
      .where(and(eq(playbackPrefs.profileId, who.profileId), eq(playbackPrefs.itemId, itemId)))
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

  /** Whether the person has picked anything for the item, so their language defaults stand back. */
  function hasPrefs(who: Watcher, itemId: string): boolean {
    return !!db
      .select({ at: playbackPrefs.updatedAt })
      .from(playbackPrefs)
      .where(and(eq(playbackPrefs.profileId, who.profileId), eq(playbackPrefs.itemId, itemId)))
      .get()
  }

  /** Saves the picks that are given; the rest stay as they were. */
  function setPrefs(who: Watcher, itemId: string, patch: Partial<PlaybackPrefs>): PlaybackPrefs {
    const next = { ...prefs(who, itemId), ...patch }
    const now = clock.now()
    db.insert(playbackPrefs)
      .values({ userId: who.userId, profileId: who.profileId, itemId, ...next, updatedAt: now })
      .onConflictDoUpdate({
        target: [playbackPrefs.profileId, playbackPrefs.itemId],
        set: { ...next, updatedAt: now },
      })
      .run()
    return next
  }

  return { position, played, unplayed, dismiss, history, prefs, hasPrefs, setPrefs }
}

export type Watch = ReturnType<typeof createWatch>

// SPDX-License-Identifier: AGPL-3.0-only
// Playback (Phase 4, checkpoint 4.1a): each person's watched state per title (ADR 0054), the
// player's picks per person and title (player.md › Data), and what each device reported it plays
// (ADR 0052). Where a person stopped is `watch_positions`, in media.ts since checkpoint 4.
// Checkpoint 4.1b adds what HLS and the scrubber read of each file: its keyframes and its trickplay.
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { devices, users } from './auth.ts'
import { mediaFiles, mediaItems } from './media.ts'

/** Played or not, how often, and when last; smart collections' watch rules read it (ADR 0049). */
export const watchHistory = sqliteTable(
  'watch_history',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    played: integer('played', { mode: 'boolean' }).notNull(),
    playCount: integer('play_count').notNull(),
    /** The last time it was played to the end; null when it never was. */
    lastPlayedAt: integer('last_played_at'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.itemId] }),
    index('watch_history_last').on(t.userId, t.lastPlayedAt),
  ],
)

/** The player's picks for a title, saved as they change. Track ids are the client API's. */
export const playbackPrefs = sqliteTable(
  'playback_prefs',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    versionId: text('version_id'),
    /** Null leaves it to the file's default. */
    audioId: text('audio_id'),
    /** Null is off. */
    subtitleId: text('subtitle_id'),
    subtitleOffsetMs: integer('subtitle_offset_ms').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] })],
)

/** The latest profile a device reported, laid over its built-in one (`@highsea-tv/stream`). */
export const deviceProfiles = sqliteTable('device_profiles', {
  deviceId: text('device_id')
    .primaryKey()
    .references(() => devices.id, { onDelete: 'cascade' }),
  /** The built-in profile it starts from (`web-chromium`). */
  base: text('base').notNull(),
  /** `ReportedProfile`, validated when it arrives. */
  report: text('report', { mode: 'json' }).notNull(),
  reportedAt: integer('reported_at').notNull(),
})

/**
 * A file's keyframes, read once by ffprobe for direct streams' segments (ADR 0051). Kept with the
 * file's size, so a file replaced at the same path is read again.
 */
export const fileKeyframes = sqliteTable('file_keyframes', {
  fileId: text('file_id')
    .primaryKey()
    .references(() => mediaFiles.id, { onDelete: 'cascade' }),
  size: integer('size').notNull(),
  /** Seconds from the film's start, ascending. */
  times: text('times', { mode: 'json' }).$type<number[]>().notNull(),
  readAt: integer('read_at').notNull(),
})

/**
 * A file's trickplay sheets in the data folder (`trickplay/<file id>/`): their manifest once made,
 * or why they weren't. Kept with the file's size, as keyframes are.
 */
export const trickplay = sqliteTable('trickplay', {
  fileId: text('file_id')
    .primaryKey()
    .references(() => mediaFiles.id, { onDelete: 'cascade' }),
  size: integer('size').notNull(),
  /** `TrickplayManifest`; null when making them failed. */
  manifest: text('manifest', { mode: 'json' }),
  error: text('error'),
  madeAt: integer('made_at').notNull(),
})

// SPDX-License-Identifier: AGPL-3.0-only
// Subtitles (checkpoint 7, ADR 0043): language profiles, the three providers with their accounts
// and throttles, the tracks highsea keeps beside each file with their originals, what each file
// still wants, the last search's results for Use, and an in-flight download's link so a rerun spends
// no second download. Embedded streams aren't rows: they're read from `media_files.media_info`.
//
// `media_items.language_profile_id` points at `language_profiles.id` without a foreign key: adding
// one to an existing SQLite table means rebuilding it, and the migrator runs each migration in a
// transaction with foreign keys on, where `PRAGMA foreign_keys` is a no-op and the rebuild's
// `DROP TABLE` deletes the rows its children cascade from (sqlite.org/pragma.html#pragma_foreign_keys,
// sqlite.org/lang_droptable.html). The subtitles package checks the reference instead.
import {
  blob,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import { mediaFiles, mediaItems } from './media.ts'

/** A language profile: ordered rules (`@highsea/subtitles/shared`'s `LanguageRule[]`). */
export const languageProfiles = sqliteTable('language_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  rules: text('rules', { mode: 'json' }).notNull(),
  /** The language that stops upgrades once present, or null for none. */
  cutoff: text('cutoff'),
  minScore: integer('min_score').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const SUBTITLE_PROVIDER_IDS = ['opensubtitles', 'subdl', 'subsource'] as const

/** One row per provider adapter, seeded off: each needs the owner's account first. */
export const subtitleProviders = sqliteTable('subtitle_providers', {
  id: text('id', { enum: SUBTITLE_PROVIDER_IDS }).primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  /** The account's fields by key, sealed as one JSON string (`@highsea/core`'s Sealer). */
  credentials: text('credentials'),
  /** What A10's Account column shows: the username, or a masked key. Never a secret. */
  account: text('account'),
  /** A login's token, sealed, with its expiry and the API base it came with. */
  token: text('token'),
  tokenExpiresAt: integer('token_expires_at'),
  baseUrl: text('base_url'),
  throttledUntil: integer('throttled_until'),
  throttleReason: text('throttle_reason'),
  /** Recent failures' times, for "5 within 2 minutes" (ADR 0043). */
  failures: text('failures', { mode: 'json' }).notNull().default([]),
  /** Downloads or requests counted today, the provider's limit, and when its day resets. */
  quotaUsed: integer('quota_used').notNull().default(0),
  quotaLimit: integer('quota_limit'),
  quotaResetsAt: integer('quota_resets_at'),
  updatedAt: integer('updated_at').notNull(),
})

export const SUBTITLE_KINDS = ['external', 'bundled'] as const
export const SUBTITLE_FORMATS = ['srt', 'vtt', 'ass', 'ssa', 'sup', 'idx'] as const
export const SYNC_STATUSES = [
  'synced',
  'syncing',
  'queued',
  'unsynced',
  'failed',
  'not-needed',
] as const

/** A subtitle track highsea keeps as a sidecar beside a library file. */
export const subtitleFiles = sqliteTable(
  'subtitle_files',
  {
    id: text('id').primaryKey(),
    mediaFileId: text('media_file_id')
      .notNull()
      .references(() => mediaFiles.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    language: text('language').notNull(),
    forced: integer('forced', { mode: 'boolean' }).notNull(),
    hi: integer('hi', { mode: 'boolean' }).notNull(),
    format: text('format', { enum: SUBTITLE_FORMATS }).notNull(),
    kind: text('kind', { enum: SUBTITLE_KINDS }).notNull(),
    path: text('path').notNull(),
    /** The provider's id, or `release` for a bundled track. */
    provider: text('provider').notNull(),
    providerSubtitleId: text('provider_subtitle_id'),
    releaseName: text('release_name'),
    score: integer('score').notNull(),
    /** The fields that matched, for A6's tooltip and upgrades. */
    matches: text('matches', { mode: 'json' }).notNull().default([]),
    /** Chosen with Use: never upgraded (judgement call 10). */
    chosen: integer('chosen', { mode: 'boolean' }).notNull().default(false),
    /** The decoded original, gzipped, before cleanup; null for image subtitles. */
    original: blob('original', { mode: 'buffer' }),
    encoding: text('encoding'),
    syncStatus: text('sync_status', { enum: SYNC_STATUSES }).notNull(),
    syncConfidence: real('sync_confidence'),
    syncRatio: real('sync_ratio'),
    syncOffsetMs: integer('sync_offset_ms'),
    syncSplits: text('sync_splits', { mode: 'json' }),
    manualOffsetMs: integer('manual_offset_ms').notNull().default(0),
    syncedAt: integer('synced_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('subtitle_files_track').on(t.mediaFileId, t.language, t.forced, t.hi, t.provider),
    index('subtitle_files_item').on(t.itemId),
    index('subtitle_files_sync').on(t.syncStatus, t.updatedAt),
    index('subtitle_files_created').on(t.createdAt),
  ],
)

/** What a file still lacks, one row per wanted language and flags; rewritten per movie. */
export const subtitleWanted = sqliteTable(
  'subtitle_wanted',
  {
    itemId: text('item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    mediaFileId: text('media_file_id')
      .notNull()
      .references(() => mediaFiles.id, { onDelete: 'cascade' }),
    language: text('language').notNull(),
    forced: integer('forced', { mode: 'boolean' }).notNull(),
    hi: integer('hi', { mode: 'boolean' }).notNull(),
    lastSearchedAt: integer('last_searched_at'),
    nextSearchAt: integer('next_search_at').notNull(),
    searches: integer('searches').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.mediaFileId, t.language, t.forced, t.hi] }),
    index('subtitle_wanted_next').on(t.nextSearchAt),
    index('subtitle_wanted_file').on(t.mediaFileId),
  ],
)

/** The last search's results per file and language, for 30 minutes: Use sends an id. */
export const subtitleResults = sqliteTable(
  'subtitle_results',
  {
    id: text('id').primaryKey(),
    mediaFileId: text('media_file_id')
      .notNull()
      .references(() => mediaFiles.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    language: text('language').notNull(),
    provider: text('provider').notNull(),
    score: integer('score').notNull(),
    /** The provider's result with its scoring, as `@highsea/subtitles/shared` keeps it. */
    result: text('result', { mode: 'json' }).notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [
    index('subtitle_results_file').on(t.mediaFileId, t.language),
    index('subtitle_results_expires').on(t.expiresAt),
  ],
)

/** An in-flight download's link, stored before it's fetched (OpenSubtitles.com counts the link). */
export const subtitleDownloads = sqliteTable('subtitle_downloads', {
  /** `{provider}:{providerSubtitleId}`. */
  key: text('key').primaryKey(),
  link: text('link').notNull(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: integer('created_at').notNull(),
})

// SPDX-License-Identifier: AGPL-3.0-only
// Indexers and the catalog (checkpoint 5). The catalog's verified definitions are kept so a
// restart works offline (ADR 0034); the indexers are the owner's installed ones, with their health
// and hourly stats (ADR 0035); `releases` caches interactive search results so a grab can take one
// by its guid without searching again. The catalog's installed version, channel and extra URLs are
// the `catalog` settings row.
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Definitions as loaded: from the main catalog (`main`), an extra catalog (`extra:{url}`), or
 * `/config/definitions` (`local`). One id can come from several origins; the service picks local,
 * then main, then the extras, in their order.
 */
export const catalogDefinitions = sqliteTable(
  'catalog_definitions',
  {
    origin: text('origin').notNull(),
    id: text('id').notNull(),
    version: text('version').notNull(),
    kind: text('kind').notNull(),
    /** The validated definition, as `@highsea/schemas/indexers` parsed it. */
    definition: text('definition', { mode: 'json' }).notNull(),
    author: text('author').notNull(),
    license: text('license').notNull(),
    /** The definition's logo as a data URL, from the bundle. */
    logo: text('logo'),
    /** The catalog version it came in, or null for a local definition. */
    catalogVersion: text('catalog_version'),
    channel: text('channel'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.origin, t.id] })],
)

export const indexers = sqliteTable(
  'indexers',
  {
    id: text('id').primaryKey(),
    definitionId: text('definition_id').notNull(),
    /** The definition version the settings were last saved against. */
    definitionVersion: text('definition_version').notNull(),
    name: text('name').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    /** 1 to 50, lower first (owner's answer 5). */
    priority: integer('priority').notNull(),
    /** The settings by key; secret ones are sealed strings (`@highsea/core`'s Sealer). */
    settings: text('settings', { mode: 'json' }).notNull(),
    /** A new definition version needs a setting this indexer doesn't have. */
    needsAttention: integer('needs_attention', { mode: 'boolean' }).notNull().default(false),
    /** Seeding rules from this indexer (checkpoint 5's answer 5); null uses the global default. */
    seedRatio: real('seed_ratio'),
    seedMinutes: integer('seed_minutes'),
    /** Private trackers' minimum seed time: never removed before it (hit-and-run). */
    minSeedMinutes: integer('min_seed_minutes'),
    addedAt: integer('added_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('indexers_definition').on(t.definitionId)],
)

/** Health and backoff (ADR 0035). A missing row is a healthy indexer that hasn't been used. */
export const indexerStatus = sqliteTable('indexer_status', {
  indexerId: text('indexer_id')
    .primaryKey()
    .references(() => indexers.id, { onDelete: 'cascade' }),
  /** Failures in a row; a success resets it. */
  failures: integer('failures').notNull().default(0),
  /** When the current run of failures began. */
  failingSince: integer('failing_since'),
  backoffUntil: integer('backoff_until'),
  lastError: text('last_error'),
  /** The last failure was the credentials: no backoff, failing until fixed. */
  authFailed: integer('auth_failed', { mode: 'boolean' }).notNull().default(false),
  lastSuccessAt: integer('last_success_at'),
  lastFailureAt: integer('last_failure_at'),
  /** A form sign-in's cookies, sealed. */
  session: text('session'),
  updatedAt: integer('updated_at').notNull(),
})

/** One row per indexer and hour: the 24-hour stats are a sum over 24 rows. */
export const indexerStats = sqliteTable(
  'indexer_stats',
  {
    indexerId: text('indexer_id')
      .notNull()
      .references(() => indexers.id, { onDelete: 'cascade' }),
    /** The hour's start, in ms. */
    hour: integer('hour').notNull(),
    queries: integer('queries').notNull().default(0),
    failures: integer('failures').notNull().default(0),
    /** Summed over successful queries, for the average. */
    responseMs: integer('response_ms').notNull().default(0),
    grabs: integer('grabs').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.indexerId, t.hour] }), index('indexer_stats_hour').on(t.hour)],
)

/** Interactive search results, for 30 minutes per movie. */
export const releases = sqliteTable(
  'releases',
  {
    tmdbId: integer('tmdb_id').notNull(),
    indexerId: text('indexer_id')
      .notNull()
      .references(() => indexers.id, { onDelete: 'cascade' }),
    guid: text('guid').notNull(),
    /** The API's `Release`, with the parsed fields, the decision and its reasons. */
    data: text('data', { mode: 'json' }).notNull(),
    /** Where the release is fetched from; never sent to clients with a passkey in it. */
    download: text('download', { mode: 'json' }).notNull(),
    fetchedAt: integer('fetched_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tmdbId, t.indexerId, t.guid] }),
    index('releases_expires').on(t.expiresAt),
  ],
)

// SPDX-License-Identifier: AGPL-3.0-only
// Import lists (checkpoint 8a, ADR 0045): lists on TMDB, Trakt or a URL in the generic format, each
// adding its movies to the library with its own folder and profiles. What each list held at its last
// check is kept, so a run adds only what's new; exclusions stop a movie the owner deleted from coming
// back. A list's secrets (a Trakt account's tokens) are sealed inside `settings`.
import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { MINIMUM_AVAILABILITY } from './media.ts'

export const IMPORT_LIST_KINDS = ['tmdb', 'trakt', 'generic'] as const
export type ImportListKind = (typeof IMPORT_LIST_KINDS)[number]

export const importLists = sqliteTable('import_lists', {
  id: text('id').primaryKey(),
  kind: text('kind', { enum: IMPORT_LIST_KINDS }).notNull(),
  name: text('name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  /** The kind's settings: which list, and sealed tokens where it has them. */
  settings: text('settings', { mode: 'json' }).notNull(),
  rootFolder: text('root_folder').notNull(),
  qualityProfileId: text('quality_profile_id').notNull(),
  languageProfileId: text('language_profile_id'),
  monitored: integer('monitored', { mode: 'boolean' }).notNull(),
  minimumAvailability: text('minimum_availability', { enum: MINIMUM_AVAILABILITY }).notNull(),
  searchOnAdd: integer('search_on_add', { mode: 'boolean' }).notNull(),
  /** Tags (checkpoint 8c): given to every movie the list adds. Ids from `tags`. */
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  lastSyncAt: integer('last_sync_at'),
  /** The last check: how many it found, added and couldn't match, or why it failed. */
  lastResult: text('last_result', { mode: 'json' }),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** What a list held at its last check. */
export const importListItems = sqliteTable(
  'import_list_items',
  {
    listId: text('list_id')
      .notNull()
      .references(() => importLists.id, { onDelete: 'cascade' }),
    tmdbId: integer('tmdb_id').notNull(),
    title: text('title').notNull(),
    year: integer('year'),
    seenAt: integer('seen_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.listId, t.tmdbId] }),
    index('import_list_items_tmdb').on(t.tmdbId),
  ],
)

/** Movies no list may add again (Radarr's import list exclusions). */
export const importListExclusions = sqliteTable('import_list_exclusions', {
  tmdbId: integer('tmdb_id').primaryKey(),
  title: text('title').notNull(),
  year: integer('year'),
  createdAt: integer('created_at').notNull(),
})

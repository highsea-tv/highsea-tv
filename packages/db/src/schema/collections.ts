// SPDX-License-Identifier: AGPL-3.0-only
// Smart collections (checkpoint 8d, ADR 0049): collections the owner and admins make, from rules
// that are evaluated when read, or from titles picked by hand, with titles always or never
// included. TMDB's own collections are the metadata cache's `collections`.
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { users } from './auth.ts'
import type { AudienceRow } from './curation.ts'
import { mediaItems } from './media.ts'

export const COLLECTION_SORTS = [
  'manual',
  'rating',
  'release',
  'year',
  'added',
  'title',
  'runtime',
  'popularity',
  'random',
] as const

export const smartCollections = sqliteTable('smart_collections', {
  /** `sc-` and a random id. */
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  summary: text('summary').notNull().default(''),
  artwork: text('artwork'),
  /** The API's `RuleGroup`, checked with its schema on read; null for a collection picked by hand. */
  rules: text('rules', { mode: 'json' }),
  sort: text('sort', { enum: COLLECTION_SORTS }).notNull(),
  descending: integer('descending', { mode: 'boolean' }).notNull(),
  limit: integer('limit'),
  audience: text('audience', { mode: 'json' }).$type<AudienceRow>().notNull(),
  /** The admin's order. */
  position: integer('position').notNull(),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** Titles always (`include`, in their order) or never (`exclude`) in a collection. */
export const smartCollectionItems = sqliteTable(
  'smart_collection_items',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => smartCollections.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['include', 'exclude'] }).notNull(),
    position: integer('position').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.collectionId, t.itemId] }),
    index('smart_collection_items_item').on(t.itemId),
  ],
)

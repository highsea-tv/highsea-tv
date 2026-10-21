// SPDX-License-Identifier: AGPL-3.0-only
// Downloads (checkpoint 6): each grab of a release for a movie's version, and the blocklist search
// and grab skip. A download points at its torrent while there is one; the torrent goes when it has
// seeded, the download stays as the record of what was grabbed.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { indexers } from './indexers.ts'
import { mediaItems, versions } from './media.ts'
import { torrents } from './torrents.ts'

export const DOWNLOAD_STATES = [
  'downloading',
  'importing',
  'import-blocked',
  'completed',
  'failed',
] as const

export const downloads = sqliteTable(
  'downloads',
  {
    id: text('id').primaryKey(),
    torrentId: text('torrent_id').references(() => torrents.id, { onDelete: 'set null' }),
    itemId: text('item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    versionId: text('version_id').references(() => versions.id, { onDelete: 'set null' }),
    indexerId: text('indexer_id').references(() => indexers.id, { onDelete: 'set null' }),
    /** The indexer's name when grabbed, for history after the indexer goes. */
    indexerName: text('indexer_name'),
    guid: text('guid'),
    infoHash: text('info_hash').notNull(),
    releaseTitle: text('release_title').notNull(),
    quality: text('quality'),
    size: integer('size').notNull(),
    /** The release as grabbed: formats, score, languages, and whether it was grabbed anyway. */
    release: text('release', { mode: 'json' }).notNull(),
    state: text('state', { enum: DOWNLOAD_STATES }).notNull(),
    stateReason: text('state_reason'),
    /** The last time data arrived or a seed was connected, for the stall check. */
    progressAt: integer('progress_at').notNull(),
    /** How the import reached the library (`hardlink`, `reflink`, `copy`, `move`), once imported. */
    transfer: text('transfer'),
    grabbedAt: integer('grabbed_at').notNull(),
    importedAt: integer('imported_at'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('downloads_state').on(t.state, t.grabbedAt),
    index('downloads_item').on(t.itemId, t.grabbedAt),
    index('downloads_torrent').on(t.torrentId),
    index('downloads_hash').on(t.infoHash),
  ],
)

export const blocklist = sqliteTable(
  'blocklist',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    releaseTitle: text('release_title').notNull(),
    indexerId: text('indexer_id'),
    indexerName: text('indexer_name'),
    guid: text('guid'),
    infoHash: text('info_hash'),
    quality: text('quality'),
    reason: text('reason').notNull(),
    date: integer('date').notNull(),
  },
  (t) => [
    index('blocklist_item').on(t.itemId, t.date),
    index('blocklist_hash').on(t.infoHash),
    index('blocklist_date').on(t.date, t.id),
  ],
)

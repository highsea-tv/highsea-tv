// SPDX-License-Identifier: AGPL-3.0-only
// The torrent engine's own tables (checkpoint 6, ADR 0037). `torrents` is what the owner or a grab
// added, with the totals and seeding rule; `torrent_files` each file's priority; `torrent_resume`
// fast resume, written every 30 seconds and at shutdown, so a restart trusts what's on disk without
// checking it again (ADR 0019: a lost write costs at most 30 seconds of pieces).
import { blob, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** What the owner last asked of a torrent; the engine works out queued, checking and seeding. */
export const TORRENT_INTENTS = ['active', 'paused'] as const

export const torrents = sqliteTable('torrents', {
  id: text('id').primaryKey(),
  /** The v1 info hash, lowercase hex. */
  infoHash: text('info_hash').notNull().unique(),
  name: text('name').notNull(),
  /** The bencoded info dictionary, once known; a magnet's arrives from peers. */
  info: blob('info', { mode: 'buffer' }),
  /** BEP 12's tracker tiers. */
  trackers: text('trackers', { mode: 'json' }).$type<string[][]>().notNull(),
  /** The magnet it was added from, if it was. */
  magnet: text('magnet'),
  savePath: text('save_path').notNull(),
  category: text('category').notNull(),
  intent: text('intent', { enum: TORRENT_INTENTS }).notNull(),
  /** Why it stopped with an error, in plain words; null when it hasn't. */
  error: text('error'),
  private: integer('private', { mode: 'boolean' }).notNull().default(false),
  sequential: integer('sequential', { mode: 'boolean' }).notNull().default(false),
  /** Added by hand on A8, not grabbed: never imported on its own. */
  manual: integer('manual', { mode: 'boolean' }).notNull().default(false),
  /** Queue order: lower starts first. */
  position: integer('position').notNull(),
  seedRatio: real('seed_ratio'),
  seedMinutes: integer('seed_minutes'),
  minSeedMinutes: integer('min_seed_minutes'),
  uploaded: integer('uploaded').notNull().default(0),
  downloaded: integer('downloaded').notNull().default(0),
  seedingMs: integer('seeding_ms').notNull().default(0),
  addedAt: integer('added_at').notNull(),
  completedAt: integer('completed_at'),
  /** The seeding rule was met: it's done and waits to be removed. */
  seededAt: integer('seeded_at'),
})

export const torrentFiles = sqliteTable(
  'torrent_files',
  {
    torrentId: text('torrent_id')
      .notNull()
      .references(() => torrents.id, { onDelete: 'cascade' }),
    index: integer('index').notNull(),
    path: text('path').notNull(),
    size: integer('size').notNull(),
    priority: text('priority', { enum: ['skip', 'normal', 'high'] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.torrentId, t.index] })],
)

export const torrentResume = sqliteTable('torrent_resume', {
  torrentId: text('torrent_id')
    .primaryKey()
    .references(() => torrents.id, { onDelete: 'cascade' }),
  /** Verified pieces, BEP 3's bit order. */
  bitfield: blob('bitfield', { mode: 'buffer' }).notNull(),
  /** Each file's size and modification time when written; null for a file not on disk. */
  files: text('files', { mode: 'json' })
    .$type<({ size: number; mtimeMs: number } | null)[]>()
    .notNull(),
  updatedAt: integer('updated_at').notNull(),
})

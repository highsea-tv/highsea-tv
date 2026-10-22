// SPDX-License-Identifier: AGPL-3.0-only
// Curation (checkpoint 8c, ADR 0048): announcements the owner writes for the people on the server,
// each placed, aimed at an audience and scheduled, with who has seen or acknowledged it; and the
// featured sections clients show at the top of Home, from hand-picked movies or a rule, with
// artwork and taglines overridden per movie.
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { users } from './auth.ts'
import { mediaItems } from './media.ts'

export const ANNOUNCEMENT_SEVERITIES = ['info', 'notice', 'warning', 'critical'] as const
export const ANNOUNCEMENT_PLACEMENTS = ['banner', 'modal', 'toast', 'card'] as const
export const FEATURED_LAYOUTS = ['hero', 'row', 'spotlight'] as const

/** Who sees an announcement or a section: the shape is the API's `Audience`. */
export type AudienceRow =
  | { kind: 'everyone' }
  | { kind: 'roles'; roles: string[] }
  | { kind: 'users'; userIds: string[] }
  | { kind: 'clients'; clients: string[] }

export type FeaturedSourceRow =
  | { kind: 'manual'; itemIds: string[] }
  | { kind: 'rule'; rule: 'recently-added' | 'genre' | 'collection' | 'filter'; value: string }

export const announcements = sqliteTable(
  'announcements',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    /** Markdown. */
    body: text('body').notNull(),
    image: text('image'),
    cta: text('cta', { mode: 'json' }).$type<{ label: string; url: string } | null>(),
    severity: text('severity', { enum: ANNOUNCEMENT_SEVERITIES }).notNull(),
    placements: text('placements', { mode: 'json' })
      .$type<(typeof ANNOUNCEMENT_PLACEMENTS)[number][]>()
      .notNull(),
    audience: text('audience', { mode: 'json' }).$type<AudienceRow>().notNull(),
    startAt: integer('start_at').notNull(),
    /** Null runs until it's ended by hand. */
    endAt: integer('end_at'),
    acknowledgement: text('acknowledgement', { enum: ['dismiss', 'require'] }).notNull(),
    /** Saved but not published: nobody sees it, whatever the schedule says. */
    draft: integer('draft', { mode: 'boolean' }).notNull().default(false),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('announcements_start_idx').on(t.startAt)],
)

/** Someone has seen (dismissed) an announcement, and acknowledged it when it asked them to. */
export const announcementSeen = sqliteTable(
  'announcement_seen',
  {
    announcementId: text('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seenAt: integer('seen_at').notNull(),
    acknowledgedAt: integer('acknowledged_at'),
  },
  (t) => [primaryKey({ columns: [t.announcementId, t.userId] })],
)

export const featuredSections = sqliteTable('featured_sections', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  tagline: text('tagline'),
  layout: text('layout', { enum: FEATURED_LAYOUTS }).notNull(),
  source: text('source', { mode: 'json' }).$type<FeaturedSourceRow>().notNull(),
  audience: text('audience', { mode: 'json' }).$type<AudienceRow>().notNull(),
  startAt: integer('start_at').notNull(),
  endAt: integer('end_at'),
  /** Home's order, from the top. */
  position: integer('position').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** A movie's artwork or tagline, changed for one section. */
export const featuredOverrides = sqliteTable(
  'featured_overrides',
  {
    sectionId: text('section_id')
      .notNull()
      .references(() => featuredSections.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    artwork: text('artwork'),
    tagline: text('tagline'),
  },
  (t) => [primaryKey({ columns: [t.sectionId, t.itemId] })],
)

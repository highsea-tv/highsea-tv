// SPDX-License-Identifier: AGPL-3.0-only
// Personalization (ADR 0027, 0028): preferences in layers, dashboard layouts, home screen order,
// the owner's themes and sound packs, and files the owner uploads (the server's mark). The
// server-wide choices (default theme, accent, sound defaults) are the `appearance` settings row.
import { blob, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { devices, ROLES, users } from './auth.ts'

/**
 * One row per layer: `user`, `client:{type}` (all of a person's TVs) or `device:{id}`. A device's
 * row goes with the device; a person's rows go with the person.
 */
export const preferences = sqliteTable(
  'preferences',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    deviceId: text('device_id').references(() => devices.id, { onDelete: 'cascade' }),
    /** The layer's keys and values; only keys from the typed list are ever stored. */
    values: text('values', { mode: 'json' }).notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.scope] }), index('preferences_device').on(t.deviceId)],
)

/** A person's dashboard (`user:{id}`), or a role's default (`role:{role}`). */
export const widgetLayouts = sqliteTable(
  'widget_layouts',
  {
    scope: text('scope').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ROLES }),
    /** Placements in order. Kinds this version doesn't know are kept, not shown. */
    widgets: text('widgets', { mode: 'json' }).notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('widget_layouts_user').on(t.userId)],
)

/** A person's home screen: row order and hidden rows, by row id. */
export const homeLayouts = sqliteTable('home_layouts', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  order: text('order', { mode: 'json' }).notNull(),
  hidden: text('hidden', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** The owner's themes: a `ThemeInput` for the theme engine, audited before it's saved. */
export const themes = sqliteTable('themes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  base: text('base', { enum: ['default', 'oled', 'high-contrast'] }).notNull(),
  accent: text('accent').notNull(),
  colors: text('colors', { mode: 'json' }),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

/** Uploaded sound packs: recipes (sound.md › Recipe format), checked before they're saved. */
export const soundPacks = sqliteTable('sound_packs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  recipe: text('recipe', { mode: 'json' }).notNull(),
  createdAt: integer('created_at').notNull(),
})

/** Files the owner uploads, kept in the database so backups cover them (ADR 0028). */
export const uploads = sqliteTable('uploads', {
  key: text('key').primaryKey(),
  /** Checked from the bytes, never taken from the client's word. */
  type: text('type').notNull(),
  data: blob('data', { mode: 'buffer' }).notNull(),
  /** A SHA-256 of the bytes, for `ETag`. */
  hash: text('hash').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

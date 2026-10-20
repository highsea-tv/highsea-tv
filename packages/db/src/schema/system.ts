// SPDX-License-Identifier: AGPL-3.0-only
// Server-wide state: one typed JSON row per settings area (`server`, `network`, …).
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at').notNull(),
})

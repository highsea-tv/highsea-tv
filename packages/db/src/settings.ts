// SPDX-License-Identifier: AGPL-3.0-only
// One typed JSON row per settings area. Reads merge the stored value over the area's defaults, so a
// field added in a later release reads its default until someone saves the area.
import { eq } from 'drizzle-orm'
import type { Db } from './database.ts'
import { settings } from './schema/system.ts'

export function readSetting<T extends object>(db: Db, key: string, defaults: T): T {
  const row = db.select().from(settings).where(eq(settings.key, key)).get()
  return row ? { ...defaults, ...(row.value as Partial<T>) } : defaults
}

export function writeSetting<T extends object>(db: Db, key: string, value: T, now: number): T {
  db.insert(settings)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } })
    .run()
  return value
}

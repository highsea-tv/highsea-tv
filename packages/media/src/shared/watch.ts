// SPDX-License-Identifier: AGPL-3.0-only
// Each person's place in each title, from `watch_positions`, whatever the title's type. Playback
// writes them in Phase 4.
import { type Db, schema } from '@highsea-tv/db'
import { and, eq, inArray } from 'drizzle-orm'
import type { WatchState } from './map.ts'
import { chunks } from './sql.ts'

const { watchPositions } = schema

/** The person's watch state for each of the items, by item id; items never started are absent. */
export function watchOf(db: Db, userId: string, itemIds: string[]): Map<string, WatchState> {
  const out = new Map<string, WatchState>()
  for (const ids of chunks(itemIds))
    for (const w of db
      .select()
      .from(watchPositions)
      .where(and(eq(watchPositions.userId, userId), inArray(watchPositions.itemId, ids)))
      .all())
      out.set(w.itemId, { positionSeconds: w.positionSeconds, durationSeconds: w.durationSeconds })
  return out
}

// SPDX-License-Identifier: AGPL-3.0-only
// A person's home screen (client-settings.md › Home screen): the order of the rows below the hero,
// and the rows they've hidden, by row id. Ids not offered yet (a curated row that goes live next
// week) are kept, so arranging today doesn't forget them.
import { schema } from '@highsea/db'
import { eq } from 'drizzle-orm'
import type { Ctx } from './context.ts'

export type HomeLayout = { order: string[]; hidden: string[] }

/**
 * A row someone can arrange. Built-in rows have no title: each app names them from its own catalog
 * by id. Curated rows carry the title the owner wrote.
 */
export type HomeRow = { id: string; title: string | null }

/** The rows every server has. Curated rows join them when curation is built. */
export const BUILT_IN_ROWS: HomeRow[] = [{ id: 'continue', title: null }]

export const HOME_IDS_MAX = 200

export function createHome(ctx: Ctx, offered: () => HomeRow[] = () => BUILT_IN_ROWS) {
  const { db, clock, events } = ctx

  const mine = (userId: string): HomeLayout => {
    const row = db
      .select()
      .from(schema.homeLayouts)
      .where(eq(schema.homeLayouts.userId, userId))
      .get()
    return row
      ? { order: row.order as string[], hidden: row.hidden as string[] }
      : { order: [], hidden: [] }
  }

  const layout = (userId: string): HomeLayout & { rows: HomeRow[] } => {
    const own = mine(userId)
    const rows = offered()
    const pos = (id: string) => {
      const i = own.order.indexOf(id)
      return i < 0 ? HOME_IDS_MAX + rows.findIndex((r) => r.id === id) : i
    }
    return { ...own, rows: [...rows].sort((a, b) => pos(a.id) - pos(b.id)) }
  }

  return {
    layout,

    save(userId: string, next: HomeLayout) {
      const values = {
        order: [...new Set(next.order)],
        hidden: [...new Set(next.hidden)],
        updatedAt: clock.now(),
      }
      db.insert(schema.homeLayouts)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: schema.homeLayouts.userId, set: values })
        .run()
      events.emit({ topic: 'home.updated', ids: [userId] })
      return layout(userId)
    },
  }
}

export type HomeService = ReturnType<typeof createHome>

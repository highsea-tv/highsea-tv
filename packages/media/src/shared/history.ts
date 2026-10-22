// SPDX-License-Identifier: AGPL-3.0-only
// What happened to each title (checkpoint 6, Data › history): grabbed, imported, failed, deleted,
// renamed, blocklisted. Newest first, paged on (date, id) with a keyset cursor, so a page deep in
// 100k rows seeks on `history_item` or `history_date` as the first does (SQLite's row values:
// https://sqlite.org/rowvalue.html). The API addresses titles by TMDB id, so a page carries each
// row's movie id from `media_items`.
import { AppError, newId } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import type { HISTORY_TYPES } from '@highsea-tv/db/schema'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { MediaDeps } from './context.ts'
import { isoOf } from './map.ts'

const { history, mediaItems } = schema

export type HistoryType = (typeof HISTORY_TYPES)[number]

export type HistoryInput = {
  itemId: string
  type: HistoryType
  sourceTitle: string
  quality?: string | null
  indexer?: string | null
  message?: string | null
  downloadId?: string | null
  data?: Record<string, unknown> | null
}

/** The prototype's `HistoryEvent`, with the movie's id as the API gives it (its TMDB id). */
export type HistoryEvent = {
  id: string
  itemId: number
  /** The movie's title and year, so a list names it without loading the library. */
  title: string
  year: number | null
  type: HistoryType
  date: string
  sourceTitle: string
  quality: string | null
  indexer: string | null
  message: string | null
  downloadId: string | null
}

export type HistoryPage = { items: HistoryEvent[]; next: string | null }

export const HISTORY_LIMIT = 50
const MAX_LIMIT = 200

const badCursor = () =>
  new AppError('invalid', 'That page link has expired. Start from the first page.', {
    reason: 'bad-cursor',
  })

type Cursor = { d: number; i: string }
const encode = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url')
function decode(cursor: string): Cursor {
  try {
    const c = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Cursor
    if (typeof c?.d === 'number' && typeof c.i === 'string') return c
  } catch {
    // falls through
  }
  throw badCursor()
}

export function createHistory({
  db,
  clock,
  logger,
  onHistory,
}: Pick<MediaDeps, 'db' | 'clock' | 'logger' | 'onHistory'>) {
  function write(entry: HistoryInput): string {
    const id = newId('his')
    db.insert(history)
      .values({
        id,
        itemId: entry.itemId,
        type: entry.type,
        date: clock.now(),
        sourceTitle: entry.sourceTitle,
        quality: entry.quality ?? null,
        indexer: entry.indexer ?? null,
        message: entry.message ?? null,
        downloadId: entry.downloadId ?? null,
        data: entry.data ?? null,
      })
      .run()
    try {
      onHistory?.(id, entry)
    } catch (e) {
      logger.warn('a history listener failed', { type: entry.type, error: (e as Error).message })
    }
    return id
  }

  /** Whether the item has an entry of this type whose `data` holds `key: value`: repeats check it. */
  function has(itemId: string, type: HistoryType, key: string, value: string): boolean {
    return !!db
      .select({ id: history.id })
      .from(history)
      .where(
        and(
          eq(history.itemId, itemId),
          eq(history.type, type),
          sql`json_extract(${history.data}, ${`$.${key}`}) = ${value}`,
        ),
      )
      .get()
  }

  function page(itemId: string | null, cursor?: string, limit = HISTORY_LIMIT): HistoryPage {
    const n = Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit) || HISTORY_LIMIT))
    const after = cursor ? decode(cursor) : null
    const rows = db
      .select({
        row: history,
        tmdbId: mediaItems.tmdbId,
        title: mediaItems.title,
        year: mediaItems.year,
      })
      .from(history)
      .innerJoin(mediaItems, eq(mediaItems.id, history.itemId))
      .where(
        and(
          itemId ? eq(history.itemId, itemId) : undefined,
          after ? sql`(${history.date}, ${history.id}) < (${after.d}, ${after.i})` : undefined,
        ),
      )
      .orderBy(desc(history.date), desc(history.id))
      .limit(n + 1)
      .all()
    const more = rows.length > n
    const items = rows.slice(0, n).map(({ row, tmdbId, title, year }) => ({
      id: row.id,
      itemId: tmdbId,
      title,
      year,
      type: row.type,
      date: isoOf(row.date),
      sourceTitle: row.sourceTitle,
      quality: row.quality,
      indexer: row.indexer,
      message: row.message,
      downloadId: row.downloadId,
    }))
    const last = rows[n - 1]
    return { items, next: more && last ? encode({ d: last.row.date, i: last.row.id }) : null }
  }

  return {
    write,
    has,
    /** One title's history, newest first. */
    forItem: (itemId: string, cursor?: string, limit?: number) => page(itemId, cursor, limit),
    /** Everything, newest first (Activity › History). */
    list: (cursor?: string, limit?: number) => page(null, cursor, limit),
    /** Activity › History's Clear: every row goes; the blocklist stays. */
    clear: () => {
      db.delete(history).run()
    },
  }
}

export type History = ReturnType<typeof createHistory>

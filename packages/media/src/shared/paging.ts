// SPDX-License-Identifier: AGPL-3.0-only
// Keyset paging over the library's indexes, for every media type: the caller's `where` picks the
// type (phase-3-server.md › Paging and sorting). A cursor holds the last row's sort value and id,
// so the next page seeks straight to it on the index (`(sort_key, id) > (?, ?)`, SQLite's row
// values: https://sqlite.org/rowvalue.html) and a page deep in a 100k library costs what the first
// does. The indexes are `(type, sort column, id)` (packages/db/src/schema/media.ts), and
// packages/db's library-scale test holds them to it.
import { AppError } from '@highsea/core'
import { type Db, schema } from '@highsea/db'
import { and, asc, desc, gt, isNotNull, isNull, lt, type SQL, sql } from 'drizzle-orm'
import type { ItemRow } from './map.ts'

const { mediaItems } = schema

export const SORTS = ['title', 'added', 'year', 'rating'] as const
export type Sort = (typeof SORTS)[number]
export type Dir = 'asc' | 'desc'

const COLUMNS = {
  title: mediaItems.sortTitle,
  added: mediaItems.addedAt,
  year: mediaItems.year,
  rating: mediaItems.rating,
} as const

/** A to Z for title; newest or highest first for the others (the contract's `MovieListQuery`). */
export const defaultDir = (sort: Sort): Dir => (sort === 'title' ? 'asc' : 'desc')

type Cursor = { s: Sort; d: Dir; v: string | number | null; i: string }

const encode = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url')

const badCursor = () =>
  new AppError('invalid', 'That page link has expired. Start from the first page.', {
    reason: 'bad-cursor',
  })

function decode(cursor: string, sort: Sort, dir: Dir): Cursor {
  let c: unknown
  try {
    c = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    throw badCursor()
  }
  const ok =
    typeof c === 'object' &&
    c !== null &&
    (c as Cursor).s === sort &&
    (c as Cursor).d === dir &&
    typeof (c as Cursor).i === 'string' &&
    ((c as Cursor).v === null || ['string', 'number'].includes(typeof (c as Cursor).v))
  if (!ok) throw badCursor()
  return c as Cursor
}

const sortValue = (row: ItemRow, sort: Sort): string | number | null =>
  sort === 'title'
    ? row.sortTitle
    : sort === 'added'
      ? row.addedAt
      : sort === 'year'
        ? row.year
        : row.rating

/**
 * One page of library rows matching `where`, in `sort` and `dir` order, with the row id breaking
 * ties. `year` can be null: SQLite puts NULLs first ascending and last descending
 * (https://sqlite.org/lang_select.html#orderby), and a row value with a NULL compares to nothing, so
 * undated rows are a segment of their own, paged by id, before or after the dated ones.
 */
export function pageRows(
  db: Db,
  where: SQL | undefined,
  { sort, dir, cursor, limit }: { sort: Sort; dir: Dir; cursor?: string; limit: number },
): { rows: ItemRow[]; next: string | null } {
  const col = COLUMNS[sort]
  const ascending = dir === 'asc'
  const after = cursor ? decode(cursor, sort, dir) : null
  const past = (v: string | number, id: string) =>
    ascending
      ? sql`(${col}, ${mediaItems.id}) > (${v}, ${id})`
      : sql`(${col}, ${mediaItems.id}) < (${v}, ${id})`
  const idPast = (id: string) => (ascending ? gt(mediaItems.id, id) : lt(mediaItems.id, id))
  const byValue = ascending ? [asc(col), asc(mediaItems.id)] : [desc(col), desc(mediaItems.id)]
  const byId = ascending ? [asc(mediaItems.id)] : [desc(mediaItems.id)]

  type Segment = { where: SQL | undefined; order: SQL[] }
  const segments: Segment[] = []
  if (sort !== 'year') {
    segments.push({
      where: after ? past(after.v as string | number, after.i) : undefined,
      order: byValue,
    })
  } else {
    const undated = (id?: string): Segment => ({
      where: and(isNull(col), id ? idPast(id) : undefined),
      order: byId,
    })
    const dated = (from?: Cursor): Segment => ({
      where: from ? past(from.v as number, from.i) : isNotNull(col),
      order: byValue,
    })
    if (ascending) {
      if (!after) segments.push(undated(), dated())
      else if (after.v === null) segments.push(undated(after.i), dated())
      else segments.push(dated(after))
    } else if (!after) segments.push(dated(), undated())
    else if (after.v === null) segments.push(undated(after.i))
    else segments.push(dated(after), undated())
  }

  const rows: ItemRow[] = []
  for (const s of segments) {
    const want = limit + 1 - rows.length
    if (want <= 0) break
    rows.push(
      ...db
        .select()
        .from(mediaItems)
        .where(and(where, s.where))
        .orderBy(...s.order)
        .limit(want)
        .all(),
    )
  }
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  const next =
    rows.length > limit && last
      ? encode({ s: sort, d: dir, v: sortValue(last, sort), i: last.id })
      : null
  return { rows: page, next }
}

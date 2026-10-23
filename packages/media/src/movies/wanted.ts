// SPDX-License-Identifier: AGPL-3.0-only
// Wanted (checkpoint 8a, ADR 0045): what the library is still looking for and when to look again.
// - Cutoff unmet: a version's file under its profile's cutoff, kept on the row (`cutoff_unmet`) so
//   Wanted's list and the searches read an index rather than parse every file.
// - The backlog sweep: the movies due a search, oldest first, and the backoff after each search
//   (1, 3, 7, then 14 days), written before the search runs so a repeated job searches nothing twice.
// - RSS's targets: the monitored movies a new release could be for.
// - The calendar: each monitored movie's cinema, digital and physical dates in a range.
import type { CalendarEntry, MoviePage } from '@highsea-tv/api-contract'
import { schema } from '@highsea-tv/db'
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import type { Media } from '../shared/index.ts'
import type { ItemRow } from '../shared/map.ts'
import { CHUNK } from '../shared/sql.ts'
import type { Ctx } from './context.ts'
import type { Library, ListQuery } from './library.ts'

export { WANTED_TOPIC } from './context.ts'

const { mediaItems, versions, movieMetadata } = schema

const DAY = 24 * 60 * 60 * 1000

/** The sweep's waits after each search that grabbed nothing (the owner's answer 3). */
export const SWEEP_BACKOFF_DAYS = [1, 3, 7, 14] as const
/** How many movies one sweep searches (the owner's answer 3). */
export const SWEEP_SIZE = 20
/** The calendar's longest range, and the feed's: 30 days back and 365 forward fit. */
export const CALENDAR_MAX_DAYS = 400

/**
 * The sweep's and RSS's movies, written as the partial index `media_items_wanted` is, so SQLite can
 * use it (https://sqlite.org/partialindex.html#queries_using_partial_indexes).
 */
const WANTED = sql`monitored = 1 AND (status = 'wanted' OR cutoff_unmet = 1)`

/** A movie RSS matches releases against. */
export type RssTarget = {
  tmdbId: number
  imdbId: string | null
  title: string
  originalTitle: string | null
  year: number | null
}

/** What a movie still needs: a version without a file, or one whose file is under the cutoff. */
export type Want = { versionId: string; upgrade: boolean }

export function createWanted(ctx: Ctx, deps: { media: Media; library: Library }) {
  const { db, clock } = ctx
  const { library } = deps
  const log = ctx.logger.child('wanted')

  /** The versions a movie needs a release for: nothing while it isn't monitored. */
  function wants(tmdbId: number): Want[] {
    const row = library.internal.rowOf(tmdbId)
    if (!row?.monitored) return []
    const all = library.internal.versionsOf([row.id]).get(row.id) ?? []
    if (row.status === 'wanted')
      return all.filter((v) => !v.fileId).map((v) => ({ versionId: v.id, upgrade: false }))
    if (!row.cutoffUnmet) return []
    return library.internal.unmetVersions(row).map((versionId) => ({ versionId, upgrade: true }))
  }

  /**
   * The sweep's movies: monitored, wanted or under the cutoff, whose next search is due, the ones
   * never searched first and then those searched longest ago. Each is pushed back before it's
   * returned, so a second run in the same window finds nothing (ADR 0022).
   */
  function takeDue(limit = SWEEP_SIZE): number[] {
    const now = clock.now()
    const rows = db
      .select({ id: mediaItems.id, tmdbId: mediaItems.tmdbId, searches: mediaItems.searches })
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.type, 'movie'),
          WANTED,
          sql`(${mediaItems.nextSearchAt} IS NULL OR ${mediaItems.nextSearchAt} <= ${now})`,
        ),
      )
      .orderBy(asc(mediaItems.nextSearchAt), asc(mediaItems.id))
      .limit(limit)
      .all()
    for (const r of rows) {
      const days = SWEEP_BACKOFF_DAYS[Math.min(r.searches, SWEEP_BACKOFF_DAYS.length - 1)] ?? 14
      db.update(mediaItems)
        .set({ nextSearchAt: now + days * DAY, searches: r.searches + 1 })
        .where(eq(mediaItems.id, r.id))
        .run()
    }
    return rows.map((r) => r.tmdbId)
  }

  /** After a search grabbed something: the backoff starts again from a day. */
  function found(tmdbId: number) {
    db.update(mediaItems)
      .set({ searches: 0 })
      .where(and(eq(mediaItems.type, 'movie'), eq(mediaItems.tmdbId, tmdbId)))
      .run()
  }

  /** Every movie RSS could grab for, with what a release name is matched by. */
  function rssTargets(): RssTarget[] {
    const out: RssTarget[] = []
    let after = ''
    for (;;) {
      const rows = db
        .select({
          id: mediaItems.id,
          tmdbId: mediaItems.tmdbId,
          title: mediaItems.title,
          year: mediaItems.year,
          // the cache keeps TMDB's answer as it came (`imdb_id`, and `external_ids` when appended)
          imdbId: sql<
            string | null
          >`coalesce(json_extract(${movieMetadata.data}, '$.external_ids.imdb_id'), json_extract(${movieMetadata.data}, '$.imdb_id'))`,
          originalTitle: movieMetadata.originalTitle,
        })
        .from(mediaItems)
        .leftJoin(movieMetadata, eq(movieMetadata.tmdbId, mediaItems.tmdbId))
        .where(and(eq(mediaItems.type, 'movie'), WANTED, sql`${mediaItems.id} > ${after}`))
        .orderBy(asc(mediaItems.id))
        .limit(CHUNK)
        .all()
      for (const r of rows)
        out.push({
          tmdbId: r.tmdbId,
          imdbId: r.imdbId ?? null,
          title: r.title,
          originalTitle: r.originalTitle ?? null,
          year: r.year,
        })
      const last = rows[rows.length - 1]
      if (!last || rows.length < CHUNK) break
      after = last.id
    }
    return out
  }

  /** Wanted › Missing: monitored movies past their minimum availability with nothing yet. */
  const missing = (query: ListQuery = {}): MoviePage =>
    library.list({ ...query, status: 'wanted', monitored: true, cutoffUnmet: undefined })

  /** Wanted › Cutoff unmet: monitored movies with a file under its profile's cutoff. */
  const cutoff = (query: ListQuery = {}): MoviePage =>
    library.list({ ...query, status: undefined, monitored: true, cutoffUnmet: true })

  /**
   * The calendar: each monitored movie's dates between `from` and `to` (days, inclusive), each date
   * its own entry (the owner's answer 2), soonest first.
   */
  function calendar(from: string, to: string): CalendarEntry[] {
    const kinds = [
      { kind: 'cinema', column: mediaItems.releaseDate, key: 'releaseDate' },
      { kind: 'digital', column: mediaItems.digitalRelease, key: 'digitalRelease' },
      { kind: 'physical', column: mediaItems.physicalRelease, key: 'physicalRelease' },
    ] as const
    const found: { kind: CalendarEntry['kind']; date: string; row: ItemRow }[] = []
    for (const { kind, column, key } of kinds)
      for (const row of db
        .select()
        .from(mediaItems)
        .where(
          and(
            eq(mediaItems.type, 'movie'),
            gte(column, from),
            lte(column, to),
            eq(mediaItems.monitored, true),
          ),
        )
        .orderBy(asc(column), asc(mediaItems.id))
        .limit(CHUNK)
        .all())
        found.push({ kind, date: row[key] ?? '', row })
    const movies = new Map(
      library.internal
        .toMovies([...new Map(found.map((f) => [f.row.id, f.row])).values()])
        .map((m) => [m.id, m]),
    )
    return found
      .map((f) => ({ date: f.date, kind: f.kind, movie: movies.get(f.row.tmdbId) }))
      .filter((e): e is CalendarEntry => !!e.movie)
      .sort((a, b) => a.date.localeCompare(b.date) || a.movie.title.localeCompare(b.movie.title))
  }

  /**
   * Brings every movie's calendar dates and cutoff up to date, after migration 0009 added them or
   * a profile changed. Safe to repeat: a second run changes nothing.
   */
  function backfill(): number {
    let after = ''
    let changed = 0
    for (;;) {
      const rows = db
        .select()
        .from(mediaItems)
        .where(and(eq(mediaItems.type, 'movie'), sql`${mediaItems.id} > ${after}`))
        .orderBy(asc(mediaItems.id))
        .limit(CHUNK)
        .all()
      for (const row of rows) {
        const meta = library.internal.cached(row.tmdbId)
        if (
          meta &&
          (meta.releases.digital !== row.digitalRelease ||
            meta.releases.physical !== row.physicalRelease)
        ) {
          db.update(mediaItems)
            .set({ digitalRelease: meta.releases.digital, physicalRelease: meta.releases.physical })
            .where(eq(mediaItems.id, row.id))
            .run()
          changed++
        }
      }
      const withFiles = db
        .selectDistinct({ itemId: versions.itemId })
        .from(versions)
        .where(
          and(
            inArray(
              versions.itemId,
              rows.map((r) => r.id),
            ),
            sql`${versions.fileId} IS NOT NULL`,
          ),
        )
        .all()
        .map((r) => r.itemId)
      const withoutFiles = rows.filter((r) => r.cutoffUnmet && !withFiles.includes(r.id))
      changed += library.internal.refreshCutoff([
        ...withFiles,
        ...withoutFiles.map((r) => r.id),
      ]).length
      const last = rows[rows.length - 1]
      if (!last || rows.length < CHUNK) break
      after = last.id
    }
    if (changed) log.info('brought the wanted list up to date', { changed })
    return changed
  }

  return { wants, takeDue, found, rssTargets, missing, cutoff, calendar, backfill }
}

export type Wanted = ReturnType<typeof createWanted>

// SPDX-License-Identifier: AGPL-3.0-only
// The wanted list (checkpoint 7's plan, "The wanted list"): rows in `subtitle_wanted`, one per
// file, language and flags an available movie's profile asks for and nothing present fills.
// They're rewritten for one movie when its file, tracks or profile change, and for every movie when
// a profile changes, so A10's page reads an index instead of every file's streams. Each row keeps
// when it may be searched again: after 1 day, then 3, then 7, then weekly (judgement call 6).
import { AppError } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { and, asc, count, countDistinct, eq, gt, inArray, lte, or, sql } from 'drizzle-orm'
import { missing, type Profiles, type Want } from '../shared/profiles.ts'
import type { SubtitlesDeps } from './context.ts'
import { DAY } from './context.ts'
import type { Tracks } from './tracks.ts'

const { mediaItems, subtitleWanted } = schema

/** The waits between searches for a row nothing was found for. */
export const BACKOFF_DAYS = [1, 3, 7] as const

/** After the backoff's last wait, weekly. */
export const nextSearchAfter = (searches: number, now: number): number =>
  now + (BACKOFF_DAYS[searches - 1] ?? 7) * DAY

export const WANTED_LIMIT = 50
const MAX_LIMIT = 200

/** One movie on A10's Wanted tab: the prototype's `{ movie, missingLanguages }`. */
export type WantedMovie = {
  movie: { id: number; title: string; year: number | null; path: string }
  /** The profile's codes still missing, in the profile's order. */
  missingLanguages: string[]
}

export type WantedPage = { items: WantedMovie[]; next: string | null; total: number }

/** A wanted row as the search reads it. */
export type WantedRow = typeof subtitleWanted.$inferSelect

type Cursor = { t: string; i: string }
const encode = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url')
function decode(cursor: string): Cursor {
  try {
    const c = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Cursor
    if (typeof c?.t === 'string' && typeof c.i === 'string') return c
  } catch {
    // falls through
  }
  throw new AppError('invalid', 'That page link has expired. Start from the first page.', {
    reason: 'bad-cursor',
  })
}

export function createWanted(deps: SubtitlesDeps, tracks: Tracks, profiles: Profiles) {
  const { db, clock } = deps

  /**
   * What each of an item's files still lacks, from the current state. `importing`: the import's
   * hook runs before the import marks the movie Available (it must, since a Move import removes
   * the release's files as soon as it finishes), so the movie counts as available already.
   */
  function wantsOf(itemId: string, importing: boolean): { fileId: string; wants: Want[] }[] {
    const item = tracks.item(itemId)
    const available = importing || item?.status === 'available'
    if (item?.type !== 'movie' || !available || !item.languageProfileId) return []
    const profile = profiles.find(item.languageProfileId)
    if (!profile) return []
    return tracks
      .filesOf(itemId)
      .map((f) => ({ fileId: f.id, wants: missing(profile, tracks.present(f)) }))
  }

  /**
   * Rewrites one movie's rows. A row still wanted keeps its search history; one now filled goes;
   * a new one may be searched at once.
   */
  function refresh(itemId: string, { importing = false } = {}): void {
    const now = clock.now()
    const wanted = wantsOf(itemId, importing)
    db.transaction((tx) => {
      const before = tx.select().from(subtitleWanted).where(eq(subtitleWanted.itemId, itemId)).all()
      const key = (r: { mediaFileId: string; language: string; forced: boolean; hi: boolean }) =>
        `${r.mediaFileId}|${r.language}|${r.forced}|${r.hi}`
      const kept = new Map(before.map((r) => [key(r), r]))
      tx.delete(subtitleWanted).where(eq(subtitleWanted.itemId, itemId)).run()
      for (const { fileId, wants } of wanted)
        for (const w of wants) {
          const row = {
            itemId,
            mediaFileId: fileId,
            language: w.language,
            forced: w.forced,
            hi: w.hi,
          }
          const old = kept.get(key(row))
          tx.insert(subtitleWanted)
            .values({
              ...row,
              lastSearchedAt: old?.lastSearchedAt ?? null,
              nextSearchAt: old?.nextSearchAt ?? now,
              searches: old?.searches ?? 0,
            })
            .onConflictDoNothing()
            .run()
        }
    })
  }

  /** Every movie's rows, a page of items at a time: a profile changed, or the job ran by hand. */
  async function refreshAll(signal?: AbortSignal): Promise<number> {
    let after = ''
    let done = 0
    for (;;) {
      signal?.throwIfAborted()
      const ids = db
        .select({ id: mediaItems.id })
        .from(mediaItems)
        .where(and(eq(mediaItems.type, 'movie'), gt(mediaItems.id, after)))
        .orderBy(asc(mediaItems.id))
        .limit(500)
        .all()
      if (ids.length === 0) return done
      for (const { id } of ids) refresh(id)
      done += ids.length
      after = ids[ids.length - 1]?.id ?? after
      // lets requests in between pages
      await new Promise((r) => setImmediate(r))
    }
  }

  /** A file's rows. */
  const forFile = (fileId: string): WantedRow[] =>
    db.select().from(subtitleWanted).where(eq(subtitleWanted.mediaFileId, fileId)).all()

  /** Files with a row due for a search, oldest due first. */
  function dueFiles(limit: number): string[] {
    return db
      .selectDistinct({ fileId: subtitleWanted.mediaFileId })
      .from(subtitleWanted)
      .where(lte(subtitleWanted.nextSearchAt, clock.now()))
      .orderBy(asc(subtitleWanted.nextSearchAt))
      .limit(limit)
      .all()
      .map((r) => r.fileId)
  }

  /** Every file with a row, for Search all. */
  function allFiles(): string[] {
    return db
      .selectDistinct({ fileId: subtitleWanted.mediaFileId })
      .from(subtitleWanted)
      .all()
      .map((r) => r.fileId)
  }

  /** A search ran for these rows and found nothing to keep: they wait longer. */
  function searched(rows: WantedRow[]): void {
    const now = clock.now()
    for (const r of rows) {
      const searches = r.searches + 1
      db.update(subtitleWanted)
        .set({ searches, lastSearchedAt: now, nextSearchAt: nextSearchAfter(searches, now) })
        .where(
          and(
            eq(subtitleWanted.itemId, r.itemId),
            eq(subtitleWanted.mediaFileId, r.mediaFileId),
            eq(subtitleWanted.language, r.language),
            eq(subtitleWanted.forced, r.forced),
            eq(subtitleWanted.hi, r.hi),
          ),
        )
        .run()
    }
  }

  /** How many movies want something: the stats card and A10's tab count. */
  const total = (): number =>
    db
      .select({ n: countDistinct(subtitleWanted.itemId) })
      .from(subtitleWanted)
      .get()?.n ?? 0

  /** A10's Wanted tab: movies by sort title, cursor-paged (judgement call 7). */
  function list(cursor?: string, limit = WANTED_LIMIT): WantedPage {
    const n = Math.min(Math.max(1, limit), MAX_LIMIT)
    const c = cursor ? decode(cursor) : null
    const rows = db
      .select({
        id: mediaItems.id,
        tmdbId: mediaItems.tmdbId,
        title: mediaItems.title,
        sortTitle: mediaItems.sortTitle,
        year: mediaItems.year,
        path: mediaItems.path,
        profileId: mediaItems.languageProfileId,
      })
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.type, 'movie'),
          sql`exists (select 1 from ${subtitleWanted} where ${subtitleWanted.itemId} = ${mediaItems.id})`,
          c
            ? or(
                gt(mediaItems.sortTitle, c.t),
                and(eq(mediaItems.sortTitle, c.t), gt(mediaItems.id, c.i)),
              )
            : undefined,
        ),
      )
      .orderBy(asc(mediaItems.sortTitle), asc(mediaItems.id))
      .limit(n + 1)
      .all()
    const page = rows.slice(0, n)
    const languages = new Map<string, Set<string>>()
    if (page.length > 0)
      for (const r of db
        .select({ itemId: subtitleWanted.itemId, language: subtitleWanted.language })
        .from(subtitleWanted)
        .where(
          inArray(
            subtitleWanted.itemId,
            page.map((p) => p.id),
          ),
        )
        .all()) {
        const set = languages.get(r.itemId) ?? new Set()
        set.add(r.language)
        languages.set(r.itemId, set)
      }
    const items = page.map((r) => {
      const codes = languages.get(r.id) ?? new Set<string>()
      const order =
        (r.profileId ? profiles.find(r.profileId)?.languages : undefined)?.map((l) => l.code) ?? []
      const missingLanguages = [...codes].sort(
        (a, b) =>
          (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999) || a.localeCompare(b),
      )
      return {
        movie: { id: r.tmdbId, title: r.title, year: r.year, path: r.path },
        missingLanguages,
      }
    })
    const last = page[page.length - 1]
    return {
      items,
      next: rows.length > n && last ? encode({ t: last.sortTitle, i: last.id }) : null,
      total: total(),
    }
  }

  /** How many rows exist: tests check the scale against it. */
  const rows = (): number => db.select({ n: count() }).from(subtitleWanted).get()?.n ?? 0

  return { wantsOf, refresh, refreshAll, forFile, dueFiles, allFiles, searched, list, total, rows }
}

export type Wanted = ReturnType<typeof createWanted>

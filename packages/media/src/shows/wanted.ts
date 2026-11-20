// SPDX-License-Identifier: AGPL-3.0-only
// Shows' Wanted (Phase 5 C1, HT-109; ADR 0045 § C1): what a show is still looking for and when to
// look again, as films' wanted.ts is for films.
// - Missing: monitored, aired episodes of monitored shows with no file.
// - Cutoff unmet: an episode's file under its show's profile's cutoff, where the profile allows
//   upgrades, kept on the episode's row (`cutoff_unmet`) by the import, the scan and a profile's
//   change, so Wanted reads it rather than weighing every file.
// - The backlog sweep: the shows due a search, never searched first, then those searched longest
//   ago, each pushed back 1, 3, 7, then 14 days (films' waits), written before the search runs so a
//   repeated job searches nothing twice. The backoff lives on the show's row: a show is searched a
//   season at a time, so its episodes share one turn.
// - RSS's targets: the monitored shows a new release could be for.
// - The calendar: each monitored episode of a monitored show on its air date.

import { basename } from 'node:path'
import type {
  EpisodeCalendarEntry,
  WantedEpisode,
  WantedEpisodePage,
} from '@highsea-tv/api-contract'
import { WANTED_TOPICS } from '@highsea-tv/api-contract'
import { schema } from '@highsea-tv/db'
import { parse } from '@highsea-tv/parser'
import {
  type ExistingFile,
  existingFile,
  isCutoffMet,
  isQualityName,
  qualityOf,
} from '@highsea-tv/quality'
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { SWEEP_BACKOFF_DAYS } from '../movies/wanted.ts'
import type { Media } from '../shared/index.ts'
import { artOf, type ItemRow } from '../shared/map.ts'
import { dayOf } from '../shared/names.ts'
import { chunks } from '../shared/sql.ts'
import type { ShowsDeps } from './context.ts'

const { mediaItems, mediaFiles, versions, showDetails, downloads } = schema

const DAY = 24 * 60 * 60 * 1000

/** How many shows one sweep looks at, at most; its searches are capped apart (show-search.ts). */
export const SHOW_SWEEP_SIZE = 10

/** A show RSS matches releases against. */
export type ShowRssTarget = {
  tmdbId: number
  tvdbId: number | null
  imdbId: string | null
  title: string
  year: number | null
}

const PAGE = 50

/** A page's cursor: where the next page starts, as an offset (the lists are small and change). */
const offsetOf = (cursor: string | undefined) => {
  const n = cursor ? Number.parseInt(cursor, 10) : 0
  return Number.isSafeInteger(n) && n > 0 ? n : 0
}

/** Episodes of monitored shows, monitored themselves: Sonarr wants both. */
const MONITORED = sql`${mediaItems.monitored} = 1 AND EXISTS (SELECT 1 FROM media_items s WHERE s.id = ${mediaItems.showId} AND s.monitored = 1)`
/** With no file in any version. */
const NO_FILE = sql`NOT EXISTS (SELECT 1 FROM versions v WHERE v.item_id = ${mediaItems.id} AND v.file_id IS NOT NULL)`

export function createShowWanted(ctx: ShowsDeps, deps: { media: Media }) {
  const { db, clock, events, metadata } = ctx
  const { media } = deps
  const log = ctx.logger.child('show-wanted')
  const today = () => dayOf(clock.now())

  // ------------------------------------------------------------ files and the cutoff

  /** An episode file as the decision engine weighs an upgrade over it, under a profile. */
  function existingOf(
    file: { path: string; size: number; quality: string | null; sceneName: string | null },
    profile: ReturnType<Media['profiles']['get']>,
    originalLanguage: string | null,
  ): ExistingFile {
    const release = parse(file.sceneName ?? basename(file.path))
    return existingFile({
      quality:
        file.quality && isQualityName(file.quality) ? file.quality : qualityOf(release.quality),
      release,
      size: file.size,
      profile,
      formats: media.customFormats(),
      originalLanguage,
    })
  }

  /** Each of a show's episode items with a file, with that file as an upgrade weighs it. */
  function existingFiles(show: ItemRow): Map<string, ExistingFile> {
    const out = new Map<string, ExistingFile>()
    let profile: ReturnType<Media['profiles']['get']>
    try {
      profile = media.profiles.get(show.qualityProfileId)
    } catch {
      return out
    }
    const language = metadata.cachedShow(show.tmdbId)?.originalLanguage ?? null
    const rows = db
      .select({
        itemId: versions.itemId,
        fileId: mediaFiles.id,
        path: mediaFiles.path,
        size: mediaFiles.size,
        quality: mediaFiles.quality,
        sceneName: mediaFiles.sceneName,
      })
      .from(versions)
      .innerJoin(mediaItems, eq(mediaItems.id, versions.itemId))
      .innerJoin(mediaFiles, eq(mediaFiles.id, versions.fileId))
      .where(eq(mediaItems.showId, show.id))
      .all()
    const byFile = new Map<string, ExistingFile>()
    for (const r of rows) {
      let existing = byFile.get(r.fileId)
      if (!existing) {
        existing = existingOf(r, profile, language)
        byFile.set(r.fileId, existing)
      }
      out.set(r.itemId, existing)
    }
    return out
  }

  /**
   * Recomputes `cutoff_unmet` for a show's episodes, after an import, a scan, or a change of the
   * show's profile. A show with an episode newly under its cutoff starts its sweep afresh. Returns
   * how many episodes changed.
   */
  function refreshCutoff(showId: string): number {
    const show = db.select().from(mediaItems).where(eq(mediaItems.id, showId)).get()
    if (show?.type !== 'show') return 0
    let profile: ReturnType<Media['profiles']['get']> | null = null
    try {
      profile = media.profiles.get(show.qualityProfileId)
    } catch {
      profile = null
    }
    const files = existingFiles(show)
    const episodes = db
      .select({ id: mediaItems.id, cutoffUnmet: mediaItems.cutoffUnmet })
      .from(mediaItems)
      .where(and(eq(mediaItems.showId, show.id), eq(mediaItems.type, 'episode')))
      .all()
    const now = clock.now()
    let changed = 0
    let newlyUnmet = false
    for (const e of episodes) {
      const existing = files.get(e.id)
      const unmet =
        !!profile && profile.upgradeAllowed && !!existing && !isCutoffMet(profile, existing)
      if (unmet === e.cutoffUnmet) continue
      db.update(mediaItems)
        .set({ cutoffUnmet: unmet, updatedAt: now })
        .where(eq(mediaItems.id, e.id))
        .run()
      changed++
      if (unmet) newlyUnmet = true
    }
    if (newlyUnmet)
      db.update(mediaItems)
        .set({ nextSearchAt: null, searches: 0 })
        .where(eq(mediaItems.id, show.id))
        .run()
    if (changed) events.emit({ topic: WANTED_TOPICS.wanted })
    return changed
  }

  /** Every show's cutoff, at boot and after a profile changes. Safe to repeat. */
  function backfill(): number {
    let changed = 0
    for (const s of db
      .select({ id: mediaItems.id })
      .from(mediaItems)
      .where(eq(mediaItems.type, 'show'))
      .all())
      changed += refreshCutoff(s.id)
    if (changed) log.info('brought the shows’ wanted list up to date', { changed })
    return changed
  }

  /**
   * Shows highsea looks after: not in a root folder it only reads (ADR 0063), whose files someone
   * else (Sonarr, the owner) keeps. Such a show is never searched, grabbed or upgraded on its own,
   * and its episodes stay off Wanted. `show` is the column holding the show's id. The folders are
   * read each call, so turning a folder to managed takes effect at once.
   */
  function looksAfter(show: typeof mediaItems.id | typeof mediaItems.showId) {
    const roots = media.rootFolders
      .list()
      .map((r) => media.rootFolders.readOnlyAt(r.path))
      .filter((r): r is string => r !== null)
    if (!roots.length) return sql`1 = 1`
    // a prefix compare, not LIKE, so a folder name's `_` or `%` matches only itself
    const inside = sql.join(
      roots.map(
        (root) => sql`(s.path = ${root} OR substr(s.path, 1, ${root.length + 1}) = ${`${root}/`})`,
      ),
      sql` OR `,
    )
    return sql`NOT EXISTS (SELECT 1 FROM media_items s WHERE s.id = ${show} AND s.path IS NOT NULL AND (${inside}))`
  }

  // ------------------------------------------------------------ the sweep and RSS

  /** A show still wanting something: an aired, missing episode, or one under its cutoff. */
  const wantsSomething = (day: string) =>
    sql`EXISTS (SELECT 1 FROM media_items e WHERE e.show_id = ${mediaItems.id} AND e.type = 'episode' AND e.monitored = 1 AND ((e.release_date IS NOT NULL AND e.release_date <= ${day} AND NOT EXISTS (SELECT 1 FROM versions v WHERE v.item_id = e.id AND v.file_id IS NOT NULL)) OR e.cutoff_unmet = 1))`

  /**
   * The sweep's shows: monitored, wanting something, whose next search is due, the ones never
   * searched first and then those searched longest ago. Each is pushed back before it's returned,
   * so a second run in the same window finds nothing (ADR 0022).
   */
  function takeDue(limit = SHOW_SWEEP_SIZE): number[] {
    const now = clock.now()
    const rows = db
      .select({ id: mediaItems.id, tmdbId: mediaItems.tmdbId, searches: mediaItems.searches })
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.type, 'show'),
          eq(mediaItems.monitored, true),
          sql`(${mediaItems.nextSearchAt} IS NULL OR ${mediaItems.nextSearchAt} <= ${now})`,
          wantsSomething(today()),
          looksAfter(mediaItems.id),
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

  /** A show the sweep took but didn't reach: due again at once, its count as it was. */
  function reschedule(tmdbId: number) {
    db.update(mediaItems)
      .set({
        nextSearchAt: null,
        searches: sql`max(${mediaItems.searches} - 1, 0)`,
      })
      .where(and(eq(mediaItems.type, 'show'), eq(mediaItems.tmdbId, tmdbId)))
      .run()
  }

  /** After a search grabbed something for a show: its backoff starts again from a day. */
  function found(tmdbId: number) {
    db.update(mediaItems)
      .set({ searches: 0 })
      .where(and(eq(mediaItems.type, 'show'), eq(mediaItems.tmdbId, tmdbId)))
      .run()
  }

  /**
   * Every show RSS could grab for: monitored, with a monitored episode missing (aired, or airing
   * by tomorrow, since a feed's release may come before the air date reaches this server's day) or
   * under its cutoff.
   */
  function rssTargets(): ShowRssTarget[] {
    const tomorrow = dayOf(clock.now() + DAY)
    const rows = db
      .select({
        tmdbId: mediaItems.tmdbId,
        title: mediaItems.title,
        year: mediaItems.year,
        tvdbId: showDetails.tvdbId,
        imdbId: showDetails.imdbId,
      })
      .from(mediaItems)
      .leftJoin(showDetails, eq(showDetails.itemId, mediaItems.id))
      .where(
        and(
          eq(mediaItems.type, 'show'),
          eq(mediaItems.monitored, true),
          wantsSomething(tomorrow),
          looksAfter(mediaItems.id),
        ),
      )
      .all()
    return rows.map((r) => {
      const meta = r.tvdbId && r.imdbId ? null : metadata.cachedShow(r.tmdbId)
      return {
        tmdbId: r.tmdbId,
        tvdbId: r.tvdbId ?? meta?.tvdbId ?? null,
        imdbId: r.imdbId ?? meta?.imdbId ?? null,
        title: r.title,
        year: r.year,
      }
    })
  }

  // ------------------------------------------------------------ the lists and the calendar

  /** The episode items a show's downloads in the queue bring. */
  function downloading(showIds: readonly string[]): Set<string> {
    if (!showIds.length) return new Set()
    return new Set(
      db
        .select({ episodeIds: downloads.episodeIds })
        .from(downloads)
        .where(
          and(
            inArray(downloads.itemId, [...showIds]),
            inArray(downloads.state, ['downloading', 'importing', 'import-blocked']),
          ),
        )
        .all()
        .flatMap((d) => d.episodeIds ?? []),
    )
  }

  /** Episode rows as Wanted and the calendar show them. */
  function toWanted(rows: ItemRow[]): WantedEpisode[] {
    if (!rows.length) return []
    const showIds = [...new Set(rows.map((r) => r.showId).filter((x): x is string => !!x))]
    const shows = new Map<string, ItemRow>()
    for (const part of chunks(showIds))
      for (const s of db.select().from(mediaItems).where(inArray(mediaItems.id, part)).all())
        shows.set(s.id, s)
    const files = new Map<string, string | null>()
    for (const part of chunks(rows.map((r) => r.id)))
      for (const f of db
        .select({ itemId: versions.itemId, quality: mediaFiles.quality })
        .from(versions)
        .innerJoin(mediaFiles, eq(mediaFiles.id, versions.fileId))
        .where(inArray(versions.itemId, part))
        .all())
        files.set(f.itemId, f.quality)
    const busy = downloading(showIds)
    const day = today()
    const out: WantedEpisode[] = []
    for (const e of rows) {
      const show = e.showId ? shows.get(e.showId) : undefined
      if (!show) continue
      const meta = metadata.cachedShow(show.tmdbId)
      const hasFile = files.has(e.id)
      const status: WantedEpisode['episode']['status'] = hasFile
        ? e.cutoffUnmet
          ? 'cutoff-unmet'
          : 'available'
        : busy.has(e.id) || e.status === 'downloading'
          ? 'downloading'
          : !e.releaseDate || e.releaseDate > day
            ? 'unaired'
            : 'missing'
      out.push({
        show: {
          id: String(show.tmdbId),
          title: show.title,
          year: show.year,
          poster: meta ? (artOf(meta.art).poster ?? null) : null,
          qualityProfileId: show.qualityProfileId,
        },
        episode: {
          id: String(e.tmdbId),
          season: e.seasonNumber ?? 0,
          number: e.episodeNumber ?? 0,
          title: e.title,
          aired: e.releaseDate,
          status,
          quality: hasFile ? (files.get(e.id) ?? null) : null,
        },
      })
    }
    return out
  }

  function page(where: ReturnType<typeof and>, query: { cursor?: string; limit?: number }) {
    const limit = query.limit ?? PAGE
    const offset = offsetOf(query.cursor)
    const total =
      db.select({ n: sql<number>`count(*)` }).from(mediaItems).where(where).get()?.n ?? 0
    const rows = db
      .select()
      .from(mediaItems)
      .where(where)
      .orderBy(desc(mediaItems.releaseDate), asc(mediaItems.id))
      .limit(limit)
      .offset(offset)
      .all()
    const next = offset + rows.length < total ? String(offset + rows.length) : null
    return { items: toWanted(rows), total, next } satisfies WantedEpisodePage
  }

  /**
   * Wanted › Missing's episodes: monitored, aired, of a monitored show highsea looks after, with no
   * file.
   */
  const missing = (query: { cursor?: string; limit?: number } = {}): WantedEpisodePage =>
    page(
      and(
        eq(mediaItems.type, 'episode'),
        MONITORED,
        sql`${mediaItems.releaseDate} IS NOT NULL AND ${mediaItems.releaseDate} <= ${today()}`,
        NO_FILE,
        looksAfter(mediaItems.showId),
      ),
      query,
    )

  /** Wanted › Cutoff unmet's episodes: monitored, of a show highsea looks after, under the cutoff. */
  const cutoff = (query: { cursor?: string; limit?: number } = {}): WantedEpisodePage =>
    page(
      and(
        eq(mediaItems.type, 'episode'),
        MONITORED,
        eq(mediaItems.cutoffUnmet, true),
        looksAfter(mediaItems.showId),
      ),
      query,
    )

  /** Every episode on one of the lists, for Search all: its show and its numbers. */
  function all(list: 'missing' | 'cutoff') {
    const out: { tmdbId: number; season: number; episode: number }[] = []
    let cursor: string | undefined
    for (;;) {
      const p =
        list === 'missing' ? missing({ cursor, limit: 200 }) : cutoff({ cursor, limit: 200 })
      for (const x of p.items)
        out.push({ tmdbId: Number(x.show.id), season: x.episode.season, episode: x.episode.number })
      if (!p.next) break
      cursor = p.next
    }
    return out
  }

  /** The calendar: each monitored episode of a monitored show airing between two days. */
  function calendar(from: string, to: string): EpisodeCalendarEntry[] {
    const rows = db
      .select()
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.type, 'episode'),
          MONITORED,
          gte(mediaItems.releaseDate, from),
          lte(mediaItems.releaseDate, to),
        ),
      )
      .orderBy(asc(mediaItems.releaseDate), asc(mediaItems.id))
      .limit(5_000)
      .all()
    return toWanted(rows).map((episode) => ({
      date: episode.episode.aired ?? '',
      kind: 'episode' as const,
      episode,
    }))
  }

  return {
    existingFiles,
    refreshCutoff,
    backfill,
    takeDue,
    reschedule,
    found,
    rssTargets,
    looksAfterShow: (path: string | null) => !path || media.rootFolders.readOnlyAt(path) === null,
    missing,
    cutoff,
    all,
    calendar,
  }
}

export type ShowWanted = ReturnType<typeof createShowWanted>

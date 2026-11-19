// SPDX-License-Identifier: AGPL-3.0-only
// The shows library's first part (ADR 0064): a show added from TMDB with its seasons and episodes,
// each a `media_items` row in the unified tree (ADR 0012) — season under show, episode under
// season, `show_id` on both — and kept in step with TMDB on every refresh. A show is addressed by
// its TMDB id, a season by its show and number, an episode by its TMDB episode id. TMDB's facts stay
// in the metadata cache (ADR 0030); the rows carry what the library sorts, filters and searches on.

import { join } from 'node:path'
import type { AddSeriesInput, ShowMonitor } from '@highsea-tv/api-contract'
import { AppError, newId } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import type { LibraryStatus } from '@highsea-tv/db/schema'
import type { EpisodeMetadata, SeasonMetadata, ShowMetadata } from '@highsea-tv/metadata'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { invalid } from '../shared/context.ts'
import type { Media } from '../shared/index.ts'
import { dayOf, sortTitleOf, titlePath } from '../shared/names.ts'
import { announce, type ShowsDeps } from './context.ts'

const { mediaItems, versions, mediaFiles, showDetails, languageProfiles } = schema

type ItemRow = typeof mediaItems.$inferSelect
type Insert = typeof mediaItems.$inferInsert

/** `Season 01`, Sonarr's default season folder (`Season {season:00}`), `Specials` for season 0. */
export const seasonFolder = (n: number) =>
  n === 0 ? 'Specials' : `Season ${String(n).padStart(2, '0')}`

/** An episode's file came or is coming: the refresh leaves its status to importing. */
export const keepStatus = (s: LibraryStatus) => s === 'available' || s === 'downloading'

/**
 * What the add's `monitor` choice monitors, as Sonarr's options do (Servarr wiki, Sonarr Library ›
 * Monitoring: https://wiki.servarr.com/sonarr/library#monitoring-options). Specials are left out
 * of every choice, as Sonarr leaves them; the owner monitors them by hand. At add no episode has a
 * file yet, so Missing is All until import (B's next task) brings files.
 */
export function monitorsEpisode(monitor: ShowMonitor, e: EpisodeMetadata, today: string): boolean {
  if (e.season === 0) return false
  switch (monitor) {
    case 'all':
    case 'missing':
      return true
    case 'future':
      return !e.aired || e.aired > today
    case 'first-season':
      return e.season === 1
    case 'none':
      return false
  }
}

export const aired = (e: { aired: string | null }, today: string) => !!e.aired && e.aired <= today

/** An episode waits for its air date; a season or show for none. */
export const statusOf = (released: boolean, monitored: boolean): LibraryStatus =>
  !released ? 'not-released' : monitored ? 'wanted' : 'unmonitored'

export function createShowLibrary(ctx: ShowsDeps, media: Media) {
  const { db, clock, events, metadata, logger } = ctx
  const log = logger.child('shows')
  const today = () => dayOf(clock.now())

  const showRow = (tmdbId: number) =>
    db
      .select()
      .from(mediaItems)
      .where(and(eq(mediaItems.type, 'show'), eq(mediaItems.tmdbId, tmdbId)))
      .get()

  const childrenOf = (showId: string) =>
    db.select().from(mediaItems).where(eq(mediaItems.showId, showId)).all()

  function requireFolder(path: string) {
    const folder = media.rootFolders.find(path, 'shows')
    if (!folder) throw invalid('Pick one of the shows’ root folders.', 'unknown-root-folder')
    return folder.path
  }

  function checkLanguageProfile(id: string | null) {
    if (id === null) return
    const row = db
      .select({ id: languageProfiles.id })
      .from(languageProfiles)
      .where(eq(languageProfiles.id, id))
      .get()
    if (!row)
      throw new AppError('not-found', 'That language profile doesn’t exist.', {
        reason: 'unknown-language-profile',
      })
  }

  /** Items whose rows must stay: an episode with a file, or one a version points a file at. */
  function withFiles(itemIds: string[]): Set<string> {
    if (itemIds.length === 0) return new Set()
    const owned = db
      .select({ id: mediaFiles.itemId })
      .from(mediaFiles)
      .where(inArray(mediaFiles.itemId, itemIds))
      .all()
    const pointed = db
      .select({ id: versions.itemId })
      .from(versions)
      .where(and(inArray(versions.itemId, itemIds), isNotNull(versions.fileId)))
      .all()
    return new Set([...owned, ...pointed].map((r) => r.id))
  }

  const showColumns = (meta: ShowMetadata) => ({
    title: meta.title,
    sortTitle: sortTitleOf(meta.title),
    year: meta.year,
    rating: meta.rating,
    releaseDate: meta.firstAired,
  })

  const seasonColumns = (meta: ShowMetadata, s: SeasonMetadata) => ({
    tmdbId: s.id,
    seasonNumber: s.number,
    title: s.title,
    sortTitle: sortTitleOf(meta.title),
    year: s.year,
    rating: 0,
    releaseDate: s.aired,
  })

  const episodeColumns = (meta: ShowMetadata, e: EpisodeMetadata) => ({
    tmdbId: e.id,
    seasonNumber: e.season,
    episodeNumber: e.number,
    title: e.title,
    sortTitle: sortTitleOf(meta.title),
    year: e.aired ? Number(e.aired.slice(0, 4)) : null,
    rating: e.rating,
    releaseDate: e.aired,
  })

  /**
   * Brings a show's rows up to date with its cached metadata, safe to run any number of times:
   * - each TMDB season and episode is matched to its row by TMDB id first, then by its numbers,
   *   so a renumbered episode keeps its row, its files and its watch state;
   * - new ones are added, an episode monitored when its season is (as Sonarr monitors new
   *   episodes of a monitored season);
   * - a row TMDB no longer lists is removed unless a file is attached, so nothing on disk loses
   *   its place.
   * Returns whether anything changed.
   */
  function syncShow(show: ItemRow, meta: ShowMetadata, monitor?: ShowMonitor): boolean {
    const now = clock.now()
    const day = today()
    const details = db.select().from(showDetails).where(eq(showDetails.itemId, show.id)).get()
    const seasonFolders = details?.seasonFolders ?? true
    let changed = false

    const update = (row: ItemRow, set: Partial<Insert>) => {
      const keys = Object.keys(set) as (keyof Insert)[]
      if (keys.every((k) => (row as Record<string, unknown>)[k] === set[k])) return
      db.update(mediaItems)
        .set({ ...set, updatedAt: now })
        .where(eq(mediaItems.id, row.id))
        .run()
      changed = true
    }
    const inherited = {
      monitored: false,
      minimumAvailability: show.minimumAvailability,
      qualityProfileId: show.qualityProfileId,
      languageProfileId: show.languageProfileId,
      rootFolder: show.rootFolder,
      addedAt: now,
      updatedAt: now,
    }

    db.transaction(() => {
      update(show, {
        ...showColumns(meta),
        status: keepStatus(show.status) ? show.status : statusOf(true, show.monitored),
      })
      if (details) {
        if (details.tvdbId !== meta.tvdbId || details.imdbId !== meta.imdbId) {
          db.update(showDetails)
            .set({ tvdbId: meta.tvdbId, imdbId: meta.imdbId })
            .where(eq(showDetails.itemId, show.id))
            .run()
          changed = true
        }
      }

      const rows = childrenOf(show.id)
      const seasonRows = rows.filter((r) => r.type === 'season')
      const episodeRows = rows.filter((r) => r.type === 'episode')
      const keptSeasons = new Set<string>()
      const keptEpisodes = new Set<string>()

      for (const s of meta.seasons) {
        const path = seasonFolders ? join(show.path, seasonFolder(s.number)) : show.path
        let season =
          seasonRows.find((r) => r.tmdbId === s.id && !keptSeasons.has(r.id)) ??
          seasonRows.find((r) => r.seasonNumber === s.number && !keptSeasons.has(r.id))
        const seasonMonitored =
          monitor !== undefined
            ? s.episodes.some((e) => monitorsEpisode(monitor, e, day))
            : (season?.monitored ?? (show.monitored && s.number > 0))
        if (season) {
          update(season, {
            ...seasonColumns(meta, s),
            path,
            ...(monitor !== undefined ? { monitored: seasonMonitored } : {}),
            status: statusOf(true, monitor !== undefined ? seasonMonitored : season.monitored),
          })
        } else {
          const id = newId('itm')
          db.insert(mediaItems)
            .values({
              ...inherited,
              id,
              type: 'season',
              parentId: show.id,
              showId: show.id,
              ...seasonColumns(meta, s),
              monitored: seasonMonitored,
              status: statusOf(true, seasonMonitored),
              path,
            })
            .run()
          season = db.select().from(mediaItems).where(eq(mediaItems.id, id)).get() as ItemRow
          changed = true
        }
        keptSeasons.add(season.id)

        for (const e of s.episodes) {
          const row =
            episodeRows.find((r) => r.tmdbId === e.id && !keptEpisodes.has(r.id)) ??
            episodeRows.find(
              (r) =>
                r.seasonNumber === e.season &&
                r.episodeNumber === e.number &&
                !keptEpisodes.has(r.id),
            )
          const monitored =
            monitor !== undefined
              ? monitorsEpisode(monitor, e, day)
              : (row?.monitored ?? season.monitored)
          if (row) {
            keptEpisodes.add(row.id)
            update(row, {
              ...episodeColumns(meta, e),
              parentId: season.id,
              path,
              ...(monitor !== undefined ? { monitored } : {}),
              status: keepStatus(row.status) ? row.status : statusOf(aired(e, day), monitored),
            })
            continue
          }
          const id = newId('itm')
          db.insert(mediaItems)
            .values({
              ...inherited,
              id,
              type: 'episode',
              parentId: season.id,
              showId: show.id,
              ...episodeColumns(meta, e),
              monitored,
              status: statusOf(aired(e, day), monitored),
              path,
            })
            // a TMDB episode id already filed under another show (TMDB merged two): leave it there
            .onConflictDoNothing({ target: [mediaItems.type, mediaItems.tmdbId] })
            .run()
          // one version an episode, which its file (or a multi-episode file) fills (ADR 0064)
          db.insert(versions)
            .values({
              id: newId('ver'),
              itemId: id,
              label: 'Default',
              qualityProfileId: show.qualityProfileId,
              fileId: null,
              position: 0,
              createdAt: now,
            })
            .onConflictDoNothing()
            .run()
          keptEpisodes.add(id)
          changed = true
        }
      }

      // what TMDB no longer lists goes, unless a file holds it
      const goneEpisodes = episodeRows.filter((r) => !keptEpisodes.has(r.id))
      const held = withFiles(goneEpisodes.map((r) => r.id))
      const drop = goneEpisodes.filter((r) => !held.has(r.id)).map((r) => r.id)
      const goneSeasons = seasonRows
        .filter((r) => !keptSeasons.has(r.id))
        .filter((r) => !goneEpisodes.some((e) => e.parentId === r.id && held.has(e.id)))
        .map((r) => r.id)
      if (drop.length || goneSeasons.length) {
        if (drop.length) db.delete(versions).where(inArray(versions.itemId, drop)).run()
        const ids = [...drop, ...goneSeasons]
        db.delete(mediaItems).where(inArray(mediaItems.id, ids)).run()
        changed = true
        log.info('episodes TMDB no longer lists removed', {
          tmdbId: show.tmdbId,
          episodes: drop.length,
          seasons: goneSeasons.length,
        })
      }
    })
    return changed
  }

  /**
   * Adds a show by TMDB id with every season and episode TMDB lists, fetching its metadata if the
   * server doesn't have it. Adding a show that's already here returns it unchanged. `search` is
   * accepted and not yet acted on: searching for episodes is part C1's. `path` is the show's folder
   * when it's already on disk (the existing-library import adds a show where it is), else
   * `Title (Year)` under the root folder.
   */
  async function add(
    input: AddSeriesInput,
    options: { path?: string } = {},
  ): Promise<{ show: ShowTree; created: boolean }> {
    const existing = showRow(input.tmdbId)
    if (existing) return { show: tree(existing), created: false }
    const rootFolder = requireFolder(input.rootFolder)
    media.profiles.get(input.qualityProfileId)
    const languageProfileId = input.languageProfileId || null
    checkLanguageProfile(languageProfileId)

    const meta = await metadata.show(input.tmdbId)
    const now = clock.now()
    const id = newId('itm')
    const monitored = input.monitor !== 'none'
    const created = db.transaction((tx) => {
      const inserted = tx
        .insert(mediaItems)
        .values({
          id,
          type: 'show',
          tmdbId: input.tmdbId,
          parentId: null,
          ...showColumns(meta),
          status: statusOf(true, monitored),
          monitored,
          // an episode is out when it airs; Radarr's minimum availability has no say over shows
          minimumAvailability: 'released',
          qualityProfileId: input.qualityProfileId,
          languageProfileId,
          rootFolder,
          path: options.path ?? titlePath(rootFolder, meta.title, meta.year),
          addedAt: now,
          updatedAt: now,
        })
        // two adds of one show at once: the second finds the first's row
        .onConflictDoNothing({ target: [mediaItems.type, mediaItems.tmdbId] })
        .returning({ id: mediaItems.id })
        .all()
      if (inserted.length === 0) return false
      tx.insert(showDetails)
        .values({
          itemId: id,
          seasonFolders: input.seasonFolders,
          tvdbId: meta.tvdbId,
          imdbId: meta.imdbId,
        })
        .run()
      return true
    })
    const row = showRow(input.tmdbId) as ItemRow
    if (created) {
      syncShow(row, meta, input.monitor)
      log.info('show added', { tmdbId: input.tmdbId, title: meta.title })
      announce(events, [input.tmdbId])
    }
    return { show: tree(showRow(input.tmdbId) as ItemRow), created }
  }

  /** Brings a library show up to date with the cache; false when it isn't here or isn't cached. */
  function sync(tmdbId: number): boolean {
    const row = showRow(tmdbId)
    const meta = row && metadata.cachedShow(tmdbId)
    if (!row || !meta) return false
    const changed = syncShow(row, meta)
    if (changed) announce(events, [tmdbId])
    return changed
  }

  /** `metadata.updated` with `show:{id}`: the shows refreshed. */
  function onMetadataUpdated(ids: string[]) {
    for (const id of ids) {
      const m = /^show:(\d+)$/.exec(id)
      if (m) sync(Number(m[1]))
    }
  }

  /** A show's rows as a tree: its seasons in order, specials first, each with its episodes. */
  function tree(show: ItemRow): ShowTree {
    const rows = childrenOf(show.id)
    const episodes = rows
      .filter((r) => r.type === 'episode')
      .sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0))
    const details = db.select().from(showDetails).where(eq(showDetails.itemId, show.id)).get()
    return {
      ...show,
      seasonFolders: details?.seasonFolders ?? true,
      tvdbId: details?.tvdbId ?? null,
      imdbId: details?.imdbId ?? null,
      seasons: rows
        .filter((r) => r.type === 'season')
        .sort((a, b) => (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0))
        .map((s) => ({ ...s, episodes: episodes.filter((e) => e.parentId === s.id) })),
    }
  }

  return {
    add,
    /** A show's rows by TMDB id, or null when it isn't in the library. */
    get(tmdbId: number): ShowTree | null {
      const row = showRow(tmdbId)
      return row ? tree(row) : null
    },
    /** Queues TMDB's refresh of the show and its seasons; the rows follow when it lands. */
    refresh(tmdbId: number) {
      if (!showRow(tmdbId)) throw new AppError('not-found', 'That show isn’t in the library.')
      return metadata.refresh(tmdbId, 'show')
    },
    sync,
    internal: { onMetadataUpdated, showRow, tree },
  }
}

export type ShowTree = ItemRow & {
  seasonFolders: boolean
  tvdbId: number | null
  imdbId: string | null
  seasons: (ItemRow & { episodes: ItemRow[] })[]
}

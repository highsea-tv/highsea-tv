// SPDX-License-Identifier: AGPL-3.0-only
// What a show's release search is judged by (Phase 5 C1), as `movies.searchInput` is a film's: the
// show's ids and title, every episode's facts (monitored, with a file, aired, its runtime), the
// show's profile, the custom formats and Settings › Quality's episode sizes. The indexers package
// takes it as its `ShowSearchInput`; `wanted` is the scope's episodes a search looks for.
import { schema } from '@highsea-tv/db'
import { and, asc, eq, isNotNull } from 'drizzle-orm'
import type { Media } from '../shared/index.ts'
import { dayOf } from '../shared/names.ts'
import type { ShowsDeps } from './context.ts'
import { aired } from './library.ts'
import type { ShowSettings } from './settings.ts'

const { mediaItems, showDetails, versions } = schema

export type ShowScope = { season: number; episode?: number | null }

export function createShowSearch(ctx: ShowsDeps, deps: { media: Media; settings: ShowSettings }) {
  const { db, clock, metadata } = ctx
  const { media, settings } = deps

  const showRow = (tmdbId: number) =>
    db
      .select()
      .from(mediaItems)
      .where(and(eq(mediaItems.type, 'show'), eq(mediaItems.tmdbId, tmdbId)))
      .get() ?? null

  /** The show's episodes with whether each has a file, in order. */
  function episodeRows(showId: string) {
    const rows = db
      .select()
      .from(mediaItems)
      .where(and(eq(mediaItems.showId, showId), eq(mediaItems.type, 'episode')))
      .orderBy(asc(mediaItems.seasonNumber), asc(mediaItems.episodeNumber))
      .all()
    const withFile = new Set(
      db
        .select({ itemId: versions.itemId })
        .from(versions)
        .innerJoin(mediaItems, eq(mediaItems.id, versions.itemId))
        .where(and(eq(mediaItems.showId, showId), isNotNull(versions.fileId)))
        .all()
        .map((v) => v.itemId),
    )
    return { rows, withFile }
  }

  const inScope = (
    e: { seasonNumber: number | null; episodeNumber: number | null },
    s: ShowScope,
  ) => e.seasonNumber === s.season && (s.episode == null || e.episodeNumber === s.episode)

  /** Null when the show isn't in the library. */
  function input(tmdbId: number, scope: ShowScope) {
    const show = showRow(tmdbId)
    if (!show) return null
    const meta = metadata.cachedShow(tmdbId)
    const details = db.select().from(showDetails).where(eq(showDetails.itemId, show.id)).get()
    const today = dayOf(clock.now())
    const { rows, withFile } = episodeRows(show.id)
    const runtime = (season: number, n: number) =>
      meta?.seasons.find((s) => s.number === season)?.episodes.find((e) => e.number === n)
        ?.runtimeMinutes ??
      meta?.runtimeMinutes ??
      null
    const episodes = rows.map((e) => ({
      id: e.id,
      season: e.seasonNumber ?? 0,
      episode: e.episodeNumber ?? 0,
      runtimeMinutes: runtime(e.seasonNumber ?? 0, e.episodeNumber ?? 0),
      monitored: e.monitored,
      hasFile: withFile.has(e.id),
      aired: aired({ aired: e.releaseDate }, today),
    }))
    const wanted = episodes
      .filter(
        (e) =>
          e.monitored &&
          !e.hasFile &&
          e.aired &&
          inScope({ seasonNumber: e.season, episodeNumber: e.episode }, scope),
      )
      .map((e) => e.id)
    return {
      showItemId: show.id,
      wanted,
      search: {
        tmdbId,
        tvdbId: details?.tvdbId ?? meta?.tvdbId ?? null,
        imdbId: details?.imdbId ?? meta?.imdbId ?? null,
        title: show.title,
        year: show.year,
        originalLanguage: meta?.originalLanguage ?? null,
        scope,
        episodes,
        profile: media.profiles.get(show.qualityProfileId),
        formats: media.customFormats(),
        sizes: settings.sizes(),
        // an indexer with tags serves only titles sharing one (checkpoint 8c)
        tags: media.tags.ofItems([show.id]).get(show.id) ?? [],
      },
    }
  }

  /**
   * What a Search on the show, a season or an episode looks for: the scopes to search, a season at
   * a time (its pack may bring it all), and the wanted episodes in each.
   */
  function plan(tmdbId: number, within?: ShowScope) {
    const show = showRow(tmdbId)
    if (!show) return []
    const today = dayOf(clock.now())
    const { rows, withFile } = episodeRows(show.id)
    const wanted = rows.filter(
      (e) =>
        e.monitored &&
        !withFile.has(e.id) &&
        aired({ aired: e.releaseDate }, today) &&
        (!within || inScope(e, within)),
    )
    const seasons = [...new Set(wanted.map((e) => e.seasonNumber ?? 0))]
    return seasons.map((season) => {
      const ids = wanted.filter((e) => e.seasonNumber === season)
      // one episode asked for is searched as itself; a season's as the season
      const one = within?.episode != null && ids.length === 1 ? ids[0] : undefined
      return {
        scope: one ? { season, episode: one.episodeNumber ?? 0 } : { season },
        wanted: ids.map((e) => e.id),
      }
    })
  }

  return { input, plan, showRow }
}

export type ShowSearch = ReturnType<typeof createShowSearch>

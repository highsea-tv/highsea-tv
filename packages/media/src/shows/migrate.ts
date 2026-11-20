// SPDX-License-Identifier: AGPL-3.0-only
// Adding a show another program already manages, where it is (Phase 5 C1, the Sonarr importer;
// ADR 0041), in the shape of films' `movies/migrate.ts`. The Sonarr importer hands each series
// here: added by TMDB id in its own folder, then made to match what Sonarr had: the show's
// monitoring and profile, each season's and episode's monitoring, its tags, and each of its files
// filed under the episodes Sonarr says it holds, probed again by highsea rather than trusted.
//
// Nothing on disk is moved, renamed or deleted: a file is filed where it is (shows/files.ts's
// `assign`), so a folder highsea only reads (ADR 0063) is safe.
//
// Safe to repeat (ADR 0022), and a second run changes only what differs: the show is found rather
// than added again, a monitored flag or profile is written only when it differs, a file already
// filed under the same episodes at the same size isn't probed again, a tag link is written once.
// A show already in the library (from the library import, B) is brought in line with Sonarr the
// same way, since Sonarr is where the owner kept its monitoring until now.
import { promises as fsp } from 'node:fs'
import { schema } from '@highsea-tv/db'
import { and, eq, inArray, or } from 'drizzle-orm'
import type { Media } from '../shared/index.ts'
import { dayOf } from '../shared/names.ts'
import { checkPath, isWithin } from '../shared/paths.ts'
import { chunks } from '../shared/sql.ts'
import { tagIdsFor } from '../shared/tags.ts'
import { announce, type ShowsDeps } from './context.ts'
import type { ShowFiles } from './files.ts'
import { type createShowLibrary, keepStatus, statusOf } from './library.ts'

const { mediaItems, mediaFiles, mediaItemTags, versions, showDetails } = schema

type ItemRow = typeof mediaItems.$inferSelect

export type EpisodeRef = { season: number; episode: number }

export type ShowInPlaceInput = {
  tmdbId: number
  /** One of the Shows root folders, by path. */
  rootFolder: string
  /** The show's own folder, inside the root folder. */
  folder: string
  monitored: boolean
  /** Season folders (`Season 01`), as the other program kept them. Set only on a show added now. */
  seasonFolders: boolean
  qualityProfileId: string
  /** Each season's monitoring by its number; a season left out keeps highsea's. */
  seasons: readonly { season: number; monitored: boolean }[]
  /** Each episode's monitoring by its numbers; one left out keeps highsea's. */
  episodes: readonly (EpisodeRef & { monitored: boolean })[]
  /** The files, each with the episodes it holds. */
  files: readonly { path: string; episodes: readonly EpisodeRef[]; sceneName: string | null }[]
  tags: readonly string[]
  /** The history's message for a file filed now. */
  message: string
}

export type ShowInPlaceResult = {
  /** False when the show was already in the library. */
  added: boolean
  /** Monitoring, the profile or tags written because they differed. */
  changed: boolean
  files: { filed: number; already: number }
  /** What couldn't be placed: a file or an episode, with why. */
  unmatched: { what: string; message: string }[]
}

const code = (e: EpisodeRef) =>
  `S${String(e.season).padStart(2, '0')}E${String(e.episode).padStart(2, '0')}`

export function createShowMigrate(
  ctx: ShowsDeps,
  deps: { media: Media; library: ReturnType<typeof createShowLibrary>; files: ShowFiles },
) {
  const { db, clock, events } = ctx
  const { media, library, files } = deps

  const showRow = (tmdbId: number) => library.internal.showRow(tmdbId)

  /** Which of these TMDB ids are shows in the library. */
  function inLibrary(tmdbIds: readonly number[]): Set<number> {
    const out = new Set<number>()
    for (const part of chunks([...new Set(tmdbIds.filter((id) => id > 0))]))
      for (const r of db
        .select({ tmdbId: mediaItems.tmdbId })
        .from(mediaItems)
        .where(and(eq(mediaItems.type, 'show'), inArray(mediaItems.tmdbId, part)))
        .all())
        if (r.tmdbId) out.add(r.tmdbId)
    return out
  }

  /** The folder a library show is in, or null. */
  const folderOf = (tmdbId: number) => showRow(tmdbId)?.path ?? null

  /** TMDB's show for TheTVDB's id, through TMDB's Find by ID; null when TMDB has none. */
  async function byTvdb(tvdbId: number): Promise<number | null> {
    const found = await ctx.metadata.discover.findByTvdb(tvdbId, 'show')
    return found?.show ?? null
  }

  /** Writes `monitored` and the status that follows, only on the rows where it differs. */
  function monitor(rows: readonly ItemRow[], monitored: boolean): boolean {
    const today = dayOf(clock.now())
    const now = clock.now()
    let changed = false
    for (const r of rows) {
      if (r.monitored === monitored) continue
      const status =
        r.type === 'episode'
          ? keepStatus(r.status)
            ? r.status
            : statusOf(!!r.releaseDate && r.releaseDate <= today, monitored)
          : statusOf(true, monitored)
      db.update(mediaItems)
        .set({ monitored, status, updatedAt: now })
        .where(eq(mediaItems.id, r.id))
        .run()
      changed = true
    }
    return changed
  }

  /** Whether a file is filed already at this size under exactly these episodes: no probe needed. */
  function filedAs(path: string, size: number, episodes: readonly ItemRow[]): boolean {
    const at = db.select().from(mediaFiles).where(eq(mediaFiles.path, path)).get()
    if (!at || at.size !== size) return false
    const vers = files.versionsOf(episodes.map((e) => e.id))
    return episodes.every((e) => vers.get(e.id)?.fileId === at.id)
  }

  async function addInPlace(input: ShowInPlaceInput): Promise<ShowInPlaceResult> {
    const result: ShowInPlaceResult = {
      added: false,
      changed: false,
      files: { filed: 0, already: 0 },
      unmatched: [],
    }
    const profile = media.profiles.get(input.qualityProfileId)
    const folder = checkPath(input.folder, [input.rootFolder])
    const { created } = await library.add(
      {
        tmdbId: input.tmdbId,
        rootFolder: input.rootFolder,
        qualityProfileId: profile.id,
        // subtitles as the folder's default, as a show the library import adds takes it
        languageProfileId: media.rootFolders.find(input.rootFolder)?.languageProfileId ?? null,
        // monitoring is set from Sonarr's below, season by season and episode by episode
        monitor: 'none',
        seasonFolders: input.seasonFolders,
        search: false,
      },
      { path: folder },
    )
    result.added = created
    const show = showRow(input.tmdbId)
    if (!show) {
      result.unmatched.push({ what: 'The show', message: 'The show couldn’t be added.' })
      return result
    }

    // the show, its profile, and every season's and episode's monitoring, where they differ
    const tree = library.internal.tree(show)
    db.transaction(() => {
      if (monitor([show], input.monitored)) result.changed = true
      if (show.qualityProfileId !== profile.id) {
        db.update(mediaItems)
          .set({ qualityProfileId: profile.id, updatedAt: clock.now() })
          .where(or(eq(mediaItems.id, show.id), eq(mediaItems.showId, show.id)))
          .run()
        const ids = tree.seasons.flatMap((s) => s.episodes.map((e) => e.id))
        for (const part of chunks(ids))
          db.update(versions)
            .set({ qualityProfileId: profile.id })
            .where(inArray(versions.itemId, part))
            .run()
        result.changed = true
      }
      for (const s of input.seasons) {
        const row = tree.seasons.find((x) => x.seasonNumber === s.season)
        if (row && monitor([row], s.monitored)) result.changed = true
      }
      const episodes = tree.seasons.flatMap((s) => s.episodes)
      for (const e of input.episodes) {
        const row = episodes.find(
          (x) => x.seasonNumber === e.season && x.episodeNumber === e.episode,
        )
        if (!row) {
          result.unmatched.push({
            what: code(e),
            message: `TMDB lists no ${code(e)} for this show, so its monitoring stays behind.`,
          })
          continue
        }
        if (monitor([row], e.monitored)) result.changed = true
      }
    })

    const before = db
      .select({ tagId: mediaItemTags.tagId })
      .from(mediaItemTags)
      .where(eq(mediaItemTags.itemId, show.id))
      .all()
      .map((r) => r.tagId)
    for (const tagId of tagIdsFor(ctx, input.tags)) {
      if (before.includes(tagId)) continue
      db.insert(mediaItemTags).values({ itemId: show.id, tagId }).onConflictDoNothing().run()
      result.changed = true
    }
    // season folders as the other program kept them, on a show only now added
    if (created) {
      const details = db.select().from(showDetails).where(eq(showDetails.itemId, show.id)).get()
      if (details && details.seasonFolders !== input.seasonFolders)
        db.update(showDetails)
          .set({ seasonFolders: input.seasonFolders })
          .where(eq(showDetails.itemId, show.id))
          .run()
    }

    // the files, each under the episodes the other program says it holds
    const episodes = files.episodesOf(show.id)
    for (const f of input.files) {
      const name = f.path.slice(show.path.length + 1) || f.path
      if (!isWithin(show.path, f.path) || f.path === show.path) {
        result.unmatched.push({
          what: name,
          message: `It isn’t inside the show’s folder, ${show.path}.`,
        })
        continue
      }
      const rows = f.episodes.map((e) => ({
        ref: e,
        row: episodes.find((x) => x.seasonNumber === e.season && x.episodeNumber === e.episode),
      }))
      const missing = rows.filter((r) => !r.row).map((r) => code(r.ref))
      const have = rows.filter((r) => r.row).map((r) => r.row as ItemRow)
      if (have.length === 0) {
        // kept for the admin's Unmatched, where the owner picks its episodes
        const message = missing.length
          ? `TMDB lists no ${missing.join(', ')} for this show.`
          : 'Sonarr gave no episodes for it.'
        const stats = await fsp.stat(f.path).catch(() => null)
        if (stats?.isFile())
          files.unmatched.put({
            path: f.path,
            kind: 'episode-file',
            rootFolder: show.rootFolder,
            itemId: show.id,
            reason: 'unknown-episode',
            message,
            size: stats.size,
          })
        result.unmatched.push({ what: name, message })
        continue
      }
      if (missing.length)
        result.unmatched.push({
          what: name,
          message: `Filed under the rest: TMDB lists no ${missing.join(', ')} for this show.`,
        })
      const stats = await fsp.stat(f.path).catch(() => null)
      if (!stats?.isFile()) {
        result.unmatched.push({ what: name, message: `${f.path} isn’t there.` })
        continue
      }
      if (filedAs(f.path, stats.size, have)) {
        result.files.already++
        continue
      }
      try {
        const done = await files.assign(
          show,
          f.path,
          have.map((e) => ({ season: e.seasonNumber ?? 0, episode: e.episodeNumber ?? 0 })),
          { sceneName: f.sceneName, message: input.message },
        )
        if (done.already) result.files.already++
        else result.files.filed++
      } catch (e) {
        result.unmatched.push({ what: name, message: (e as Error).message })
      }
    }
    if (result.changed) announce(events, [input.tmdbId])
    return result
  }

  return { addInPlace, inLibrary, folderOf, byTvdb }
}

export type ShowMigrate = ReturnType<typeof createShowMigrate>

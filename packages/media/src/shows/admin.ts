// SPDX-License-Identifier: AGPL-3.0-only
// Shows as the admin keeps them (Phase 5 B, ADR 0064): Sonarr's series, seasons and episodes,
// monitored or not, each episode with its file, read from the library's rows and TMDB's cache. The
// admin's id for a show is its TMDB id as a string, an episode's its own TMDB id. Nothing here
// touches a library folder: a show's Edit changes what highsea records, and Remove takes the rows
// out and leaves the files where they are.
import type {
  DiscoverSeries,
  EpisodeMarkersPatch,
  Series,
  SeriesDetail,
  SeriesEpisode,
  SeriesSeason,
  SeriesUpdate,
  UnmatchedShowPath,
} from '@highsea-tv/api-contract'
import { AppError } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import type { ShowMetadata } from '@highsea-tv/metadata'
import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm'
import { invalid } from '../shared/context.ts'
import { probeOf } from '../shared/file-facts.ts'
import type { Media } from '../shared/index.ts'
import { artOf, type ItemRow, isoOf, stars } from '../shared/map.ts'
import { dayOf } from '../shared/names.ts'
import { chunks } from '../shared/sql.ts'
import { versionQuality } from '../shared/tracks.ts'
import { announce, type ShowsDeps } from './context.ts'
import { keepStatus, type ShowTree, statusOf } from './library.ts'
import { adminMarks, type ShowMarkers } from './markers.ts'

const {
  mediaItems,
  mediaFiles,
  versions: versionsTable,
  showDetails,
  languageProfiles,
  unmatchedFiles,
} = schema

/** "S01E05", as Sonarr writes an episode's place. */
export const adminCode = (season: number, episode: number) =>
  `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`

type Tx = Parameters<Parameters<ShowsDeps['db']['transaction']>[0]>[0]

const notHere = () => new AppError('not-found', 'That show isn’t in the library.')

/** The admin's id for a show: its TMDB id as a string. Anything else isn't a show here. */
export function showIdOf(id: string): number {
  const n = Number(id)
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(n)) throw notHere()
  return n
}

type Deps = {
  media: Media
  get(tmdbId: number): ShowTree | null
  markers: ShowMarkers
}

export function createShowAdmin(ctx: ShowsDeps, deps: Deps) {
  const { db, clock, metadata, events } = ctx
  const log = ctx.logger.child('shows')
  const today = () => dayOf(clock.now())

  const treeOf = (tmdbId: number): ShowTree => {
    const tree = deps.get(tmdbId)
    if (!tree) throw notHere()
    return tree
  }

  /** Each episode's file, with the episodes a multi-episode file holds. */
  function filesOf(tree: ShowTree) {
    const episodes = tree.seasons.flatMap((s) => s.episodes)
    const versions = new Map<string, { fileId: string | null }>()
    for (const part of chunks(episodes.map((e) => e.id)))
      for (const v of db
        .select({ itemId: versionsTable.itemId, fileId: versionsTable.fileId })
        .from(versionsTable)
        .where(inArray(versionsTable.itemId, part))
        .orderBy(asc(versionsTable.position))
        .all())
        if (!versions.get(v.itemId)?.fileId) versions.set(v.itemId, { fileId: v.fileId })
    const fileIds = [...new Set([...versions.values()].flatMap((v) => v.fileId ?? []))]
    const files = new Map<string, typeof mediaFiles.$inferSelect>()
    for (const part of chunks(fileIds))
      for (const f of db.select().from(mediaFiles).where(inArray(mediaFiles.id, part)).all())
        files.set(f.id, f)
    const holds = new Map<string, number[]>()
    for (const e of episodes) {
      const id = versions.get(e.id)?.fileId
      if (id) holds.set(id, [...(holds.get(id) ?? []), e.episodeNumber ?? 0])
    }
    return { fileOf: (itemId: string) => versions.get(itemId)?.fileId ?? null, files, holds }
  }

  /** Sonarr's status: what the library says, with a file below its cutoff called out. */
  /** The episode items a show's downloads in the queue bring (Phase 5 C1). */
  const downloadingOf = (showId: string) =>
    new Set(
      db
        .select({ episodeIds: schema.downloads.episodeIds })
        .from(schema.downloads)
        .where(
          and(
            eq(schema.downloads.itemId, showId),
            inArray(schema.downloads.state, ['downloading', 'importing', 'import-blocked']),
          ),
        )
        .all()
        .flatMap((d) => d.episodeIds ?? []),
    )

  const statusFor = (
    e: ItemRow,
    hasFile: boolean,
    downloading: ReadonlySet<string>,
  ): SeriesEpisode['status'] => {
    if (hasFile) return e.cutoffUnmet ? 'cutoff-unmet' : 'available'
    if (e.status === 'downloading' || downloading.has(e.id)) return 'downloading'
    if (e.status === 'not-released' || !e.releaseDate || e.releaseDate > today()) return 'unaired'
    return 'missing'
  }

  function seasonsOf(tree: ShowTree, meta: ShowMetadata | null): SeriesSeason[] {
    const { fileOf, files, holds } = filesOf(tree)
    const downloading = downloadingOf(tree.id)
    const marks = deps.markers.forFiles([...files.keys()])
    const posters = new Map((meta?.seasons ?? []).map((s) => [s.number, s.poster]))
    const showPoster = meta ? (artOf(meta.art).poster ?? '') : ''
    return tree.seasons.map((s) => {
      const n = s.seasonNumber ?? 0
      const episodes = s.episodes.flatMap((e): SeriesEpisode[] => {
        const fileId = fileOf(e.id)
        const file = fileId ? files.get(fileId) : undefined
        // TMDB lists a few episodes with no air date; with no file either, the admin has nothing
        // to say of them (the contract's `aired` is a day) until TMDB dates them
        if (!e.releaseDate && !file) return []
        return [
          {
            id: String(e.tmdbId),
            show: String(tree.tmdbId),
            season: n,
            number: e.episodeNumber ?? 0,
            title: e.title,
            aired: e.releaseDate ?? dayOf(e.addedAt),
            runtimeMinutes: metaRuntime(meta, e) ?? meta?.runtimeMinutes ?? 0,
            monitored: e.monitored,
            status: statusFor(e, !!file, downloading),
            file: file
              ? {
                  path: file.path,
                  size: file.size,
                  quality: file.quality ?? versionQuality(probeOf(file.mediaInfo)) ?? 'Unknown',
                  releaseGroup: file.releaseGroup,
                  episodes: holds.get(file.id) ?? [e.episodeNumber ?? 0],
                }
              : null,
            markers: file ? adminMarks(marks.get(file.id), file.size) : null,
          },
        ]
      })
      return {
        number: n,
        title: s.title || (n === 0 ? 'Specials' : `Season ${n}`),
        monitored: s.monitored,
        poster: posters.get(n) ?? showPoster,
        episodes,
      }
    })
  }

  const metaRuntime = (meta: ShowMetadata | null, e: ItemRow) => {
    for (const s of meta?.seasons ?? [])
      if (s.number === e.seasonNumber)
        return s.episodes.find((x) => x.id === e.tmdbId)?.runtimeMinutes ?? null
    return null
  }

  function seriesOf(tree: ShowTree, seasons: SeriesSeason[], meta: ShowMetadata | null): Series {
    const eps = seasons.filter((s) => s.number !== 0).flatMap((s) => s.episodes)
    const aired = eps.filter((e) => e.status !== 'unaired')
    const all = seasons.flatMap((s) => s.episodes)
    const sized = new Map<string, number>()
    for (const e of all) if (e.file) sized.set(e.file.path, e.file.size)
    const next = eps
      .filter((e) => e.monitored && e.aired > today())
      .sort((a, b) => a.aired.localeCompare(b.aired))[0]
    const art = meta ? artOf(meta.art) : null
    return {
      id: String(tree.tmdbId),
      tmdbId: tree.tmdbId,
      title: tree.title,
      sortTitle: tree.sortTitle,
      year: tree.year ?? meta?.year ?? 0,
      endYear: meta?.endYear ?? null,
      airing: meta?.airing ?? false,
      network: meta?.network ?? '',
      genres: meta?.genres ?? [],
      synopsis: meta?.synopsis ?? '',
      rating: stars(tree.rating),
      certification: meta?.certification ?? '',
      runtimeMinutes: meta?.runtimeMinutes ?? 0,
      monitored: tree.monitored,
      qualityProfileId: tree.qualityProfileId,
      languageProfileId: tree.languageProfileId ?? '',
      rootFolder: tree.rootFolder,
      path: tree.path,
      readOnly: deps.media.rootFolders.readOnlyAt(tree.path) !== null,
      seasonFolders: tree.seasonFolders,
      addedAt: isoOf(tree.addedAt),
      art: { poster: art?.poster ?? '', backdrop: art?.backdrop ?? '', logo: art?.logo ?? null },
      seasons: seasons.filter((s) => s.number !== 0).length,
      episodes: {
        // Sonarr's count: monitored or on disk, so a show no longer monitored still shows its files
        monitored: aired.filter((e) => e.monitored || e.file).length,
        have: aired.filter((e) => e.file).length,
        total: eps.length,
      },
      // a multi-episode file counts once
      size: [...sized.values()].reduce((n, s) => n + s, 0),
      nextAiring: next
        ? {
            id: next.id,
            code: adminCode(next.season, next.number),
            title: next.title,
            aired: next.aired,
          }
        : null,
    }
  }

  function detailOf(tree: ShowTree): SeriesDetail {
    const meta = metadata.cachedShow(tree.tmdbId)
    const seasons = seasonsOf(tree, meta)
    return {
      ...seriesOf(tree, seasons, meta),
      // specials first, as Sonarr lists them, then the seasons newest first
      seasonList: [...seasons].sort((a, b) =>
        a.number === 0 ? -1 : b.number === 0 ? 1 : b.number - a.number,
      ),
    }
  }

  /** Every show in the library, by title. */
  function list(): Series[] {
    const rows = db
      .select({ tmdbId: mediaItems.tmdbId })
      .from(mediaItems)
      .where(eq(mediaItems.type, 'show'))
      .orderBy(asc(mediaItems.sortTitle), asc(mediaItems.id))
      .all()
    return rows.flatMap((r) => {
      const tree = deps.get(r.tmdbId)
      if (!tree) return []
      const meta = metadata.cachedShow(r.tmdbId)
      return [seriesOf(tree, seasonsOf(tree, meta), meta)]
    })
  }

  const get = (id: string): SeriesDetail => detailOf(treeOf(showIdOf(id)))

  /** An episode with no file goes back to waiting, or to not watched, as it's monitored. */
  function restatus(rows: ItemRow[], monitored: boolean, tx: Tx) {
    const now = clock.now()
    for (const e of rows) {
      const status =
        e.type === 'episode' && keepStatus(e.status)
          ? e.status
          : e.type === 'episode'
            ? statusOf(!!e.releaseDate && e.releaseDate <= today(), monitored)
            : statusOf(true, monitored)
      tx.update(mediaItems)
        .set({ monitored, status, updatedAt: now })
        .where(eq(mediaItems.id, e.id))
        .run()
    }
  }

  /**
   * A show's Edit and the bulk bar: monitoring, its profiles, season folders. Its folder can't move
   * here: moving a show's files is a write to a library folder, which B doesn't do.
   */
  function update(id: string, patch: SeriesUpdate): SeriesDetail {
    const tree = treeOf(showIdOf(id))
    if (patch.rootFolder !== undefined && patch.rootFolder !== tree.rootFolder)
      throw invalid(
        'A show’s root folder can’t change yet: highsea would have to move its files.',
        'root-folder-move',
      )
    if (patch.qualityProfileId !== undefined) deps.media.profiles.get(patch.qualityProfileId)
    const languageProfileId =
      patch.languageProfileId === undefined ? undefined : patch.languageProfileId || null
    if (languageProfileId) {
      const row = db
        .select({ id: languageProfiles.id })
        .from(languageProfiles)
        .where(eq(languageProfiles.id, languageProfileId))
        .get()
      if (!row)
        throw new AppError('not-found', 'That language profile doesn’t exist.', {
          reason: 'unknown-language-profile',
        })
    }
    const now = clock.now()
    db.transaction((tx) => {
      const set = {
        ...(patch.qualityProfileId !== undefined
          ? { qualityProfileId: patch.qualityProfileId }
          : {}),
        ...(languageProfileId !== undefined ? { languageProfileId } : {}),
      }
      if (Object.keys(set).length)
        tx.update(mediaItems)
          .set({ ...set, updatedAt: now })
          .where(or(eq(mediaItems.id, tree.id), eq(mediaItems.showId, tree.id)))
          .run()
      if (patch.qualityProfileId !== undefined) {
        const ids = tree.seasons.flatMap((s) => s.episodes.map((e) => e.id))
        for (const part of chunks(ids))
          tx.update(versionsTable)
            .set({ qualityProfileId: patch.qualityProfileId })
            .where(inArray(versionsTable.itemId, part))
            .run()
      }
      // the show on or off, as Sonarr's series toggle: its episodes keep their own
      if (patch.monitored !== undefined)
        tx.update(mediaItems)
          .set({ monitored: patch.monitored, updatedAt: now })
          .where(eq(mediaItems.id, tree.id))
          .run()
      if (patch.seasonFolders !== undefined)
        tx.update(showDetails)
          .set({ seasonFolders: patch.seasonFolders })
          .where(eq(showDetails.itemId, tree.id))
          .run()
    })
    // the episodes' subtitles follow the show's language profile
    if (languageProfileId !== undefined && languageProfileId !== (tree.languageProfileId ?? null))
      ctx.subtitles?.profileChanged?.(tree.seasons.flatMap((s) => s.episodes.map((e) => e.id)))
    log.info('show edited', { tmdbId: tree.tmdbId, fields: Object.keys(patch) })
    announce(events, [tree.tmdbId])
    return detailOf(treeOf(tree.tmdbId))
  }

  /**
   * Out of the library: its rows go, with its files' records; the files stay on disk. Deleting
   * them is a write to a library folder, which B doesn't do.
   */
  function remove(id: string, deleteFiles: boolean) {
    const tree = treeOf(showIdOf(id))
    if (deleteFiles)
      throw new AppError(
        'conflict',
        'highsea doesn’t delete a show’s files yet. Remove it and keep the files.',
        { reason: 'delete-files' },
      )
    db.transaction((tx) => {
      tx.delete(mediaItems).where(eq(mediaItems.showId, tree.id)).run()
      tx.delete(mediaItems).where(eq(mediaItems.id, tree.id)).run()
    })
    log.info('show removed', { tmdbId: tree.tmdbId, title: tree.title })
    announce(events, [tree.tmdbId])
  }

  /** A season on or off, with every episode in it. */
  function monitorSeason(id: string, season: number, monitored: boolean) {
    const tree = treeOf(showIdOf(id))
    const s = tree.seasons.find((x) => x.seasonNumber === season)
    if (!s) throw new AppError('not-found', 'That season isn’t in this show.')
    db.transaction((tx) => restatus([s, ...s.episodes], monitored, tx))
    announce(events, [tree.tmdbId])
  }

  /** One episode on or off; its season is on while any of its episodes is. */
  /**
   * A Search's or an interactive search's scope in the library's numbers (Phase 5 C1): the season,
   * and the episode the admin names by its id. 404 when the show or the episode isn't here; 409
   * `read-only` when highsea only reads the show's root folder (ADR 0063).
   */
  function scopeOf(
    id: string,
    asked: { season?: number; episode?: string },
  ): { tmdbId: number; scope?: { season: number; episode?: number | null } } {
    const tree = treeOf(showIdOf(id))
    if (deps.media.rootFolders.readOnlyAt(tree.path) !== null)
      throw new AppError(
        'conflict',
        'highsea only reads this show’s root folder, so it doesn’t search for it.',
        { reason: 'read-only' },
      )
    if (asked.episode !== undefined) {
      for (const s of tree.seasons) {
        const e = s.episodes.find((x) => String(x.tmdbId) === asked.episode)
        if (e && (asked.season === undefined || asked.season === e.seasonNumber))
          return {
            tmdbId: tree.tmdbId,
            scope: { season: e.seasonNumber ?? 0, episode: e.episodeNumber ?? 0 },
          }
      }
      throw new AppError('not-found', 'That episode isn’t in this show.')
    }
    if (asked.season === undefined) return { tmdbId: tree.tmdbId }
    if (!tree.seasons.some((s) => s.seasonNumber === asked.season))
      throw new AppError('not-found', `This show has no season ${asked.season}.`)
    return { tmdbId: tree.tmdbId, scope: { season: asked.season } }
  }

  function monitorEpisode(id: string, episodeId: string, monitored: boolean) {
    const tree = treeOf(showIdOf(id))
    const season = tree.seasons.find((s) => s.episodes.some((e) => String(e.tmdbId) === episodeId))
    const episode = season?.episodes.find((e) => String(e.tmdbId) === episodeId)
    if (!season || !episode) throw new AppError('not-found', 'That episode isn’t in this show.')
    db.transaction((tx) => {
      restatus([episode], monitored, tx)
      const any = season.episodes.some((e) => (e.id === episode.id ? monitored : e.monitored))
      tx.update(mediaItems)
        .set({ monitored: any, updatedAt: clock.now() })
        .where(eq(mediaItems.id, season.id))
        .run()
    })
    announce(events, [tree.tmdbId])
  }

  /** An episode's file, by the show's and the episode's ids; not found without one. */
  function episodeFile(id: string, episodeId: string): string {
    const tree = treeOf(showIdOf(id))
    const episode = tree.seasons
      .flatMap((s) => s.episodes)
      .find((e) => String(e.tmdbId) === episodeId)
    if (!episode) throw new AppError('not-found', 'That episode isn’t in this show.')
    const fileId = fileOfEpisode(episode.id)
    if (!fileId) throw new AppError('not-found', 'That episode has no file.')
    return fileId
  }

  /** An episode's first version's file. */
  const fileOfEpisode = (itemId: string) =>
    db
      .select({ fileId: versionsTable.fileId })
      .from(versionsTable)
      .where(eq(versionsTable.itemId, itemId))
      .orderBy(asc(versionsTable.position))
      .all()
      .find((v) => v.fileId)?.fileId ?? null

  /** The owner's intro and credits for an episode (ADR 0067): kept when the season is looked at again. */
  function setMarkers(id: string, episodeId: string, patch: EpisodeMarkersPatch) {
    deps.markers.correct(episodeFile(id, episodeId), patch)
    announce(events, [showIdOf(id)])
  }

  /** Forgets an episode's marks, the owner's too, and has its season looked at again. */
  function findMarkers(id: string, episodeId: string) {
    deps.markers.forget(episodeFile(id, episodeId))
    announce(events, [showIdOf(id)])
  }

  /** TMDB's shows for a search, those here marked; an empty search finds nothing. */
  async function discover(query = ''): Promise<DiscoverSeries[]> {
    const q = query.trim()
    if (!q) return []
    const page = await metadata.discover.searchShows(q, 1)
    const ids = page.results.map((r) => r.id)
    const here = new Set(
      ids.length
        ? db
            .select({ tmdbId: mediaItems.tmdbId })
            .from(mediaItems)
            .where(and(eq(mediaItems.type, 'show'), inArray(mediaItems.tmdbId, ids)))
            .all()
            .map((r) => r.tmdbId)
        : [],
    )
    return page.results.map((r) => {
      const cached = metadata.cachedShow(r.id)
      const art = artOf(r.art)
      return {
        id: String(r.id),
        tmdbId: r.id,
        title: r.title,
        year: r.year ?? 0,
        endYear: cached?.endYear ?? null,
        seasons: cached?.seasons.filter((s) => s.number !== 0).length ?? 0,
        network: cached?.network ?? '',
        genres: r.genres,
        synopsis: r.synopsis,
        rating: stars(r.rating),
        art: { poster: art.poster ?? '', backdrop: art.backdrop ?? '' },
        inLibrary: here.has(r.id),
      }
    })
  }

  /** Settings › Media management's folders for shows. */
  const rootFolders = (): string[] => deps.media.rootFolders.list('shows').map((f) => f.path)

  /** What the import and the scan kept unmatched, by path; a file's show by its TMDB id. */
  function unmatched(rootFolder?: string): UnmatchedShowPath[] {
    const rows = db
      .select({
        path: unmatchedFiles.path,
        kind: unmatchedFiles.kind,
        rootFolder: unmatchedFiles.rootFolder,
        tmdbId: mediaItems.tmdbId,
        reason: unmatchedFiles.reason,
        message: unmatchedFiles.message,
        size: unmatchedFiles.size,
        foundAt: unmatchedFiles.foundAt,
      })
      .from(unmatchedFiles)
      .leftJoin(mediaItems, eq(mediaItems.id, unmatchedFiles.itemId))
      // what the owner dismissed stays known but leaves the list
      .where(
        and(
          isNull(unmatchedFiles.dismissedAt),
          rootFolder ? eq(unmatchedFiles.rootFolder, rootFolder) : undefined,
        ),
      )
      .orderBy(asc(unmatchedFiles.path))
      .all()
    return rows.map(({ tmdbId, foundAt, ...r }) => ({
      ...r,
      show: tmdbId === null ? null : String(tmdbId),
      foundAt: isoOf(foundAt),
    }))
  }

  return {
    list,
    get,
    detailOf,
    unmatched,
    update,
    remove,
    monitorSeason,
    monitorEpisode,
    scopeOf,
    setMarkers,
    findMarkers,
    discover,
    rootFolders,
  }
}

export type ShowAdmin = ReturnType<typeof createShowAdmin>

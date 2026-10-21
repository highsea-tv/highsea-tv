// SPDX-License-Identifier: AGPL-3.0-only
// The movie library: adding by TMDB id, the paged list, editing, bulk edits, versions (ADR 0012)
// and removal. A movie's address is its TMDB id (ADR 0014, amended 2026-10-20); the row ids key
// only what hangs off it. TMDB's facts come from the metadata cache, joined by TMDB id; the sort
// columns are copied onto the library row on add and kept current from `metadata.updated`.
import { basename, join } from 'node:path'
import type {
  AddMovieInput,
  BulkInput,
  BulkResult,
  Movie,
  MoviePage,
  MovieStatus,
  MovieUpdate,
  VersionInput,
  VersionUpdate,
} from '@highsea/api-contract'
import { AppError, newId } from '@highsea/core'
import { schema } from '@highsea/db'
import type { LibraryStatus, MinimumAvailability } from '@highsea/db/schema'
import type { MovieMetadata } from '@highsea/metadata'
import { and, asc, desc, eq, gte, inArray, lte, type SQL, sql } from 'drizzle-orm'
import { invalid, noIndexers } from '../shared/context.ts'
import type { Media } from '../shared/index.ts'
import type { ItemRow, VersionRow } from '../shared/map.ts'
import { dayOf, fold, sortTitleOf } from '../shared/names.ts'
import { type Dir, defaultDir, pageRows, type Sort } from '../shared/paging.ts'
import { CHUNK, chunks, escapeLike } from '../shared/sql.ts'
import { announce, type Ctx, notInLibrary } from './context.ts'
import { toApiMovie } from './map.ts'
import { isAvailable, moviePath, regionalReleaseDate, statusOf } from './titles.ts'

const { mediaItems, versions, movieMetadata, languageProfiles } = schema

const DAY = 24 * 60 * 60 * 1000
const MAX_VERSIONS = 10

export const DEFAULT_LIMIT = 60
export const MAX_LIMIT = 200

export type ListQuery = {
  status?: MovieStatus
  title?: string
  qualityProfileId?: string
  /** The contract's query string (`'true'`/`'false'`) or a boolean. */
  monitored?: boolean | 'true' | 'false'
  sort?: Sort
  dir?: Dir
  cursor?: string
  limit?: number
}

/** Filters the client API adds to the admin's. */
export type ExtraFilters = { genre?: string; playable?: boolean }

/**
 * The title filter: anywhere in the title or the original title, ignoring case (SQLite's LIKE folds
 * ASCII: https://sqlite.org/lang_expr.html#like) and accents (through the folded sort title). A
 * substring can't seek a B-tree, so a filtered page walks the sort's index until it's full.
 */
export function titleMatch(query: string): SQL {
  const plain = `%${escapeLike(query.trim())}%`
  const folded = `%${escapeLike(fold(query))}%`
  return sql`(${mediaItems.title} LIKE ${plain} ESCAPE '\\' OR ${mediaItems.sortTitle} LIKE ${folded} ESCAPE '\\' OR ${mediaItems.tmdbId} IN (SELECT ${movieMetadata.tmdbId} FROM ${movieMetadata} WHERE ${movieMetadata.originalTitle} LIKE ${plain} ESCAPE '\\'))`
}

/** Titles with a genre, by name, from the cached TMDB data (`genres[].name`), ignoring case. */
const genreMatch = (genre: string) =>
  sql`${mediaItems.tmdbId} IN (SELECT m.tmdb_id FROM movie_metadata m, json_each(m.data, '$.genres') g WHERE json_extract(g.value, '$.name') = ${genre} COLLATE NOCASE)`

export function createLibrary(ctx: Ctx, media: Media) {
  const { db, clock, events, metadata } = ctx
  const log = ctx.logger.child('movies')
  const today = () => dayOf(clock.now())
  const canSearch = () => ctx.search?.canSearch() ?? false

  // ------------------------------------------------------------ reading rows

  const rowOf = (tmdbId: number) =>
    db
      .select()
      .from(mediaItems)
      .where(and(eq(mediaItems.type, 'movie'), eq(mediaItems.tmdbId, tmdbId)))
      .get()

  const requireRow = (tmdbId: number) => {
    const row = Number.isSafeInteger(tmdbId) ? rowOf(tmdbId) : undefined
    if (!row) throw notInLibrary()
    return row
  }

  const versionsOf = (itemIds: string[]) => {
    const byItem = new Map<string, VersionRow[]>()
    for (const ids of chunks(itemIds))
      for (const v of db
        .select()
        .from(versions)
        .where(inArray(versions.itemId, ids))
        .orderBy(asc(versions.position))
        .all())
        byItem.set(v.itemId, [...(byItem.get(v.itemId) ?? []), v])
    return byItem
  }

  const cached = (tmdbId: number): MovieMetadata | null => {
    try {
      return metadata.cachedMovie(tmdbId)
    } catch (e) {
      log.warn('couldn’t read cached metadata', { tmdbId, error: (e as Error).message })
      return null
    }
  }

  function toMovies(rows: ItemRow[]): Movie[] {
    const vs = versionsOf(rows.map((r) => r.id))
    return rows.map((r) => toApiMovie(r, vs.get(r.id) ?? [], cached(r.tmdbId)))
  }

  const view = (row: ItemRow) => toMovies([row])[0] as Movie
  const get = (tmdbId: number): Movie => view(requireRow(tmdbId))

  /** The library's TMDB ids among `ids`: for marking Discover, collections and filmographies. */
  function inLibrary(ids: number[]): Set<number> {
    const found = new Set<number>()
    const wanted = [...new Set(ids.filter((id) => Number.isSafeInteger(id)))]
    for (const part of chunks(wanted))
      for (const r of db
        .select({ id: mediaItems.tmdbId })
        .from(mediaItems)
        .where(and(eq(mediaItems.type, 'movie'), inArray(mediaItems.tmdbId, part)))
        .all())
        found.add(r.id)
    return found
  }

  // ------------------------------------------------------------ status and the cache's columns

  /** Whether the movie has reached its minimum availability, from the cache or the row's date. */
  function released(
    row: Pick<ItemRow, 'releaseDate'>,
    meta: MovieMetadata | null,
    min: MinimumAvailability,
  ) {
    const facts = meta ?? {
      releaseDate: row.releaseDate,
      releases: { theatrical: row.releaseDate, digital: null, physical: null },
    }
    return isAvailable(facts, min, today())
  }

  /** The columns copied from the cache: what the library sorts and filters on. */
  const cacheColumns = (meta: MovieMetadata) => ({
    title: meta.title,
    sortTitle: sortTitleOf(meta.title),
    year: meta.year,
    rating: meta.rating,
    releaseDate: regionalReleaseDate(meta),
  })

  /**
   * Brings a library row up to date with the cache and the calendar: the sort columns and the
   * status. Returns whether anything changed. The folder's path stays: it's where the files are.
   */
  function sync(row: ItemRow): boolean {
    const meta = cached(row.tmdbId)
    const columns = meta ? cacheColumns(meta) : {}
    const next = { ...row, ...columns }
    const status = keepStatus(row.status)
      ? row.status
      : statusOf(released(next, meta, row.minimumAvailability), row.monitored)
    const changed =
      status !== row.status ||
      (Object.keys(columns) as (keyof typeof columns)[]).some((k) => columns[k] !== row[k])
    if (!changed) return false
    db.update(mediaItems)
      .set({ ...columns, status, updatedAt: clock.now() })
      .where(eq(mediaItems.id, row.id))
      .run()
    return true
  }

  /** `available` and `downloading` belong to files and the queue (checkpoint 6), not the calendar. */
  const keepStatus = (s: LibraryStatus) => s === 'available' || s === 'downloading'

  /**
   * After a file came or went outside an import (6b's library scan): Available while a version has
   * a file, else what the calendar says, or Downloading while a grab is under way. Returns whether
   * the status changed.
   */
  function settleFiles(itemId: string): boolean {
    const row = db.select().from(mediaItems).where(eq(mediaItems.id, itemId)).get()
    if (!row) return false
    const hasFile = db
      .select({ id: versions.id })
      .from(versions)
      .where(and(eq(versions.itemId, itemId), sql`${versions.fileId} IS NOT NULL`))
      .get()
    const status: LibraryStatus = hasFile
      ? 'available'
      : row.status === 'downloading'
        ? 'downloading'
        : statusOf(released(row, cached(row.tmdbId), row.minimumAvailability), row.monitored)
    if (status === row.status) return false
    db.update(mediaItems)
      .set({ status, updatedAt: clock.now() })
      .where(eq(mediaItems.id, itemId))
      .run()
    return true
  }

  /** After `metadata.updated`: the library movies among the ids get the new facts. */
  function onMetadataUpdated(ids: string[]) {
    const tmdbIds = ids.flatMap((id) => {
      const m = /^movie:(\d+)$/.exec(id)
      return m ? [Number(m[1])] : []
    })
    if (tmdbIds.length === 0) return
    const changed: number[] = []
    for (const part of chunks(tmdbIds))
      for (const row of db
        .select()
        .from(mediaItems)
        .where(and(eq(mediaItems.type, 'movie'), inArray(mediaItems.tmdbId, part)))
        .all())
        if (sync(row)) changed.push(row.tmdbId)
    announce(events, changed)
  }

  /**
   * The daily availability check: movies waiting for their release are looked at again, since the
   * calendar moves without anything else changing. Safe to repeat (ADR 0022): a second run finds
   * nothing to change.
   */
  function checkAvailability(): number {
    const changed: number[] = []
    let after = ''
    for (;;) {
      const rows = db
        .select()
        .from(mediaItems)
        .where(
          and(
            eq(mediaItems.type, 'movie'),
            eq(mediaItems.status, 'not-released'),
            sql`${mediaItems.id} > ${after}`,
          ),
        )
        .orderBy(asc(mediaItems.id))
        .limit(CHUNK)
        .all()
      for (const row of rows) if (sync(row)) changed.push(row.tmdbId)
      const last = rows[rows.length - 1]
      if (!last || rows.length < CHUNK) break
      after = last.id
    }
    announce(events, changed, { many: changed.length > 1 })
    return changed.length
  }

  // ------------------------------------------------------------ the list

  function conditions(
    query: ListQuery & ExtraFilters,
    { withStatus }: { withStatus: boolean },
  ): SQL | undefined {
    const where: (SQL | undefined)[] = [eq(mediaItems.type, 'movie')]
    if (withStatus && query.status) where.push(eq(mediaItems.status, query.status))
    if (query.qualityProfileId) where.push(eq(mediaItems.qualityProfileId, query.qualityProfileId))
    if (query.monitored !== undefined)
      where.push(eq(mediaItems.monitored, query.monitored === true || query.monitored === 'true'))
    if (query.title?.trim()) where.push(titleMatch(query.title))
    if (query.genre?.trim()) where.push(genreMatch(query.genre.trim()))
    // nothing has a file to play until checkpoint 6
    if (query.playable === true) where.push(sql`0`)
    return and(...where)
  }

  const limitOf = (n: number | undefined) =>
    Math.min(Math.max(Math.trunc(n ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1), MAX_LIMIT)

  /** A page of library rows, for the admin's list and the client API's. */
  function pageOf(query: ListQuery & ExtraFilters) {
    const sort = query.sort ?? 'title'
    return pageRows(db, conditions(query, { withStatus: true }), {
      sort,
      dir: query.dir ?? defaultDir(sort),
      cursor: query.cursor,
      limit: limitOf(query.limit),
    })
  }

  /** The status tabs' counts, applying every filter but the status. */
  function countsOf(query: ListQuery & ExtraFilters) {
    const counts = {
      all: 0,
      available: 0,
      wanted: 0,
      downloading: 0,
      'not-released': 0,
      unmonitored: 0,
    }
    for (const r of db
      .select({ status: mediaItems.status, n: sql<number>`count(*)` })
      .from(mediaItems)
      .where(conditions(query, { withStatus: false }))
      .groupBy(mediaItems.status)
      .all()) {
      counts[r.status] = r.n
      counts.all += r.n
    }
    return counts
  }

  function list(query: ListQuery = {}): MoviePage {
    const { rows, next } = pageOf(query)
    const counts = countsOf(query)
    return {
      items: toMovies(rows),
      next,
      total: query.status ? counts[query.status] : counts.all,
      counts,
    }
  }

  /** Monitored movies released in the next `days` days (in the server's region), soonest first. */
  function upcoming(days = 14): Movie[] {
    const from = today()
    const to = dayOf(clock.now() + Math.max(1, days) * DAY)
    const rows = db
      .select()
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.type, 'movie'),
          gte(mediaItems.releaseDate, from),
          lte(mediaItems.releaseDate, to),
          eq(mediaItems.monitored, true),
        ),
      )
      .orderBy(asc(mediaItems.releaseDate), asc(mediaItems.id))
      .limit(MAX_LIMIT)
      .all()
    return toMovies(rows)
  }

  /** The movies added last, newest first. */
  function recent(limit = 8): Movie[] {
    const rows = db
      .select()
      .from(mediaItems)
      .where(eq(mediaItems.type, 'movie'))
      .orderBy(desc(mediaItems.addedAt), desc(mediaItems.id))
      .limit(Math.min(Math.max(1, limit), 50))
      .all()
    return toMovies(rows)
  }

  // ------------------------------------------------------------ changing it

  /**
   * A language profile must exist (checkpoint 7): `media_items.language_profile_id` has no foreign
   * key (the schema's subtitles.ts says why), so the library checks it.
   */
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

  function requireFolder(path: string) {
    const folder = media.rootFolders.find(path)
    if (!folder) throw invalid('Pick one of the root folders.', 'unknown-root-folder')
    return folder.path
  }

  const checkLabels = (labels: string[]) => {
    const seen = new Set<string>()
    for (const l of labels) {
      const key = l.trim().toLowerCase()
      if (seen.has(key)) throw invalid('Each version needs its own label.', 'duplicate-label')
      seen.add(key)
    }
  }

  /**
   * Adds a movie by TMDB id, fetching its metadata if the server doesn't have it (the one fetch a
   * request makes). Adding a movie that's already here returns it unchanged. Search now is refused
   * while no indexer is enabled (decision 2), before anything is written; with one, the search is
   * queued once the movie is added.
   */
  async function add(input: AddMovieInput): Promise<{ movie: Movie; created: boolean }> {
    const existing = rowOf(input.tmdbId)
    if (existing) return { movie: view(existing), created: false }
    if (input.searchNow && !canSearch()) throw noIndexers()
    const rootFolder = requireFolder(input.rootFolder)
    if (input.versions.length === 0 || input.versions.length > MAX_VERSIONS)
      throw invalid('A movie has one to ten versions.', 'versions')
    for (const v of input.versions) media.profiles.get(v.qualityProfileId)
    checkLanguageProfile(input.languageProfileId ?? null)
    checkLabels(input.versions.map((v) => v.label))

    const meta = await metadata.movie(input.tmdbId)
    const now = clock.now()
    const itemId = newId('itm')
    const first = input.versions[0] as VersionInput
    const columns = cacheColumns(meta)
    const created = db.transaction((tx) => {
      const inserted = tx
        .insert(mediaItems)
        .values({
          id: itemId,
          type: 'movie',
          tmdbId: input.tmdbId,
          parentId: null,
          ...columns,
          status: statusOf(released(columns, meta, input.minimumAvailability), input.monitored),
          monitored: input.monitored,
          minimumAvailability: input.minimumAvailability,
          qualityProfileId: first.qualityProfileId,
          languageProfileId: input.languageProfileId ?? null,
          rootFolder,
          path: moviePath(rootFolder, meta.title, meta.year),
          addedAt: now,
          updatedAt: now,
        })
        // two adds of one movie at once: the second finds the first's row
        .onConflictDoNothing({ target: [mediaItems.type, mediaItems.tmdbId] })
        .returning({ id: mediaItems.id })
        .all()
      if (inserted.length === 0) return false
      tx.insert(versions)
        .values(
          input.versions.map((v, position) => ({
            id: newId('ver'),
            itemId,
            label: v.label.trim(),
            qualityProfileId: v.qualityProfileId,
            fileId: null,
            position,
            createdAt: now,
          })),
        )
        .run()
      return true
    })
    const row = requireRow(input.tmdbId)
    if (created) {
      log.info('movie added', { tmdbId: input.tmdbId, title: meta.title })
      announce(events, [input.tmdbId])
      if (input.searchNow) ctx.search?.queue([input.tmdbId])
    }
    return { movie: view(row), created }
  }

  /**
   * What a release search for a movie is judged by: its ids, title and year, TMDB's facts, and its
   * first version's profile (the Search tab has no version picker, so it judges by the first).
   * No files yet (checkpoint 6), so nothing existing to upgrade.
   */
  function searchInput(tmdbId: number) {
    const row = requireRow(tmdbId)
    const meta = cached(tmdbId)
    const first = versionsOf([row.id]).get(row.id)?.[0]
    const profile = media.profiles.get(first?.qualityProfileId ?? row.qualityProfileId)
    return {
      tmdbId,
      imdbId: meta?.imdbId ?? null,
      title: row.title,
      year: row.year,
      movie: {
        title: row.title,
        year: row.year,
        runtimeMinutes: meta?.runtimeMinutes ?? null,
        originalLanguage: meta?.originalLanguage ?? null,
      },
      profile,
      formats: media.customFormats(),
      sizes: media.qualitySizes(),
      existing: null,
    }
  }

  function update(tmdbId: number, patch: MovieUpdate): Movie {
    const row = requireRow(tmdbId)
    const set: Partial<ItemRow> = {}
    if (patch.rootFolder !== undefined) {
      const rootFolder = requireFolder(patch.rootFolder)
      // nothing moves on disk until there are files (checkpoint 6): the path follows the folder
      if (rootFolder !== row.rootFolder) {
        set.rootFolder = rootFolder
        set.path = join(rootFolder, basename(row.path))
      }
    }
    if (patch.monitored !== undefined) set.monitored = patch.monitored
    if (patch.minimumAvailability !== undefined) set.minimumAvailability = patch.minimumAvailability
    if (patch.languageProfileId !== undefined) {
      checkLanguageProfile(patch.languageProfileId)
      set.languageProfileId = patch.languageProfileId
    }
    const next = { ...row, ...set }
    if (!keepStatus(row.status))
      set.status = statusOf(
        released(next, cached(tmdbId), next.minimumAvailability),
        next.monitored,
      )
    db.update(mediaItems)
      .set({ ...set, updatedAt: clock.now() })
      .where(eq(mediaItems.id, row.id))
      .run()
    announce(events, [tmdbId])
    return get(tmdbId)
  }

  /**
   * Removes the library rows: the item, its versions, tags and watch positions (by cascade). Its
   * metadata stays cached, so the page keeps working without the library layer. `deleteFiles`
   * would remove its files from disk, but no movie has files until checkpoint 6 (`versions.file_id`
   * is always null), so there is nothing to delete either way; checkpoint 6 fills this in.
   */
  function remove(tmdbId: number, { deleteFiles = false }: { deleteFiles?: boolean } = {}) {
    const row = requireRow(tmdbId)
    db.delete(mediaItems).where(eq(mediaItems.id, row.id)).run()
    log.info('movie removed', { tmdbId, deleteFiles })
    announce(events, [tmdbId])
  }

  /** Queues the metadata refresh; `metadata.updated` follows, and the library row with it. */
  function refresh(tmdbId: number) {
    requireRow(tmdbId)
    metadata.refresh(tmdbId)
  }

  // ------------------------------------------------------------ bulk

  /** The library rows for TMDB ids, and the ids that aren't in the library. */
  function resolve(ids: number[]) {
    const unique = [...new Set(ids)]
    const rows: { id: string; tmdbId: number }[] = []
    for (const part of chunks(unique))
      rows.push(
        ...db
          .select({ id: mediaItems.id, tmdbId: mediaItems.tmdbId })
          .from(mediaItems)
          .where(and(eq(mediaItems.type, 'movie'), inArray(mediaItems.tmdbId, part)))
          .all(),
      )
    const found = new Set(rows.map((r) => r.tmdbId))
    return { rows, missing: unique.filter((id) => !found.has(id)) }
  }

  /** Moves each item's first version to the profile; the item's filter column follows. */
  function setFirstProfile(itemIds: string[], profileId: string, now: number) {
    for (const part of chunks(itemIds)) {
      db.update(versions)
        .set({ qualityProfileId: profileId })
        .where(
          sql`${versions.id} IN (SELECT v.id FROM versions v WHERE v.item_id IN (${sql.join(
            part.map((id) => sql`${id}`),
            sql`, `,
          )}) AND v.position = (SELECT min(w.position) FROM versions w WHERE w.item_id = v.item_id))`,
        )
        .run()
      db.update(mediaItems)
        .set({ qualityProfileId: profileId, updatedAt: now })
        .where(inArray(mediaItems.id, part))
        .run()
    }
  }

  function bulk(input: BulkInput): BulkResult {
    if (input.action === 'search') {
      if (!canSearch()) throw noIndexers()
      const { rows, missing } = resolve(input.ids)
      const tmdbIds = rows.map((r) => r.tmdbId)
      ctx.search?.queue(tmdbIds)
      return { ids: tmdbIds, missing }
    }
    if (input.action === 'setQualityProfile') media.profiles.get(input.qualityProfileId)
    if (input.action === 'setLanguageProfile') checkLanguageProfile(input.languageProfileId)
    const { rows, missing } = resolve(input.ids)
    const itemIds = rows.map((r) => r.id)
    const tmdbIds = rows.map((r) => r.tmdbId)
    const now = clock.now()
    db.transaction((tx) => {
      switch (input.action) {
        case 'monitor':
        case 'unmonitor': {
          const monitored = input.action === 'monitor'
          // the status follows monitoring, except before release and once there are files
          for (const part of chunks(itemIds))
            tx.update(mediaItems)
              .set({
                monitored,
                status: sql`CASE WHEN ${mediaItems.status} IN ('not-released', 'available', 'downloading') THEN ${mediaItems.status} ELSE ${monitored ? 'wanted' : 'unmonitored'} END`,
                updatedAt: now,
              })
              .where(inArray(mediaItems.id, part))
              .run()
          break
        }
        case 'setQualityProfile':
          setFirstProfile(itemIds, input.qualityProfileId, now)
          break
        case 'setLanguageProfile':
          for (const part of chunks(itemIds))
            tx.update(mediaItems)
              .set({ languageProfileId: input.languageProfileId, updatedAt: now })
              .where(inArray(mediaItems.id, part))
              .run()
          break
        case 'delete':
          // no files until checkpoint 6, so `deleteFiles` has nothing to remove (see `remove`)
          for (const part of chunks(itemIds))
            tx.delete(mediaItems).where(inArray(mediaItems.id, part)).run()
          break
        case 'refresh':
          break
      }
    })
    if (input.action === 'refresh') for (const id of tmdbIds) metadata.refresh(id)
    else announce(events, tmdbIds, { many: tmdbIds.length > 1 })
    return { ids: tmdbIds, missing }
  }

  // ------------------------------------------------------------ versions

  const versionNotFound = () => new AppError('not-found', 'That version doesn’t exist.')

  function versionRows(itemId: string) {
    return db
      .select()
      .from(versions)
      .where(eq(versions.itemId, itemId))
      .orderBy(asc(versions.position))
      .all()
  }

  /** Keeps the item's filter column on its first version's profile. */
  function syncFirst(row: ItemRow) {
    const first = versionRows(row.id)[0]
    if (first && first.qualityProfileId !== row.qualityProfileId)
      db.update(mediaItems)
        .set({ qualityProfileId: first.qualityProfileId, updatedAt: clock.now() })
        .where(eq(mediaItems.id, row.id))
        .run()
  }

  const movieVersions = {
    add(tmdbId: number, input: VersionInput): Movie {
      const row = requireRow(tmdbId)
      media.profiles.get(input.qualityProfileId)
      const existing = versionRows(row.id)
      if (existing.length >= MAX_VERSIONS)
        throw invalid('A movie has at most ten versions.', 'versions')
      checkLabels([...existing.map((v) => v.label), input.label])
      db.insert(versions)
        .values({
          id: newId('ver'),
          itemId: row.id,
          label: input.label.trim(),
          qualityProfileId: input.qualityProfileId,
          fileId: null,
          position: Math.max(-1, ...existing.map((v) => v.position)) + 1,
          createdAt: clock.now(),
        })
        .run()
      announce(events, [tmdbId])
      return get(tmdbId)
    },

    update(tmdbId: number, versionId: string, patch: VersionUpdate): Movie {
      const row = requireRow(tmdbId)
      const all = versionRows(row.id)
      const version = all.find((v) => v.id === versionId)
      if (!version) throw versionNotFound()
      if (patch.qualityProfileId !== undefined) media.profiles.get(patch.qualityProfileId)
      if (patch.label !== undefined)
        checkLabels([...all.filter((v) => v.id !== versionId).map((v) => v.label), patch.label])
      db.update(versions)
        .set({
          ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
          ...(patch.qualityProfileId !== undefined
            ? { qualityProfileId: patch.qualityProfileId }
            : {}),
        })
        .where(eq(versions.id, versionId))
        .run()
      syncFirst(row)
      announce(events, [tmdbId])
      return get(tmdbId)
    },

    /** A movie keeps at least one version. Removing the first makes the next one first. */
    remove(tmdbId: number, versionId: string): Movie {
      const row = requireRow(tmdbId)
      const all = versionRows(row.id)
      if (!all.some((v) => v.id === versionId)) throw versionNotFound()
      if (all.length === 1)
        throw new AppError('conflict', 'A movie keeps at least one version.', {
          reason: 'last-version',
        })
      db.delete(versions).where(eq(versions.id, versionId)).run()
      syncFirst(row)
      announce(events, [tmdbId])
      return get(tmdbId)
    },
  }

  return {
    add,
    list,
    get,
    update,
    delete: remove,
    bulk,
    refresh,
    upcoming,
    recent,
    versions: movieVersions,
    inLibrary,
    // for the client API, parse and the jobs
    searchInput,
    internal: {
      rowOf,
      pageOf,
      /** Titles matching every filter. */
      countOf: (query: ListQuery & ExtraFilters) => countsOf(query).all,
      toMovies,
      cached,
      versionsOf,
      onMetadataUpdated,
      checkAvailability,
      settleFiles,
    },
  }
}

export type Library = ReturnType<typeof createLibrary>

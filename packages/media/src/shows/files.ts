// SPDX-License-Identifier: AGPL-3.0-only
// A show's files matched to its episodes (Phase 5 B, ADR 0064's 2026-11-18 section). A video in a
// show's folder is read by its name, as Sonarr's disk scan reads it: `parseEpisode` for the season
// and episodes (the name's season wins over its folder's, as Sonarr parses the file's name), then
// the show's episode rows by those numbers. Nothing is guessed: a name with no episode number, a
// season or an episode TMDB doesn't list, or an episode another file already holds is kept in
// `unmatched_files` with its reason, for the admin to resolve. Anime's absolute numbers parse to
// nothing today and wait the same way; its mapping is a later part and goes in `episodeMatch`.
//
// A matched file is probed and judged as a film's is (shared/inspect.ts: extras, samples, the
// quality from its name and the probe) and filed as ADR 0064 has it: one `media_files` row under
// its first episode, a version of every episode it holds pointing at it, those episodes Available.
// Removing a file clears each episode it held; an episode taken from a multi-episode file leaves
// the file its others, and the file moves to its first remaining episode.
//
// In place only: nothing here renames, moves or writes beside a file, so a folder highsea only
// reads (ADR 0063) is safe. Every step is safe to repeat (ADR 0022): a file is recorded by its path,
// and its history entry written once.
import { promises as fsp } from 'node:fs'
import { basename, dirname, extname, relative, sep } from 'node:path'
import { AppError, newId } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import type { UnmatchedKind } from '@highsea-tv/db/schema'
import { parse, parseEpisode, parseSeasonFolder } from '@highsea-tv/parser'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { StoredFileInfo } from '../movies/import.ts'
import { createProbe } from '../shared/ffprobe.ts'
import { writeFileFacts } from '../shared/file-facts.ts'
import {
  type FoundFile,
  isVideo,
  listFiles,
  minimumRuntimeSeconds,
  skipBeforeProbe,
} from '../shared/files.ts'
import type { Media } from '../shared/index.ts'
import { probeFile, qualityFor } from '../shared/inspect.ts'
import { dayOf } from '../shared/names.ts'
import { isWithin } from '../shared/paths.ts'
import { announce, type ShowsDeps } from './context.ts'
import { aired, statusOf } from './library.ts'

const { mediaItems, versions, mediaFiles, unmatchedFiles } = schema

type ItemRow = typeof mediaItems.$inferSelect
type FileRow = typeof mediaFiles.$inferSelect

/** No show folder comes near it; it bounds one walk. */
const MAX_FILES = 200_000

/** Why a file in a show's folder isn't filed under an episode. */
export type UnmatchedFileReason =
  | 'no-episode-number'
  | 'unknown-season'
  | 'unknown-episode'
  | 'episode-has-file'
  | 'unreadable'

/** The episodes a file's name gives, or why it gives none the show has. */
export type EpisodeMatch =
  | { ok: true; season: number; episodes: number[] }
  | { ok: false; reason: UnmatchedFileReason; message: string }

const code = (season: number, episode: number) =>
  `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`

/**
 * Which of a show's episodes a file holds by its name (pure, for the tests and the admin's later
 * preview). `seasons` maps each season number TMDB lists to its episode numbers. A season folder
 * (`Season 02`, `Specials`) is read only when the name says nothing else: Sonarr's own disk scan
 * goes by the file's name.
 */
export function episodeMatch(
  path: string,
  showFolder: string,
  seasons: ReadonlyMap<number, ReadonlySet<number>>,
): EpisodeMatch {
  const parsed = parseEpisode(basename(path))
  if (!parsed || parsed.fullSeason || parsed.episodes.length === 0) {
    const folders = relative(showFolder, dirname(path)).split(sep).filter(Boolean)
    const folderSeason = folders.length
      ? parseSeasonFolder(folders[folders.length - 1] ?? '')
      : null
    return {
      ok: false,
      reason: 'no-episode-number',
      message: parsed?.fullSeason
        ? 'Its name gives a whole season, not an episode.'
        : folderSeason !== null
          ? 'Its name has no episode number (like S01E01), so it can’t be matched in its season’s folder.'
          : 'Its name has no season and episode number (like S01E01).',
    }
  }
  const have = seasons.get(parsed.season)
  if (!have)
    return {
      ok: false,
      reason: 'unknown-season',
      message:
        parsed.season === 0
          ? 'TMDB lists no specials for this show.'
          : `TMDB lists no season ${parsed.season} for this show.`,
    }
  const missing = parsed.episodes.filter((e) => !have.has(e))
  if (missing.length)
    return {
      ok: false,
      reason: 'unknown-episode',
      message: `TMDB lists no ${missing.map((e) => code(parsed.season, e)).join(', ')} for this show.`,
    }
  return { ok: true, season: parsed.season, episodes: parsed.episodes }
}

export type FileOutcome =
  | { status: 'filed'; fileId: string; episodes: string[]; already: boolean }
  | { status: 'skipped'; why: string }
  | { status: 'unmatched'; reason: UnmatchedFileReason; message: string }

/** What reconciling a show's folder with its rows did. */
export type ReconcileResult = {
  added: number
  changed: number
  removed: number
  unmatched: number
}

export function createShowFiles(ctx: ShowsDeps, deps: { media: Media }) {
  const { db, clock, events, metadata } = ctx
  const { media } = deps
  const log = ctx.logger.child('show-files')
  const options = ctx.files ?? {}
  const probe = options.probe ?? createProbe()

  // ---------------------------------------------------------------- unmatched paths

  const unmatched = {
    put(entry: {
      path: string
      kind: UnmatchedKind
      rootFolder: string
      itemId: string | null
      reason: string
      message: string
      size?: number
    }) {
      const values = { ...entry, size: entry.size ?? 0, foundAt: clock.now() }
      const at = db.select().from(unmatchedFiles).where(eq(unmatchedFiles.path, entry.path)).get()
      // the same reason again isn't news: the row (and its time) stays as it was
      if (
        at &&
        at.kind === values.kind &&
        at.itemId === values.itemId &&
        at.reason === values.reason &&
        at.message === values.message &&
        at.size === values.size
      )
        return
      db.insert(unmatchedFiles)
        .values(values)
        .onConflictDoUpdate({
          target: unmatchedFiles.path,
          set: {
            kind: values.kind,
            rootFolder: values.rootFolder,
            itemId: values.itemId,
            reason: values.reason,
            message: values.message,
            size: values.size,
            ...(at ? {} : { foundAt: values.foundAt }),
          },
        })
        .run()
    },
    clear(path: string) {
      db.delete(unmatchedFiles).where(eq(unmatchedFiles.path, path)).run()
    },
    /** What's unmatched, under one root folder or every one, oldest first. */
    list(rootFolder?: string) {
      const q = db.select().from(unmatchedFiles)
      return (rootFolder ? q.where(eq(unmatchedFiles.rootFolder, rootFolder)) : q)
        .orderBy(asc(unmatchedFiles.path))
        .all()
    },
    has(path: string) {
      return !!db
        .select({ path: unmatchedFiles.path })
        .from(unmatchedFiles)
        .where(eq(unmatchedFiles.path, path))
        .get()
    },
  }

  // ---------------------------------------------------------------- reads

  const episodesOf = (showId: string) =>
    db
      .select()
      .from(mediaItems)
      .where(and(eq(mediaItems.showId, showId), eq(mediaItems.type, 'episode')))
      .orderBy(asc(mediaItems.seasonNumber), asc(mediaItems.episodeNumber))
      .all()

  /** Each episode's first version (an episode has one, `Default`, ADR 0064). */
  function versionsOf(itemIds: readonly string[]) {
    const out = new Map<string, typeof versions.$inferSelect>()
    if (itemIds.length === 0) return out
    const rows = db
      .select()
      .from(versions)
      .where(inArray(versions.itemId, [...itemIds]))
      .orderBy(asc(versions.position))
      .all()
    for (const v of rows) if (!out.has(v.itemId)) out.set(v.itemId, v)
    return out
  }

  /** The show's episodes by season, for `episodeMatch`. */
  function seasonsOf(episodes: readonly ItemRow[]) {
    const seasons = new Map<number, Set<number>>()
    for (const e of episodes) {
      if (e.seasonNumber === null || e.episodeNumber === null) continue
      const set = seasons.get(e.seasonNumber) ?? new Set<number>()
      set.add(e.episodeNumber)
      seasons.set(e.seasonNumber, set)
    }
    return seasons
  }

  /** The show's files under a folder: a file is filed under its first episode (ADR 0064). */
  const filesUnder = (folder: string, episodeIds: readonly string[]) =>
    episodeIds.length === 0
      ? []
      : db
          .select()
          .from(mediaFiles)
          .where(inArray(mediaFiles.itemId, [...episodeIds]))
          .all()
          .filter((f) => isWithin(folder, f.path))

  // ---------------------------------------------------------------- statuses

  /** Episodes back to what their files say: Available with one, else by air date and monitoring. */
  function settle(itemIds: readonly string[]) {
    if (itemIds.length === 0) return
    const today = dayOf(clock.now())
    const rows = db
      .select()
      .from(mediaItems)
      .where(inArray(mediaItems.id, [...itemIds]))
      .all()
    const held = new Set(
      db
        .select({ itemId: versions.itemId, fileId: versions.fileId })
        .from(versions)
        .where(inArray(versions.itemId, [...itemIds]))
        .all()
        .filter((v) => v.fileId)
        .map((v) => v.itemId),
    )
    const now = clock.now()
    for (const row of rows) {
      const status = held.has(row.id)
        ? 'available'
        : row.status === 'downloading'
          ? row.status
          : statusOf(aired({ aired: row.releaseDate }, today), row.monitored)
      if (status !== row.status)
        db.update(mediaItems).set({ status, updatedAt: now }).where(eq(mediaItems.id, row.id)).run()
    }
  }

  /**
   * After episodes were taken from a file: a file no episode points at any more goes; one whose
   * first episode was taken moves to its first remaining episode, so it keeps the others.
   */
  function rehome(fileIds: readonly string[]) {
    for (const fileId of new Set(fileIds)) {
      const file = db.select().from(mediaFiles).where(eq(mediaFiles.id, fileId)).get()
      if (!file) continue
      const holders = db
        .select({ versionId: versions.id, itemId: versions.itemId })
        .from(versions)
        .innerJoin(mediaItems, eq(mediaItems.id, versions.itemId))
        .where(eq(versions.fileId, fileId))
        .orderBy(asc(mediaItems.seasonNumber), asc(mediaItems.episodeNumber))
        .all()
      if (holders.length === 0) {
        db.delete(mediaFiles).where(eq(mediaFiles.id, fileId)).run()
        continue
      }
      if (!holders.some((h) => h.itemId === file.itemId)) {
        const first = holders[0] as (typeof holders)[number]
        db.update(mediaFiles)
          .set({ itemId: first.itemId, versionId: first.versionId })
          .where(eq(mediaFiles.id, fileId))
          .run()
      }
    }
  }

  // ---------------------------------------------------------------- filing

  /** DetectSample's minimum for an episode: Sonarr skips the check for specials. */
  function minimumSeconds(show: ItemRow, season: number, episodes: readonly ItemRow[]): number {
    if (options.sampleSeconds !== undefined) return options.sampleSeconds
    // Sonarr's DetectSample: "Special, skipping sample check"
    // (https://github.com/Sonarr/Sonarr/blob/v4.0.15.2941/src/NzbDrone.Core/MediaFiles/EpisodeImport/DetectSample.cs)
    if (season === 0) return 0
    const meta = metadata.cachedShow(show.tmdbId)
    const own = meta?.seasons
      .find((s) => s.number === season)
      ?.episodes.find((e) => e.number === episodes[0]?.episodeNumber)?.runtimeMinutes
    return minimumRuntimeSeconds(own ?? meta?.runtimeMinutes ?? null)
  }

  /**
   * Records one file against the episodes given, in one transaction: the file's row under its
   * first episode, every episode's version pointing at it, an episode it held before and no longer
   * does cleared. With `take`, episodes another file holds are taken from it (that file keeps the
   * rest); without, such a file is left unmatched.
   */
  function record(args: {
    show: ItemRow
    episodes: ItemRow[]
    found: FoundFile
    info: StoredFileInfo
    quality: string
    releaseGroup: string | null
    sceneName: string
    take: boolean
  }): { fileId: string; already: boolean } | { conflict: string } {
    const { show, episodes, found, info } = args
    const vers = versionsOf(episodes.map((e) => e.id))
    const held = episodes.filter((e) => vers.has(e.id))
    if (held.length === 0) return { conflict: 'Its episodes have no version to hold a file.' }
    const first = held[0] as ItemRow
    const firstVersion = vers.get(first.id) as typeof versions.$inferSelect
    const at = db.select().from(mediaFiles).where(eq(mediaFiles.path, found.path)).get()
    const others = held
      .map((e) => ({ e, fileId: vers.get(e.id)?.fileId ?? null }))
      .filter((x) => x.fileId && x.fileId !== at?.id)
    if (others.length && !args.take) {
      const names = others.map((x) => code(x.e.seasonNumber ?? 0, x.e.episodeNumber ?? 0))
      return {
        conflict: `${names.join(', ')} already ${names.length > 1 ? 'have files' : 'has a file'}.`,
      }
    }
    const heldIds = held.map((e) => e.id)
    const already =
      !!at &&
      at.size === found.size &&
      at.itemId === first.id &&
      held.every((e) => vers.get(e.id)?.fileId === at.id)
    if (already) return { fileId: (at as FileRow).id, already: true }
    const fileId = db.transaction((tx) => {
      const id = at?.id ?? newId('fil')
      const values = {
        itemId: first.id,
        versionId: firstVersion.id,
        path: found.path,
        size: found.size,
        quality: args.quality,
        releaseGroup: args.releaseGroup,
        sceneName: args.sceneName,
        edition: null,
        mediaInfo: info,
        transfer: null,
      }
      if (at) tx.update(mediaFiles).set(values).where(eq(mediaFiles.id, id)).run()
      else
        tx.insert(mediaFiles)
          .values({ id, ...values, addedAt: clock.now() })
          .run()
      writeFileFacts(tx, id, info.probe)
      // what this file held before and doesn't now
      const before = tx
        .select({ itemId: versions.itemId })
        .from(versions)
        .where(eq(versions.fileId, id))
        .all()
        .map((v) => v.itemId)
      const dropped = before.filter((itemId) => !heldIds.includes(itemId))
      if (dropped.length)
        tx.update(versions)
          .set({ fileId: null })
          .where(and(eq(versions.fileId, id), inArray(versions.itemId, dropped)))
          .run()
      tx.update(versions)
        .set({ fileId: id })
        .where(
          inArray(
            versions.id,
            held.map((e) => (vers.get(e.id) as typeof versions.$inferSelect).id),
          ),
        )
        .run()
      tx.delete(unmatchedFiles).where(eq(unmatchedFiles.path, found.path)).run()
      return { id, dropped }
    })
    rehome(others.map((x) => x.fileId as string))
    settle([...heldIds, ...fileId.dropped, ...others.map((x) => x.e.id)])
    log.info('filed an episode file', {
      tmdbId: show.tmdbId,
      path: found.path,
      episodes: held.map((e) => code(e.seasonNumber ?? 0, e.episodeNumber ?? 0)),
    })
    return { fileId: fileId.id, already: false }
  }

  /**
   * Files one video found in a show's folder: matched by its name, probed, and recorded; or kept
   * unmatched with its reason; or skipped (an extra, a sample), which isn't kept. Safe to repeat.
   */
  async function fileOne(
    show: ItemRow,
    found: FoundFile,
    {
      message = 'Found in the show’s folder.',
      episodes: given,
    }: { message?: string; episodes?: ItemRow[] } = {},
  ): Promise<FileOutcome> {
    const rows = given ?? episodesOf(show.id)
    const keep = (reason: UnmatchedFileReason, why: string): FileOutcome => {
      unmatched.put({
        path: found.path,
        kind: 'episode-file',
        rootFolder: show.rootFolder,
        itemId: show.id,
        reason,
        message: why,
        size: found.size,
      })
      return { status: 'unmatched', reason, message: why }
    }
    // an extra or a macOS resource file is no episode, and isn't kept as unmatched either
    const early = skipBeforeProbe(found.path, show.path)
    if (early) return { status: 'skipped', why: early }
    const match = episodeMatch(found.path, show.path, seasonsOf(rows))
    if (!match.ok) return keep(match.reason, match.message)
    const episodes = match.episodes
      .map((n) => rows.find((r) => r.seasonNumber === match.season && r.episodeNumber === n))
      .filter((r): r is ItemRow => !!r)
    const probed = await probeFile(
      probe,
      found,
      show.path,
      minimumSeconds(show, match.season, episodes),
    )
    if (probed.skip !== null) {
      // a probe that failed is the owner's to see; a sample is skipped quietly
      if (probed.info === null) return keep('unreadable', probed.skip)
      unmatched.clear(found.path)
      return { status: 'skipped', why: probed.skip }
    }
    const own = basename(found.path, extname(found.path))
    const release = parse(own)
    const stats = await fsp.stat(found.path).catch(() => null)
    const info: StoredFileInfo = {
      probe: probed.info,
      revision: release.quality.revision,
      formats: [],
      formatScore: 0,
      mtimeMs: stats?.mtimeMs ?? found.mtimeMs,
    }
    const quality = qualityFor(release, probed.info, null)
    const done = record({
      show,
      episodes,
      found,
      info,
      quality,
      releaseGroup: release.releaseGroup,
      sceneName: own,
      take: false,
    })
    if ('conflict' in done) return keep('episode-has-file', done.conflict)
    if (!done.already)
      await afterFiling(show, episodes[0] as ItemRow, done.fileId, found, quality, message)
    return {
      status: 'filed',
      fileId: done.fileId,
      episodes: episodes.map((e) => e.id),
      already: done.already,
    }
  }

  /** The history entry (once per file), the import hook and the announcement. */
  async function afterFiling(
    show: ItemRow,
    first: ItemRow,
    fileId: string,
    found: FoundFile,
    quality: string,
    message: string,
  ) {
    const key = `${found.path}|${found.size}`
    if (!media.history.has(first.id, 'imported', 'key', key))
      media.history.write({
        itemId: first.id,
        type: 'imported',
        sourceTitle: basename(found.path),
        quality,
        message,
        // in place: the notifications leave it out, as they do a film the scan found
        data: { key, fileId, path: found.path, size: found.size, inPlace: true },
      })
    try {
      await options.hooks?.afterImport?.({
        fileId,
        itemId: first.id,
        path: found.path,
        sourceFolder: dirname(found.path),
        inPlace: true,
      })
    } catch (e) {
      log.warn('the import hook failed', { path: found.path, error: (e as Error).message })
    }
    announce(events, [show.tmdbId])
  }

  /** A file that's gone from disk: every episode it held loses it. */
  function remove(file: FileRow, show: ItemRow | null) {
    const holders = db
      .select({ itemId: versions.itemId })
      .from(versions)
      .where(eq(versions.fileId, file.id))
      .all()
      .map((v) => v.itemId)
    db.transaction((tx) => {
      tx.update(versions).set({ fileId: null }).where(eq(versions.fileId, file.id)).run()
      tx.delete(mediaFiles).where(eq(mediaFiles.id, file.id)).run()
    })
    settle([...holders, file.itemId])
    media.history.write({
      itemId: file.itemId,
      type: 'deleted',
      sourceTitle: file.sceneName ?? basename(file.path),
      quality: file.quality,
      message: 'The file was deleted outside highsea.',
      data: { path: file.path, fileId: file.id },
    })
    if (show) announce(events, [show.tmdbId])
  }

  /** A file whose size or time changed: probed again, its facts updated. */
  async function changed(file: FileRow, found: FoundFile, show: ItemRow) {
    const p = await probeFile(probe, found, show.path, 0)
    const stored = file.mediaInfo as StoredFileInfo | null
    const next: StoredFileInfo = {
      probe: p.info ?? stored?.probe ?? (null as unknown as StoredFileInfo['probe']),
      revision: stored?.revision ?? { version: 1, real: 0, proper: false, repack: false },
      formats: stored?.formats ?? [],
      formatScore: stored?.formatScore ?? 0,
      mtimeMs: found.mtimeMs,
    }
    db.transaction((tx) => {
      tx.update(mediaFiles)
        .set({ size: found.size, mediaInfo: next })
        .where(eq(mediaFiles.id, file.id))
        .run()
      if (next.probe) writeFileFacts(tx, file.id, next.probe)
    })
    announce(events, [show.tmdbId])
  }

  /**
   * Brings a show's files in step with its folder (or one folder inside it): files gone are
   * removed, changed ones probed again, new ones filed or kept unmatched. A folder that can't be
   * read is left alone, so a missing disk never reads as every episode deleted. Safe to repeat.
   */
  async function reconcile(show: ItemRow, scope: string = show.path): Promise<ReconcileResult> {
    const result: ReconcileResult = { added: 0, changed: 0, removed: 0, unmatched: 0 }
    const readable = await fsp.readdir(scope).then(
      () => true,
      () => false,
    )
    // the show's own folder gone: its files are gone; a root that can't be read is checked first
    const found = readable ? (await listFiles(scope, MAX_FILES)).filter((f) => isVideo(f.path)) : []
    const onDisk = new Map(found.map((f) => [f.path, f]))
    const episodes = episodesOf(show.id)
    const known = filesUnder(
      scope,
      episodes.map((e) => e.id),
    )
    for (const file of known) {
      const there = onDisk.get(file.path)
      if (!there) {
        // only what's really gone: a walk that stopped early mustn't delete anything
        if (await fsp.lstat(file.path).catch(() => null)) continue
        remove(file, show)
        result.removed++
        continue
      }
      const stored = file.mediaInfo as StoredFileInfo | null
      const mtimeChanged =
        stored?.mtimeMs !== undefined &&
        there.mtimeMs !== undefined &&
        Math.trunc(stored.mtimeMs) !== Math.trunc(there.mtimeMs)
      if (there.size !== file.size || mtimeChanged) {
        await changed(file, there, show)
        result.changed++
      }
    }
    // unmatched files that are gone go too
    for (const u of unmatched.list(show.rootFolder))
      if (u.itemId === show.id && isWithin(scope, u.path) && !onDisk.has(u.path))
        if (!(await fsp.lstat(u.path).catch(() => null))) unmatched.clear(u.path)

    const knownPaths = new Set(known.map((f) => f.path))
    for (const f of found) {
      if (knownPaths.has(f.path)) continue
      // a file kept unmatched is tried again (TMDB may list its episode now), counted once
      const kept = unmatched.has(f.path)
      const outcome = await fileOne(show, f, { episodes })
      if (outcome.status === 'filed' && !outcome.already) result.added++
      if (outcome.status === 'unmatched' && !kept) result.unmatched++
    }
    return result
  }

  /**
   * Files a video under the episodes the owner picks (the admin's resolve, part B's fourth task;
   * anime's absolute numbers until their mapping): it's probed, and an episode another file holds
   * is taken from it, that file keeping its others.
   */
  async function assign(
    show: ItemRow,
    path: string,
    picks: readonly { season: number; episode: number }[],
  ): Promise<{ fileId: string }> {
    if (!isWithin(show.path, path) || path === show.path)
      throw new AppError('invalid', 'The file isn’t in the show’s folder.', {
        reason: 'outside-show',
      })
    const rows = episodesOf(show.id)
    const episodes = picks.map((p) => {
      const row = rows.find((r) => r.seasonNumber === p.season && r.episodeNumber === p.episode)
      if (!row)
        throw new AppError('not-found', `The show has no ${code(p.season, p.episode)}.`, {
          reason: 'unknown-episode',
        })
      return row
    })
    if (episodes.length === 0)
      throw new AppError('invalid', 'Pick at least one episode.', { reason: 'no-episodes' })
    const stats = await fsp.stat(path).catch(() => null)
    if (!stats?.isFile())
      throw new AppError('not-found', 'That file isn’t there.', { reason: 'no-file' })
    const found: FoundFile = { path, size: stats.size, mtimeMs: stats.mtimeMs }
    const probed = await probeFile(probe, found, show.path, 0)
    if (probed.skip !== null || !probed.info)
      throw new AppError('invalid', probed.skip ?? 'The file can’t be read.', {
        reason: 'unreadable',
      })
    const own = basename(path, extname(path))
    const release = parse(own)
    const quality = qualityFor(release, probed.info, null)
    const done = record({
      show,
      episodes,
      found,
      info: {
        probe: probed.info,
        revision: release.quality.revision,
        formats: [],
        formatScore: 0,
        mtimeMs: stats.mtimeMs,
      },
      quality,
      releaseGroup: release.releaseGroup,
      sceneName: own,
      take: true,
    })
    if ('conflict' in done)
      throw new AppError('conflict', done.conflict, { reason: 'episode-has-file' })
    await afterFiling(show, episodes[0] as ItemRow, done.fileId, found, quality, 'Matched by hand.')
    return { fileId: done.fileId }
  }

  return { fileOne, reconcile, assign, remove, unmatched, episodesOf }
}

export type ShowFiles = ReturnType<typeof createShowFiles>

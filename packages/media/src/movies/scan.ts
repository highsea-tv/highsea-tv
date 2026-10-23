// SPDX-License-Identifier: AGPL-3.0-only
// The library scan (checkpoint 6, Watching the filesystem and the library scan, 6b): the source of
// truth for what's on disk. A job walks each root folder every 12 hours, as Jellyfin's library scan
// does (RefreshMediaLibraryTask.cs, a 12-hour interval trigger:
// https://github.com/jellyfin/jellyfin/blob/master/Emby.Server.Implementations/ScheduledTasks/Tasks/RefreshMediaLibraryTask.cs),
// and again for a title's folder after each import and whenever watching (shared/watching.ts) sees
// a change there. It finds files added, changed or removed outside highsea:
// - a video that appears in a movie's folder is probed and recorded against a version without a
//   file, in place (imports.adopt), unless it's a sample, an extra or unreadable;
// - one whose size or modification time changed is probed again;
// - one that's gone clears its version's file, and with Stop monitoring deleted files on (Settings
//   › Media management), the movie stops being monitored.
// A root folder that can't be read (an unmounted disk) is skipped whole, so a missing disk never
// reads as every file deleted. Safe to repeat (ADR 0022): a second scan finds nothing to do.
import { promises as fsp } from 'node:fs'
import { basename, dirname, extname } from 'node:path'
import { schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'
import { writeFileFacts } from '../shared/file-facts.ts'
import { type FoundFile, isVideo, listFiles } from '../shared/files.ts'
import type { Media } from '../shared/index.ts'
import type { ItemRow } from '../shared/map.ts'
import { isWithin } from '../shared/paths.ts'
import { announce, type Ctx, TOPICS } from './context.ts'
import type { Imports, StoredFileInfo } from './import.ts'
import type { Library } from './library.ts'

const { mediaItems, versions, mediaFiles } = schema

export const LIBRARY_SCAN_JOB = 'library.scan'
/** Jellyfin's library scan interval. */
export const SCAN_EVERY_MS = 12 * 60 * 60 * 1000
/** No library comes near it; it bounds one walk. */
const MAX_FILES = 1_000_000

export type ScanResult = {
  added: number
  changed: number
  removed: number
  /** Root folders that couldn't be read, left alone. */
  unreadable: string[]
}

export function createLibraryScan(
  ctx: Ctx,
  deps: { media: Media; library: Library; imports: Imports },
) {
  const { db, events } = ctx
  const { media, library, imports } = deps
  const log = ctx.logger.child('scan')

  const readable = (dir: string) =>
    fsp.readdir(dir).then(
      () => true,
      () => false,
    )

  /** The movie whose folder holds the path, deepest first. */
  function owner(movies: ItemRow[], path: string): ItemRow | null {
    let best: ItemRow | null = null
    for (const m of movies)
      if (isWithin(m.path, dirname(path)) && (!best || m.path.length > best.path.length)) best = m
    return best
  }

  async function removeFile(file: typeof mediaFiles.$inferSelect, unmonitor: boolean) {
    const row = db.select().from(mediaItems).where(eq(mediaItems.id, file.itemId)).get()
    db.transaction((tx) => {
      tx.update(versions).set({ fileId: null }).where(eq(versions.fileId, file.id)).run()
      tx.delete(mediaFiles).where(eq(mediaFiles.id, file.id)).run()
      if (unmonitor)
        tx.update(mediaItems)
          .set({ monitored: false, updatedAt: ctx.clock.now() })
          .where(eq(mediaItems.id, file.itemId))
          .run()
    })
    library.internal.settleFiles(file.itemId)
    if (!row) return
    media.history.write({
      itemId: row.id,
      type: 'deleted',
      sourceTitle: file.sceneName ?? basename(file.path),
      quality: file.quality,
      message: unmonitor
        ? 'The file was deleted outside highsea, so the movie is no longer monitored.'
        : 'The file was deleted outside highsea.',
      data: { path: file.path, fileId: file.id },
    })
    announce(events, [row.tmdbId])
    events.emit({ topic: TOPICS.history, ids: [`movie:${row.tmdbId}`] })
  }

  async function changedFile(file: typeof mediaFiles.$inferSelect, found: FoundFile) {
    const row = db.select().from(mediaItems).where(eq(mediaItems.id, file.itemId)).get()
    const meta = row ? library.internal.cached(row.tmdbId) : null
    const p = await imports.internal.probed(found, dirname(found.path), meta)
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
      writeFileFacts(tx, file.id, next.probe)
    })
    if (row) announce(events, [row.tmdbId])
  }

  async function addedFile(row: ItemRow, found: FoundFile): Promise<boolean> {
    const meta = library.internal.cached(row.tmdbId)
    const p = await imports.internal.probed(found, row.path, meta)
    if (p.skip !== null) {
      log.info('a new file in a movie’s folder was skipped', { path: found.path, why: p.skip })
      return false
    }
    const free = imports.internal.versionRows(row.id).find((v) => !v.fileId)
    if (!free) {
      log.info('a new file appeared, but every version has a file', { path: found.path })
      return false
    }
    const own = basename(found.path, extname(found.path))
    await imports.adopt({
      row,
      version: free,
      path: found.path,
      info: p.info,
      sourceTitle: own,
      message: 'Found in the movie’s folder.',
    })
    return true
  }

  /**
   * Scans every root folder, or only `folder` (a title's folder, after an import or a change seen
   * by watching) when it's inside one.
   */
  async function scan({ folder }: { folder?: string } = {}): Promise<ScanResult> {
    const result: ScanResult = { added: 0, changed: 0, removed: 0, unreadable: [] }
    const roots = media.rootFolders.list().map((r) => r.path)
    const scopes = folder ? (roots.some((r) => isWithin(r, folder)) ? [folder] : []) : roots
    const settings = media.mediaManagement.get()
    for (const scope of scopes) {
      const root = roots.find((r) => isWithin(r, scope)) as string
      if (!(await readable(root))) {
        result.unreadable.push(root)
        log.warn('a root folder can’t be read; the scan leaves it alone', { root })
        continue
      }
      // a title folder that's gone is a scan of what was in it: everything there was removed
      const found = (await readable(scope))
        ? (await listFiles(scope, MAX_FILES)).filter((f) => isVideo(f.path))
        : []
      const onDisk = new Map(found.map((f) => [f.path, f]))
      const known = db
        .select()
        .from(mediaFiles)
        .all()
        .filter((f) => isWithin(scope, f.path))
      const knownPaths = new Set(known.map((f) => f.path))

      for (const file of known) {
        const there = onDisk.get(file.path)
        if (!there) {
          // only what's really gone: a walk that stopped early mustn't delete anything
          if (await fsp.lstat(file.path).catch(() => null)) continue
          await removeFile(file, settings.unmonitorDeleted)
          result.removed++
          continue
        }
        const stored = file.mediaInfo as StoredFileInfo | null
        const mtimeChanged =
          stored?.mtimeMs !== undefined &&
          there.mtimeMs !== undefined &&
          Math.trunc(stored.mtimeMs) !== Math.trunc(there.mtimeMs)
        if (there.size !== file.size || mtimeChanged) {
          await changedFile(file, there)
          result.changed++
        }
      }

      const fresh = found.filter((f) => !knownPaths.has(f.path))
      if (fresh.length) {
        const movies = db
          .select()
          .from(mediaItems)
          .where(eq(mediaItems.type, 'movie'))
          .all()
          .filter((m) => isWithin(root, m.path)) as ItemRow[]
        for (const f of fresh) {
          const row = owner(movies, f.path)
          if (row && (await addedFile(row, f))) result.added++
        }
      }
    }
    if (result.added || result.changed || result.removed)
      log.info('the library scan found changes', { ...result, folder: folder ?? null })
    return result
  }

  return { scan }
}

export type LibraryScan = ReturnType<typeof createLibraryScan>

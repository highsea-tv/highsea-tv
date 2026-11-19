// SPDX-License-Identifier: AGPL-3.0-only
// The shows' library scan (Phase 5 B), films' scan (movies/scan.ts) for Shows root folders: every
// 12 hours as Jellyfin's library scan runs, and for one folder when watching sees a change there
// or the owner asks. Through the same job machinery (`shows.scan`, deduped per folder):
// - each show in the library has its folder reconciled: files gone are removed from their
//   episodes, changed ones probed again, new ones matched to episodes or kept unmatched
//   (files.ts);
// - a folder under the root that's no show's goes to the import's `addNew`: added in place when
//   it's identified surely, else kept unmatched with its reason.
// A root folder that can't be read (an unmounted disk) is skipped whole, so a missing disk never
// reads as every episode deleted. Safe to repeat (ADR 0022): a second scan finds nothing to do.
import { promises as fsp } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { schema } from '@highsea-tv/db'
import { and, eq } from 'drizzle-orm'
import type { Media } from '../shared/index.ts'
import { isWithin } from '../shared/paths.ts'
import type { ShowsDeps } from './context.ts'
import type { ShowFiles } from './files.ts'
import type { ShowLibraryImport } from './library-import.ts'

const { mediaItems } = schema

export const SHOW_SCAN_JOB = 'shows.scan'

export type ShowScanResult = {
  /** Episode files filed in shows already in the library. */
  added: number
  changed: number
  removed: number
  /** Files kept unmatched this scan. */
  unmatched: number
  /** Shows added from new folders identified surely. */
  shows: number
  /** New folders kept unmatched. */
  waiting: number
  /** Root folders that couldn't be read, left alone. */
  unreadable: string[]
}

export function createShowScan(
  ctx: ShowsDeps,
  deps: { media: Media; files: ShowFiles; addNew: ShowLibraryImport['addNew'] },
) {
  const { db } = ctx
  const { media, files, addNew } = deps
  const log = ctx.logger.child('shows-scan')

  const readable = (dir: string) =>
    fsp.readdir(dir).then(
      () => true,
      () => false,
    )

  /**
   * Scans every Shows root folder, or only `folder` (a show's folder, or a folder in one, after a
   * change seen by watching) when it's inside one.
   */
  async function scan({ folder }: { folder?: string } = {}): Promise<ShowScanResult> {
    const result: ShowScanResult = {
      added: 0,
      changed: 0,
      removed: 0,
      unmatched: 0,
      shows: 0,
      waiting: 0,
      unreadable: [],
    }
    const roots = media.rootFolders.list('shows').map((r) => r.path)
    const scopes = folder ? (roots.some((r) => isWithin(r, folder)) ? [folder] : []) : roots
    for (const scope of scopes) {
      const root = roots.find((r) => isWithin(r, scope)) as string
      if (!(await readable(root))) {
        result.unreadable.push(root)
        log.warn('a root folder can’t be read; the scan leaves it alone', { root })
        continue
      }
      const shows = db
        .select()
        .from(mediaItems)
        .where(and(eq(mediaItems.type, 'show'), eq(mediaItems.rootFolder, root)))
        .all()
      // the shows the scope touches: every one for the root, else the one whose folder holds it
      const touched = shows.filter(
        (s) => scope === root || isWithin(s.path, scope) || isWithin(scope, s.path),
      )
      for (const show of touched) {
        const within = scope !== root && isWithin(show.path, scope) ? scope : show.path
        const r = await files.reconcile(show, within)
        result.added += r.added
        result.changed += r.changed
        result.removed += r.removed
        result.unmatched += r.unmatched
      }
      // folders under the root that are no show's: new shows
      const owned = new Set(shows.map((s) => s.path))
      const candidates =
        scope === root
          ? (await fsp.readdir(root, { withFileTypes: true }).catch(() => []))
              .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('@'))
              .map((e) => join(root, e.name))
          : [join(root, relative(root, scope).split(sep)[0] as string)]
      const fresh = candidates.filter((c) => c !== root && !owned.has(c)).sort()
      // a kept folder that's gone isn't waiting any more
      for (const u of files.unmatched.list(root))
        if (u.kind === 'show-folder' && isWithin(scope, u.path) && !(await readable(u.path)))
          files.unmatched.clear(u.path)
      if (fresh.length) {
        const fromNew = await addNew(root, fresh, { retry: scope !== root })
        result.shows += fromNew.added
        result.waiting += fromNew.waiting
      }
    }
    if (result.added || result.shows || result.changed || result.removed)
      log.info('the shows scan found changes', { ...result, folder: folder ?? null })
    return result
  }

  return { scan }
}

export type ShowScan = ReturnType<typeof createShowScan>

// SPDX-License-Identifier: AGPL-3.0-only
// The recycle bin and permissions (checkpoint 6, NFO, artwork, permissions and the recycle bin),
// as Radarr's Media management settings describe them (Servarr wiki, Radarr settings › File
// management and Permissions: https://wiki.servarr.com/radarr/settings#file-management):
// - a replaced or deleted file goes to the recycle bin when one is set, else it's deleted;
// - files in the bin longer than the set days are deleted by a job; 0 days keeps them;
// - "Set Permissions" applies the octal mode to new folders, and to new files without execute bits.
import { promises as fsp } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { nodeFs, type TransferFs, transfer } from './transfer.ts'

const DAY = 24 * 60 * 60 * 1000

const code = (e: unknown) => (e as NodeJS.ErrnoException)?.code ?? ''

/**
 * Removes a library file: into `bin`, under `{bin}/{movie folder}/{name}` as Radarr files it, or
 * deleted when `bin` is empty. A name already in the bin gets a number. Returns where it went, or
 * null when it was deleted or was already gone (safe to repeat).
 */
export async function recycle(
  path: string,
  bin: string,
  now: number,
  fs: TransferFs = nodeFs,
): Promise<string | null> {
  let links: number
  try {
    links = (await fs.stat(path)).nlink
  } catch (e) {
    if (code(e) === 'ENOENT') return null
    throw e
  }
  if (!bin) {
    await fs.unlink(path)
    return null
  }
  const folder = join(bin, basename(dirname(path)))
  const ext = extname(path)
  const stem = basename(path, ext)
  for (let n = 0; ; n++) {
    const dest = join(folder, n === 0 ? `${stem}${ext}` : `${stem} (${n})${ext}`)
    try {
      await fs.stat(dest)
      continue
    } catch (e) {
      if (code(e) !== 'ENOENT') throw e
    }
    await transfer(path, dest, 'move', fs)
    // The bin's clock starts when the file arrives, as Radarr's RecycleBinProvider sets the time
    // on arrival. Not for a file still hardlinked to a download: the time is the inode's, and
    // changing it would make the torrent's resume data look stale. Its data lives on in the
    // download, so emptying it early loses nothing.
    if (links <= 1) {
      const at = new Date(now)
      await fsp.utimes(dest, at, at).catch(() => {})
    }
    return dest
  }
}

/**
 * Deletes what's been in the bin longer than `days`, by modification time, and the folders it
 * leaves empty. 0 days does nothing. Safe to repeat: a second run finds nothing old.
 */
export async function emptyRecycleBin(bin: string, days: number, now: number): Promise<number> {
  if (!bin || days <= 0) return 0
  const cutoff = now - days * DAY
  let removed = 0
  const walk = async (dir: string): Promise<boolean> => {
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch (e) {
      if (code(e) === 'ENOENT') return true
      throw e
    }
    let empty = true
    for (const e of entries) {
      const path = join(dir, e.name)
      if (e.isDirectory()) {
        if (await walk(path)) await fsp.rmdir(path).catch(() => {})
        else empty = false
        continue
      }
      const stat = await fsp.lstat(path).catch(() => null)
      if (stat && stat.mtimeMs < cutoff) {
        await fsp.unlink(path).catch(() => {})
        removed++
      } else empty = false
    }
    return empty
  }
  await walk(bin)
  return removed
}

/** Radarr's chmod: the mode for folders, and without execute bits for files. */
export function modesOf(chmod: string): { folder: number; file: number } {
  const folder = Number.parseInt(chmod, 8)
  return { folder, file: folder & 0o666 }
}

/** Applies the permission setting to a new file and the folders made for it, up to `stopAt`. */
export async function applyPermissions(file: string, chmod: string, stopAt: string) {
  const { folder, file: fileMode } = modesOf(chmod)
  await fsp.chmod(file, fileMode)
  for (let dir = dirname(file); dir.startsWith(stopAt) && dir !== stopAt; dir = dirname(dir))
    await fsp.chmod(dir, folder)
}

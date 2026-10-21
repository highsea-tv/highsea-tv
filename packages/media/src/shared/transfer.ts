// SPDX-License-Identifier: AGPL-3.0-only
// Moving a file into the library (checkpoint 6, The import pipeline, step 6), saying which way it
// went:
// - **hardlink:** `link(2)`, so seeding takes no extra space. It fails with `EXDEV` across
//   filesystems (https://man7.org/linux/man-pages/man2/link.2.html), and SMB and NFS mounts may
//   refuse it with `EPERM` or `ENOTSUP`; then the file is copied.
// - **copy:** `fs.copyFile` with `COPYFILE_FICLONE`, which makes a copy-on-write reflink where the
//   filesystem has them and falls back to a plain copy where it doesn't (Node.js docs:
//   https://nodejs.org/docs/latest-v24.x/api/fs.html#fscopyfilesrc-dest-mode-callback). Node
//   doesn't say which happened, so both are `copy`.
// - **move:** `rename(2)`, and across filesystems (`EXDEV`) a copy, then the source unlinked.
// Each writes beside the destination and renames into place, so a crash never leaves half a file
// under the library's name, and a repeat finds the finished file and does nothing.
import { constants, promises as fsp, type Stats } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { newId } from '@highsea/core'

/** The filesystem calls transfers make, injectable so a test can force `EXDEV`. */
export type TransferFs = {
  link(src: string, dest: string): Promise<void>
  copyFile(src: string, dest: string, mode: number): Promise<void>
  rename(src: string, dest: string): Promise<void>
  unlink(path: string): Promise<void>
  stat(path: string): Promise<Stats>
  mkdir(path: string, options: { recursive: true }): Promise<unknown>
}

export const nodeFs: TransferFs = {
  link: (s, d) => fsp.link(s, d),
  copyFile: (s, d, m) => fsp.copyFile(s, d, m),
  rename: (s, d) => fsp.rename(s, d),
  unlink: (p) => fsp.unlink(p),
  stat: (p) => fsp.stat(p),
  mkdir: (p, o) => fsp.mkdir(p, o),
}

export type TransferMode = 'hardlink' | 'copy' | 'move'
export type TransferMethod = 'hardlink' | 'copy' | 'move'

export type TransferResult = {
  method: TransferMethod
  /** Why it isn't what was asked: across filesystems, or the filesystem refused hardlinks. */
  fallback: 'cross-device' | 'not-supported' | null
  /** The destination was already the finished file; nothing was done. */
  already: boolean
}

/** Errors that mean "hardlinks can't be made here", not "something is wrong". */
const NO_LINK = new Set(['EXDEV', 'EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EMLINK'])

const code = (e: unknown) => (e as NodeJS.ErrnoException)?.code ?? ''

async function statOrNull(fs: TransferFs, path: string): Promise<Stats | null> {
  try {
    return await fs.stat(path)
  } catch (e) {
    if (code(e) === 'ENOENT') return null
    throw e
  }
}

/** A temporary name beside `dest`, hidden, so a scan never takes it for a film. */
const besideTemp = (dest: string) => join(dirname(dest), `.${basename(dest)}.${newId('tmp')}.part`)

async function copyInto(fs: TransferFs, src: string, dest: string) {
  const temp = besideTemp(dest)
  try {
    await fs.copyFile(src, temp, constants.COPYFILE_FICLONE)
    await fs.rename(temp, dest)
  } catch (e) {
    await fs.unlink(temp).catch(() => {})
    throw e
  }
}

/**
 * Puts `src` at `dest`. `dest` must not exist, or must already be `src`'s finished transfer: the
 * same inode (a hardlink), or for a copy or a move, a file of the same size where the source is
 * gone or matches. Anything else at `dest` is the caller's to clear first (the replace step).
 */
export async function transfer(
  src: string,
  dest: string,
  mode: TransferMode,
  fs: TransferFs = nodeFs,
): Promise<TransferResult> {
  const [from, to] = await Promise.all([statOrNull(fs, src), statOrNull(fs, dest)])
  if (to) {
    const same = from && from.dev === to.dev && from.ino === to.ino
    if (same)
      return { method: mode === 'move' ? 'move' : 'hardlink', fallback: null, already: true }
    if (!from && mode === 'move') return { method: 'move', fallback: null, already: true }
    if (from && from.size === to.size && mode !== 'move')
      return { method: 'copy', fallback: null, already: true }
    // a move across disks that stopped after the copy (renamed into place whole) and before the unlink
    if (from && from.size === to.size && mode === 'move' && from.dev !== to.dev) {
      await fs.unlink(src)
      return { method: 'move', fallback: 'cross-device', already: true }
    }
    throw Object.assign(new Error(`${dest} already exists.`), { code: 'EEXIST' })
  }
  if (!from) throw Object.assign(new Error(`${src} doesn’t exist.`), { code: 'ENOENT' })
  await fs.mkdir(dirname(dest), { recursive: true })

  if (mode === 'hardlink') {
    try {
      await fs.link(src, dest)
      return { method: 'hardlink', fallback: null, already: false }
    } catch (e) {
      if (!NO_LINK.has(code(e))) throw e
      await copyInto(fs, src, dest)
      return {
        method: 'copy',
        fallback: code(e) === 'EXDEV' ? 'cross-device' : 'not-supported',
        already: false,
      }
    }
  }
  if (mode === 'copy') {
    await copyInto(fs, src, dest)
    return { method: 'copy', fallback: null, already: false }
  }
  try {
    await fs.rename(src, dest)
    return { method: 'move', fallback: null, already: false }
  } catch (e) {
    if (code(e) !== 'EXDEV') throw e
    await copyInto(fs, src, dest)
    await fs.unlink(src)
    return { method: 'move', fallback: 'cross-device', already: false }
  }
}

/** What the history says about a transfer, in the parent plan's words. */
export function transferMessage(r: Pick<TransferResult, 'method' | 'fallback'>): string {
  if (r.method === 'hardlink') return 'Hardlinked: seeding takes no extra space.'
  if (r.method === 'move')
    return r.fallback === 'cross-device'
      ? 'Moved: copied to the other disk, then removed.'
      : 'Moved.'
  if (r.fallback === 'cross-device') return 'Copied: the downloads folder is on another disk.'
  if (r.fallback === 'not-supported') return 'Copied: this disk doesn’t support hardlinks.'
  return 'Copied.'
}

// SPDX-License-Identifier: AGPL-3.0-only
// The admin's folder browser (A17's Browse, checkpoint 6): folders and files inside the data root,
// the root folders and the downloads folder, never elsewhere. Each path is resolved through
// symlinks before the prefix check (OWASP Path Traversal: canonicalize, then compare), with
// `checkPath` from the import pipeline, so the browser and the importer agree on what's inside.
import { accessSync, constants, type Dirent, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { AppError } from '@highsea-tv/core'
import { checkPath, isWithin, realOrParent } from '@highsea-tv/media/shared'

export type BrowseEntry = { name: string; path: string; kind: 'folder' | 'file'; size?: number }
export type BrowseListing = { path: string; parent: string | null; entries: BrowseEntry[] }

/** At most this many entries come back; a folder with more is cut, folders first. */
const MAX_ENTRIES = 2000

export function browse(roots: readonly string[], path: string | undefined): BrowseListing {
  const target = path ?? roots[0]
  if (!target) throw new AppError('not-found', 'There’s no folder to browse yet.')
  let real: string
  try {
    real = checkPath(target, roots)
  } catch {
    throw new AppError('forbidden', `${target} is outside the folders highsea may look in.`)
  }
  let names: Dirent[]
  try {
    names = readdirSync(real, { withFileTypes: true })
  } catch {
    throw new AppError('not-found', `${target} doesn’t exist on the server, or isn’t a folder.`)
  }
  const entries: BrowseEntry[] = []
  for (const d of names) {
    if (d.name.startsWith('.')) continue
    const full = join(real, d.name)
    if (d.isDirectory()) entries.push({ name: d.name, path: full, kind: 'folder' })
    else if (d.isFile()) {
      let size: number | undefined
      try {
        size = statSync(full).size
      } catch {
        // gone since the listing, or unreadable: listed without a size
      }
      entries.push({ name: d.name, path: full, kind: 'file', size })
    }
  }
  entries.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1,
  )
  const up = dirname(real)
  let parent: string | null = null
  if (up !== real)
    try {
      parent = checkPath(up, roots)
    } catch {
      parent = null
    }
  // a root's parent is outside unless another root holds it
  if (parent && !roots.some((r) => isWithin(r, parent as string))) parent = null
  return { path: real, parent, entries: entries.slice(0, MAX_ENTRIES) }
}

// ---------------------------------------------------------------- the folder picker's listing

export type FolderListing = {
  /** The folder listed, absolute and normalized (`..` resolved), as asked for. */
  path: string
  /** The allowed folder it's in, where the picker's path starts. */
  root: string
  /** The folder above, while it's still inside an allowed folder; else null. */
  parent: string | null
  folders: { name: string; path: string }[]
  /** Folders left out past `MAX_FOLDERS`, sorted last by name. */
  more: number
  /** Whether highsea may write here (`fs.accessSync` with `W_OK`). */
  writable: boolean
}

const denied = (e: unknown) => {
  const code = (e as NodeJS.ErrnoException).code
  return code === 'EACCES' || code === 'EPERM'
}

/** Whether `path`, symlinks resolved, is inside one of the hidden folders. */
function isHiddenPath(hidden: readonly string[], path: string): boolean {
  try {
    const real = realOrParent(path)
    return hidden.filter(Boolean).some((h) => isWithin(realOrParent(h), real))
  } catch {
    // can't be resolved: compared as written
    return hidden.filter(Boolean).some((h) => isWithin(resolve(h), resolve(path)))
  }
}

/** At most this many folders come back; the picker filters within them. */
export const MAX_FOLDERS = 5000

/** Names in the order a person reads them: case aside, `2` before `10` (ECMA-402 Intl.Collator). */
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/**
 * The folders inside `path` for the admin's folder picker (HT-91): names and paths only, never
 * files. `path` must be inside one of `roots` once `..` and symlinks are resolved (`checkPath`,
 * OWASP Path Traversal: canonicalize, then compare), and never inside one of `hidden` (the config
 * folder, which holds the database and keys), even when a root holds it. Without `path`, the first
 * root. Errors say which state the picker shows, by `details.reason`: `outside`, `missing`,
 * `unreadable`. The codes are Node's system errors
 * (https://nodejs.org/docs/latest-v24.x/api/errors.html#common-system-errors): ENOENT and ENOTDIR
 * for a folder that isn't there, EACCES and EPERM for one whose permissions keep highsea out.
 */
export function browseFolders(
  roots: readonly string[],
  hidden: readonly string[],
  path: string | undefined,
): FolderListing {
  const target = path || roots[0]
  if (!target) throw new AppError('not-found', 'There’s no folder to browse yet.')
  const outside = () =>
    new AppError('forbidden', `${target} is outside the folders highsea may look in.`, {
      reason: 'outside',
    })
  const unreadable = (p: string) =>
    new AppError('forbidden', `highsea can’t read ${p}.`, { reason: 'unreadable' })
  let normalized: string
  try {
    normalized = checkPath(target, roots)
  } catch (e) {
    // resolving a folder whose permissions keep highsea out can fail itself (realpath(3) opens it
    // on macOS): it's unreadable when its parent, which holds the name, is inside
    if (!denied(e)) throw outside()
    try {
      normalized = join(checkPath(dirname(resolve(target)), roots), basename(resolve(target)))
    } catch {
      throw outside()
    }
    if (isHiddenPath(hidden, dirname(normalized))) throw outside()
    throw unreadable(normalized)
  }
  const isHidden = (p: string) => isHiddenPath(hidden, p)
  if (isHidden(normalized)) throw outside()

  let names: Dirent[]
  try {
    if (!statSync(normalized).isDirectory()) throw Object.assign(new Error(), { code: 'ENOTDIR' })
    names = readdirSync(normalized, { withFileTypes: true })
  } catch (e) {
    if (denied(e)) throw unreadable(normalized)
    throw new AppError('not-found', `${normalized} doesn’t exist on the server.`, {
      reason: 'missing',
    })
  }

  // a plain folder here is hidden only when it is a hidden folder; a symlink is resolved first
  const here = realOrParent(normalized)
  const hiddenHere = new Set(hidden.filter(Boolean).map((h) => realOrParent(h)))
  const folders: { name: string; path: string }[] = []
  for (const d of names) {
    if (d.name.startsWith('.')) continue
    const full = join(normalized, d.name)
    let folder = d.isDirectory()
    // a symlink counts when it leads to a folder (`statSync` follows it); going in is checked then
    if (!folder && d.isSymbolicLink())
      try {
        folder = statSync(full).isDirectory()
      } catch {
        folder = false
      }
    const hiddenOne = d.isSymbolicLink() ? isHidden(full) : hiddenHere.has(join(here, d.name))
    if (folder && !hiddenOne) folders.push({ name: d.name, path: full })
  }
  folders.sort((a, b) => byName.compare(a.name, b.name))

  const holding = roots
    .filter(Boolean)
    .map((r) => resolve(r))
    .filter((r) => isWithin(r, normalized))
    .sort((a, b) => a.length - b.length)
  const root = holding[0] ?? normalized
  const up = dirname(normalized)
  const parent = up !== normalized && isWithin(root, up) && !isHidden(up) ? up : null

  let writable = false
  try {
    accessSync(normalized, constants.W_OK)
    writable = true
  } catch {
    // read-only: a share mounted :ro, or permissions that keep highsea to reading
  }
  return {
    path: normalized,
    root,
    parent,
    folders: folders.slice(0, MAX_FOLDERS),
    more: Math.max(0, folders.length - MAX_FOLDERS),
    writable,
  }
}

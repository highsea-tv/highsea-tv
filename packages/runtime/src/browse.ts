// SPDX-License-Identifier: AGPL-3.0-only
// The admin's folder browser (A17's Browse, checkpoint 6): folders and files inside the data root,
// the root folders and the downloads folder, never elsewhere. Each path is resolved through
// symlinks before the prefix check (OWASP Path Traversal: canonicalize, then compare), with
// `checkPath` from the import pipeline, so the browser and the importer agree on what's inside.
import { readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AppError } from '@highsea/core'
import { checkPath, isWithin } from '@highsea/media/shared'

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
  let names: import('node:fs').Dirent[]
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

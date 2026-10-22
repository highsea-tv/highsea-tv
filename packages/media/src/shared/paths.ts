// SPDX-License-Identifier: AGPL-3.0-only
// Every path importing touches is checked first (phase-3-server.md, Known pitfalls › Paths): made
// absolute and normalized, then resolved through symlinks (`fs.realpathSync`, Node.js docs:
// https://nodejs.org/docs/latest-v24.x/api/fs.html#fsrealpathsyncpath-options), and it must land
// inside an allowed root: the root folders and the downloads folder. A path that doesn't exist yet
// (a destination) is checked through its nearest existing parent, so a symlinked folder can't lead
// a new file out of the roots either.
import { realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { AppError } from '@highsea-tv/core'

export const outsideRoots = (path: string) =>
  new AppError('invalid', `${path} isn’t inside a root folder or the downloads folder.`, {
    reason: 'outside-roots',
  })

/** Whether `inner` is `outer` or inside it; both absolute and normalized. */
export function isWithin(outer: string, inner: string): boolean {
  const rel = relative(outer, inner)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/** The real path, or for a path that doesn't exist, its nearest existing parent's real path joined with the rest. */
export function realOrParent(path: string): string {
  let current = resolve(path)
  const rest: string[] = []
  for (;;) {
    try {
      return join(realpathSync(current), ...rest.reverse())
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw e
      const parent = dirname(current)
      if (parent === current) return join(current, ...rest.reverse())
      rest.push(basename(current))
      current = parent
    }
  }
}

/** The roots, real and normalized, skipping any that don't exist. */
function realRoots(roots: readonly string[]): string[] {
  const out: string[] = []
  for (const r of roots) {
    if (!r || !isAbsolute(r)) continue
    try {
      out.push(realpathSync(resolve(r)))
    } catch {
      // a root that's missing (an unmounted disk) allows nothing
    }
  }
  return out
}

/**
 * The path, absolute and normalized, if it's inside one of the roots once symlinks are resolved;
 * otherwise an `outside-roots` AppError. Relative paths are refused: nothing here has a working
 * directory to be relative to.
 */
export function checkPath(path: string, roots: readonly string[]): string {
  if (typeof path !== 'string' || !path || !isAbsolute(path) || path.includes('\0'))
    throw outsideRoots(String(path))
  const normalized = resolve(path)
  const real = realOrParent(normalized)
  if (!realRoots(roots).some((root) => isWithin(root, real))) throw outsideRoots(normalized)
  return normalized
}

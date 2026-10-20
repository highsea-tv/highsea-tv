// SPDX-License-Identifier: AGPL-3.0-only
// The folders every media type files its titles under. Adding one checks that it's absolute, exists and is a
// directory the server can write to; free space, size and the device are read live each time, so
// an unmounted disk shows as inaccessible rather than with stale numbers.
import { accessSync, constants, statfsSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { RootFolder } from '@highsea/api-contract'
import { AppError, newId } from '@highsea/core'
import { schema } from '@highsea/db'
import type { MediaType } from '@highsea/db/schema'
import { asc, eq, sql } from 'drizzle-orm'
import { invalid, type MediaDeps } from './context.ts'

const { rootFolders, mediaItems } = schema

/** How a refusal names each type: one, then many. A new media type adds its nouns here. */
const NOUNS: Record<MediaType, [string, string]> = { movie: ['movie', 'movies'] }

/** The titles filed under a folder, counted by type. */
export type FiledCounts = Partial<Record<MediaType, number>>

/** "A movie is", "3 movies are", "2 movies and 1 show are": what's filed under a folder. */
function filedPhrase(counts: FiledCounts): string {
  const entries = Object.entries(counts).filter(([, n]) => (n ?? 0) > 0) as [MediaType, number][]
  const total = entries.reduce((sum, [, n]) => sum + n, 0)
  if (total === 1 && entries[0]) return `A ${NOUNS[entries[0][0]][0]} is`
  const parts = entries.map(([type, n]) => `${n} ${NOUNS[type][n === 1 ? 0 : 1]}`)
  return `${parts.join(' and ')} are`
}

/** The path as stored: resolved, without a trailing separator (`/data/media/movies/` → `/data/media/movies`). */
export const normalizeFolder = (path: string) => resolve(path)

/** Whether `inner` is `outer` or inside it. */
const within = (outer: string, inner: string) => {
  const rel = relative(outer, inner)
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel))
}

/**
 * What the disk says about a folder now. `fs.statfsSync` gives the filesystem's block size, free
 * blocks for unprivileged users (`bavail`) and total blocks; `fs.statSync().dev` the device it's on
 * (Node.js docs, File system › fs.statfsSync, fs.Stats). `accessSync` with `W_OK` checks the
 * server may write there (Node.js docs, fs.accessSync).
 */
function probe(path: string): Pick<RootFolder, 'free' | 'total' | 'device' | 'accessible'> {
  try {
    const stat = statSync(path)
    if (!stat.isDirectory()) return { free: null, total: null, device: null, accessible: false }
    let accessible = true
    try {
      accessSync(path, constants.W_OK)
    } catch {
      accessible = false
    }
    let free: number | null = null
    let total: number | null = null
    try {
      const fs = statfsSync(path)
      free = Number(fs.bavail) * Number(fs.bsize)
      total = Number(fs.blocks) * Number(fs.bsize)
    } catch {
      // some filesystems (and platforms) don't answer statfs; the folder still works
    }
    return { free, total, device: String(stat.dev), accessible }
  } catch {
    return { free: null, total: null, device: null, accessible: false }
  }
}

export function createRootFolders({ db, clock }: MediaDeps) {
  const filedIn = (path: string): FiledCounts => {
    const counts: FiledCounts = {}
    for (const { type, n } of db
      .select({ type: mediaItems.type, n: sql<number>`count(*)` })
      .from(mediaItems)
      .where(eq(mediaItems.rootFolder, path))
      .groupBy(mediaItems.type)
      .all())
      counts[type] = n
    return counts
  }

  const view = (row: typeof rootFolders.$inferSelect): RootFolder => ({
    id: row.id,
    path: row.path,
    ...probe(row.path),
    movies: filedIn(row.path).movie ?? 0,
  })

  const rows = () => db.select().from(rootFolders).orderBy(asc(rootFolders.path)).all()

  return {
    list: (): RootFolder[] => rows().map(view),

    /** The stored folder for a path (normalized), or null when it isn't a root folder. */
    find(path: string) {
      if (!isAbsolute(path)) return null
      const normalized = normalizeFolder(path)
      return rows().find((r) => r.path === normalized) ?? null
    },

    add(path: string): RootFolder {
      if (!isAbsolute(path)) throw invalid('Use a full path, starting with /.', 'not-absolute')
      const normalized = normalizeFolder(path)
      let isDir = false
      try {
        isDir = statSync(normalized).isDirectory()
      } catch {
        isDir = false
      }
      if (!isDir) throw invalid('There’s no folder at that path.', 'not-found')
      try {
        accessSync(normalized, constants.W_OK)
      } catch {
        throw invalid('highsea can’t write to that folder. Check its permissions.', 'not-writable')
      }
      for (const r of rows()) {
        if (r.path === normalized)
          throw new AppError('conflict', 'That folder is already a root folder.', {
            reason: 'exists',
          })
        if (within(r.path, normalized) || within(normalized, r.path))
          throw new AppError('conflict', `That folder overlaps ${r.path}, a root folder already.`, {
            reason: 'overlaps',
          })
      }
      const row = { id: newId('rf'), path: normalized, createdAt: clock.now() }
      db.insert(rootFolders).values(row).run()
      return view(row)
    },

    /** Nothing on disk changes. Refused while titles of any type are filed under it. */
    remove(id: string) {
      const row = db.select().from(rootFolders).where(eq(rootFolders.id, id)).get()
      if (!row) throw new AppError('not-found', 'That root folder doesn’t exist.')
      const counts = filedIn(row.path)
      const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0)
      if (total > 0)
        throw new AppError(
          'conflict',
          `${filedPhrase(counts)} filed under that folder. Move ${total === 1 ? 'it' : 'them'} first.`,
          { reason: 'in-use', counts },
        )
      db.delete(rootFolders).where(eq(rootFolders.id, id)).run()
    },
  }
}

export type RootFolders = ReturnType<typeof createRootFolders>

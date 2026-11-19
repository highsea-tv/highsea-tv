// SPDX-License-Identifier: AGPL-3.0-only
// The folders every media type files its titles under, one kind each: Movies, Shows or Music
// (prototype-gaps.md's stage 6; Phase 5 A1 keeps shows' and music's for parts B and D). Adding one
// checks that it's absolute, exists and is a directory highsea can read, and write to unless it
// only reads it; free space, size and the device are read live each time, so an unmounted disk
// shows as inaccessible rather than with stale numbers.
//
// A folder highsea only reads (ADR 0063) is one the owner added as read-only, or one mounted
// read-only, which `access(2)` reports with EROFS ("Write permission was requested for a file on a
// read-only filesystem", https://man7.org/linux/man-pages/man2/access.2.html; Docker's `ro` bind
// mounts are read-only filesystems, https://docs.docker.com/engine/storage/bind-mounts/). Nothing
// under it is written, renamed or deleted: `assertWritable` is the one check every write path
// makes, and it's refused with `read-only` until the folder is switched to managed.
import { accessSync, constants, existsSync, statfsSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { RootFolder } from '@highsea-tv/api-contract'
import { AppError, newId } from '@highsea-tv/core'
import { readSetting, schema } from '@highsea-tv/db'
import type { LibraryKind, MediaType } from '@highsea-tv/db/schema'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { invalid, type MediaDeps } from './context.ts'

const { rootFolders, mediaItems, languageProfiles } = schema

/** How a refusal names each type: one, then many. A new media type adds its nouns here. */
const NOUNS: Record<MediaType, [string, string]> = {
  movie: ['movie', 'movies'],
  show: ['show', 'shows'],
  // never counted: a folder's titles are its top-level rows (ADR 0064)
  season: ['season', 'seasons'],
  episode: ['episode', 'episodes'],
}

/**
 * The folders the library scan couldn't match surely, by root folder: they wait for Library
 * import (`@highsea-tv/media/movies`' `addNew` writes it).
 */
export const ROOT_WAITING_KEY = 'libraryScan.waiting'
export type RootWaiting = Record<string, string[]>

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

/** What `access(2)` says about writing to a folder: yes, no, or no because it's mounted read-only. */
export type WriteAccess = 'writable' | 'denied' | 'mounted-read-only'

export function writeAccess(path: string): WriteAccess {
  try {
    accessSync(path, constants.W_OK)
    return 'writable'
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EROFS' ? 'mounted-read-only' : 'denied'
  }
}

/** Whether highsea can list the folder and open what's in it. */
function readable(path: string): boolean {
  try {
    accessSync(path, constants.R_OK | constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * What the disk says about a folder now. `fs.statfsSync` gives the filesystem's block size, free
 * blocks for unprivileged users (`bavail`) and total blocks; `fs.statSync().dev` the device it's on
 * (Node.js docs, File system › fs.statfsSync, fs.Stats). `accessSync` checks highsea may read it,
 * and write to it (Node.js docs, fs.accessSync).
 */
function probe(
  path: string,
  storedReadOnly: boolean,
): Pick<RootFolder, 'free' | 'total' | 'device' | 'accessible' | 'readOnly' | 'mountedReadOnly'> {
  const gone = {
    free: null,
    total: null,
    device: null,
    accessible: false,
    readOnly: storedReadOnly,
    mountedReadOnly: false,
  }
  try {
    const stat = statSync(path)
    if (!stat.isDirectory()) return gone
    const access = writeAccess(path)
    const mountedReadOnly = access === 'mounted-read-only'
    const readOnly = storedReadOnly || mountedReadOnly
    // a folder highsea only reads needs reading; one it manages, writing too
    const accessible = readable(path) && (readOnly || access === 'writable')
    let free: number | null = null
    let total: number | null = null
    try {
      const fs = statfsSync(path)
      free = Number(fs.bavail) * Number(fs.bsize)
      total = Number(fs.blocks) * Number(fs.bsize)
    } catch {
      // some filesystems (and platforms) don't answer statfs; the folder still works
    }
    return { free, total, device: String(stat.dev), accessible, readOnly, mountedReadOnly }
  } catch {
    return gone
  }
}

export type RootFolderInput = {
  path: string
  /** Movies when left out, as every folder was before A1. */
  kind?: LibraryKind
  /** highsea only reads it (ADR 0063). A folder mounted read-only is read-only either way. */
  readOnly?: boolean
}

type Row = typeof rootFolders.$inferSelect

/** The refusal every write path under a read-only folder gives (ADR 0063). */
export const readOnlyRefusal = (root: string, what: string) =>
  new AppError('conflict', `highsea only reads ${root}, so it doesn’t ${what} there.`, {
    reason: 'read-only',
    root,
  })

export function createRootFolders({ db, clock }: MediaDeps) {
  const filedIn = (path: string): FiledCounts => {
    const counts: FiledCounts = {}
    for (const { type, n } of db
      .select({ type: mediaItems.type, n: sql<number>`count(*)` })
      .from(mediaItems)
      // titles only: a show's seasons and episodes share its root folder
      .where(and(eq(mediaItems.rootFolder, path), isNull(mediaItems.parentId)))
      .groupBy(mediaItems.type)
      .all())
      counts[type] = n
    return counts
  }

  /** What still waits: a folder imported since, or gone, no longer counts. */
  const waitingIn = (path: string): number => {
    const folders = readSetting<RootWaiting>(db, ROOT_WAITING_KEY, {})[path] ?? []
    if (folders.length === 0) return 0
    const filed = new Set(
      db
        .select({ path: mediaItems.path })
        .from(mediaItems)
        .where(and(eq(mediaItems.rootFolder, path), isNull(mediaItems.parentId)))
        .all()
        .map((r) => r.path),
    )
    return folders.filter((f) => !filed.has(f) && existsSync(f)).length
  }

  const view = (row: Row): RootFolder => ({
    id: row.id,
    path: row.path,
    kind: row.kind,
    ...probe(row.path, row.readOnly),
    movies: filedIn(row.path).movie ?? 0,
    languageProfileId: row.languageProfileId,
    waiting: waitingIn(row.path),
  })

  const rows = () => db.select().from(rootFolders).orderBy(asc(rootFolders.path)).all()
  const rowById = (id: string) => {
    const row = db.select().from(rootFolders).where(eq(rootFolders.id, id)).get()
    if (!row) throw new AppError('not-found', 'That root folder doesn’t exist.')
    return row
  }

  /** The root folder a path is in (the deepest, though they never overlap), or null. */
  const rootOf = (path: string): Row | null => {
    if (!isAbsolute(path)) return null
    const p = normalizeFolder(path)
    return rows().find((r) => within(r.path, p)) ?? null
  }

  /** Whether highsea only reads the root folder `path` is in: the owner's choice, or the mount. */
  const readOnlyAt = (path: string): string | null => {
    const root = rootOf(path)
    if (!root) return null
    return root.readOnly || writeAccess(root.path) === 'mounted-read-only' ? root.path : null
  }

  return {
    /** Every folder, or one kind's. */
    list: (kind?: LibraryKind): RootFolder[] =>
      rows()
        .filter((r) => !kind || r.kind === kind)
        .map(view),

    /** The stored folder for a path (normalized), or null when it isn't a root folder (of `kind`). */
    find(path: string, kind?: LibraryKind) {
      if (!isAbsolute(path)) return null
      const normalized = normalizeFolder(path)
      return rows().find((r) => r.path === normalized && (!kind || r.kind === kind)) ?? null
    },

    /**
     * The read-only root folder a path is in, or null when it's in a managed one or none. Every
     * write path asks before it writes (ADR 0063).
     */
    readOnlyAt,

    /**
     * Throws `read-only` (409) when `path` is under a folder highsea only reads. `what` finishes
     * the sentence: "highsea only reads /data/media/movies, so it doesn’t rename files there."
     */
    assertWritable(path: string, what: string) {
      const root = readOnlyAt(path)
      if (root) throw readOnlyRefusal(root, what)
    },

    add(input: string | RootFolderInput): RootFolder {
      const {
        path,
        kind = 'movies',
        readOnly = false,
      } = typeof input === 'string' ? { path: input } : input
      if (!isAbsolute(path)) throw invalid('Use a full path, starting with /.', 'not-absolute')
      const normalized = normalizeFolder(path)
      let isDir = false
      try {
        isDir = statSync(normalized).isDirectory()
      } catch {
        isDir = false
      }
      if (!isDir) throw invalid('There’s no folder at that path.', 'not-found')
      if (!readable(normalized))
        throw invalid('highsea can’t read that folder. Check its permissions.', 'not-readable')
      const access = writeAccess(normalized)
      if (access === 'denied' && !readOnly)
        throw invalid(
          'highsea can’t write to that folder. Check its permissions, or add it as a folder highsea only reads.',
          'not-writable',
        )
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
      const row: Row = {
        id: newId('rf'),
        path: normalized,
        kind,
        // a read-only mount is recorded as such, so it stays read-only if it's ever remounted
        readOnly: readOnly || access === 'mounted-read-only',
        languageProfileId: null,
        createdAt: clock.now(),
      }
      db.insert(rootFolders).values(row).run()
      return view(row)
    },

    /**
     * The subtitle language profile a title added here takes when none is chosen (checkpoint 8c);
     * null for none. Titles already filed here keep theirs.
     */
    setLanguageProfile(id: string, languageProfileId: string | null): RootFolder {
      const row = rowById(id)
      if (
        languageProfileId !== null &&
        !db
          .select({ id: languageProfiles.id })
          .from(languageProfiles)
          .where(eq(languageProfiles.id, languageProfileId))
          .get()
      )
        throw new AppError('not-found', 'That language profile doesn’t exist.', {
          reason: 'unknown-language-profile',
        })
      db.update(rootFolders).set({ languageProfileId }).where(eq(rootFolders.id, id)).run()
      return view({ ...row, languageProfileId })
    },

    /**
     * Read-only, or managed (ADR 0063): switching to managed is how highsea takes over a kind, and
     * needs a folder highsea can write to (`not-writable`, or `mounted-read-only` while the mount
     * says so). Switching to read-only is always allowed.
     */
    setReadOnly(id: string, readOnly: boolean): RootFolder {
      const row = rowById(id)
      if (!readOnly) {
        const access = writeAccess(row.path)
        if (access === 'mounted-read-only')
          throw invalid(
            `${row.path} is mounted read-only, so highsea can’t manage it. Mount it read-write first.`,
            'mounted-read-only',
          )
        if (access === 'denied')
          throw invalid(
            `highsea can’t write to ${row.path}, so it can’t manage it. Check its permissions.`,
            'not-writable',
          )
      }
      db.update(rootFolders).set({ readOnly }).where(eq(rootFolders.id, id)).run()
      return view({ ...row, readOnly })
    },

    /** Nothing on disk changes. Refused while titles of any type are filed under it. */
    remove(id: string) {
      const row = rowById(id)
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

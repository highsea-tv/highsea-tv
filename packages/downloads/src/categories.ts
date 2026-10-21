// SPDX-License-Identifier: AGPL-3.0-only
// Categories (checkpoint 6b, answer 5): `movies` is fixed for the library's grabs and `manual` for
// torrents added by hand without one (judgement call 25); the owner adds their own, each with a
// folder that defaults to `{downloads}/{name}`, as a qBittorrent category without its own save path
// saves to `{default save path}/{category}` under Automatic Torrent Management.
// They're one settings row, a list, like every other small setting (ADR 0019's settings table): a
// table would add a migration for a handful of rows nothing joins to. A stored folder of null
// follows the downloads folder, so moving that moves the categories with it.
import { join } from 'node:path'
import { AppError, type Clock, type EventBus } from '@highsea/core'
import { type Db, readSetting, writeSetting } from '@highsea/db'
import type { TorrentEngine } from '@highsea/torrent'
import { z } from 'zod'
import { DEFAULT_DOWNLOAD_CLIENT, DOWNLOAD_CLIENT_KEY } from './settings.ts'

export const CATEGORIES_KEY = 'torrentCategories'

/** Library grabs go to `{downloads}/movies`; manual torrents without a category to `{downloads}/manual`. */
export const MOVIES_CATEGORY = 'movies'
export const MANUAL_CATEGORY = 'manual'
/** Kept back for the library's later media types (answer 5: "later `shows`, `music`"). */
const RESERVED = [MOVIES_CATEGORY, MANUAL_CATEGORY, 'shows', 'music']

/** Letters, digits, spaces, dots, dashes and underscores; no slash, so a name is one folder. */
const NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u

const storedSchema = z.array(z.object({ name: z.string(), folder: z.string().nullable() }))
type Stored = z.infer<typeof storedSchema>[number]

export type CategoryView = {
  name: string
  /** Where its torrents save. */
  folder: string
  /** `movies` and `manual`: built in, never removed. */
  fixed: boolean
  /** Torrents in Downloads that use it now. */
  torrents: number
}

export type CategoryInput = { name: string; folder?: string | null }

export function readCategories(db: Db): Stored[] {
  const parsed = storedSchema.safeParse(readSetting(db, CATEGORIES_KEY, { list: [] }).list)
  return parsed.success ? parsed.data : []
}

/** The folder a category saves to, or null when there's no such category. */
export function categoryFolder(db: Db, downloads: string, name: string): string | null {
  if (name === MOVIES_CATEGORY || name === MANUAL_CATEGORY) return join(downloads, name)
  const c = readCategories(db).find((x) => x.name === name)
  return c ? (c.folder ?? join(downloads, c.name)) : null
}

export type CategoriesDeps = {
  db: Db
  clock: Clock
  events: EventBus
  engine: Pick<TorrentEngine, 'list'>
  downloadsFolder(): string
  /**
   * A folder the owner typed, absolute and inside the folders highsea may write to (the data root
   * and the downloads folder), or an AppError. The runtime passes media's `checkPath`.
   */
  checkFolder(path: string): string
  /** Announced when the list changes. */
  topic: string
}

export function createCategories(deps: CategoriesDeps) {
  const { db, clock, events } = deps
  const write = (list: Stored[]) => writeSetting(db, CATEGORIES_KEY, { list }, clock.now())
  const inUse = (name: string) => deps.engine.list().filter((t) => t.category === name).length

  function view(c: Stored, fixed = false): CategoryView {
    return {
      name: c.name,
      folder: c.folder ?? join(deps.downloadsFolder(), c.name),
      fixed,
      torrents: inUse(c.name),
    }
  }

  return {
    /** `movies` and `manual` first, then the owner's, by name. */
    list(): CategoryView[] {
      const own = [...readCategories(db)].sort((a, b) => a.name.localeCompare(b.name))
      return [
        view({ name: MOVIES_CATEGORY, folder: null }, true),
        view({ name: MANUAL_CATEGORY, folder: null }, true),
        ...own.map((c) => view(c)),
      ]
    },

    /** Adds a category, or changes its folder. Torrents already in it stay where they are. */
    save(input: CategoryInput): CategoryView {
      const name = input.name.trim()
      if (!name || name.length > 40 || !NAME.test(name))
        throw new AppError(
          'invalid',
          'Use up to 40 letters, digits, spaces, dots, dashes or underscores.',
          { field: 'name' },
        )
      const lower = name.toLowerCase()
      if (lower === MOVIES_CATEGORY || lower === MANUAL_CATEGORY)
        throw new AppError('invalid', `${lower} is built in. Choose another name.`, {
          field: 'name',
        })
      if (RESERVED.includes(lower))
        throw new AppError('invalid', `${name} is kept for the library. Choose another name.`, {
          field: 'name',
        })
      const typed = input.folder?.trim()
      let folder: string | null = null
      if (typed) {
        try {
          folder = deps.checkFolder(typed)
        } catch {
          throw new AppError(
            'invalid',
            `${typed} isn’t inside the data folder or the downloads folder.`,
            { field: 'folder' },
          )
        }
        // the default folder is stored as the default, so it follows the downloads folder
        if (folder === join(deps.downloadsFolder(), name)) folder = null
      }
      const list = readCategories(db)
      const same = list.find((c) => c.name.toLowerCase() === name.toLowerCase())
      const next: Stored = { name: same?.name ?? name, folder }
      write(same ? list.map((c) => (c === same ? next : c)) : [...list, next])
      events.emit({ topic: deps.topic })
      return view(next)
    },

    /** Refused while a torrent or the watch folder still uses it, so nothing is left without a folder. */
    remove(name: string) {
      if (name === MOVIES_CATEGORY || name === MANUAL_CATEGORY)
        throw new AppError('conflict', `${name} is built in and stays.`)
      const list = readCategories(db)
      const c = list.find((x) => x.name === name)
      if (!c) throw new AppError('not-found', `There’s no category named ${name}.`)
      const count = inUse(name)
      if (count)
        throw new AppError(
          'conflict',
          count === 1
            ? `A torrent still uses ${name}. Remove it from Downloads first.`
            : `${count} torrents still use ${name}. Remove them from Downloads first.`,
        )
      const client = readSetting(db, DOWNLOAD_CLIENT_KEY, DEFAULT_DOWNLOAD_CLIENT)
      if (client.watchFolder && client.watchCategory === name)
        throw new AppError(
          'conflict',
          `The watch folder adds torrents to ${name}. Choose another category for it first.`,
        )
      write(list.filter((x) => x !== c))
      events.emit({ topic: deps.topic })
    },

    /** The owner's categories' folders, for the folders A17 may browse and import from. */
    folders(): string[] {
      return readCategories(db).map((c) => c.folder ?? join(deps.downloadsFolder(), c.name))
    },
  }
}

export type Categories = ReturnType<typeof createCategories>

// SPDX-License-Identifier: AGPL-3.0-only
// The settings with calls of their own, as apps/server answers them: tags (checkpoint 8c), root
// folders (checkpoint 4, with 8c's subtitle languages; one list per kind since stage 6, each with
// Scan now), General's Metadata (the TMDB key, kept as
// its last four) and the indexer catalog's settings (checkpoint 5, the owner's alone). A key or a
// folder with "wrong" in it is refused; a folder outside `/data` doesn't exist on the server.

import type {
  CatalogSettings,
  LibraryKind,
  MetadataSettings,
  RootFolderRow,
  SettingsDeps,
  Tag,
} from './settings.ts'
import type { MediaItem } from './types.ts'

const TB = 1e12
let made = 0

/** The other kinds' libraries, for their folders' counts. */
export type OtherLibraries = {
  shows: () => { rootFolder: string; path: string }[]
  /** The music library has no paths in the mock: it's all in the first music folder. */
  music: () => { artists: unknown[]; albums: unknown[] }
}

const FILED: Record<LibraryKind, string> = {
  movies: 'Movies are',
  shows: 'Shows are',
  music: 'Albums are',
}

export function librarySettingsApi(
  d: SettingsDeps,
  items: () => MediaItem[],
  others: OtherLibraries = { shows: () => [], music: () => ({ artists: [], albums: [] }) },
) {
  const s = d.settings
  const announce = () => d.emit({ type: 'settings.updated' })
  const under = (f: { path: string }, x: { rootFolder: string; path: string }) =>
    x.rootFolder === f.path || x.path.startsWith(`${f.path}/`)

  /** What's filed under each folder, by its kind: the libraries' own counts. */
  const folders = (): RootFolderRow[] => {
    const firstMusic = s.rootFolders.find((f) => f.kind === 'music')?.id
    const music = others.music()
    return s.rootFolders.map((f) => {
      if (f.kind === 'music') {
        const here = f.id === firstMusic
        return {
          ...f,
          titles: here ? music.albums.length : 0,
          artists: here ? music.artists.length : 0,
        }
      }
      const titles =
        f.kind === 'shows'
          ? others.shows().filter((x) => under(f, x)).length
          : items().filter((m) => m.type === 'movie' && under(f, m)).length
      return { ...f, titles, artists: 0 }
    })
  }

  const tags = (): Tag[] =>
    [...s.tags]
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((t) => ({
        id: t.id,
        label: t.label,
        usage: {
          movies: t.movies,
          indexers: 0,
          lists: s.importLists.filter((l) => l.tags.includes(t.id)).length,
          connections: s.connections.filter((c) => c.tags.includes(t.id)).length,
        },
      }))

  const checkLabel = (label: string, except?: string) => {
    const l = label.trim().toLowerCase()
    if (!l) throw d.fail(400, 'invalid', 'Enter a label.', { field: 'label', reason: 'required' })
    if (!/^[a-z0-9][a-z0-9 _-]*$/.test(l))
      throw d.fail(400, 'invalid', 'Use letters, numbers, spaces, dashes and underscores.', {
        field: 'label',
        reason: 'invalid',
      })
    if (s.tags.some((t) => t.id !== except && t.label === l))
      throw d.fail(409, 'conflict', `There’s a tag called ${l} already.`, {
        field: 'label',
        reason: 'exists',
      })
    return l
  }

  return {
    tags: {
      list: () => {
        d.requireStaff()
        return tags()
      },
      add: (label: string) => {
        d.requireStaff()
        const tag = { id: `t-new-${++made}`, label: checkLabel(label), movies: 0 }
        s.tags.push(tag)
        announce()
        return tags().find((t) => t.id === tag.id)
      },
      rename: (id: string, label: string) => {
        d.requireStaff()
        const tag = s.tags.find((t) => t.id === id)
        if (!tag) throw d.fail(404, 'not-found', 'There’s no such tag.')
        tag.label = checkLabel(label, id)
        announce()
      },
      /** Comes off every list and connection that has it. */
      remove: (id: string) => {
        d.requireStaff()
        if (!s.tags.some((t) => t.id === id)) throw d.fail(404, 'not-found', 'There’s no such tag.')
        s.tags = s.tags.filter((t) => t.id !== id)
        for (const l of s.importLists) l.tags = l.tags.filter((t) => t !== id)
        for (const c of s.connections) c.tags = c.tags.filter((t) => t !== id)
        announce()
      },
    },

    rootFolders: {
      /** Every folder, or one kind's. */
      list: (kind?: LibraryKind) => {
        d.requireStaff()
        return folders().filter((f) => !kind || f.kind === kind)
      },
      /** Checks the folder exists and the server can write to it, as the server does. */
      add: (input: string, kind: LibraryKind = 'movies') => {
        d.requireStaff()
        const path = input.trim().replace(/\/+$/, '')
        if (!path.startsWith('/'))
          throw d.fail(400, 'invalid', 'Use the full path, starting with /.', {
            reason: 'not-absolute',
          })
        if (!path.startsWith('/data/') || /wrong/i.test(path))
          throw d.fail(400, 'invalid', 'That folder doesn’t exist on the server.', {
            reason: 'not-found',
          })
        if (path.startsWith('/data/readonly'))
          throw d.fail(400, 'invalid', 'highsea can’t write to that folder.', {
            reason: 'not-writable',
          })
        if (
          s.rootFolders.some(
            (f) =>
              f.path === path || f.path.startsWith(`${path}/`) || path.startsWith(`${f.path}/`),
          )
        )
          throw d.fail(409, 'conflict', 'That folder is a root folder already, or inside one.')
        const folder: RootFolderRow = {
          id: `rf-new-${++made}`,
          kind,
          path,
          free: 3.4 * TB,
          total: 16 * TB,
          accessible: true,
          titles: 0,
          artists: 0,
          waiting: 0,
          languageProfileId: null,
        }
        s.rootFolders.push(folder)
        announce()
        return folder
      },
      update: (id: string, patch: { languageProfileId: string | null }) => {
        d.requireStaff()
        const f = s.rootFolders.find((x) => x.id === id)
        if (!f) throw d.fail(404, 'not-found', 'There’s no such root folder.')
        f.languageProfileId = patch.languageProfileId
        announce()
        return folders().find((x) => x.id === id)
      },
      remove: (id: string) => {
        d.requireStaff()
        const f = folders().find((x) => x.id === id)
        if (!f) throw d.fail(404, 'not-found', 'There’s no such root folder.')
        if (f.titles > 0)
          throw d.fail(
            409,
            'conflict',
            `${FILED[f.kind]} filed under it. Move them to another folder first.`,
          )
        s.rootFolders = s.rootFolders.filter((x) => x.id !== id)
        announce()
      },
      /**
       * Scan now: the library scan of one folder, as adding it queues. New folders it matches
       * surely are added; the rest wait in Library import. Nothing new turns up in the mock.
       */
      scan: (id: string) => {
        d.requireStaff()
        const f = folders().find((x) => x.id === id)
        if (!f) throw d.fail(404, 'not-found', 'There’s no such root folder.')
        if (!f.accessible)
          throw d.fail(409, 'conflict', `highsea can’t read ${f.path} now, so it can’t scan it.`)
        announce()
        return f
      },
    },

    metadata: {
      get: (): MetadataSettings => {
        d.requireStaff()
        return s.metadata
      },
      /** A new key is checked with TMDB first; one with "wrong" in it is refused. */
      save: (input: { language: string; region: string; key?: string }) => {
        d.requireOwner()
        if (input.key !== undefined) {
          const key = input.key.trim()
          if (/wrong/i.test(key) || key.length < 16)
            throw d.fail(400, 'invalid', 'TMDB didn’t accept that key.', {
              field: 'key',
              reason: 'tmdb-key-rejected',
            })
          s.metadata.key = { ...s.metadata.key, set: true, last4: key.slice(-4) }
        }
        s.metadata.language = input.language
        s.metadata.region = input.region
        announce()
        return s.metadata
      },
      removeKey: () => {
        d.requireOwner()
        s.metadata.key = { ...s.metadata.key, set: false, last4: null }
        announce()
      },
    },

    catalog: {
      get: (): CatalogSettings => {
        d.requireOwner()
        return s.catalog
      },
      update: (patch: Partial<CatalogSettings>) => {
        d.requireOwner()
        for (const x of patch.extras ?? []) {
          if (!/^https:\/\//.test(x.url))
            throw d.fail(400, 'invalid', 'Use an https address for the manifest.', { field: 'url' })
          if (!/^[A-Za-z0-9+/]{40,}={0,2}$/.test(x.publicKey))
            throw d.fail(400, 'invalid', 'That isn’t an ed25519 public key in base64.', {
              field: 'publicKey',
            })
        }
        const urls = (patch.extras ?? []).map((x) => x.url)
        if (new Set(urls).size !== urls.length)
          throw d.fail(409, 'conflict', 'That catalog is added already.', { field: 'url' })
        Object.assign(s.catalog, patch)
        announce()
        return s.catalog
      },
    },
  }
}

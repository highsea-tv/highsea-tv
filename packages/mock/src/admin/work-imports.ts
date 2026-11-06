// SPDX-License-Identifier: AGPL-3.0-only
// The work answers' importing part (one-client-platform-d.md › D2): the folder picker (`fs.list`),
// manual import (A17) and library import (A17's Library import mode), from the mock's small
// filesystem, its manual import and its library.
//
// The mock has no library import of its own, so its run is kept here, per transport: a root
// folder's scan finds the library's own folders (already in the library) and a few of the
// metadata cache's films that aren't, and a run adds those through the mock's movies.add,
// finishing after a moment as a job would.
import { LIBRARY_IMPORT_TOPIC, type LibraryCandidate, MEDIA_TOPICS } from '@highsea-tv/api-contract'
import type { ServerState } from '../seed.ts'
import { type AdminKit, type Answers, type Ctx, refuse } from './kit.ts'
import { movieOf, tw } from './work-shared.ts'

/** Where the folder picker opens without a path: the downloads folder. */
const DOWNLOADS = '/data/downloads'
/** How long a library import's job takes, in real ms. */
const RUN_MS = 1500
const GB = 1e9

const extOf = (path: string) => path.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'mkv'

/** The movies' root folders, from Settings › Media management. */
const moviesRoots = (s: ServerState) =>
  s.settings.rootFolders.filter((f) => f.kind === 'movies').map((f) => f.path)

const inside = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`)

type Run = {
  state: 'idle' | 'running' | 'done' | 'failed'
  root: string | null
  rename: boolean
  total: number
  done: number
  imported: number
  failures: { folder: string; message: string }[]
  startedAt: string | null
  finishedAt: string | null
}

export function importAnswers(kit: AdminKit): Answers {
  const { emit } = kit
  let run: Run = {
    state: 'idle',
    root: null,
    rename: false,
    total: 0,
    done: 0,
    imported: 0,
    failures: [],
    startedAt: null,
    finishedAt: null,
  }
  /** The last scan's candidates by folder, which a run takes its films from. */
  const scanned = new Map<string, LibraryCandidate>()

  /** The folders the picker may show: the data folder and every root folder, as on the server. */
  const allowed = (s: ServerState) => ['/data', ...moviesRoots(s)]

  const scanRoot = (ctx: Ctx, root: string): LibraryCandidate[] => {
    const s = ctx.srv.state
    const ours = s.items
      .filter((m) => m.type === 'movie' && m.rootFolder === root)
      .map((m): LibraryCandidate => {
        const file = s.files.find((f) => f.itemId === m.id)
        return {
          folder: m.path,
          name: m.path.split('/').pop() ?? m.path,
          file: file?.path ?? null,
          size: file?.size ?? 0,
          quality: m.quality[0] ?? null,
          match: { tmdbId: m.tmdbId, title: m.title, year: m.year },
          inLibrary: true,
          skip: tw('work.inLibrary'),
        }
      })
    // a few films on disk that the library hasn't got: from the metadata cache, so they match
    // (by title too: the mock's movies.add takes a title it has as the same film)
    const here = new Set(s.items.map((m) => m.tmdbId))
    const titles = new Set(s.items.map((m) => m.title.toLowerCase()))
    const theirs = s.discoverCatalog
      .filter((d) => !here.has(d.tmdbId) && !titles.has(d.title.toLowerCase()))
      .slice(0, 3)
      .map((d): LibraryCandidate => {
        const name = `${d.title} (${d.year})`
        const folder = `${root}/${name}`
        return {
          folder,
          name,
          file: `${folder}/${d.title.replace(/[^A-Za-z0-9]+/g, '.')}.${d.year}.1080p.BluRay.x264.mkv`,
          size: Math.round(8.2 * GB),
          quality: 'Bluray-1080p',
          match: { tmdbId: d.tmdbId, title: d.title, year: d.year },
          inLibrary: false,
          skip: null,
        }
      })
    // and one folder TMDB can't place
    const stray: LibraryCandidate = {
      folder: `${root}/Lisbon 2019`,
      name: 'Lisbon 2019',
      file: `${root}/Lisbon 2019/Lisbon 2019.mp4`,
      size: Math.round(2.2 * GB),
      quality: null,
      match: null,
      inLibrary: false,
      skip: tw('work.noMatch'),
    }
    return [...ours, ...theirs, stray].sort((a, b) => a.name.localeCompare(b.name))
  }

  return {
    fs: {
      list: ({ query }, ctx) => {
        const s = ctx.srv.state
        const path = (query.path ?? DOWNLOADS).replace(/(.)\/+$/, '$1')
        const roots = allowed(s)
        if (!roots.some((r) => inside(path, r)))
          throw refuse('forbidden', tw('work.outside', { path }))
        if (!s.fs[path]) throw refuse('not-found', tw('work.noFolder', { path }))
        const up = path.slice(0, path.lastIndexOf('/')) || '/'
        return {
          path,
          parent: path !== up && roots.some((r) => inside(up, r)) ? up : null,
          entries: ctx.api.fs.list(path),
        }
      },
    },

    manualImport: {
      scan: ({ body }, ctx) => {
        const s = ctx.srv.state
        const path = body.path.replace(/(.)\/+$/, '$1')
        if (!allowed(s).some((r) => inside(path, r)))
          throw refuse('forbidden', tw('work.outside', { path }))
        if (!s.fs[path]) throw refuse('not-found', tw('work.noFolder', { path }))
        return ctx.api.manualImport.scan(path).map((c) => {
          // an episode file matches no movie: a server without shows can't place it
          const m = movieOf(s, c.itemId)
          const name = m && `${m.title} (${m.year})`
          return {
            path: c.path,
            size: c.size,
            quality: c.quality,
            language: c.language,
            movieId: m?.tmdbId ?? null,
            versionId: m?.versions[0]?.id ?? null,
            skip: c.skip,
            becomes: name ? `${name}/${name} ${c.quality}.${extOf(c.path)}` : null,
          }
        })
      },
      run: ({ body }, ctx) => {
        const s = ctx.srv.state
        const results = body.files.map((f) => {
          const m = s.items.find((x) => x.type === 'movie' && x.tmdbId === f.movieId)
          if (!m) return { path: f.path, ok: false, message: tw('work.movieUnknown') }
          ctx.api.manualImport.run([{ path: f.path, itemId: m.id }], body.mode)
          return {
            path: f.path,
            ok: true,
            message: tw('work.imported', { title: m.title, year: m.year }),
          }
        })
        if (results.some((r) => r.ok)) emit(MEDIA_TOPICS.item)
        return { results }
      },
    },

    libraryImport: {
      scan: ({ body }, ctx) => {
        const root = body.root.replace(/(.)\/+$/, '$1')
        if (!moviesRoots(ctx.srv.state).includes(root))
          throw refuse('invalid', tw('work.pickRoot'), { reason: 'unknown-root-folder' })
        const found = scanRoot(ctx, root)
        for (const c of found) scanned.set(c.folder, c)
        return found
      },
      run: ({ body }, ctx) => {
        if (run.state === 'running')
          throw refuse('conflict', tw('work.importRunning'), { reason: 'running' })
        const roots = moviesRoots(ctx.srv.state)
        const rootOf = (folder: string) => roots.find((r) => inside(folder, r) && folder !== r)
        const first = rootOf(body.items[0]?.folder ?? '')
        if (!first) throw refuse('invalid', tw('work.pickRoot'), { reason: 'unknown-root-folder' })
        if (body.items.some((i) => rootOf(i.folder) !== first))
          throw refuse('invalid', tw('work.mixedRoots'), { reason: 'mixed-roots' })
        if (new Set(body.items.map((i) => i.tmdbId)).size !== body.items.length)
          throw refuse('invalid', tw('work.duplicateMovie'), { reason: 'duplicate-movie' })

        const profile = body.qualityProfileId ?? ctx.srv.state.qualityProfiles[0]?.id ?? 'hd-1080p'
        const language = ctx.srv.state.languageProfiles[0]?.id ?? ''
        run = {
          state: 'running',
          root: first,
          rename: body.rename ?? false,
          total: body.items.length,
          done: 0,
          imported: 0,
          failures: [],
          startedAt: new Date().toISOString(),
          finishedAt: null,
        }
        const started = { ...run, failures: [] }
        emit(LIBRARY_IMPORT_TOPIC)
        const items = body.items
        const api = ctx.api
        const s = ctx.srv.state
        setTimeout(() => {
          const failures: Run['failures'] = []
          let imported = 0
          for (const i of items) {
            const c = scanned.get(i.folder)
            const known =
              s.items.find((m) => m.tmdbId === i.tmdbId) ??
              s.discoverCatalog.find((d) => d.tmdbId === i.tmdbId)
            const title = c?.match?.title ?? known?.title
            const year = c?.match?.year ?? known?.year
            if (!title || !year) {
              failures.push({ folder: i.folder, message: tw('work.noMatch') })
              continue
            }
            if (s.items.some((m) => m.tmdbId === i.tmdbId)) {
              failures.push({ folder: i.folder, message: tw('work.inLibrary') })
              continue
            }
            const added = api.movies.add({
              tmdbId: i.tmdbId,
              title,
              year,
              rootFolder: first,
              qualityProfileId: profile,
              languageProfileId: language,
              monitored: true,
              minimumAvailability: 'released',
            })
            if (added.tmdbId === i.tmdbId) imported++
            else failures.push({ folder: i.folder, message: tw('work.inLibrary') })
          }
          run = {
            ...run,
            state: 'done',
            done: items.length,
            imported,
            failures,
            finishedAt: new Date().toISOString(),
          }
          emit(LIBRARY_IMPORT_TOPIC)
          emit(MEDIA_TOPICS.movies)
        }, RUN_MS)
        return started
      },
      status: () => ({ ...run, failures: run.failures.map((f) => ({ ...f })) }),
    },
  }
}

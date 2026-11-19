// SPDX-License-Identifier: AGPL-3.0-only
// Importing the shows already on disk (Phase 5 B, ADR 0064's 2026-11-18 section), in the shape of
// films' existing-library import (movies/library-import.ts): each folder under a Shows root folder
// is a show, identified, added where it is, and its files matched to its episodes. Nothing is moved,
// renamed or written beside a file, so a folder highsea only reads (ADR 0063) is safe.
//
// A folder is identified, most certain first:
// 1. its `tvshow.nfo`, which Sonarr's Kodi metadata writes with TheTVDB's, IMDb's and TMDB's ids
//    (shared/nfo.ts); TMDB's id is used as it is, TheTVDB's and IMDb's through TMDB's Find by ID
//    (https://developer.themoviedb.org/reference/find-by-id);
// 2. the ids in its name, as Sonarr, Jellyfin and Plex write them (`[tvdb-…]`, `[tmdbid-…]`,
//    `{imdb-tt…}`, @highsea-tv/parser's `parseShowFolder`);
// 3. TMDB's TV search for its title (https://developer.themoviedb.org/reference/search-tv): sure
//    only when exactly one show has the folder's title (and its year, when the name gives one).
// Anything else (no show, or several of that name) waits in `unmatched_files` with its reason, for
// the admin to resolve; nothing is guessed.
//
// `scan` previews a root folder; `run` adds the folders the owner confirms, in a job whose progress
// is one settings row announced on `import.updated` (films' shape); `addNew` is the library scan's:
// it adds what it identifies surely and keeps the rest unmatched. All of it is safe to repeat (ADR
// 0022): adding a show that's here returns it, and its files are recorded by path.
import { promises as fsp } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { AppError } from '@highsea-tv/core'
import { readSetting, schema, writeSetting } from '@highsea-tv/db'
import { parseSeasonFolder, parseShowFolder } from '@highsea-tv/parser'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { LIBRARY_IMPORT_TOPIC } from '../movies/library-import.ts'
import { isVideo } from '../shared/files.ts'
import type { Media } from '../shared/index.ts'
import { matchKey } from '../shared/names.ts'
import { readShowNfo, type ShowNfoIds } from '../shared/nfo.ts'
import { checkPath, isWithin } from '../shared/paths.ts'
import type { ShowsDeps } from './context.ts'
import type { ReconcileResult, ShowFiles } from './files.ts'
import type { createShowLibrary } from './library.ts'

const { mediaItems } = schema

export const SHOW_IMPORT_JOB = 'shows.libraryImport'
export const SHOW_IMPORT_KEY = 'showsLibraryImport'
/** One scan reads at most this many folders: a root with more is imported in parts. */
export const MAX_SHOW_FOLDERS = 2_000

/** Why a show folder isn't added. */
export type ShowFolderReason = 'no-match' | 'ambiguous' | 'second-copy' | 'unreachable'

export type ShowCandidate = {
  folder: string
  name: string
  match: { tmdbId: number; title: string; year: number | null } | null
  /** How it was identified: its `tvshow.nfo`, its name's ids, TMDB's search, or not at all. */
  matchedBy: 'nfo' | 'name' | 'search' | null
  inLibrary: boolean
  /** Why it can't be imported as it is, or null. */
  reason: ShowFolderReason | null
  skip: string | null
}

export type ShowImportItem = { folder: string; tmdbId: number }

export type ShowImportState = {
  state: 'idle' | 'running' | 'done' | 'failed'
  jobId: string | null
  root: string | null
  total: number
  done: number
  imported: number
  /** Episode files filed and left unmatched across the run. */
  files: number
  unmatched: number
  failures: { folder: string; message: string }[]
  startedAt: number | null
  finishedAt: number | null
}

const IDLE: ShowImportState = {
  state: 'idle',
  jobId: null,
  root: null,
  total: 0,
  done: 0,
  imported: 0,
  files: 0,
  unmatched: 0,
  failures: [],
  startedAt: null,
  finishedAt: null,
}

const Payload = z.object({
  root: z.string(),
  qualityProfileId: z.string(),
  items: z.array(z.object({ folder: z.string(), tmdbId: z.number().int().positive() })),
})

type Identified =
  | {
      sure: true
      tmdbId: number
      by: 'nfo' | 'name' | 'search'
    }
  | { sure: false; reason: ShowFolderReason; message: string; candidates: number[] }

/** A title as names and TMDB write it, for telling them equal: folded, no leading article. */
const titleKey = (title: string) => matchKey(title).replace(/^(?:the|a|an) /, '')

/**
 * The one show TMDB's search results name as the folder's: the same title (or original title),
 * then the same year when the folder gives one, then a year off by one (a show's first air date
 * can differ by region, as Radarr allows for films). Several left, or none, isn't a match.
 */
export function pickShow<
  T extends { id: number; title: string; originalTitle: string; year: number | null },
>(
  results: readonly T[],
  title: string,
  year: number | null,
): { show: T } | { reason: 'no-match' | 'ambiguous'; candidates: T[] } {
  const want = titleKey(title)
  const same = results.filter(
    (r) => titleKey(r.title) === want || titleKey(r.originalTitle) === want,
  )
  let pool = same
  if (year !== null) {
    const exact = same.filter((r) => r.year === year)
    pool = exact.length
      ? exact
      : same.filter((r) => r.year !== null && Math.abs(r.year - year) === 1)
  }
  if (pool.length === 1) return { show: pool[0] as T }
  return pool.length
    ? { reason: 'ambiguous', candidates: pool }
    : { reason: 'no-match', candidates: [] }
}

const noKey = (e: unknown) =>
  (e as { details?: { reason?: string } }).details?.reason === 'no-tmdb-key'

export function createShowLibraryImport(
  ctx: ShowsDeps,
  deps: {
    media: Media
    library: ReturnType<typeof createShowLibrary>
    files: ShowFiles
  },
) {
  const { db, jobs, events, clock, metadata } = ctx
  const { media, library, files } = deps
  const log = ctx.logger.child('shows-import')

  const read = () => readSetting<ShowImportState>(db, SHOW_IMPORT_KEY, IDLE)
  function write(next: ShowImportState) {
    writeSetting(db, SHOW_IMPORT_KEY, next, clock.now())
    events.emit({ topic: LIBRARY_IMPORT_TOPIC })
  }

  function requireRoot(path: string): string {
    const folder = media.rootFolders.find(path, 'shows')
    if (!folder)
      throw new AppError('invalid', 'Pick one of the shows’ root folders.', {
        reason: 'unknown-root-folder',
      })
    return folder.path
  }

  /** A show TMDB has under that id, or null; other failures (no key, unreachable) are thrown. */
  async function showExists(tmdbId: number): Promise<boolean> {
    try {
      await metadata.show(tmdbId)
      return true
    } catch (e) {
      if ((e as AppError).code === 'not-found') return false
      throw e
    }
  }

  /** TMDB's show for a set of ids: TMDB's own first, then TheTVDB's, then IMDb's. */
  async function byIds(ids: ShowNfoIds): Promise<number | null> {
    if (ids.tmdb && (await showExists(ids.tmdb))) return ids.tmdb
    if (ids.tvdb) {
      const found = await metadata.discover.findByTvdb(ids.tvdb, 'show')
      if (found) return found.show
    }
    if (ids.imdb) {
      const found = await metadata.discover.findShowByImdb(ids.imdb)
      if (found) return found
    }
    return null
  }

  /** Which show a folder holds, or why it can't be said surely. */
  async function identify(folder: string): Promise<Identified> {
    const nfo = await readShowNfo(folder)
    if (nfo) {
      const id = await byIds(nfo)
      if (id) return { sure: true, tmdbId: id, by: 'nfo' }
    }
    const parsed = parseShowFolder(basename(folder))
    const named = await byIds(parsed.ids)
    if (named) return { sure: true, tmdbId: named, by: 'name' }
    if (!parsed.title)
      return { sure: false, reason: 'no-match', message: 'Its name has no title.', candidates: [] }
    // the title as the folder writes it: TMDB's search ignores case
    const page = await metadata.discover.searchShows(parsed.title)
    const picked = pickShow(page.results, parsed.title, parsed.year)
    if ('show' in picked) return { sure: true, tmdbId: picked.show.id, by: 'search' }
    const named_ = `${parsed.title}${parsed.year ? ` (${parsed.year})` : ''}`
    return picked.reason === 'ambiguous'
      ? {
          sure: false,
          reason: 'ambiguous',
          message: `TMDB has ${picked.candidates.length} shows named ${named_}: ${picked.candidates
            .map((c) => `${c.title}${c.year ? ` (${c.year})` : ''}`)
            .join(', ')}. Pick the show to import it.`,
          candidates: picked.candidates.map((c) => c.id),
        }
      : {
          sure: false,
          reason: 'no-match',
          message: `TMDB has no show named ${named_}. Pick the show to import it.`,
          candidates: [],
        }
  }

  const showAt = (tmdbId: number) =>
    db
      .select()
      .from(mediaItems)
      .where(and(eq(mediaItems.type, 'show'), eq(mediaItems.tmdbId, tmdbId)))
      .get()

  /** Season folders (`Season 01`, `Specials`) in the folder, or videos straight in it. */
  async function usesSeasonFolders(folder: string): Promise<boolean> {
    const entries = await fsp.readdir(folder, { withFileTypes: true }).catch(() => [])
    if (entries.some((e) => e.isDirectory() && parseSeasonFolder(e.name) !== null)) return true
    return !entries.some((e) => e.isFile() && isVideo(e.name))
  }

  /** The folders under a root folder: its children, hidden ones left out. */
  async function foldersIn(root: string): Promise<string[]> {
    const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => {
      throw new AppError('unavailable', `${root} can’t be read.`, { reason: 'unreadable' })
    })
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('@'))
      .map((e) => join(root, e.name))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, MAX_SHOW_FOLDERS)
  }

  /**
   * What a root folder holds: one candidate per folder, identified on TMDB. Writes nothing.
   * Without a TMDB key it's refused (`no-tmdb-key`), since nothing can be matched.
   */
  async function scan(rootPath: string): Promise<ShowCandidate[]> {
    const root = requireRoot(
      checkPath(
        rootPath,
        media.rootFolders.list('shows').map((r) => r.path),
      ),
    )
    const out: ShowCandidate[] = []
    for (const folder of await foldersIn(root)) {
      const name = basename(folder)
      let found: Identified
      try {
        found = await identify(folder)
      } catch (e) {
        if (noKey(e)) throw e
        log.warn('couldn’t identify a show folder', { folder, error: (e as Error).message })
        found = {
          sure: false,
          reason: 'unreachable',
          message: 'TMDB couldn’t be reached to match it.',
          candidates: [],
        }
      }
      if (!found.sure) {
        out.push({
          folder,
          name,
          match: null,
          matchedBy: null,
          inLibrary: false,
          reason: found.reason,
          skip: found.message,
        })
        continue
      }
      const meta = metadata.cachedShow(found.tmdbId)
      const here = showAt(found.tmdbId)
      const elsewhere = here && here.path !== folder
      out.push({
        folder,
        name,
        match: { tmdbId: found.tmdbId, title: meta?.title ?? name, year: meta?.year ?? null },
        matchedBy: found.by,
        inLibrary: !!here,
        reason: elsewhere ? 'second-copy' : null,
        skip: here
          ? elsewhere
            ? `The show is already in the library, in ${here.path}.`
            : 'Already in the library.'
          : null,
      })
    }
    return out
  }

  /**
   * Adds one folder's show where it is, then matches its files. Returns the problem, or null, and
   * what its files came to. Safe to repeat: the show is found, its files by their paths.
   */
  async function importOne(
    item: ShowImportItem,
    root: string,
    qualityProfileId: string,
  ): Promise<{ problem: string | null; files: ReconcileResult | null }> {
    const here = showAt(item.tmdbId)
    if (here && here.path !== item.folder)
      return {
        problem: `The show is already in the library, in ${here.path}.`,
        files: null,
      }
    await library.add(
      {
        tmdbId: item.tmdbId,
        rootFolder: root,
        qualityProfileId,
        languageProfileId: null,
        // monitoring and searching are C1's; a read-only root folder hides both (the plan's B)
        monitor: 'all',
        seasonFolders: await usesSeasonFolders(item.folder),
        search: false,
      },
      { path: item.folder },
    )
    const show = showAt(item.tmdbId)
    if (!show) return { problem: 'The show couldn’t be added.', files: null }
    files.unmatched.clear(item.folder)
    const result = await files.reconcile(show)
    return { problem: null, files: result }
  }

  /**
   * The library scan's new folders under one Shows root folder: each identified surely is added
   * where it is with its files matched; the rest are kept unmatched with their reason. A folder
   * already kept isn't searched for again unless `retry` (a change seen in it). Without a TMDB key
   * nothing changes. Safe to repeat.
   */
  async function addNew(
    rootPath: string,
    folders: readonly string[],
    { retry = false }: { retry?: boolean } = {},
  ): Promise<{ added: number; waiting: number }> {
    const result = { added: 0, waiting: 0 }
    const root = media.rootFolders.find(rootPath, 'shows')?.path
    const profile = media.profiles.list()[0]
    if (!root || !profile || folders.length === 0) return result
    for (const folder of folders) {
      if (!isWithin(root, folder) || dirname(folder) !== root) continue
      if (!retry && files.unmatched.has(folder)) {
        result.waiting++
        continue
      }
      let found: Identified
      try {
        found = await identify(folder)
      } catch (e) {
        if (noKey(e)) {
          log.info('new show folders wait for a TMDB key to be matched', { root })
          break
        }
        // TMDB unreachable: the next scan tries again
        log.warn('couldn’t identify a new show folder', { folder, error: (e as Error).message })
        continue
      }
      if (!found.sure) {
        files.unmatched.put({
          path: folder,
          kind: 'show-folder',
          rootFolder: root,
          itemId: null,
          reason: found.reason,
          message: found.message,
        })
        result.waiting++
        continue
      }
      let outcome: Awaited<ReturnType<typeof importOne>>
      try {
        outcome = await importOne({ folder, tmdbId: found.tmdbId }, root, profile.id)
      } catch (e) {
        log.warn('couldn’t add a new folder’s show', { folder, error: (e as Error).message })
        continue
      }
      if (outcome.problem) {
        files.unmatched.put({
          path: folder,
          kind: 'show-folder',
          rootFolder: root,
          itemId: null,
          reason: 'second-copy',
          message: outcome.problem,
        })
        result.waiting++
        continue
      }
      result.added++
      log.info('added a show found in a root folder', {
        folder,
        tmdbId: found.tmdbId,
        by: found.by,
      })
    }
    return result
  }

  function status(): ShowImportState {
    const s = read()
    if (s.state !== 'running' || !s.jobId) return s
    // a job that gave up leaves the row saying running: it's failed
    const job = jobs.get(s.jobId)
    if (!job || job.status === 'failed' || job.status === 'cancelled')
      return { ...s, state: 'failed' }
    return s
  }

  /** Starts the job that adds the confirmed shows. One run at a time (409 `running`). */
  function run(
    items: readonly ShowImportItem[],
    options: { qualityProfileId?: string } = {},
  ): ShowImportState {
    if (status().state === 'running')
      throw new AppError('conflict', 'A library import is already running.', { reason: 'running' })
    if (items.length === 0)
      throw new AppError('invalid', 'Pick at least one folder.', { reason: 'no-items' })
    const roots = media.rootFolders.list('shows').map((r) => r.path)
    let root: string | null = null
    const seen = new Set<number>()
    const checked: ShowImportItem[] = []
    for (const item of items) {
      const folder = checkPath(item.folder, roots)
      const parent = requireRoot(dirname(folder))
      if (root && parent !== root)
        throw new AppError('invalid', 'Every folder comes from one root folder.', {
          reason: 'mixed-roots',
        })
      root = parent
      if (seen.has(item.tmdbId))
        throw new AppError('invalid', 'Two folders are matched to one show.', {
          reason: 'duplicate-show',
        })
      seen.add(item.tmdbId)
      checked.push({ folder, tmdbId: item.tmdbId })
    }
    const profile = options.qualityProfileId
      ? media.profiles.get(options.qualityProfileId)
      : media.profiles.list()[0]
    if (!profile)
      throw new AppError('invalid', 'Add a quality profile first.', { reason: 'no-profiles' })
    const jobId = jobs.enqueue(SHOW_IMPORT_JOB, {
      root: root as string,
      qualityProfileId: profile.id,
      items: checked,
    })
    const next: ShowImportState = {
      ...IDLE,
      state: 'running',
      jobId,
      root,
      total: checked.length,
      startedAt: clock.now(),
    }
    write(next)
    log.info('shows library import started', { root, items: checked.length })
    return next
  }

  jobs.define({
    type: SHOW_IMPORT_JOB,
    payload: Payload,
    attempts: 3,
    // 270 shows and 8,000 episodes probed on a NAS's disks: generous, and still ends
    timeoutMs: 12 * 60 * 60 * 1000,
    async run(p, jobCtx) {
      let state = read()
      // a different run's row (or none): this job starts it
      if (state.jobId !== jobCtx.jobId)
        state = {
          ...IDLE,
          state: 'running',
          jobId: jobCtx.jobId,
          root: p.root,
          total: p.items.length,
          startedAt: clock.now(),
        }
      // a retry picks up after the last folder it finished
      for (let i = state.done; i < p.items.length; i++) {
        if (jobCtx.signal.aborted) throw new Error('The library import was stopped.')
        const item = p.items[i] as ShowImportItem
        let problem: string | null
        let result: ReconcileResult | null = null
        try {
          const out = await importOne(item, p.root, p.qualityProfileId)
          problem = out.problem
          result = out.files
        } catch (e) {
          problem = (e as Error).message
        }
        state = {
          ...state,
          done: i + 1,
          imported: state.imported + (problem ? 0 : 1),
          files: state.files + (result?.added ?? 0),
          unmatched: state.unmatched + (result?.unmatched ?? 0),
          failures: problem
            ? [...state.failures, { folder: item.folder, message: problem }]
            : state.failures,
        }
        write(state)
      }
      write({ ...state, state: 'done', finishedAt: clock.now() })
      log.info('shows library import finished', {
        imported: state.imported,
        files: state.files,
        unmatched: state.unmatched,
        failed: state.failures.length,
      })
    },
  })

  return { scan, run, status, addNew, identify }
}

export type ShowLibraryImport = ReturnType<typeof createShowLibraryImport>

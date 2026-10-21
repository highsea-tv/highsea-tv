// SPDX-License-Identifier: AGPL-3.0-only
// Importing a library that's already on disk (checkpoint 6, Manual import, 6b; the owner's answer
// 9): A17's Library import mode. Each folder under a root folder is a candidate: its name is read
// with @highsea/parser (`Title (Year)`, `{tmdb-…}`, `{imdb-…}`, as Radarr's and Jellyfin's naming
// put ids in folder names) and matched on TMDB, which needs the key. The owner confirms the
// matches, and a job adds each movie where it is: no move, and no rename unless Rename to my
// format is ticked (then the folder takes the folder format and the file the file format).
//
// The job is safe to repeat (ADR 0022): adding a movie that's in the library returns it, a folder
// already renamed is found under its new name, and the file is recorded by path. Progress lives in
// one settings row, `libraryImport`, announced on `import.updated`; the job's payload carries the
// items, so a restart picks up where it stopped.
import { promises as fsp } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { AddMovieInput } from '@highsea/api-contract'
import { AppError } from '@highsea/core'
import { readSetting, schema, writeSetting } from '@highsea/db'
import type { DiscoverMovie } from '@highsea/metadata'
import { parse } from '@highsea/parser'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { type FoundFile, isVideo, listFiles, skipBeforeProbe } from '../shared/files.ts'
import type { Media } from '../shared/index.ts'
import { buildFolderName } from '../shared/naming.ts'
import { checkPath } from '../shared/paths.ts'
import type { MediaInfo } from '../shared/probe.ts'
import type { Ctx } from './context.ts'
import type { Imports } from './import.ts'
import type { Library } from './library.ts'

const { mediaItems, mediaFiles } = schema

export const LIBRARY_IMPORT_JOB = 'library.import'
export const LIBRARY_IMPORT_KEY = 'libraryImport'
/** @highsea/api-contract's `LIBRARY_IMPORT_TOPIC`. */
export const LIBRARY_IMPORT_TOPIC = 'import.updated'
/** One scan reads at most this many folders: a root with more is imported in parts. */
export const MAX_FOLDERS = 2_000

export type LibraryCandidate = {
  folder: string
  name: string
  /** The main video file, the largest that isn't a sample or an extra; null when there's none. */
  file: string | null
  size: number
  quality: string | null
  match: { tmdbId: number; title: string; year: number | null } | null
  inLibrary: boolean
  /** Why it can't be imported, or null. */
  skip: string | null
}

export type LibraryImportItem = { folder: string; tmdbId: number }

export type LibraryImportState = {
  state: 'idle' | 'running' | 'done' | 'failed'
  jobId: string | null
  root: string | null
  rename: boolean
  total: number
  done: number
  imported: number
  failures: { folder: string; message: string }[]
  startedAt: number | null
  finishedAt: number | null
}

const IDLE: LibraryImportState = {
  state: 'idle',
  jobId: null,
  root: null,
  rename: false,
  total: 0,
  done: 0,
  imported: 0,
  failures: [],
  startedAt: null,
  finishedAt: null,
}

const Payload = z.object({
  root: z.string(),
  rename: z.boolean(),
  qualityProfileId: z.string(),
  items: z.array(z.object({ folder: z.string(), tmdbId: z.number().int().positive() })),
})

const invalid = (message: string, reason: string) => new AppError('invalid', message, { reason })

/** `the`, `a` and punctuation aside, for telling whether TMDB's title is the folder's. */
const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(the|a|an) /, '')
    .trim()

/**
 * The best of TMDB's results for a folder's title and year: the same title and year, then the same
 * year, then the same title, then TMDB's first. A year that's off by one counts, as Radarr allows
 * for release dates that differ by region.
 */
export function bestMatch(
  results: readonly DiscoverMovie[],
  title: string,
  year: number | null,
): DiscoverMovie | null {
  const want = plain(title)
  const score = (m: DiscoverMovie) => {
    const sameTitle = plain(m.title) === want || plain(m.originalTitle) === want
    const yearOff = year && m.year ? Math.abs(m.year - year) : null
    return (sameTitle ? 2 : 0) + (yearOff === 0 ? 3 : yearOff === 1 ? 1 : 0)
  }
  let best: DiscoverMovie | null = null
  let bestScore = -1
  for (const m of results) {
    const s = score(m)
    if (s > bestScore) {
      best = m
      bestScore = s
    }
  }
  // with a year to go by, a result whose title and year both differ isn't a match
  if (best && year && bestScore === 0) return null
  return best
}

export function createLibraryImport(
  ctx: Ctx,
  deps: { media: Media; library: Library; imports: Imports },
) {
  const { db, jobs, events, clock, metadata } = ctx
  const { media, library, imports } = deps
  const log = ctx.logger.child('library-import')

  const read = () => readSetting<LibraryImportState>(db, LIBRARY_IMPORT_KEY, IDLE)
  function write(next: LibraryImportState) {
    writeSetting(db, LIBRARY_IMPORT_KEY, next, clock.now())
    events.emit({ topic: LIBRARY_IMPORT_TOPIC })
  }

  function requireRoot(path: string): string {
    const folder = media.rootFolders.find(path)
    if (!folder) throw invalid('Pick one of the root folders.', 'unknown-root-folder')
    return folder.path
  }

  /** The folder's videos, largest first, leaving out samples, extras and the like by name. */
  async function videosIn(folder: string): Promise<FoundFile[]> {
    return (await listFiles(folder))
      .filter((f) => isVideo(f.path) && !skipBeforeProbe(f.path, folder))
      .sort((a, b) => b.size - a.size)
  }

  async function matchFor(name: string): Promise<LibraryCandidate['match']> {
    const parsed = parse(name)
    const toMatch = (m: { id: number; title: string; year: number | null }) => ({
      tmdbId: m.id,
      title: m.title,
      year: m.year,
    })
    if (parsed.ids.tmdb) {
      const m = await metadata.movie(parsed.ids.tmdb).catch((e) => {
        if ((e as AppError).code === 'not-found') return null
        throw e
      })
      if (m) return toMatch(m)
    }
    if (parsed.ids.imdb) {
      const m = await metadata.discover.findByImdb(parsed.ids.imdb)
      if (m) return toMatch(m)
    }
    if (!parsed.title) return null
    // TMDB's search ignores case; one spelling keeps the requests (and the recordings) the same
    const page = await metadata.discover.search(parsed.title.toLowerCase())
    const best = bestMatch(page.results, parsed.title, parsed.year)
    return best ? toMatch(best) : null
  }

  /**
   * What a root folder holds: one candidate per folder, matched on TMDB. Without a TMDB key it's
   * refused (`no-tmdb-key`), since nothing can be matched.
   */
  async function scan(rootPath: string): Promise<LibraryCandidate[]> {
    const root = requireRoot(
      checkPath(
        rootPath,
        media.rootFolders.list().map((r) => r.path),
      ),
    )
    const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => {
      throw new AppError('unavailable', `${root} can’t be read.`, { reason: 'unreadable' })
    })
    const folders = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, MAX_FOLDERS)
    const here = db
      .select({ path: mediaItems.path, tmdbId: mediaItems.tmdbId })
      .from(mediaItems)
      .where(eq(mediaItems.type, 'movie'))
      .all()
    const byPath = new Set(here.map((r) => r.path))
    const byId = new Set(here.map((r) => r.tmdbId))

    const out: LibraryCandidate[] = []
    for (const name of folders) {
      const folder = join(root, name)
      const videos = await videosIn(folder).catch(() => [] as FoundFile[])
      const main = videos[0] ?? null
      let match: LibraryCandidate['match'] = null
      let matchProblem: string | null = null
      try {
        match = await matchFor(name)
      } catch (e) {
        // no key: nothing can be matched, so the whole scan says so
        if ((e as { details?: { reason?: string } }).details?.reason === 'no-tmdb-key') throw e
        matchProblem = 'TMDB couldn’t be reached to match it.'
        log.warn('couldn’t match a folder', { folder, error: (e as Error).message })
      }
      const inLibrary = byPath.has(folder) || (match !== null && byId.has(match.tmdbId))
      const quality = main
        ? imports.internal.qualityFor(
            parse(`${name} ${basename(main.path, extname(main.path))}`),
            null,
          )
        : null
      out.push({
        folder,
        name,
        file: main?.path ?? null,
        size: main?.size ?? 0,
        quality,
        match,
        inLibrary,
        skip: !main
          ? 'No video file in the folder.'
          : inLibrary
            ? 'Already in the library.'
            : (matchProblem ?? (match ? null : 'No match on TMDB. Pick the movie to import it.')),
      })
    }
    return out
  }

  function status(): LibraryImportState {
    const s = read()
    if (s.state !== 'running' || !s.jobId) return s
    // a job that gave up leaves the row saying running: it's failed
    const job = jobs.get(s.jobId)
    if (!job || job.status === 'failed' || job.status === 'cancelled')
      return { ...s, state: 'failed' }
    return s
  }

  /** Starts the job that adds the confirmed movies. One run at a time (409 `running`). */
  function run(
    items: readonly LibraryImportItem[],
    options: { rename?: boolean; qualityProfileId?: string } = {},
  ): LibraryImportState {
    if (status().state === 'running')
      throw new AppError('conflict', 'A library import is already running.', { reason: 'running' })
    if (items.length === 0) throw invalid('Pick at least one folder.', 'no-items')
    const roots = media.rootFolders.list().map((r) => r.path)
    let root: string | null = null
    const seen = new Set<number>()
    const checked: LibraryImportItem[] = []
    for (const item of items) {
      const folder = checkPath(item.folder, roots)
      const parent = requireRoot(dirname(folder))
      if (root && parent !== root)
        throw invalid('Every folder comes from one root folder.', 'mixed-roots')
      root = parent
      if (seen.has(item.tmdbId))
        throw invalid('Two folders are matched to one movie.', 'duplicate-movie')
      seen.add(item.tmdbId)
      checked.push({ folder, tmdbId: item.tmdbId })
    }
    const profiles = media.profiles.list()
    const profile = options.qualityProfileId
      ? media.profiles.get(options.qualityProfileId)
      : profiles[0]
    if (!profile) throw invalid('Add a quality profile first.', 'no-profiles')
    const rename = options.rename ?? false
    const jobId = jobs.enqueue(LIBRARY_IMPORT_JOB, {
      root: root as string,
      rename,
      qualityProfileId: profile.id,
      items: checked,
    })
    const next: LibraryImportState = {
      ...IDLE,
      state: 'running',
      jobId,
      root,
      rename,
      total: checked.length,
      startedAt: clock.now(),
    }
    write(next)
    log.info('library import started', { root, items: checked.length, rename })
    return next
  }

  /** Adds one folder's movie in place. Returns the problem, or null. */
  async function importOne(
    item: LibraryImportItem,
    p: z.infer<typeof Payload>,
    label: string,
  ): Promise<string | null> {
    const input: AddMovieInput = {
      tmdbId: item.tmdbId,
      rootFolder: p.root,
      monitored: true,
      minimumAvailability: 'released',
      versions: [{ label, qualityProfileId: p.qualityProfileId }],
    }
    await library.add(input)
    let row = library.internal.rowOf(item.tmdbId)
    if (!row) return 'The movie couldn’t be added.'
    const meta = library.internal.cached(item.tmdbId)
    const settings = media.mediaManagement.get()

    // the folder: where it is, or under the folder format; a second run finds it renamed
    let folder = item.folder
    if (p.rename) {
      const name = buildFolderName(settings.folderFormat, imports.internal.namingMovie(row, meta), {
        colonReplacement: settings.colonReplacement,
      })
      const dest = name ? checkPath(join(p.root, name), [p.root]) : folder
      const there = (path: string) =>
        fsp.stat(path).then(
          () => true,
          () => false,
        )
      if (dest !== folder) {
        if ((await there(folder)) && !(await there(dest))) {
          await fsp.mkdir(dirname(dest), { recursive: true })
          await fsp.rename(folder, dest)
          folder = dest
        } else if (!(await there(folder)) && (await there(dest))) folder = dest
      }
    }
    if (row.path !== folder) {
      db.update(mediaItems)
        .set({ path: folder, updatedAt: clock.now() })
        .where(eq(mediaItems.id, row.id))
        .run()
      row = { ...row, path: folder }
    }

    // the file: the largest video that probes as one and isn't a sample
    let videos: FoundFile[]
    try {
      videos = await videosIn(folder)
    } catch {
      return `${folder} can’t be read.`
    }
    let picked: { file: FoundFile; info: MediaInfo } | null = null
    let why = 'No video file in the folder.'
    for (const f of videos) {
      const probed = await imports.internal.probed(f, folder, meta)
      if (probed.skip === null) {
        picked = { file: f, info: probed.info }
        break
      }
      why = probed.skip
    }
    if (!picked) return why

    const versions = imports.internal.versionRows(row.id)
    const recorded = db
      .select({ id: mediaFiles.id })
      .from(mediaFiles)
      .where(eq(mediaFiles.path, picked.file.path))
      .get()
    const version =
      (recorded && versions.find((v) => v.fileId === recorded.id)) ??
      versions.find((v) => !v.fileId)
    if (!version) return 'The movie already has a file.'
    const own = basename(picked.file.path, extname(picked.file.path))
    await imports.adopt({
      row,
      version,
      path: picked.file.path,
      info: picked.info,
      // the file's own name, with the folder's for what it leaves out (the year, an id)
      sourceTitle: own,
      rename: p.rename,
      message: p.rename
        ? 'Imported from the existing library, renamed to the naming format.'
        : 'Imported from the existing library, where it was.',
    })
    return null
  }

  jobs.define({
    type: LIBRARY_IMPORT_JOB,
    payload: Payload,
    attempts: 3,
    // a large library on a slow disk: probing every file takes a while
    timeoutMs: 6 * 60 * 60 * 1000,
    async run(p, jobCtx) {
      const label = media.profiles.list().find((x) => x.id === p.qualityProfileId)?.name ?? 'Main'
      let state = read()
      // a different run's row (or none): this job starts it
      if (state.jobId !== jobCtx.jobId)
        state = {
          ...IDLE,
          state: 'running',
          jobId: jobCtx.jobId,
          root: p.root,
          rename: p.rename,
          total: p.items.length,
          startedAt: clock.now(),
        }
      for (let i = state.done; i < p.items.length; i++) {
        if (jobCtx.signal.aborted) throw new Error('The library import was stopped.')
        const item = p.items[i] as LibraryImportItem
        let problem: string | null
        try {
          problem = await importOne(item, p, label)
        } catch (e) {
          problem = (e as Error).message
        }
        state = {
          ...state,
          done: i + 1,
          imported: state.imported + (problem ? 0 : 1),
          failures: problem
            ? [...state.failures, { folder: item.folder, message: problem }]
            : state.failures,
        }
        write(state)
      }
      write({ ...state, state: 'done', finishedAt: clock.now() })
      log.info('library import finished', {
        imported: state.imported,
        failed: state.failures.length,
      })
    },
  })

  return { scan, run, status }
}

export type LibraryImport = ReturnType<typeof createLibraryImport>

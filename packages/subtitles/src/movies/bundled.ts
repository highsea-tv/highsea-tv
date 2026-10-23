// SPDX-License-Identifier: AGPL-3.0-only
// What the import does for subtitles (checkpoint 7's plan, "Embedded and bundled tracks"), through
// the movie import's hooks:
// - the file's moviehash goes into `media_files.media_info`, for OpenSubtitles.com's hash search;
// - the text subtitles that came with the release, beside the video or in a `Subs` folder, become
//   sidecars (`kind: 'bundled'`) with a score of 100: they were made for this release. The language
//   comes from the name; one whose language can't be told is skipped and logged, not guessed. Image
//   subtitles (`.sup`, `.idx` with its `.sub`) are copied unchanged (judgement call 2);
// - a file adopted in place keeps the sidecars already beside it, recorded as they are;
// - a replaced file's tracks move to the new file, and their sidecars to its name;
// - then the movie's wanted rows are rewritten and a search is queued.
import { basename, dirname, extname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { newId } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import type { ImportedFile, ImportHooks, Tx } from '@highsea-tv/media/movies'
import { and, eq, sql } from 'drizzle-orm'
import { toLanguageCode } from '../shared/languages.ts'
import { moviehash } from '../shared/moviehash.ts'
import { sidecarPath } from '../shared/naming.ts'
import { MAX_SUBTITLE_BYTES, processSubtitle, renderSubtitle } from '../shared/processing/index.ts'
import { applyCorrection } from '../sync/align.ts'
import { announce, type SubtitlesDeps } from './context.ts'
import { correctionOf } from './sync.ts'
import { providerName, type TrackRow, type Tracks } from './tracks.ts'
import type { Wanted } from './wanted.ts'

const { mediaFiles, subtitleFiles } = schema

/** The extensions a release's subtitles come in. `.sub` goes with its `.idx`. */
const TEXT = new Set(['srt', 'vtt', 'ass', 'ssa'])
const IMAGE = new Set(['sup', 'idx'])

/** The folders releases keep subtitles in. */
const SUB_FOLDERS = /^(subs?|subtitles?)$/i

/** Words in a subtitle's name that are its flags, not its language. */
const FORCED = new Set(['forced', 'foreign'])
const SDH = new Set(['sdh', 'hi', 'cc'])

export type NamedTrack = { language: string; forced: boolean; hi: boolean }

/**
 * A subtitle's language and flags from its name: `Movie.en.srt`, `Movie.English.forced.srt`,
 * `2_English.srt`, `eng.sdh.srt`. Only the last word before the flags is read as the language, so a
 * title's words are never taken for one. `hi` is SDH beside a language, and Hindi alone.
 */
export function trackFromName(file: string): NamedTrack | null {
  const words = basename(file, extname(file))
    .split(/[\s._-]+/)
    .filter(Boolean)
  let forced = false
  let hi = false
  for (let i = words.length - 1; i >= 0; i--) {
    const word = (words[i] ?? '').toLowerCase()
    if (FORCED.has(word)) forced = true
    else if (SDH.has(word) && i > 0) hi = true
    else {
      // a regional code is split by the hyphen: `pt-BR`, `zh-Hant`
      const regional = i > 0 ? toLanguageCode(`${words[i - 1]}-${words[i]}`) : null
      const language = regional?.includes('-') ? regional : toLanguageCode(words[i] ?? '')
      return language ? { language, forced, hi } : null
    }
  }
  return null
}

export type SubtitleFsEntry = { path: string; name: string }

export function createBundled(
  deps: SubtitlesDeps,
  tracks: Tracks,
  wanted: Wanted,
  {
    queueSearch,
    queueResync,
  }: { queueSearch: (fileId: string) => void; queueResync: (fileId: string) => void },
) {
  const { db, clock, events } = deps
  const fs = tracks.fs
  const log = deps.logger.child('subtitles')

  async function list(dir: string): Promise<SubtitleFsEntry[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    const out: SubtitleFsEntry[] = []
    for (const e of entries) {
      const path = join(dir, e.name)
      if (e.isDirectory() && SUB_FOLDERS.test(e.name)) {
        const inner = await fs.readdir(path, { withFileTypes: true }).catch(() => [])
        for (const f of inner) if (f.isFile()) out.push({ path: join(path, f.name), name: f.name })
      } else if (e.isFile()) out.push({ path, name: e.name })
    }
    return out.filter((f) => {
      const ext = extname(f.name).slice(1).toLowerCase()
      return TEXT.has(ext) || IMAGE.has(ext)
    })
  }

  /** Stores the file's moviehash beside its probe; a file outside the hash's range stores null. */
  async function hash(fileId: string, path: string): Promise<void> {
    const value = await moviehash(path).catch((e) => {
      log.warn('couldn’t hash the file', { path, error: (e as Error).message })
      return null
    })
    db.update(mediaFiles)
      .set({
        mediaInfo: sql`json_set(coalesce(${mediaFiles.mediaInfo}, '{}'), '$.moviehash', ${value})`,
      })
      .where(eq(mediaFiles.id, fileId))
      .run()
  }

  const exists = (fileId: string, t: NamedTrack) =>
    !!db
      .select({ id: subtitleFiles.id })
      .from(subtitleFiles)
      .where(
        and(
          eq(subtitleFiles.mediaFileId, fileId),
          eq(subtitleFiles.language, t.language),
          eq(subtitleFiles.forced, t.forced),
          eq(subtitleFiles.hi, t.hi),
          eq(subtitleFiles.provider, 'release'),
        ),
      )
      .get()

  /** Records one bundled subtitle, copying it beside the video unless it's already there. */
  async function take(
    file: ImportedFile,
    entry: SubtitleFsEntry,
    inPlace: boolean,
  ): Promise<boolean> {
    const t = trackFromName(entry.name)
    if (!t) {
      log.info('skipped a subtitle whose language can’t be told', { path: entry.path })
      return false
    }
    if (exists(file.fileId, t)) return false
    const ext = extname(entry.name).slice(1).toLowerCase()
    const stat = await fs.stat(entry.path)
    let format = ext
    let original: Buffer | null = null
    let encoding: string | null = null
    let data: string | Uint8Array
    if (TEXT.has(ext)) {
      if (stat.size > MAX_SUBTITLE_BYTES) {
        log.info('skipped a subtitle over 2 MB', { path: entry.path })
        return false
      }
      const processed = processSubtitle(new Uint8Array(await fs.readFile(entry.path)), {
        removeHi: false,
      })
      if (!processed.ok) {
        log.info('skipped a file that isn’t a subtitle', {
          path: entry.path,
          reason: processed.reason,
        })
        return false
      }
      format = processed.format
      original = gzipSync(Buffer.from(processed.original, 'utf8'))
      encoding = processed.encoding
      data = processed.text
    } else data = new Uint8Array(await fs.readFile(entry.path))

    const path = inPlace ? entry.path : sidecarPath(file.path, { ...t, format })
    if (!inPlace) {
      await tracks.write(path, data)
      if (ext === 'idx') {
        // VobSub's pictures are in the `.sub` beside the `.idx`
        const sub = join(dirname(entry.path), `${basename(entry.name, extname(entry.name))}.sub`)
        await fs.copyFile(sub, `${path.slice(0, -4)}.sub`).catch((e) =>
          log.warn('couldn’t copy the VobSub pictures', {
            path: sub,
            error: (e as Error).message,
          }),
        )
      }
    }
    const now = clock.now()
    db.insert(subtitleFiles)
      .values({
        id: newId('sub'),
        mediaFileId: file.fileId,
        itemId: file.itemId,
        ...t,
        format: format as TrackRow['format'],
        kind: 'bundled',
        path,
        provider: 'release',
        providerSubtitleId: null,
        releaseName: null,
        score: 100,
        matches: [],
        chosen: false,
        original,
        encoding,
        syncStatus: 'not-needed',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run()
    return true
  }

  /** The sidecars a file adopted in place already has: those named after it. */
  async function besideInPlace(file: ImportedFile): Promise<SubtitleFsEntry[]> {
    const base = basename(file.path, extname(file.path))
    return (await list(dirname(file.path))).filter(
      (e) => dirname(e.path) === dirname(file.path) && e.name.startsWith(`${base}.`),
    )
  }

  /** The release's own subtitles: everything beside the video in its folder, and in `Subs`. */
  async function fromRelease(folder: string): Promise<SubtitleFsEntry[]> {
    return list(folder)
  }

  /**
   * Moves a file's sidecars to its name (the video was renamed or replaced). One that's gone from
   * disk is written again from its original.
   */
  async function follow(fileId: string, videoPath: string): Promise<void> {
    const rows = tracks.rowsOf(fileId)
    const taken = new Set<string>()
    for (const row of rows) {
      let path = sidecarPath(videoPath, { ...row, format: row.format })
      if (taken.has(path))
        path = sidecarPath(
          videoPath,
          row,
          providerName(row.provider)?.replace(/\.com$/, '') ?? row.provider,
        )
      taken.add(path)
      if (row.path === path) continue
      const moved = await fs
        .rename(row.path, path)
        .then(() => true)
        .catch(() => false)
      if (!moved) {
        const original = tracks.originalOf(row)
        if (!original) {
          log.warn('couldn’t move a subtitle with its video', { path: row.path })
          continue
        }
        const c = correctionOf(row)
        const nudge = row.manualOffsetMs
        await tracks.write(
          path,
          renderSubtitle(original, {
            removeHi: row.hiRemoved,
            shift: (ms, anchor) => applyCorrection(c, ms, anchor) + nudge,
          }).text,
        )
      }
      if (row.format === 'idx')
        await fs.rename(`${row.path.slice(0, -4)}.sub`, `${path.slice(0, -4)}.sub`).catch(() => {})
      db.update(subtitleFiles)
        .set({ path, updatedAt: clock.now() })
        .where(eq(subtitleFiles.id, row.id))
        .run()
    }
  }

  /** Files whose tracks came from the file they replaced: synced again after the import. */
  const replacedFiles = new Set<string>()

  const hooks: ImportHooks = {
    replacing(tx: Tx, from: string, to: string) {
      replacedFiles.add(to)
      // the old file's tracks belong to the new one; the new file may already have the same track
      const moving = tx
        .select()
        .from(subtitleFiles)
        .where(eq(subtitleFiles.mediaFileId, from))
        .all()
      for (const row of moving) {
        const clash = tx
          .select({ id: subtitleFiles.id })
          .from(subtitleFiles)
          .where(
            and(
              eq(subtitleFiles.mediaFileId, to),
              eq(subtitleFiles.language, row.language),
              eq(subtitleFiles.forced, row.forced),
              eq(subtitleFiles.hi, row.hi),
              eq(subtitleFiles.provider, row.provider),
            ),
          )
          .get()
        if (clash) continue
        tx.update(subtitleFiles).set({ mediaFileId: to }).where(eq(subtitleFiles.id, row.id)).run()
      }
    },

    async afterImport(file: ImportedFile) {
      await hash(file.fileId, file.path)
      await follow(file.fileId, file.path)
      if (replacedFiles.delete(file.fileId)) queueResync(file.fileId)
      const entries = file.inPlace
        ? await besideInPlace(file)
        : file.sourceFolder
          ? await fromRelease(file.sourceFolder)
          : []
      let taken = 0
      for (const entry of entries)
        if (
          await take(file, entry, file.inPlace).catch((e) => {
            log.warn('couldn’t keep a bundled subtitle', {
              path: entry.path,
              error: (e as Error).message,
            })
            return false
          })
        )
          taken++
      if (taken > 0) log.info('kept bundled subtitles', { fileId: file.fileId, count: taken })
      wanted.refresh(file.itemId, { importing: true })
      if (wanted.forFile(file.fileId).length > 0) queueSearch(file.fileId)
      const item = tracks.item(file.itemId)
      if (item) announce(events, [item.tmdbId])
    },
  }

  return { hooks, hash, follow, trackFromName }
}

export type Bundled = ReturnType<typeof createBundled>

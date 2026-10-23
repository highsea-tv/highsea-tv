// SPDX-License-Identifier: AGPL-3.0-only
// Importing movies (checkpoint 6, The import pipeline and Manual import, 6a): a finished download,
// or files the owner picks, into the library. The steps are the plan's 1 to 9: find the files,
// extract archives (6b, extract.ts), probe, decide, name, transfer, replace, record, announce.
// A job runs it at least once (ADR 0022), so each step checks whether it already happened: a
// file already recorded from this release is the import done, a finished transfer isn't redone,
// and the history entry is written once.
//
// Every path is checked against the allowed roots (the root folders and the downloads folder)
// before anything is read or written (paths.ts).
import { promises as fsp } from 'node:fs'
import { basename, dirname, extname, join, relative } from 'node:path'
import { AppError, newId } from '@highsea-tv/core'
import { type Db, schema } from '@highsea-tv/db'
import type { MovieMetadata } from '@highsea-tv/metadata'
import { type ParsedRelease, parse } from '@highsea-tv/parser'
import {
  decide,
  defaultSpecifications,
  type ExistingFile,
  isQualityName,
  type QualityName,
  qualityDefinition,
  qualityOf,
} from '@highsea-tv/quality'
import { and, asc, eq } from 'drizzle-orm'
import {
  createExtractor,
  type Extract,
  ExtractError,
  extractDownload,
  removeUnpacked,
} from '../shared/extract.ts'
import { createProbe } from '../shared/ffprobe.ts'
import { writeFileFacts } from '../shared/file-facts.ts'
import {
  blockedMessage,
  type FoundFile,
  findBlocked,
  isBlocked,
  isVideo,
  listFiles,
  minimumRuntimeSeconds,
  sampleReason,
  skipBeforeProbe,
} from '../shared/files.ts'
import type { HistoryPage } from '../shared/history.ts'
import { applyPermissions, recycle } from '../shared/housekeeping.ts'
import type { Media } from '../shared/index.ts'
import type { ItemRow, VersionRow } from '../shared/map.ts'
import { isoOf } from '../shared/map.ts'
import { matchKey, safeName } from '../shared/names.ts'
import { buildFileName, type NamingFile, type NamingMovie } from '../shared/naming.ts'
import { type NfoMovie, writeArtwork, writeNfo } from '../shared/nfo.ts'
import { checkPath } from '../shared/paths.ts'
import {
  type MediaInfo,
  type Probe,
  ProbeError,
  resolutionOf,
  type Stream,
  streamsOf,
} from '../shared/probe.ts'
import type { MediaManagement } from '../shared/settings.ts'
import {
  nodeFs,
  type TransferFs,
  type TransferMethod,
  transfer,
  transferMessage,
} from '../shared/transfer.ts'
import { announce, type Ctx, notInLibrary, TOPICS } from './context.ts'
import type { Library } from './library.ts'

const { mediaItems, versions, mediaFiles } = schema

/** How importing is set up; every part has a default, so the runtime passes only the downloads folder. */
export type ImportOptions = {
  /** The downloads folder (setup's `folders.downloads`), allowed alongside the root folders. */
  downloadDirs?: () => string[]
  /** ffprobe; defaults to `HIGHSEA_FFPROBE` or `ffprobe` on the PATH. */
  probe?: Probe
  /** Overrides DetectSample's minimum runtime in seconds, so tests can use short clips. */
  sampleSeconds?: number
  /** The filesystem calls transfers make; a test forces `EXDEV` through it. */
  fs?: TransferFs
  /** unar (6b); defaults to `HIGHSEA_UNAR` or `unar` on the PATH. */
  extract?: Extract
  /** What another package does as files arrive (checkpoint 7's subtitles); the runtime wires it. */
  hooks?: ImportHooks
}

/** A transaction, as `db.transaction` hands it to its callback. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** A file just recorded in the library, as the import hook sees it. */
export type ImportedFile = {
  fileId: string
  itemId: string
  /** Where it is now, in the movie's folder. */
  path: string
  /**
   * The release's folder it came from, for the files that came with it (subtitles); null when it
   * came alone, or was recorded where it already was.
   */
  sourceFolder: string | null
  /** Recorded in place (the scan, the existing-library import, the importers): nothing was copied. */
  inPlace: boolean
}

/**
 * The import pipeline's hooks (checkpoint 7): `media` calls them and doesn't know who listens, so it
 * doesn't depend on `subtitles`. Both run inside the import, before it finishes: a Move import
 * removes the download's files as soon as it does.
 */
export type ImportHooks = {
  /** Inside the record's transaction, before a replaced file's row goes: what hangs off it moves. */
  replacing?: (tx: Tx, from: string, to: string) => void
  /** After a file is recorded. A failure is logged; the import stands. */
  afterImport?: (file: ImportedFile) => Promise<void>
}

export type ImportMode = 'hardlink' | 'move'

export type ImportInput = {
  /** The library row's id (`media_items.id`), as a download holds it. */
  itemId: string
  /** The version to fill; default: the first without a file, else the first. */
  versionId?: string | null
  /** The download's folder, or its one file. */
  folder: string
  releaseTitle: string
  /** The quality as grabbed (`Bluray-1080p`); the name and the probe decide when it's missing. */
  quality?: string | null
  indexer?: string | null
  downloadId?: string | null
  mode?: ImportMode
}

export type ImportResult =
  | {
      status: 'imported'
      fileId: string
      path: string
      transfer: TransferMethod
      /** The transfer's own words for the history ("Copied: the downloads folder is on another disk."). */
      message: string
      quality: QualityName
      /** It was already imported; nothing changed this time. */
      already: boolean
    }
  /** `replace`: the release can never import (a password-protected archive), so find another. */
  | { status: 'blocked'; reason: string; replace?: boolean }
  | { status: 'failed'; reason: string }

/** What manual import found: the prototype's `ImportCandidate`, with what the scan worked out. */
export type ImportCandidate = {
  path: string
  size: number
  quality: QualityName
  language: string
  /** The matched movie's id (its TMDB id, as the API addresses movies); null when nothing matched. */
  itemId: number | null
  /** The version it would fill: the first without a file, else the first. */
  versionId: string | null
  /** Why it would be skipped, when it would. */
  skip: string | null
  /** `{movie folder}/{file}`, as the naming format makes it; null until a movie is chosen. */
  becomes: string | null
}

export type ManualImportFile = { path: string; itemId: number; versionId?: string | null }

/** The prototype's `MediaFile`, with the movie's id as the API gives it. */
export type MediaFileView = {
  id: string
  itemId: number
  versionId: string | null
  path: string
  size: number
  quality: {
    name: string | null
    resolution: string | null
    source: string | null
    codec: string | null
  }
  releaseGroup: string | null
  sceneName: string | null
  edition: string | null
  transfer: string | null
  addedAt: string
  streams: Stream[]
}

/** What `media_files.media_info` holds: the probe, and what deciding a later upgrade needs. */
export type StoredFileInfo = {
  probe: MediaInfo
  revision: { version: number; real: number; proper: boolean; repack: boolean }
  formats: string[]
  formatScore: number
  /** The file's modification time when it was recorded, so the library scan (6b) can tell a change. */
  mtimeMs?: number
}

/** The specifications that apply to a file at import: the quality and upgrades (Radarr's import specs). */
const IMPORT_SPECS = defaultSpecifications.filter((s) =>
  ['quality', 'upgradeAllowed', 'cutoff', 'upgrade'].includes(s.id),
)

function parsedQuality(quality: QualityName, release: ParsedRelease): ParsedRelease['quality'] {
  const def = qualityDefinition(quality)
  return {
    source: def.source,
    resolution: def.resolution,
    modifier: def.modifier,
    revision: release.quality.revision,
  }
}

const errorMessage = (e: unknown) =>
  e instanceof AppError || e instanceof ProbeError
    ? e.message
    : 'Something went wrong moving the file.'

export function createImports(ctx: Ctx, deps: { media: Media; library: Library }) {
  const { db, clock, events, metadata } = ctx
  const { media, library } = deps
  const log = ctx.logger.child('import')
  const options = ctx.importing ?? {}
  const probe = options.probe ?? createProbe()
  const fs = options.fs ?? nodeFs
  const extract = options.extract ?? createExtractor()
  const hooks = options.hooks ?? {}

  /** The import hook, which never fails an import: its own errors are logged. */
  async function afterImport(file: ImportedFile) {
    try {
      await hooks.afterImport?.(file)
    } catch (e) {
      log.warn('the import hook failed', { path: file.path, error: (e as Error).message })
    }
  }

  const roots = () => [
    ...media.rootFolders.list().map((r) => r.path),
    ...(options.downloadDirs?.() ?? []),
  ]

  const itemRow = (itemId: string) =>
    db.select().from(mediaItems).where(eq(mediaItems.id, itemId)).get()

  const versionRows = (itemId: string) =>
    db
      .select()
      .from(versions)
      .where(eq(versions.itemId, itemId))
      .orderBy(asc(versions.position))
      .all()

  /** The version asked for, else the first without a file, else the first. */
  function pickVersion(itemId: string, versionId?: string | null): VersionRow {
    const all = versionRows(itemId)
    if (versionId) {
      const v = all.find((x) => x.id === versionId)
      if (!v) throw new AppError('not-found', 'That version doesn’t exist.')
      return v
    }
    const v = all.find((x) => !x.fileId) ?? all[0]
    if (!v) throw new AppError('conflict', 'The movie has no versions.')
    return v
  }

  const fileRow = (id: string | null) =>
    id ? db.select().from(mediaFiles).where(eq(mediaFiles.id, id)).get() : undefined

  const namingMovie = (row: ItemRow, meta: MovieMetadata | null): NamingMovie => ({
    title: row.title,
    originalTitle: meta?.originalTitle ?? null,
    year: row.year,
    imdbId: meta?.imdbId ?? null,
    tmdbId: row.tmdbId,
    collection: meta?.collection?.name ?? null,
  })

  /**
   * The file's quality: as grabbed when the download says, else the name's, with a resolution the
   * name leaves out taken from the probe, as Radarr augments a quality from media info.
   */
  function qualityFor(
    release: ParsedRelease,
    info: MediaInfo | null,
    grabbed?: string | null,
  ): QualityName {
    if (grabbed && isQualityName(grabbed)) return grabbed
    const resolution = release.quality.resolution ?? resolutionOf(info?.video ?? null)
    return qualityOf({ ...release.quality, resolution })
  }

  /** The file's name in the library: the naming format, or its own name when renaming is off. */
  function targetName(
    settings: MediaManagement,
    row: ItemRow,
    meta: MovieMetadata | null,
    file: NamingFile,
    source: string,
  ) {
    const ext = extname(source).toLowerCase()
    if (!settings.rename) return basename(source)
    const name = buildFileName(settings.fileFormat, namingMovie(row, meta), file, {
      colonReplacement: settings.colonReplacement,
    })
    return `${name || safeName(basename(source, extname(source)))}${ext}`
  }

  /**
   * Where the file goes: the movie's folder and its name. When another version of the movie
   * already has a file of that name (two versions at one quality), the version's label is added.
   */
  function destination(row: ItemRow, version: VersionRow, name: string): string {
    const plain = join(row.path, name)
    const taken = db
      .select({ versionId: mediaFiles.versionId })
      .from(mediaFiles)
      .where(eq(mediaFiles.path, plain))
      .get()
    if (!taken || taken.versionId === version.id) return plain
    const ext = extname(name)
    return join(row.path, `${basename(name, ext)} - ${safeName(version.label)}${ext}`)
  }

  const minimumSeconds = (meta: MovieMetadata | null) =>
    options.sampleSeconds ?? minimumRuntimeSeconds(meta?.runtimeMinutes ?? null)

  async function nfoAndArtwork(
    row: ItemRow,
    meta: MovieMetadata | null,
    path: string,
    info: MediaInfo,
  ) {
    if (!meta) return
    const nfo: NfoMovie = {
      title: row.title,
      originalTitle: meta.originalTitle,
      sortTitle: row.sortTitle,
      rating: meta.rating,
      votes: meta.voteCount,
      plot: meta.synopsis || null,
      runtimeMinutes: meta.runtimeMinutes,
      tmdbId: row.tmdbId,
      imdbId: meta.imdbId,
      genres: meta.genres,
      collection: meta.collection?.name ?? null,
      premiered: meta.releaseDate,
      directors: meta.crew.filter((c) => c.job === 'Director').map((c) => c.name),
      actors: meta.cast.slice(0, 20).map((c) => ({ name: c.name, role: c.character })),
    }
    await writeNfo(path, nfo, info)
    const cached = async (address: string | null, size: string) => {
      // `/api/v1/images/{owner}/{ownerId}/{kind}/{size}/{file}` (@highsea-tv/metadata's image-url.ts)
      const parts = address?.split('/').slice(4)
      if (parts?.length !== 5) return null
      const [owner, ownerId, kind, , file] = parts as [string, string, string, string, string]
      try {
        return (await metadata.images.get({ owner, ownerId, kind, size, file: `/${file}` })).path
      } catch (e) {
        log.warn('artwork isn’t available', { tmdbId: row.tmdbId, error: (e as Error).message })
        return null
      }
    }
    await writeArtwork(row.path, {
      poster: await cached(meta.art.poster, 'w780'),
      fanart: await cached(meta.art.backdrop, 'w1280'),
    })
  }

  function announceItem(row: ItemRow) {
    announce(events, [row.tmdbId])
    events.emit({ topic: TOPICS.history, ids: [`movie:${row.tmdbId}`] })
  }

  function failed(
    row: ItemRow,
    status: 'blocked' | 'failed',
    reason: string,
    input: {
      sourceTitle: string
      quality?: string | null
      indexer?: string | null
      downloadId?: string | null
    },
    replace = false,
  ): ImportResult {
    media.history.write({
      itemId: row.id,
      type: 'import-failed',
      sourceTitle: input.sourceTitle,
      quality: input.quality ?? null,
      indexer: input.indexer ?? null,
      message: reason,
      downloadId: input.downloadId ?? null,
      data: { status },
    })
    events.emit({ topic: TOPICS.history, ids: [`movie:${row.tmdbId}`] })
    return status === 'blocked' && replace ? { status, reason, replace } : { status, reason }
  }

  /**
   * Steps 4 to 9 for one probed file: decide, name, transfer, replace, record, announce. The
   * caller has found and probed it.
   */
  async function importFile(args: {
    row: ItemRow
    version: VersionRow
    source: FoundFile
    info: MediaInfo
    release: ParsedRelease
    sourceTitle: string
    grabbedQuality?: string | null
    indexer?: string | null
    downloadId?: string | null
    mode: ImportMode
    /** The release's folder, for the files that came with the video (ImportedFile). */
    sourceFolder?: string | null
  }): Promise<ImportResult> {
    const { row, version, source, info, release, sourceTitle } = args
    const allowed = roots()
    const settings = media.mediaManagement.get()
    const meta = library.internal.cached(row.tmdbId)
    const history = {
      sourceTitle,
      indexer: args.indexer,
      downloadId: args.downloadId,
    }
    const quality = qualityFor(release, info, args.grabbedQuality)
    const existing = fileRow(version.fileId)

    // Already done: this release's file is the version's file and it's on disk.
    if (existing && existing.sceneName === sourceTitle) {
      const stillThere = await fsp.stat(existing.path).catch(() => null)
      if (stillThere) {
        settle(
          row,
          version,
          existing.id,
          existing.path,
          sourceTitle,
          quality,
          args,
          existing.transfer,
          undefined,
          { size: existing.size },
        )
        return {
          status: 'imported',
          fileId: existing.id,
          path: existing.path,
          transfer: (existing.transfer ?? 'copy') as TransferMethod,
          message: 'Already imported.',
          quality: (isQualityName(existing.quality ?? '')
            ? existing.quality
            : quality) as QualityName,
          already: true,
        }
      }
    }

    // Step 4, decide: the version's profile must want it, as a first file or an upgrade.
    const profile = media.profiles.get(version.qualityProfileId)
    const stored = existing?.mediaInfo as StoredFileInfo | null | undefined
    const existingFile: ExistingFile | null =
      existing && isQualityName(existing.quality ?? '')
        ? {
            quality: existing.quality as QualityName,
            revision: stored?.revision ?? { version: 1, real: 0, proper: false, repack: false },
            formatScore: stored?.formatScore ?? 0,
          }
        : null
    const decision = decide(
      {
        // the quality decided above, which the probe may have completed, in the parser's terms
        release: { ...release, quality: parsedQuality(quality, release) },
        size: source.size,
        movie: {
          title: row.title,
          year: row.year,
          runtimeMinutes: meta?.runtimeMinutes ?? null,
          originalLanguage: meta?.originalLanguage ?? null,
        },
        profile,
        formats: media.customFormats(),
        sizes: media.qualitySizes(),
        existing: existingFile,
      },
      { specifications: IMPORT_SPECS },
    )
    if (!decision.approved) {
      const why =
        decision.reasons.find((r) => r.kind === 'rejected')?.message ??
        'The profile doesn’t want it.'
      return failed(row, 'blocked', why, { ...history, quality })
    }

    // Step 5, name.
    const naming: NamingFile = {
      quality,
      revision: release.quality.revision,
      releaseGroup: release.releaseGroup,
      edition: release.edition,
      customFormats: decision.formats.filter((f) => f.score !== 0).map((f) => f.name),
      mediaInfo: info,
      sceneName: sourceTitle,
    }
    let dest: string
    try {
      checkPath(source.path, allowed)
      dest = checkPath(
        destination(row, version, targetName(settings, row, meta, naming, source.path)),
        allowed,
      )
    } catch (e) {
      return failed(row, 'blocked', errorMessage(e), { ...history, quality })
    }

    // Steps 6 and 7, transfer and replace. The old file goes first when it has the new one's name.
    let method: TransferMethod
    let message: string
    try {
      if (existing && existing.path === dest) {
        const same = await sameFile(existing.path, source.path)
        if (!same) await recycle(existing.path, settings.recycleBin, clock.now(), fs)
      }
      const mode = args.mode === 'move' ? 'move' : settings.hardlinks ? 'hardlink' : 'copy'
      const moved = await transfer(source.path, dest, mode, fs)
      method = moved.method
      message = transferMessage(moved)
      if (existing && existing.path !== dest)
        await recycle(existing.path, settings.recycleBin, clock.now(), fs)
    } catch (e) {
      log.error('import failed', { itemId: row.id, error: (e as Error).message })
      return failed(row, 'failed', errorMessage(e), { ...history, quality })
    }

    // Step 8, record.
    const stats = await fsp.stat(dest)
    const fileInfo: StoredFileInfo = {
      probe: info,
      revision: release.quality.revision,
      formats: decision.formats.map((f) => f.name),
      formatScore: decision.formatScore,
      mtimeMs: stats.mtimeMs,
    }
    const now = clock.now()
    const fileId = db.transaction((tx) => {
      const at = tx
        .select({ id: mediaFiles.id })
        .from(mediaFiles)
        .where(eq(mediaFiles.path, dest))
        .get()
      const id = at?.id ?? newId('fil')
      const values = {
        itemId: row.id,
        versionId: version.id,
        path: dest,
        size: stats.size,
        quality,
        releaseGroup: release.releaseGroup,
        sceneName: sourceTitle,
        edition: release.edition,
        mediaInfo: fileInfo,
        transfer: method,
      }
      if (at) tx.update(mediaFiles).set(values).where(eq(mediaFiles.id, id)).run()
      else
        tx.insert(mediaFiles)
          .values({ id, ...values, addedAt: now })
          .run()
      writeFileFacts(tx, id, fileInfo.probe)
      if (existing && existing.id !== id) {
        hooks.replacing?.(tx, existing.id, id)
        tx.delete(mediaFiles).where(eq(mediaFiles.id, existing.id)).run()
      }
      return id
    })
    if (settings.permissions)
      await applyPermissions(dest, settings.chmod, dirname(row.path)).catch((e) =>
        log.warn('couldn’t set permissions', { path: dest, error: (e as Error).message }),
      )
    if (settings.nfo)
      await nfoAndArtwork(row, meta, dest, info).catch((e) =>
        log.warn('couldn’t write the NFO', { path: dest, error: (e as Error).message }),
      )

    await afterImport({
      fileId,
      itemId: row.id,
      path: dest,
      sourceFolder: args.sourceFolder ?? null,
      inPlace: false,
    })

    // Step 9, announce.
    settle(row, version, fileId, dest, sourceTitle, quality, args, method, message, {
      size: stats.size,
      upgradedFrom: existing?.quality ?? null,
    })
    log.info('imported', { tmdbId: row.tmdbId, path: dest, transfer: method })
    return {
      status: 'imported',
      fileId,
      path: dest,
      transfer: method,
      message,
      quality,
      already: false,
    }
  }

  async function sameFile(a: string, b: string) {
    const [x, y] = await Promise.all([fsp.stat(a).catch(() => null), fsp.stat(b).catch(() => null)])
    return !!x && !!y && x.dev === y.dev && x.ino === y.ino
  }

  /**
   * The record's last part, safe to repeat: the version's file, the movie Available, one history
   * entry for this release's file, and the announcements.
   */
  function settle(
    row: ItemRow,
    version: VersionRow,
    fileId: string,
    path: string,
    sourceTitle: string,
    quality: QualityName,
    args: { indexer?: string | null; downloadId?: string | null },
    method: string | null,
    message?: string,
    /** More for the history entry: the file's size, the quality it replaced, adopted in place. */
    extra?: { size: number; upgradedFrom?: string | null; inPlace?: boolean },
  ) {
    db.transaction((tx) => {
      tx.update(versions).set({ fileId }).where(eq(versions.id, version.id)).run()
      tx.update(mediaItems)
        .set({ status: 'available', updatedAt: clock.now() })
        .where(eq(mediaItems.id, row.id))
        .run()
    })
    // an upgrade that still isn't at the cutoff stays in Wanted; one that is leaves it (8a)
    library.internal.refreshCutoff([row.id])
    const key = `${path}|${sourceTitle}|${args.downloadId ?? ''}`
    if (!media.history.has(row.id, 'imported', 'key', key))
      media.history.write({
        itemId: row.id,
        type: 'imported',
        sourceTitle,
        quality,
        indexer: args.indexer ?? null,
        message:
          message ??
          transferMessage({ method: (method ?? 'copy') as TransferMethod, fallback: null }),
        downloadId: args.downloadId ?? null,
        data: { key, fileId, path, versionId: version.id, transfer: method, ...extra },
      })
    announceItem(row)
  }

  /** Probes a file, or says why it can't be imported. */
  async function probed(
    file: FoundFile,
    root: string,
    meta: MovieMetadata | null,
  ): Promise<{ info: MediaInfo; skip: null } | { info: MediaInfo | null; skip: string }> {
    const early = skipBeforeProbe(file.path, root)
    if (early) return { info: null, skip: early }
    let info: MediaInfo
    try {
      info = await probe(file.path)
    } catch (e) {
      return { info: null, skip: errorMessage(e) }
    }
    if (!info.video) return { info, skip: 'No video stream in the file. Skipped.' }
    const sample = sampleReason(file.path, file.size, info.duration, minimumSeconds(meta))
    return sample ? { info, skip: sample } : { info, skip: null }
  }

  /**
   * Imports a finished download into its movie: the plan's steps 1 and 3 to 9. Returns what
   * happened; a refusal or a failure is also written to the history.
   */
  async function importDownload(input: ImportInput): Promise<ImportResult> {
    const row = itemRow(input.itemId)
    if (!row) throw notInLibrary()
    const sourceTitle = input.releaseTitle.trim() || basename(input.folder)
    const history = {
      sourceTitle,
      quality: input.quality,
      indexer: input.indexer,
      downloadId: input.downloadId,
    }
    let folder: string
    try {
      folder = checkPath(input.folder, roots())
    } catch (e) {
      return failed(row, 'blocked', errorMessage(e), history)
    }
    const version = pickVersion(row.id, input.versionId)

    // Step 1, find the files: nothing blocked, then the videos that aren't samples or extras.
    let files: FoundFile[]
    try {
      files = await listFiles(folder)
    } catch {
      return failed(row, 'failed', `${folder} can’t be read.`, history)
    }
    const blocked = findBlocked(files.map((f) => f.path))
    if (blocked) return failed(row, 'blocked', blockedMessage(basename(blocked)), history)

    // Step 2, extract: archives into a folder beside the download, whose files join the rest. A
    // password-protected archive can never import, so the release is replaced.
    let unpacked: string | null = null
    try {
      unpacked = await extractDownload(
        folder,
        files.map((f) => f.path),
        extract,
      )
    } catch (e) {
      if (!(e instanceof ExtractError)) throw e
      log.warn('couldn’t extract a download', { folder, kind: e.kind, unar: e.detail })
      return failed(row, 'blocked', e.message, history, e.kind === 'password')
    }
    const extracted = unpacked ? await listFiles(unpacked) : []
    const blockedInside = findBlocked(extracted.map((f) => f.path))
    if (blockedInside)
      return failed(row, 'blocked', blockedMessage(basename(blockedInside)), history)

    const meta = library.internal.cached(row.tmdbId)
    const root = files.length === 1 && files[0]?.path === folder ? dirname(folder) : folder
    const candidates: { file: FoundFile; info: MediaInfo }[] = []
    const skipped: string[] = []
    const all = [
      ...files.map((file) => ({ file, root })),
      ...extracted.map((file) => ({ file, root: unpacked as string })),
    ]
    for (const { file, root } of all.filter((f) => isVideo(f.file.path))) {
      // Step 3, probe.
      const p = await probed(file, root, meta)
      if (p.skip === null) candidates.push({ file, info: p.info })
      else skipped.push(p.skip)
    }
    const best = candidates.sort((a, b) => b.file.size - a.file.size)[0]
    if (!best) {
      const reason =
        skipped.length > 0
          ? `Nothing to import: ${skipped[0]
              ?.replace(/ Skipped\.$/, '')
              .toLowerCase()
              .replace(/\.$/, '')}.`
          : 'Nothing to import: the download has no video file.'
      return failed(row, 'blocked', reason, history)
    }
    const result = await importFile({
      row,
      version,
      source: best.file,
      info: best.info,
      release: parse(sourceTitle),
      sourceTitle,
      grabbedQuality: input.quality,
      indexer: input.indexer,
      downloadId: input.downloadId,
      // a download that's one file has no folder of its own: its parent is the downloads folder
      sourceFolder: root === folder ? folder : null,
      // an extracted file is hardlinked too, never moved: a move would read as the download's
      // files having gone, and the torrent would stop seeding the archives
      mode: input.mode ?? 'hardlink',
    })
    // the extracted copy goes once the file is in; the archives stay to seed
    if (unpacked && result.status === 'imported')
      await removeUnpacked(folder).catch((e) =>
        log.warn('couldn’t remove the extracted copy', { folder, error: (e as Error).message }),
      )
    return result
  }

  /**
   * Records a file that's already in the movie's folder, in place (6b): a file the library scan
   * finds there, and the existing-library import's. Nothing is transferred; with `rename`, the file
   * is renamed beside itself to the naming format, unless another file has that name. Safe to
   * repeat: a file already recorded at its path is updated, and its history written once.
   */
  async function adopt(args: {
    row: ItemRow
    version: VersionRow
    path: string
    info: MediaInfo
    /** The name the quality and group are read from: the file's own, or its folder's. */
    sourceTitle: string
    rename?: boolean
    /** The history's message ("Found in the movie’s folder."). */
    message: string
  }): Promise<{ fileId: string; path: string }> {
    const { row, version, info, sourceTitle } = args
    const allowed = roots()
    let path = checkPath(args.path, allowed)
    const release = parse(sourceTitle)
    const quality = qualityFor(release, info, null)
    const meta = library.internal.cached(row.tmdbId)
    if (args.rename) {
      const settings = { ...media.mediaManagement.get(), rename: true }
      const name = targetName(
        settings,
        row,
        meta,
        {
          quality,
          revision: release.quality.revision,
          releaseGroup: release.releaseGroup,
          edition: release.edition,
          mediaInfo: info,
          sceneName: sourceTitle,
        },
        path,
      )
      const dest = checkPath(join(dirname(path), name), allowed)
      if (dest !== path && !(await fsp.stat(dest).catch(() => null))) {
        await fsp.rename(path, dest)
        path = dest
      }
    }
    const stats = await fsp.stat(path)
    const fileInfo: StoredFileInfo = {
      probe: info,
      revision: release.quality.revision,
      formats: [],
      formatScore: 0,
      mtimeMs: stats.mtimeMs,
    }
    const now = clock.now()
    const fileId = db.transaction((tx) => {
      const at = tx
        .select({ id: mediaFiles.id })
        .from(mediaFiles)
        .where(eq(mediaFiles.path, path))
        .get()
      const id = at?.id ?? newId('fil')
      const values = {
        itemId: row.id,
        versionId: version.id,
        path,
        size: stats.size,
        quality,
        releaseGroup: release.releaseGroup,
        sceneName: sourceTitle,
        edition: release.edition,
        mediaInfo: fileInfo,
        transfer: null,
      }
      if (at) tx.update(mediaFiles).set(values).where(eq(mediaFiles.id, id)).run()
      else
        tx.insert(mediaFiles)
          .values({ id, ...values, addedAt: now })
          .run()
      writeFileFacts(tx, id, fileInfo.probe)
      return id
    })
    await afterImport({ fileId, itemId: row.id, path, sourceFolder: dirname(path), inPlace: true })
    settle(row, version, fileId, path, sourceTitle, quality, {}, null, args.message, {
      size: stats.size,
      inPlace: true,
    })
    log.info('recorded a file in place', { tmdbId: row.tmdbId, path })
    return { fileId, path }
  }

  // ------------------------------------------------------------ manual import

  /** The library movie a name matches: its TMDB id, else its title and year. */
  function match(release: ParsedRelease): ItemRow | null {
    if (release.ids.tmdb) return library.internal.rowOf(release.ids.tmdb) ?? null
    const key = matchKey(release.title)
    if (!key) return null
    const rows = db
      .select()
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.type, 'movie'),
          release.year ? eq(mediaItems.year, release.year) : undefined,
        ),
      )
      .all()
      .filter((r) => matchKey(r.title) === key)
    return rows.length === 1 ? (rows[0] as ItemRow) : null
  }

  /** The name to read a file by: its own, unless it's bare ("movie.mkv") and its folder's says more. */
  function releaseOf(path: string, root: string): { release: ParsedRelease; name: string } {
    const own = basename(path, extname(path))
    const fromFile = parse(own)
    const folder = relative(root, dirname(path)) ? basename(dirname(path)) : null
    if (folder && (!fromFile.year || !fromFile.title.trim())) {
      const fromFolder = parse(folder)
      if (fromFolder.year) return { release: fromFolder, name: folder }
    }
    return { release: fromFile, name: own }
  }

  const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })
  function languageOf(info: MediaInfo | null, release: ParsedRelease): string {
    const code =
      info?.audio.find((a) => a.default)?.language ??
      info?.audio[0]?.language ??
      release.languages[0]
    if (!code) return 'Unknown'
    try {
      return languageNames.of(code) ?? 'Unknown'
    } catch {
      return 'Unknown'
    }
  }

  const manualImport = {
    /**
     * What's in a folder that could be imported, each file matched to the library by name, with
     * its quality, the name it becomes, or why it would be skipped. Allowed roots only.
     */
    async scan(path: string): Promise<ImportCandidate[]> {
      const folder = checkPath(path, roots())
      let files: FoundFile[]
      try {
        files = await listFiles(folder)
      } catch {
        throw new AppError('not-found', `${folder} doesn’t exist on the server.`)
      }
      const settings = media.mediaManagement.get()
      const root = files.length === 1 && files[0]?.path === folder ? dirname(folder) : folder
      const out: ImportCandidate[] = []
      for (const file of files) {
        const { release, name } = releaseOf(file.path, root)
        if (isBlocked(file.path)) {
          out.push({
            path: file.path,
            size: file.size,
            quality: 'Unknown',
            language: 'Unknown',
            itemId: null,
            versionId: null,
            skip: 'An executable file. It won’t be imported.',
            becomes: null,
          })
          continue
        }
        if (!isVideo(file.path)) continue
        const row = match(release)
        const meta = row ? library.internal.cached(row.tmdbId) : null
        const p = await probed(file, root, meta)
        const quality = qualityFor(release, p.info, null)
        const version = row ? pickVersion(row.id) : null
        const becomes =
          row && version && p.info
            ? `${basename(row.path)}/${basename(
                destination(
                  row,
                  version,
                  targetName(
                    settings,
                    row,
                    meta,
                    {
                      quality,
                      revision: release.quality.revision,
                      releaseGroup: release.releaseGroup,
                      edition: release.edition,
                      mediaInfo: p.info,
                      sceneName: name,
                    },
                    file.path,
                  ),
                ),
              )}`
            : null
        out.push({
          path: file.path,
          size: file.size,
          quality,
          language: languageOf(p.info, release),
          itemId: row?.tmdbId ?? null,
          versionId: version?.id ?? null,
          skip: p.skip ?? (row ? null : 'Didn’t match a movie. Choose one.'),
          becomes,
        })
      }
      return out
    },

    /** Imports the files into their movies, each into its version: hardlinked (or copied) or moved, and named. */
    async run(
      files: ManualImportFile[],
      mode: ImportMode = 'hardlink',
    ): Promise<{ path: string; result: ImportResult }[]> {
      const allowed = roots()
      const results: { path: string; result: ImportResult }[] = []
      for (const f of files) {
        const path = checkPath(f.path, allowed)
        const row = library.internal.rowOf(f.itemId)
        if (!row) throw notInLibrary()
        const version = pickVersion(row.id, f.versionId)
        const { release, name } = releaseOf(path, dirname(dirname(path)))
        const meta = library.internal.cached(row.tmdbId)
        if (isBlocked(path)) {
          results.push({
            path,
            result: failed(row, 'blocked', blockedMessage(basename(path)), { sourceTitle: name }),
          })
          continue
        }
        const size = (await fsp.stat(path).catch(() => null))?.size
        if (size === undefined) {
          results.push({
            path,
            result: failed(row, 'failed', `${path} doesn’t exist.`, { sourceTitle: name }),
          })
          continue
        }
        const p = await probed({ path, size }, dirname(path), meta)
        if (!p.info?.video) {
          results.push({
            path,
            result: failed(row, 'failed', p.skip ?? 'No video stream in the file.', {
              sourceTitle: name,
            }),
          })
          continue
        }
        // The owner chose the file, so a short one is imported anyway: only an unreadable file stops it.
        results.push({
          path,
          result: await importFile({
            row,
            version,
            source: { path, size },
            info: p.info,
            release,
            sourceTitle: name,
            mode,
            sourceFolder: allowed.includes(dirname(path)) ? null : dirname(path),
          }),
        })
      }
      return results
    },
  }

  // ------------------------------------------------------------ reads

  /** A movie's files, in its versions' order. */
  function files(tmdbId: number): MediaFileView[] {
    const row = library.internal.rowOf(tmdbId)
    if (!row) throw notInLibrary()
    const order = new Map(versionRows(row.id).map((v, i) => [v.id, i]))
    return db
      .select()
      .from(mediaFiles)
      .where(eq(mediaFiles.itemId, row.id))
      .all()
      .sort((a, b) => (order.get(a.versionId ?? '') ?? 99) - (order.get(b.versionId ?? '') ?? 99))
      .map((f) => {
        const stored = f.mediaInfo as StoredFileInfo | null
        const def = isQualityName(f.quality ?? '')
          ? qualityDefinition(f.quality as QualityName)
          : null
        return {
          id: f.id,
          itemId: row.tmdbId,
          versionId: f.versionId,
          path: f.path,
          size: f.size,
          quality: {
            name: f.quality,
            resolution: def?.resolution ? `${def.resolution}p` : null,
            source: def?.source ?? null,
            codec: stored?.probe.video?.codec ?? null,
          },
          releaseGroup: f.releaseGroup,
          sceneName: f.sceneName,
          edition: f.edition,
          transfer: f.transfer,
          addedAt: isoOf(f.addedAt),
          streams: stored?.probe ? streamsOf(stored.probe) : [],
        }
      })
  }

  /** A movie's history, newest first, cursor-paged. */
  function history(tmdbId: number, cursor?: string, limit?: number): HistoryPage {
    const row = library.internal.rowOf(tmdbId)
    if (!row) throw notInLibrary()
    return media.history.forItem(row.id, cursor, limit)
  }

  return {
    importDownload,
    manualImport,
    files,
    history,
    adopt,
    internal: { roots, probed, qualityFor, pickVersion, versionRows, namingMovie },
  }
}

export type Imports = ReturnType<typeof createImports>

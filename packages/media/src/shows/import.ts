// SPDX-License-Identifier: AGPL-3.0-only
// A show's finished download into its episodes (Phase 5 C1, ADR 0039's pipeline and ADR 0064's
// files): the films' steps for each video in it. Find the files (nothing blocked), extract archives,
// then each video is read by its own name (`parseEpisode`, as Sonarr's import reads a file's name
// before its folder's), probed, judged against the show's profile, named with Settings › Media
// management's episode naming into its season's folder, hardlinked (or copied, or moved as the
// films' setting says) and recorded as the scan records a file: one `media_files` row under its
// first episode, every episode it holds pointing at it. A season pack is so many files, each filed
// to its own episode; a multi-episode file is one file holding several.
//
// Only what the download was grabbed for is filed: a video whose episodes aren't all among the
// download's (another show's, another season's, an episode not monitored) is left where it is, and
// the show's history says so. A file that's already been imported is the import done (ADR 0022).
//
// An upgrade (HT-109) is judged as a film's is, against each file it would replace (Sonarr's
// UpgradeSpecification checks every episode's file): the new file takes its episodes over, and an
// old file that no longer holds any episode goes to the recycle bin, as a film's replaced file does
// (shared/housekeeping.ts's `recycle`); one still holding another episode stays.
import { promises as fsp } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { AppError } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { parse, parseEpisode } from '@highsea-tv/parser'
import { decide, type ExistingFile, type QualityName } from '@highsea-tv/quality'
import { eq, inArray } from 'drizzle-orm'
import { FORCED_IMPORT_SPECS, IMPORT_SPECS, parsedQuality } from '../movies/import.ts'
import { buildEpisodeName, type NamingEpisode } from '../shared/episode-naming.ts'
import {
  createExtractor,
  ExtractError,
  extractDownload,
  removeUnpacked,
} from '../shared/extract.ts'
import {
  blockedMessage,
  type FoundFile,
  findBlocked,
  isVideo,
  listFiles,
  skipBeforeProbe,
} from '../shared/files.ts'
import { applyPermissions, recycle } from '../shared/housekeeping.ts'
import type { Media } from '../shared/index.ts'
import { fileErrorMessage, probeFile, qualityFor } from '../shared/inspect.ts'
import { checkPath } from '../shared/paths.ts'
import { nodeFs, type TransferMethod, transfer, transferMessage } from '../shared/transfer.ts'
import type { ShowsDeps } from './context.ts'
import type { ShowFiles } from './files.ts'
import type { ShowSettings } from './settings.ts'
import type { ShowWanted } from './wanted.ts'

const { mediaItems, showDetails, versions } = schema

type ItemRow = typeof mediaItems.$inferSelect

export type EpisodeImportInput = {
  /** The show's item, as the download holds it. */
  showItemId: string
  /** The episode items the release brings. */
  episodeIds: readonly string[]
  /** The download's folder, or its one file. */
  folder: string
  releaseTitle: string
  quality?: string | null
  indexer?: string | null
  downloadId?: string | null
  grabbedAnyway?: boolean
}

export type EpisodeImportResult =
  | {
      status: 'imported'
      transfer: TransferMethod
      /**
       * The files filed, each with the episode items it holds, its quality and size, and the
       * quality of the file it replaced, for an upgrade.
       */
      files: {
        fileId: string
        path: string
        episodes: string[]
        episodeIds: string[]
        quality: string
        size: number
        upgradedFrom: string | null
      }[]
      /** Videos left where they are, with why. */
      left: { path: string; why: string }[]
    }
  | { status: 'blocked' | 'failed'; reason: string; replace?: boolean }

const code = (e: ItemRow) =>
  `S${String(e.seasonNumber ?? 0).padStart(2, '0')}E${String(e.episodeNumber ?? 0).padStart(2, '0')}`

export function createEpisodeImport(
  ctx: ShowsDeps,
  deps: { media: Media; files: ShowFiles; settings: ShowSettings; wanted: ShowWanted },
) {
  const { db, events, clock } = ctx
  const { media, files, settings, wanted } = deps
  const log = ctx.logger.child('episode-import')
  const options = ctx.files ?? {}
  const fs = options.fs ?? nodeFs
  const extract = options.extract ?? createExtractor()

  const roots = () => [
    ...media.rootFolders.list('shows').map((r) => r.path),
    ...(options.downloadDirs?.() ?? []),
  ]

  const showRow = (id: string) =>
    db.select().from(mediaItems).where(eq(mediaItems.id, id)).get() ?? null

  /** A refusal of the whole download, in the show's history. */
  function refuse(
    show: ItemRow,
    status: 'blocked' | 'failed',
    reason: string,
    input: EpisodeImportInput,
    replace = false,
  ): EpisodeImportResult {
    media.history.write({
      itemId: show.id,
      type: 'import-failed',
      sourceTitle: input.releaseTitle,
      quality: input.quality ?? null,
      indexer: input.indexer ?? null,
      message: reason,
      downloadId: input.downloadId ?? null,
      data: { status, episodeIds: [...input.episodeIds] },
    })
    events.emit({ topic: 'history.updated' })
    return status === 'blocked' && replace ? { status, reason, replace } : { status, reason }
  }

  /** `{show}/Season 01/Chernobyl - S01E02 - Please Remain Calm WEBDL-1080p.mkv`, by the settings. */
  function destination(
    show: ItemRow,
    episodes: readonly ItemRow[],
    file: { quality: string; releaseGroup: string | null },
    source: string,
  ): string {
    const naming = settings.naming()
    const named: NamingEpisode[] = episodes.map((e) => ({
      season: e.seasonNumber ?? 0,
      episode: e.episodeNumber ?? 0,
      title: e.title,
      aired: e.releaseDate ?? '',
    }))
    const year = show.year ?? 0
    const details = db.select().from(showDetails).where(eq(showDetails.itemId, show.id)).get()
    const seasonFolders = details?.seasonFolders ?? true
    const folder = seasonFolders
      ? join(
          show.path,
          (episodes[0]?.seasonNumber ?? 0) === 0
            ? 'Specials'
            : buildEpisodeName(naming.seasonFolderFormat, { title: show.title, year }, named),
        )
      : show.path
    const ext = extname(source)
    const name = naming.rename
      ? buildEpisodeName(
          naming.standardFormat,
          { title: show.title, year },
          named,
          file,
          naming.multiEpisodeStyle,
        )
      : basename(source, ext)
    // a format with a slash in it makes folders of its own, as Sonarr's does
    return join(folder, `${name}${ext}`)
  }

  /** Files one video of the download, or says why it's left where it is. */
  async function fileVideo(
    show: ItemRow,
    found: FoundFile,
    root: string,
    sourceFolder: string | null,
    input: EpisodeImportInput,
    lone: boolean,
  ): Promise<
    | {
        ok: true
        fileId: string
        path: string
        episodes: string[]
        episodeIds: string[]
        quality: string
        size: number
        upgradedFrom: string | null
        transfer: TransferMethod
      }
    | { ok: false; why: string; failed?: boolean }
  > {
    const early = skipBeforeProbe(found.path, root)
    if (early) return { ok: false, why: early }
    // the file's own name first; a download that's one file of one episode may only say it in its
    // release's name
    const own = basename(found.path, extname(found.path))
    const parsed =
      parseEpisode(basename(found.path)) ?? (lone ? parseEpisode(input.releaseTitle) : null)
    if (!parsed || parsed.fullSeason || parsed.episodes.length === 0)
      return { ok: false, why: 'Its name has no season and episode number (like S01E01).' }
    const rows = files.episodesOf(show.id)
    const episodes = parsed.episodes.map((n) =>
      rows.find((r) => r.seasonNumber === parsed.season && r.episodeNumber === n),
    )
    const tag = parsed.episodes
      .map((n) => `S${String(parsed.season).padStart(2, '0')}E${String(n).padStart(2, '0')}`)
      .join(', ')
    if (episodes.some((e) => !e)) return { ok: false, why: `TMDB doesn’t list ${tag}.` }
    const held = episodes as ItemRow[]
    const grabbedFor = new Set(input.episodeIds)
    const other = held.filter((e) => !grabbedFor.has(e.id))
    if (other.length)
      return {
        ok: false,
        why: `${other.map(code).join(', ')} ${other.length > 1 ? 'weren’t' : 'wasn’t'} what it was grabbed for.`,
      }

    // probe: a sample or something unreadable isn't filed
    const probed = await probeFile(
      files.probe,
      found,
      root,
      files.minimumSeconds(show, parsed.season, held),
    )
    if (probed.skip !== null || !probed.info)
      return { ok: false, why: probed.skip ?? 'Unreadable.' }
    const release = parse(own)
    const quality = qualityFor(release, probed.info, input.quality ?? null) as QualityName

    // decide: the show's profile must allow its quality, and an episode with a file is replaced
    // only by an upgrade over that file (one decision per file it would replace)
    const version = db
      .select()
      .from(versions)
      .where(eq(versions.itemId, held[0]?.id ?? ''))
      .get()
    const profile = media.profiles.get(version?.qualityProfileId ?? show.qualityProfileId)
    // the name first: a file already at it from this same release is this import done before
    const allowed = roots()
    let dest: string
    try {
      checkPath(found.path, allowed)
      dest = checkPath(
        destination(show, held, { quality, releaseGroup: release.releaseGroup }, found.path),
        allowed,
      )
    } catch (e) {
      return { ok: false, why: fileErrorMessage(e), failed: true }
    }
    const existingByEpisode = wanted.existingFiles(show)
    const replacing = replaced(held, found.path).filter(
      (r) => !(r.path === dest && r.sceneName === input.releaseTitle),
    )
    const weighed = [
      ...new Map(
        replacing
          .map((r) => existingByEpisode.get(r.itemId))
          .filter((x): x is ExistingFile => !!x)
          .map((x) => [
            `${x.quality}|${x.formatScore}|${x.revision.version}|${x.revision.real}`,
            x,
          ]),
      ).values(),
    ]
    const decisions = (weighed.length ? weighed : [null]).map((existing) =>
      decide(
        {
          release: { ...release, quality: parsedQuality(quality, release) },
          size: found.size,
          movie: {
            title: show.title,
            year: show.year,
            runtimeMinutes: null,
            originalLanguage: null,
          },
          profile,
          formats: media.customFormats(),
          sizes: settings.sizes(),
          existing,
        },
        { specifications: input.grabbedAnyway ? FORCED_IMPORT_SPECS : IMPORT_SPECS },
      ),
    )
    const decision = {
      ...(decisions[0] as (typeof decisions)[number]),
      approved: decisions.every((d) => d.approved),
      reasons: decisions.flatMap((d) => d.reasons),
    }
    if (!decision.approved)
      return {
        ok: false,
        why:
          decision.reasons.find((r) => r.kind === 'rejected')?.message ??
          'The profile doesn’t want it.',
      }

    // transfer
    const management = media.mediaManagement.get()
    let method: TransferMethod
    let message: string
    try {
      // an old file with the new one's name goes first, as a film's does
      const same = replacing.find((r) => r.path === dest)
      if (same && !(await sameFile(same.path, found.path)))
        await recycle(same.path, management.recycleBin, clock.now(), fs)
      const moved = await transfer(found.path, dest, management.hardlinks ? 'hardlink' : 'copy', fs)
      method = moved.method
      message = transferMessage(moved)
    } catch (e) {
      log.error('an episode’s transfer failed', { path: found.path, error: (e as Error).message })
      return { ok: false, why: fileErrorMessage(e), failed: true }
    }
    if (management.permissions)
      await applyPermissions(dest, management.chmod, dirname(show.path)).catch((e) =>
        log.warn('couldn’t set permissions', { path: dest, error: (e as Error).message }),
      )

    // record, as the scan records a file it finds; the transfer goes on the row
    const stats = await fsp.stat(dest)
    const placed: FoundFile = { path: dest, size: stats.size, mtimeMs: stats.mtimeMs }
    const done = files.record({
      show,
      episodes: held,
      found: placed,
      info: {
        probe: probed.info,
        revision: release.quality.revision,
        formats: decision.formats.map((f) => f.name),
        formatScore: decision.formatScore,
        mtimeMs: stats.mtimeMs,
      },
      quality,
      releaseGroup: release.releaseGroup,
      sceneName: input.releaseTitle,
      // the decision above approved replacing each file these episodes had
      take: replacing.length > 0,
    })
    if ('conflict' in done) return { ok: false, why: done.conflict }
    // an old file no episode holds any more goes to the recycle bin; one still holding another
    // episode (a multi-episode file partly replaced) stays
    for (const old of new Map(replacing.map((r) => [r.fileId, r])).values()) {
      if (old.path === dest) continue
      const still = db
        .select({ id: schema.mediaFiles.id })
        .from(schema.mediaFiles)
        .where(eq(schema.mediaFiles.id, old.fileId))
        .get()
      if (still) continue
      await recycle(old.path, management.recycleBin, clock.now(), fs).catch((e) =>
        log.warn('couldn’t recycle the replaced file', {
          path: old.path,
          error: (e as Error).message,
        }),
      )
    }
    wanted.refreshCutoff(show.id)
    const upgradedFrom = replacing[0]?.quality ?? null
    db.update(schema.mediaFiles)
      .set({ transfer: method })
      .where(eq(schema.mediaFiles.id, done.fileId))
      .run()
    await files.afterFiling(show, held[0] as ItemRow, done.fileId, placed, quality, message, {
      sourceTitle: input.releaseTitle,
      indexer: input.indexer ?? null,
      downloadId: input.downloadId ?? null,
      transfer: method,
      sourceFolder,
      upgradedFrom,
    })
    log.info('imported an episode file', {
      tmdbId: show.tmdbId,
      path: dest,
      episodes: held.map(code),
      transfer: method,
    })
    return {
      ok: true,
      fileId: done.fileId,
      path: dest,
      episodes: tag.split(', '),
      episodeIds: held.map((e) => e.id),
      quality,
      size: stats.size,
      upgradedFrom,
      transfer: method,
    }
  }

  /** The files a video for these episodes would replace: each episode's file, but its own path. */
  function replaced(episodes: readonly ItemRow[], path: string) {
    if (!episodes.length) return []
    return db
      .select({
        itemId: versions.itemId,
        fileId: schema.mediaFiles.id,
        path: schema.mediaFiles.path,
        quality: schema.mediaFiles.quality,
        sceneName: schema.mediaFiles.sceneName,
      })
      .from(versions)
      .innerJoin(schema.mediaFiles, eq(schema.mediaFiles.id, versions.fileId))
      .where(
        inArray(
          versions.itemId,
          episodes.map((e) => e.id),
        ),
      )
      .all()
      .filter((r) => r.path !== path)
  }

  async function sameFile(a: string, b: string) {
    const [x, y] = await Promise.all([fsp.stat(a).catch(() => null), fsp.stat(b).catch(() => null)])
    return !!x && !!y && x.dev === y.dev && x.ino === y.ino
  }

  async function importDownload(input: EpisodeImportInput): Promise<EpisodeImportResult> {
    const show = showRow(input.showItemId)
    if (show?.type !== 'show') throw new AppError('not-found', 'That show isn’t in the library.')
    let folder: string
    try {
      folder = checkPath(input.folder, roots())
    } catch (e) {
      return refuse(show, 'blocked', fileErrorMessage(e), input)
    }
    // a folder highsea only reads takes nothing from downloads (ADR 0063)
    const readOnly = media.rootFolders.readOnlyAt(show.path)
    if (readOnly)
      return refuse(
        show,
        'blocked',
        `highsea only reads ${readOnly}, so it doesn’t import into it. Switch the folder to managed in Settings › Media management to import there.`,
        input,
      )

    let found: FoundFile[]
    try {
      found = await listFiles(folder)
    } catch {
      return refuse(show, 'failed', `${folder} can’t be read.`, input)
    }
    const blocked = findBlocked(found.map((f) => f.path))
    if (blocked) return refuse(show, 'blocked', blockedMessage(basename(blocked)), input)
    let unpacked: string | null = null
    try {
      unpacked = await extractDownload(
        folder,
        found.map((f) => f.path),
        extract,
      )
    } catch (e) {
      if (!(e instanceof ExtractError)) throw e
      return refuse(show, 'blocked', e.message, input, e.kind === 'password')
    }
    const extracted = unpacked ? await listFiles(unpacked) : []
    const blockedInside = findBlocked(extracted.map((f) => f.path))
    if (blockedInside)
      return refuse(show, 'blocked', blockedMessage(basename(blockedInside)), input)

    const lone = found.length === 1 && found[0]?.path === folder
    const root = lone ? dirname(folder) : folder
    const videos = [
      ...found.map((file) => ({ file, root })),
      ...extracted.map((file) => ({ file, root: unpacked as string })),
    ].filter((v) => isVideo(v.file.path))
    const filed: Extract<EpisodeImportResult, { status: 'imported' }>['files'] = []
    const left: { path: string; why: string }[] = []
    let method: TransferMethod | null = null
    let failure: string | null = null
    for (const v of videos.sort((a, b) => a.file.path.localeCompare(b.file.path))) {
      const r = await fileVideo(
        show,
        v.file,
        v.root,
        lone ? null : folder,
        input,
        videos.length === 1,
      )
      if (r.ok) {
        const { ok: _ok, transfer: _transfer, ...file } = r
        filed.push(file)
        method ??= r.transfer
      } else {
        left.push({ path: v.file.path, why: r.why })
        if (r.failed) failure ??= r.why
      }
    }
    if (unpacked && filed.length)
      await removeUnpacked(folder).catch((e) =>
        log.warn('couldn’t remove the extracted copy', { folder, error: (e as Error).message }),
      )
    // Activity says what was left and why, once per file (a sample or an extra isn't news)
    for (const l of left) {
      if (/sample|extra/i.test(l.why)) continue
      const key = `${input.downloadId ?? ''}|${l.path}`
      if (media.history.has(show.id, 'import-failed', 'key', key)) continue
      media.history.write({
        itemId: show.id,
        type: 'import-failed',
        sourceTitle: basename(l.path),
        quality: null,
        indexer: input.indexer ?? null,
        message: `Left in the download: ${l.why}`,
        downloadId: input.downloadId ?? null,
        data: { key, left: true },
      })
    }
    if (left.length) events.emit({ topic: 'history.updated' })
    if (!filed.length) {
      const why = failure ?? left.find((l) => !/sample|extra/i.test(l.why))?.why ?? left[0]?.why
      return refuse(
        show,
        failure ? 'failed' : 'blocked',
        why ? `Nothing to import: ${why}` : 'Nothing to import: the download has no video file.',
        input,
      )
    }
    return { status: 'imported', transfer: method ?? 'copy', files: filed, left }
  }

  return { importDownload }
}

export type EpisodeImport = ReturnType<typeof createEpisodeImport>

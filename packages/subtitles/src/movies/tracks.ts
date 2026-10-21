// SPDX-License-Identifier: AGPL-3.0-only
// A movie file's tracks: the sidecars highsea keeps (`subtitle_files`, external and bundled) and
// the streams inside the file, read from the import's probe (`media_files.media_info`). Embedded
// streams count toward the profile, image ones included (owner's answer 14), and aren't extracted.
// Sidecars are written to a temporary name beside the video and renamed into place, so a crash
// never leaves half a file.
import { promises as fsp } from 'node:fs'
import { basename } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { AppError } from '@highsea/core'
import { schema } from '@highsea/db'
import type { MediaInfo } from '@highsea/media/shared'
import { and, asc, eq } from 'drizzle-orm'
import { PROVIDER_INFO } from '../providers/index.ts'
import { toLanguageCode } from '../shared/languages.ts'
import type { PresentTrack } from '../shared/profiles.ts'
import type { ProviderId } from '../shared/types.ts'
import type { SidecarFs, SubtitlesDeps } from './context.ts'

const { mediaFiles, mediaItems, subtitleFiles } = schema

export type FileRow = typeof mediaFiles.$inferSelect
export type ItemRow = typeof mediaItems.$inferSelect
export type TrackRow = typeof subtitleFiles.$inferSelect

/** What `media_files.media_info` holds that subtitles read: the probe and, since 7a, the hash. */
export type FileInfo = { probe?: MediaInfo; moviehash?: string | null }

/** A stream inside the file, as A6 lists it. */
export type EmbeddedTrack = PresentTrack & {
  index: number
  codec: string
  format: string
  title: string | null
}

/** ffprobe's codec names for subtitle streams (ffmpeg's codec descriptors), as A6 names them. */
const FORMATS: Record<string, string> = {
  subrip: 'srt',
  srt: 'srt',
  ass: 'ass',
  ssa: 'ssa',
  webvtt: 'vtt',
  mov_text: 'text',
  hdmv_pgs_subtitle: 'pgs',
  dvd_subtitle: 'vobsub',
  dvb_subtitle: 'dvb',
}

/** The API's `SubtitleTrack`. */
export type TrackView = {
  id: string
  /** The movie's TMDB id, as the API addresses movies. */
  itemId: number
  fileId: string
  language: string
  kind: 'external' | 'bundled'
  format: string
  forced: boolean
  hi: boolean
  /** The provider's name; null for a bundled track. */
  provider: string | null
  releaseName: string | null
  score: number | null
  matches: string[]
  chosen: boolean
  sync: { status: TrackRow['syncStatus']; confidence: number | null; offsetMs: number }
  path: string
  addedAt: string
}

export const providerName = (provider: string): string | null =>
  provider in PROVIDER_INFO ? PROVIDER_INFO[provider as ProviderId].name : null

export function createTracks(deps: SubtitlesDeps) {
  const { db } = deps
  const fs: SidecarFs = deps.fs ?? fsp

  const file = (id: string): FileRow | undefined =>
    db.select().from(mediaFiles).where(eq(mediaFiles.id, id)).get()

  const item = (id: string): ItemRow | undefined =>
    db.select().from(mediaItems).where(eq(mediaItems.id, id)).get()

  const itemByTmdb = (tmdbId: number): ItemRow => {
    const row = db
      .select()
      .from(mediaItems)
      .where(and(eq(mediaItems.type, 'movie'), eq(mediaItems.tmdbId, tmdbId)))
      .get()
    if (!row) throw new AppError('not-found', 'That movie isn’t in the library.')
    return row
  }

  const filesOf = (itemId: string): FileRow[] =>
    db
      .select()
      .from(mediaFiles)
      .where(eq(mediaFiles.itemId, itemId))
      .orderBy(asc(mediaFiles.addedAt))
      .all()

  const rowsOf = (fileId: string): TrackRow[] =>
    db
      .select()
      .from(subtitleFiles)
      .where(eq(subtitleFiles.mediaFileId, fileId))
      .orderBy(asc(subtitleFiles.createdAt))
      .all()

  const track = (id: string): TrackRow => {
    const row = db.select().from(subtitleFiles).where(eq(subtitleFiles.id, id)).get()
    if (!row) throw new AppError('not-found', 'That subtitle track doesn’t exist.')
    return row
  }

  /** The file's own streams with a language; one without (`und`) can't fill a profile. */
  function embedded(f: FileRow): EmbeddedTrack[] {
    const info = (f.mediaInfo ?? {}) as FileInfo
    return (info.probe?.subtitles ?? []).flatMap((s) => {
      const language = toLanguageCode(s.language)
      return language
        ? [
            {
              index: s.index,
              codec: s.codec,
              format: FORMATS[s.codec] ?? s.codec,
              title: s.title,
              language,
              forced: s.forced,
              hi: s.hi,
            },
          ]
        : []
    })
  }

  /** Everything a file has: its sidecars and its streams. */
  function present(f: FileRow): PresentTrack[] {
    return [
      ...rowsOf(f.id).map((t) => ({ language: t.language, forced: t.forced, hi: t.hi })),
      ...embedded(f),
    ]
  }

  function view(row: TrackRow, tmdbId: number): TrackView {
    return {
      id: row.id,
      itemId: tmdbId,
      fileId: row.mediaFileId,
      language: row.language,
      kind: row.kind,
      format: row.format,
      forced: row.forced,
      hi: row.hi,
      provider: providerName(row.provider),
      releaseName: row.releaseName,
      score: row.score,
      matches: (row.matches as string[]) ?? [],
      chosen: row.chosen,
      sync: {
        status: row.syncStatus,
        confidence: row.syncConfidence,
        offsetMs: (row.syncOffsetMs ?? 0) + row.manualOffsetMs,
      },
      path: row.path,
      addedAt: new Date(row.createdAt).toISOString(),
    }
  }

  /** A movie's sidecar tracks, file by file. */
  function forItem(tmdbId: number): TrackView[] {
    const it = itemByTmdb(tmdbId)
    return filesOf(it.id).flatMap((f) => rowsOf(f.id).map((r) => view(r, it.tmdbId)))
  }

  /** Writes a sidecar: a temporary name beside it, then a rename. */
  async function write(path: string, data: string | Uint8Array): Promise<void> {
    const tmp = `${path}.highsea-tmp`
    await fs.writeFile(tmp, data)
    try {
      await fs.rename(tmp, path)
    } catch (e) {
      await fs.unlink(tmp).catch(() => {})
      throw e
    }
  }

  /** Removes a sidecar from disk; one already gone is fine. */
  async function unlink(path: string): Promise<void> {
    await fs.unlink(path).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'ENOENT') throw e
    })
  }

  /** The stored original, decoded. */
  const originalOf = (row: TrackRow): string | null =>
    row.original ? gunzipSync(row.original).toString('utf8') : null

  return {
    fs,
    file,
    item,
    itemByTmdb,
    filesOf,
    rowsOf,
    track,
    embedded,
    present,
    view,
    forItem,
    write,
    unlink,
    originalOf,
    /** A file name for history lines. */
    nameOf: (path: string) => basename(path),
  }
}

export type Tracks = ReturnType<typeof createTracks>

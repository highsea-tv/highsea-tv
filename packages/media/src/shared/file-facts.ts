// SPDX-License-Identifier: AGPL-3.0-only
// What collection rules ask of a file (checkpoint 8d, ADR 0049), read from its probe into columns
// and rows SQL can index: the resolution in lines, the HDR format, the video codec, and the audio
// and embedded subtitle languages (`media_file_languages`). Written whenever a probe is, and once
// by the runtime's `media.file-facts` for files recorded before 8d, always from the stored probe,
// so it's safe to repeat.
import { type Db, readSetting, schema, writeSetting } from '@highsea-tv/db'
import { streamLanguage } from '@highsea-tv/parser'
import { asc, eq, gt } from 'drizzle-orm'
import { type MediaInfo, resolutionOf } from './probe.ts'

const { mediaFiles, mediaFileLanguages } = schema

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** The settings row that says the stored file facts are this version's. */
export const FILE_FACTS_STATE_KEY = 'media.file-facts'
export const FILE_FACTS_VERSION = 1

/** The HDR a rule can ask for: the streams' short form (`streamsOf`), `none` for SDR. */
export type FileHdr = 'none' | 'hdr10' | 'dolby-vision' | 'hlg'

/**
 * The probe as `media_files` stores it: the import's `{ probe, revision, … }`, or a bare probe.
 * Anything else, or a file never probed, reads as no probe.
 */
export function probeOf(stored: unknown): MediaInfo | null {
  if (!stored || typeof stored !== 'object') return null
  const s = stored as { probe?: unknown; audio?: unknown }
  const p = (s.probe ?? (Array.isArray(s.audio) ? s : null)) as MediaInfo | null
  return p && Array.isArray(p.audio) && Array.isArray(p.subtitles) ? p : null
}

/**
 * The columns: lines as Radarr reads them from the picture (`resolutionOf`, so a 1920×800 scope
 * film is 1080), the HDR format, and ffprobe's `codec_name` (`h264`, `hevc`, `av1`). The codec is
 * ffprobe's rather than Radarr's naming name, which changes with the release name (x264, AVC or
 * h264 for one codec) and so would split one codec three ways.
 */
export function fileColumns(info: MediaInfo | null) {
  const v = info?.video ?? null
  return {
    resolution: v ? resolutionOf(v) : null,
    hdr: v ? hdrOf(v.hdr) : null,
    videoCodec: v?.codec ? v.codec.toLowerCase() : null,
  }
}

const hdrOf = (h: string): FileHdr =>
  h.startsWith('dv') ? 'dolby-vision' : h === 'hlg' ? 'hlg' : h === 'none' ? 'none' : 'hdr10'

/** The languages as ISO 639-1, each once per kind; untagged and `und` streams are left out. */
export function fileLanguages(info: MediaInfo | null) {
  const rows = new Map<string, { kind: 'audio' | 'subtitle'; language: string }>()
  for (const [kind, streams] of [
    ['audio', info?.audio ?? []],
    ['subtitle', info?.subtitles ?? []],
  ] as const)
    for (const s of streams) {
      const language = streamLanguage(s.language)
      if (language) rows.set(`${kind}:${language}`, { kind, language })
    }
  return [...rows.values()]
}

/** Sets a file's facts from its probe, inside the caller's transaction. */
export function writeFileFacts(tx: Tx | Db, fileId: string, info: MediaInfo | null) {
  tx.update(mediaFiles).set(fileColumns(info)).where(eq(mediaFiles.id, fileId)).run()
  tx.delete(mediaFileLanguages).where(eq(mediaFileLanguages.fileId, fileId)).run()
  const rows = fileLanguages(info).map((r) => ({ ...r, fileId }))
  if (rows.length) tx.insert(mediaFileLanguages).values(rows).onConflictDoNothing().run()
}

export const fileFactsCurrent = (db: Db) =>
  readSetting(db, FILE_FACTS_STATE_KEY, { version: 0 }).version === FILE_FACTS_VERSION

/**
 * Derives every file's facts again from its stored probe, `batch` files a transaction, yielding
 * between batches so a large library doesn't hold the event loop; then records the version.
 */
export async function deriveAllFileFacts(
  db: Db,
  now: number,
  { batch = 250, yieldFn = () => new Promise<void>((r) => setImmediate(r)) } = {},
) {
  let after = ''
  let count = 0
  for (;;) {
    const rows = db
      .select({ id: mediaFiles.id, mediaInfo: mediaFiles.mediaInfo })
      .from(mediaFiles)
      .where(gt(mediaFiles.id, after))
      .orderBy(asc(mediaFiles.id))
      .limit(batch)
      .all()
    if (!rows.length) break
    db.transaction((tx) => {
      for (const row of rows) writeFileFacts(tx, row.id, probeOf(row.mediaInfo))
    })
    count += rows.length
    after = rows[rows.length - 1]?.id ?? after
    await yieldFn()
  }
  writeSetting(db, FILE_FACTS_STATE_KEY, { version: FILE_FACTS_VERSION }, now)
  return count
}

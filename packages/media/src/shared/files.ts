// SPDX-License-Identifier: AGPL-3.0-only
// What's in a download, and what of it to import (checkpoint 6, The import pipeline, step 1, and
// Protection from malicious releases):
// - **Video files** by extension, from Radarr's MediaFileExtensions
//   (https://github.com/Radarr/Radarr/blob/develop/src/NzbDrone.Core/MediaFiles/MediaFileExtensions.cs),
//   leaving out disc images (`.iso`, `.img`) and playlists and links (`.strm`, `.m3u`), which
//   ffprobe can't read as a film.
// - **Skipped,** with a reason the owner reads in manual import: macOS's `._` resource files,
//   extras by Jellyfin's folder and suffix conventions
//   (https://jellyfin.org/docs/general/server/media/movies/#extras), and samples by runtime, as
//   Radarr's DetectSample does
//   (https://github.com/Radarr/Radarr/blob/develop/src/NzbDrone.Core/MediaFiles/MovieImport/DetectSample.cs).
// - **Blocked extensions:** Radarr's executable and "dangerous" lists, the same in Radarr and
//   Sonarr (https://github.com/Radarr/Radarr/blob/develop/src/NzbDrone.Core/MediaFiles/FileExtensions.cs).
import { promises as fsp } from 'node:fs'
import { basename, extname, join, relative, sep } from 'node:path'
import { bytes } from '@highsea/core'

export const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set([
  '.3gp',
  '.asf',
  '.avi',
  '.divx',
  '.dv',
  '.flv',
  '.m2ts',
  '.m2v',
  '.m4v',
  '.mk3d',
  '.mkv',
  '.mov',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.ogm',
  '.ogv',
  '.qt',
  '.rm',
  '.rmvb',
  '.ts',
  '.vob',
  '.webm',
  '.wmv',
  '.wtv',
  '.xvid',
])

/** FileExtensions.cs's `_executableExtensions`. */
export const EXECUTABLE_EXTENSIONS: ReadonlySet<string> = new Set(['.bat', '.cmd', '.exe', '.sh'])
/** FileExtensions.cs's `_dangerousExtensions`. */
export const DANGEROUS_EXTENSIONS: ReadonlySet<string> = new Set([
  '.arj',
  '.lnk',
  '.lzh',
  '.ps1',
  '.scr',
  '.vbs',
  '.zipx',
])

const ext = (path: string) => extname(path).toLowerCase()

export const isVideo = (path: string) => VIDEO_EXTENSIONS.has(ext(path))
export const isBlocked = (path: string) =>
  EXECUTABLE_EXTENSIONS.has(ext(path)) || DANGEROUS_EXTENSIONS.has(ext(path))

/** The first file with a blocked extension, or null. */
export const findBlocked = (paths: readonly string[]): string | null =>
  paths.find((p) => isBlocked(p)) ?? null

/** The state's copy for a release with a blocked file (the checkpoint's judgement call 9). */
export const blockedMessage = (name: string) =>
  `The release contains an executable file (${name}). It wasn’t downloaded, and it has been blocklisted.`

/**
 * The reason to refuse a release for its files, or null when none is blocked. The torrent engine
 * calls it with the `.torrent`'s file list before anything downloads; the import calls it again.
 */
export function vetFiles(paths: readonly string[]): string | null {
  const found = findBlocked(paths)
  return found ? blockedMessage(basename(found)) : null
}

/** Jellyfin's extras folders, lowercased. */
const EXTRA_FOLDERS = new Set([
  'behind the scenes',
  'deleted scenes',
  'interviews',
  'scenes',
  'samples',
  'shorts',
  'featurettes',
  'clips',
  'other',
  'extras',
  'trailers',
])
/**
 * Jellyfin's extras suffixes, before the extension: `trailer` and `sample` after `-`, `.`, `_` or
 * a space, the rest after `-` only (Jellyfin's NamingOptions), so "The Big Short.mkv" is the film.
 */
const EXTRA_SUFFIX =
  /(?:[-._ ](?:trailer|sample)|-(?:scene|clip|interview|behindthescenes|deleted|deletedscene|featurette|short|other|extra))$/i

/** Why a file is skipped before it's probed, or null. `root` is the folder being imported. */
export function skipBeforeProbe(path: string, root: string): string | null {
  const name = basename(path)
  if (name.startsWith('._')) return 'A macOS resource file, not a video. Skipped.'
  const folders = relative(root, path).split(sep).slice(0, -1)
  const folder = folders.find((f) => EXTRA_FOLDERS.has(f.toLowerCase()))
  if (folder) return `An extra, in ${folder}. Skipped.`
  if (EXTRA_SUFFIX.test(name.slice(0, name.length - extname(name).length)))
    return 'An extra, by its name. Skipped.'
  return null
}

/**
 * Radarr's GetMinimumAllowedRuntime: the shortest a file can run and still be the film, by the
 * film's runtime in minutes. Unknown runtimes count as feature length.
 */
export function minimumRuntimeSeconds(runtimeMinutes: number | null): number {
  if (runtimeMinutes && runtimeMinutes > 0) {
    if (runtimeMinutes <= 3) return 15
    if (runtimeMinutes <= 10) return 90
    if (runtimeMinutes <= 30) return 300
  }
  return 600
}

/** DetectSample's extensions that skip the check: Flash video, links and disc images. */
const NO_SAMPLE_CHECK = new Set(['.flv', '.strm', '.iso', '.img', '.m2ts'])

/**
 * Why a probed file is skipped as a sample, or null. A runtime of zero is a sample, as in
 * DetectSample; an unknown runtime isn't decided here (the probe failing is its own error).
 */
export function sampleReason(
  path: string,
  size: number,
  durationSeconds: number | null,
  minimumSeconds: number,
): string | null {
  if (NO_SAMPLE_CHECK.has(ext(path)) || durationSeconds === null) return null
  return durationSeconds < minimumSeconds ? `A sample (${bytes(size)}). Skipped.` : null
}

/** A file found on disk; `mtimeMs` lets the library scan (6b) tell a changed file. */
export type FoundFile = { path: string; size: number; mtimeMs?: number }

/**
 * Every file under `folder` (or `folder` itself when it's a file), depth-first, symlinks not
 * followed: a link could point anywhere, and the roots check is for what's really there. Stops
 * at `limit` files, which no real release comes near.
 */
export async function listFiles(folder: string, limit = 10_000): Promise<FoundFile[]> {
  const top = await fsp.lstat(folder)
  if (top.isFile()) return [{ path: folder, size: top.size, mtimeMs: top.mtimeMs }]
  if (!top.isDirectory()) return []
  const out: FoundFile[] = []
  const walk = async (dir: string) => {
    const entries = await fsp.readdir(dir, { withFileTypes: true })
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const e of entries) {
      if (out.length >= limit) return
      const path = join(dir, e.name)
      if (e.isDirectory()) await walk(path)
      else if (e.isFile()) {
        const st = await fsp.stat(path)
        out.push({ path, size: st.size, mtimeMs: st.mtimeMs })
      }
    }
  }
  await walk(folder)
  return out
}

// SPDX-License-Identifier: AGPL-3.0-only
// How the library names any title, pure: its sort title, its match key and its folder.
import { join } from 'node:path'
import { fold } from './fold.ts'

export { fold, sortTitleOf } from './fold.ts'

/** For matching names to titles: folded, letters and digits only (`Mission: Impossible` → `mission impossible`). */
export const matchKey = (title: string) =>
  fold(title)
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * A folder name that's valid on the filesystems libraries live on. Removed: the characters Windows
 * reserves (`< > : " / \ | ? *`) and control characters, and trailing dots and spaces, which
 * Windows doesn't allow at the end of a name (Microsoft, "Naming Files, Paths, and Namespaces":
 * https://learn.microsoft.com/windows/win32/fileio/naming-a-file). POSIX filesystems forbid only
 * `/` and NUL, so a name valid on Windows is valid everywhere, including SMB shares.
 */
export function safeName(name: string): string {
  const cleaned = name
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what's removed
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  return cleaned || 'Untitled'
}

/** `{Title} ({Year})`, the folder format Radarr and Sonarr default to for a movie or a series. */
export const folderName = (title: string, year: number | null) =>
  safeName(year ? `${title} (${year})` : title)

/** `{rootFolder}/{Title} ({Year})`. */
export const titlePath = (rootFolder: string, title: string, year: number | null) =>
  join(rootFolder, folderName(title, year))

/** `YYYY-MM-DD` in UTC, the form TMDB's dates take. */
export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

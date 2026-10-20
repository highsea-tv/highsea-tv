// SPDX-License-Identifier: AGPL-3.0-only
// The library's rules for a title, pure: its sort title, its folder, and its status until files
// and downloads exist (checkpoint 6).
import { join } from 'node:path'
import type { LibraryStatus, MinimumAvailability } from '@highsea/db/schema'
import type { MovieMetadata } from '@highsea/metadata'

/** Lowercase without accents (`Amélie` → `amelie`): Unicode compatibility decomposition, marks removed. */
export const fold = (s: string) =>
  s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * What Title sorts on: the title folded, without a leading English article ("The", "A", "An"), as
 * Radarr and Plex sort by default. Other languages' articles are left alone: the metadata language
 * is the server's, and a wrong guess would misfile titles.
 */
export function sortTitleOf(title: string): string {
  const folded = fold(title)
  const stripped = folded.replace(/^(the|a|an)\s+(?=\S)/, '')
  return stripped || folded
}

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

/** `{rootFolder}/{Title} ({Year})`, Radarr's default movie folder format. */
export const folderName = (title: string, year: number | null) =>
  safeName(year ? `${title} (${year})` : title)

export const moviePath = (rootFolder: string, title: string, year: number | null) =>
  join(rootFolder, folderName(title, year))

/** `YYYY-MM-DD` in UTC, the form TMDB's dates take. */
export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const addDays = (day: string, days: number) =>
  dayOf(Date.parse(`${day}T00:00:00Z`) + days * 24 * 60 * 60 * 1000)

/**
 * Without a digital or physical date, a movie is taken to be released 90 days after its theatrical
 * date, as Radarr documents (Servarr wiki, Radarr FAQ › What is Minimum Availability:
 * https://wiki.servarr.com/radarr/faq#what-is-minimum-availability).
 */
export const ASSUMED_HOME_RELEASE_DAYS = 90

/** The release date the library shows and sorts on: the region's theatrical date, else TMDB's primary. */
export const regionalReleaseDate = (m: Pick<MovieMetadata, 'releases' | 'releaseDate'>) =>
  m.releases.theatrical ?? m.releaseDate

/**
 * Whether the movie has reached its minimum availability today, in the server's region (Servarr
 * wiki, Radarr FAQ › What is Minimum Availability):
 * - announced: as soon as it's on TMDB;
 * - in cinemas: once its theatrical date (or TMDB's primary date) has passed;
 * - released: once its digital or physical date has passed, or the assumed home release above.
 * An unknown date is never reached.
 */
export function isAvailable(
  m: Pick<MovieMetadata, 'releases' | 'releaseDate'>,
  minimum: MinimumAvailability,
  today: string,
): boolean {
  if (minimum === 'announced') return true
  const cinema = regionalReleaseDate(m)
  if (minimum === 'in-cinemas') return cinema !== null && cinema <= today
  const home = [m.releases.digital, m.releases.physical].filter((d): d is string => !!d).sort()[0]
  if (home) return home <= today
  return cinema !== null && addDays(cinema, ASSUMED_HOME_RELEASE_DAYS) <= today
}

/**
 * A library movie's status until files exist (checkpoint 6), one of @highsea/db's
 * `LIBRARY_STATUSES`: `not-released` before its minimum availability, otherwise `wanted` when
 * monitored and `unmonitored` when not. `available` and `downloading` come with files and the queue.
 */
export const statusOf = (released: boolean, monitored: boolean): LibraryStatus =>
  !released ? 'not-released' : monitored ? 'wanted' : 'unmonitored'

// SPDX-License-Identifier: AGPL-3.0-only
// A movie's rules, pure: its folder, when it counts as released, and its status until files and
// downloads exist (checkpoint 6). Naming any title is @highsea/media/shared's (names.ts).
import type { LibraryStatus, MinimumAvailability } from '@highsea/db/schema'
import type { MovieMetadata } from '@highsea/metadata'
import { dayOf, titlePath } from '../shared/names.ts'

/** `{rootFolder}/{Title} ({Year})`, Radarr's default movie folder format. */
export const moviePath = titlePath

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

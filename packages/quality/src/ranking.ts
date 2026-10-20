// SPDX-License-Identifier: AGPL-3.0-only
// Which of two releases is better for a profile: quality (as the profile orders it), then
// revision, then format score. The Servarr wiki's profile rules give the first and last
// (https://wiki.servarr.com/radarr/settings#quality-profiles); "Download Proper & Repacks", at its
// default "Prefer and Upgrade", ranks a newer revision above an older one of the same quality
// (https://wiki.servarr.com/radarr/settings#file-management).
//
// Checkpoint 5 adds the keys that need an indexer's facts (protocol, indexer priority, seeders,
// size nearest the preferred size) as `tiebreakers`, after these three.
import type { Revision } from '@highsea/parser'
import { preference, type QualityProfile } from './profiles.ts'
import type { QualityName } from './qualities.ts'

export type Rankable = { quality: QualityName; revision: Revision; formatScore: number }

/** Negative when `a` is the better release, positive when `b` is, 0 when they tie. */
export type Comparator<T> = (a: T, b: T) => number

/** Version first (PROPER, REPACK, v2…), then REAL. Positive when `a` is newer. */
export const compareRevisions = (a: Revision, b: Revision): number =>
  a.version - b.version || a.real - b.real

/**
 * Best first, for `releases.sort(compareReleases(profile))`. `tiebreakers` run in order when the
 * three keys tie.
 */
export function compareReleases<T extends Rankable>(
  profile: Pick<QualityProfile, 'items'>,
  tiebreakers: readonly Comparator<T>[] = [],
): Comparator<T> {
  return (a, b) => {
    const byQuality = preference(profile, b.quality) - preference(profile, a.quality)
    if (byQuality) return byQuality
    const byRevision = compareRevisions(b.revision, a.revision)
    if (byRevision) return byRevision
    const byScore = b.formatScore - a.formatScore
    if (byScore) return byScore
    for (const t of tiebreakers) {
      const r = t(a, b)
      if (r) return r
    }
    return 0
  }
}

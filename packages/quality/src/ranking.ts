// SPDX-License-Identifier: AGPL-3.0-only
// Which of two releases is better for a profile: quality (as the profile orders it), then
// revision, then format score. The Servarr wiki's profile rules give the first and last
// (https://wiki.servarr.com/radarr/settings#quality-profiles); "Download Proper & Repacks", at its
// default "Prefer and Upgrade", ranks a newer revision above an older one of the same quality
// (https://wiki.servarr.com/radarr/settings#file-management).
//
// `indexerTiebreakers` adds the keys that need an indexer's facts, after these three, in the order
// TRaSH's guides give for the *arr's logic: protocol, indexer priority, seeds, then size
// (https://trash-guides.info/Sonarr/sonarr-setup-quality-profiles/#sonarr-current-logic). Priority
// is 1 to 50, 1 first, a tiebreaker (https://wiki.servarr.com/radarr/settings#indexers); size is
// nearest the quality's preferred size, which Radarr prefers (https://wiki.servarr.com/radarr/settings#quality).
import type { Revision } from '@highsea-tv/parser'
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

/** What the indexer tiebreakers read. */
export type IndexerRankable = Rankable & {
  protocol: 'torrent' | 'usenet'
  /** 1 to 50, lower first. */
  indexerPriority: number
  seeders: number | null
  size: number | null
  /** The quality's preferred size for this movie, in bytes; null when there's none. */
  preferredSize: number | null
}

/**
 * Protocol (the preferred one first), indexer priority (lower first), seeders (more first, torrents
 * only), then size nearest the preferred size (when there is one).
 */
export function indexerTiebreakers<T extends IndexerRankable>(
  preferredProtocol: 'torrent' | 'usenet' = 'torrent',
): Comparator<T>[] {
  return [
    (a, b) => Number(b.protocol === preferredProtocol) - Number(a.protocol === preferredProtocol),
    (a, b) => a.indexerPriority - b.indexerPriority,
    (a, b) =>
      a.protocol === 'torrent' && b.protocol === 'torrent'
        ? (b.seeders ?? -1) - (a.seeders ?? -1)
        : 0,
    (a, b) => {
      const target = a.preferredSize ?? b.preferredSize
      if (target === null || a.size === null || b.size === null) return 0
      return Math.abs(a.size - target) - Math.abs(b.size - target)
    },
  ]
}

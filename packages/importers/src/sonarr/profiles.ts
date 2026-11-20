// SPDX-License-Identifier: AGPL-3.0-only
// Sonarr's quality profiles onto highsea's, as Radarr's are (radarr/profiles.ts): nearest first by
// cutoff, or brought across as they are. Sonarr's profile resource has Radarr's shape (items,
// groups, cutoff, upgrades, format scores; no language, which Sonarr v4 dropped), and its quality
// names are Radarr's but for the remuxes, which Sonarr calls `Bluray-1080p Remux` and
// `Bluray-2160p Remux` (Servarr wiki, Sonarr Settings › Qualities Defined:
// https://wiki.servarr.com/sonarr/settings#qualities-defined). So a Sonarr profile is read as a
// Radarr one with those two names put in highsea's (Radarr's) words, and the Radarr functions do
// the rest.
import type { ProfileInput } from '@highsea-tv/media/shared'
import type { QualityProfile } from '@highsea-tv/quality'
import type { RadarrProfile, RadarrProfileItem } from '../radarr/client.ts'
import { nearestProfiles, profileFromRadarr, radarrCutoff } from '../radarr/profiles.ts'
import type { SonarrProfile, SonarrProfileItem, SonarrQuality } from './client.ts'

/** Sonarr's names that differ from highsea's. */
const RENAMES: Record<string, string> = {
  'Bluray-1080p Remux': 'Remux-1080p',
  'Bluray-2160p Remux': 'Remux-2160p',
}

/** A quality's name in highsea's words. */
export const sonarrQualityName = (name: string) => RENAMES[name] ?? name

const quality = (q: SonarrQuality) => ({ ...q, name: sonarrQualityName(q.name) })

const item = (i: SonarrProfileItem): RadarrProfileItem => ({
  ...(i.id !== undefined ? { id: i.id } : {}),
  ...(i.name !== undefined ? { name: i.name } : {}),
  ...(i.quality ? { quality: quality(i.quality) } : {}),
  ...(i.items ? { items: i.items.map(item) } : {}),
  allowed: i.allowed,
})

/** A Sonarr profile in the shape the Radarr functions read. */
export const asRadarr = (p: SonarrProfile): RadarrProfile => ({ ...p, items: p.items.map(item) })

export const sonarrCutoff = (p: SonarrProfile) => radarrCutoff(asRadarr(p))

/** highsea's profile ids, nearest to the Sonarr profile's cutoff first. */
export const nearestToSonarr = (p: SonarrProfile, ours: readonly QualityProfile[]) =>
  nearestProfiles(asRadarr(p), ours)

/** A Sonarr profile as highsea's editor would save it, or null when it can't be. */
export function profileFromSonarr(
  p: SonarrProfile,
  formats: readonly { id: string; name: string }[],
): ProfileInput | null {
  const input = profileFromRadarr(asRadarr(p), formats)
  if (!input) return null
  return { ...input, name: p.name.trim() || `Sonarr profile ${p.id}` }
}

// SPDX-License-Identifier: AGPL-3.0-only
// Radarr's quality profiles onto highsea's (checkpoint 6, The importers; the owner's answer 10):
// nearest first by cutoff. A profile's cutoff is where upgrading stops, so it says best what the
// owner wanted from it. Radarr's quality names are the ones highsea's vocabulary uses
// (@highsea/quality's QUALITIES follow Radarr's Quality.cs), so a cutoff is compared by rank: a
// group's cutoff by its best member. Ties keep highsea's own order. Custom profiles arrive with the
// editors in checkpoint 8; until then the owner picks among the seeded ones in the preview.
import { isQualityName, type QualityName, type QualityProfile, qualityRank } from '@highsea/quality'
import type { RadarrProfile, RadarrProfileItem } from './client.ts'

const best = (names: readonly string[]) =>
  Math.max(-1, ...names.filter(isQualityName).map((n) => qualityRank(n as QualityName)))

/** The qualities in an item: itself, or a group's members. */
const namesIn = (item: RadarrProfileItem): string[] =>
  item.quality ? [item.quality.name] : (item.items ?? []).flatMap(namesIn)

/** The cutoff's name and rank: the item whose quality or group id it is. -1 when it isn't found. */
export function radarrCutoff(profile: RadarrProfile): { name: string; rank: number } {
  const find = (items: readonly RadarrProfileItem[]): RadarrProfileItem | null => {
    for (const i of items) {
      if (i.quality && i.quality.id === profile.cutoff) return i
      if (!i.quality && i.id === profile.cutoff) return i
      const inner = i.items?.length ? find(i.items) : null
      if (inner) return inner
    }
    return null
  }
  const item = find(profile.items)
  if (!item) return { name: '', rank: -1 }
  return { name: item.quality?.name ?? item.name ?? '', rank: best(namesIn(item)) }
}

/** A highsea profile's cutoff rank: its cutoff item's best quality. */
export function highseaCutoff(profile: QualityProfile): number {
  const item = profile.items.find((i) => i.name === profile.cutoff)
  return item ? best(item.qualities) : -1
}

/** highsea's profile ids, nearest to the Radarr profile's cutoff first. */
export function nearestProfiles(radarr: RadarrProfile, ours: readonly QualityProfile[]): string[] {
  const want = radarrCutoff(radarr).rank
  return ours
    .map((p, i) => ({ id: p.id, i, d: want < 0 ? i : Math.abs(highseaCutoff(p) - want) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.id)
}

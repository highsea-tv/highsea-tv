// SPDX-License-Identifier: AGPL-3.0-only
// Radarr's quality profiles onto highsea's (checkpoint 6, The importers; the owner's answer 10):
// nearest first by cutoff. A profile's cutoff is where upgrading stops, so it says best what the
// owner wanted from it. Radarr's quality names are the ones highsea's vocabulary uses
// (@highsea/quality's QUALITIES follow Radarr's Quality.cs), so a cutoff is compared by rank: a
// group's cutoff by its best member. Ties keep highsea's own order.
//
// Since checkpoint 8c's editors, a Radarr profile can also come across as it is (`COPY_PROFILE`,
// `profileFromRadarr`): its qualities and groups, cutoff, upgrades and score thresholds, its
// language, and the scores of the custom formats highsea has by the same name (Radarr's own formats
// don't come across, ADR 0041).
import type { ProfileInput } from '@highsea/media/shared'
import { languageCode } from '@highsea/parser'
import {
  completeItems,
  isQualityName,
  type ProfileItem,
  type QualityName,
  type QualityProfile,
  qualityProfileSchema,
  qualityRank,
} from '@highsea/quality'
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

/** The preview's choice that brings a Radarr profile across as it is, in place of a profile id. */
export const COPY_PROFILE = 'copy'

/** Radarr's `Language` as a highsea profile's: Any (-1), Original (-2), or one by its name. */
function languageOf(language: RadarrProfile['language']): string {
  if (!language || language.id === -1) return 'any'
  if (language.id === -2) return 'original'
  return languageCode(language.name.toUpperCase()) ?? 'any'
}

/**
 * A Radarr profile as highsea's editor would save it, or null when it can't be (no quality highsea
 * knows is wanted). Radarr lists items lowest first, highsea highest first, so they're reversed; a
 * group keeps its name and the qualities highsea knows, a group left with one is that quality, and
 * the qualities Radarr leaves out are added, not wanted. Format scores are kept for highsea's
 * formats of the same name, case aside.
 */
export function profileFromRadarr(
  radarr: RadarrProfile,
  formats: readonly { id: string; name: string }[],
): ProfileInput | null {
  const items: ProfileItem[] = []
  const names = new Set<string>()
  for (const i of [...radarr.items].reverse()) {
    const qualities = namesIn(i).filter(isQualityName) as QualityName[]
    if (!qualities.length) continue
    const single = qualities.length === 1
    let name = single ? (qualities[0] as string) : i.name?.trim() || qualities.join(' / ')
    // a group named like a quality, or twice, gets the qualities' names
    if (!single && (isQualityName(name) || names.has(name))) name = qualities.join(' / ')
    names.add(name)
    items.push({ name, allowed: i.allowed, qualities })
  }
  if (!items.some((i) => i.allowed)) return null
  // the cutoff: the item holding the Radarr cutoff's best quality, else the best wanted
  const cutoffRank = radarrCutoff(radarr).rank
  const cutoff =
    items.find((i) => i.allowed && i.qualities.some((q) => qualityRank(q) === cutoffRank)) ??
    items.find((i) => i.allowed)
  const byName = new Map(formats.map((f) => [f.name.trim().toLowerCase(), f.id]))
  const scores = new Map<string, number>()
  for (const f of radarr.formatItems ?? []) {
    const id = byName.get(f.name.trim().toLowerCase())
    if (id && f.score !== 0) scores.set(id, f.score)
  }
  const input: ProfileInput = {
    name: radarr.name.trim() || `Radarr profile ${radarr.id}`,
    items: completeItems(items),
    cutoff: cutoff?.name ?? '',
    upgradeAllowed: radarr.upgradeAllowed ?? true,
    minFormatScore: radarr.minFormatScore ?? 0,
    cutoffFormatScore: radarr.cutoffFormatScore ?? 0,
    minUpgradeFormatScore: Math.max(1, radarr.minUpgradeFormatScore ?? 1),
    formats: [...scores].map(([formatId, score]) => ({ formatId, score })),
    language: languageOf(radarr.language),
    waitMinutes: 0,
  }
  const parsed = qualityProfileSchema.safeParse({ ...input, id: 'check' })
  return parsed.success ? input : null
}

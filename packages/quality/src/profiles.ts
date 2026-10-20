// SPDX-License-Identifier: AGPL-3.0-only
// Quality profiles, as the Servarr wiki describes them (https://wiki.servarr.com/radarr/settings#quality-profiles):
// - the qualities, highest first: "Qualities higher in the list are more preferred even if not
//   checked. Qualities within the same group are equal. Only checked qualities are wanted.";
// - the cutoff ("Upgrade Until"), a quality or group in that list, and whether upgrades are allowed;
// - format scores: a minimum to grab, a score to stop upgrading at, and the least gain that counts
//   as an upgrade (TRaSH's `minUpgradeFormatScore`);
// - the language: any, the movie's original language, or one language.
// The shape follows TRaSH's profile JSON (`items` with `name`, `allowed` and the qualities).
import { z } from 'zod'
import { languageCodeSchema } from './formats.ts'
import { QUALITY_NAMES, type QualityName, qualityRank, WEB_GROUPS } from './qualities.ts'

export const profileItemSchema = z.object({
  /** A quality's own name, or the group's ("WEB 1080p"). */
  name: z.string().min(1).max(100),
  allowed: z.boolean(),
  /** One quality, or the group's, all equal. */
  qualities: z.array(z.enum(QUALITY_NAMES)).min(1),
})
export type ProfileItem = z.infer<typeof profileItemSchema>

export const qualityProfileSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(100),
    /** Highest first. Qualities left out aren't allowed. */
    items: z.array(profileItemSchema).min(1),
    /** The item, by name, at which upgrading stops. */
    cutoff: z.string().min(1),
    upgradeAllowed: z.boolean(),
    minFormatScore: z.number().int(),
    cutoffFormatScore: z.number().int(),
    minUpgradeFormatScore: z.number().int().min(1).default(1),
    formats: z.array(z.object({ formatId: z.string().min(1), score: z.number().int() })),
    /** `any`, `original` (the movie's) or an ISO 639-1 code. */
    language: z.union([z.literal('any'), languageCodeSchema]).default('any'),
  })
  .superRefine((p, ctx) => {
    const seen = new Set<string>()
    const names = new Set<string>()
    p.items.forEach((item, i) => {
      if (names.has(item.name))
        ctx.addIssue({ code: 'custom', path: ['items', i, 'name'], message: 'Duplicate item' })
      names.add(item.name)
      if (item.qualities.length === 1 && item.qualities[0] !== item.name)
        ctx.addIssue({
          code: 'custom',
          path: ['items', i, 'name'],
          message: 'A single quality is named after itself',
        })
      for (const q of item.qualities) {
        if (seen.has(q))
          ctx.addIssue({ code: 'custom', path: ['items', i], message: `${q} appears twice` })
        seen.add(q)
      }
    })
    const cutoff = p.items.find((i) => i.name === p.cutoff)
    if (!cutoff?.allowed)
      ctx.addIssue({ code: 'custom', path: ['cutoff'], message: 'The cutoff must be allowed' })
    const ids = new Set(p.formats.map((f) => f.formatId))
    if (ids.size !== p.formats.length)
      ctx.addIssue({ code: 'custom', path: ['formats'], message: 'A format is scored twice' })
  })
export type QualityProfile = z.infer<typeof qualityProfileSchema>
export type QualityProfileInput = z.input<typeof qualityProfileSchema>

/** The item a quality is in, and its position (0 is the most preferred). */
export function profileItem(
  profile: Pick<QualityProfile, 'items'>,
  quality: QualityName,
): { item: ProfileItem; index: number } | null {
  const index = profile.items.findIndex((i) => i.qualities.includes(quality))
  const item = profile.items[index]
  return item ? { item, index } : null
}

/**
 * How much a profile prefers a quality: higher is better. Qualities the profile lists rank by
 * position, a group's members equally; those it leaves out rank below all of them, by their
 * global rank.
 */
export function preference(profile: Pick<QualityProfile, 'items'>, quality: QualityName): number {
  const found = profileItem(profile, quality)
  if (found) return profile.items.length - found.index
  return qualityRank(quality) - QUALITY_NAMES.length
}

export const isAllowed = (profile: Pick<QualityProfile, 'items'>, quality: QualityName) =>
  profileItem(profile, quality)?.item.allowed ?? false

/** Whether a quality is at or above the profile's cutoff. */
export function meetsCutoff(
  profile: Pick<QualityProfile, 'items' | 'cutoff'>,
  quality: QualityName,
): boolean {
  const cutoff = profile.items.findIndex((i) => i.name === profile.cutoff)
  const at = profileItem(profile, quality)
  return cutoff >= 0 && at !== null && at.index <= cutoff
}

/** A single quality, or a WEB group, as an item. */
export function item(name: QualityName | keyof typeof WEB_GROUPS, allowed: boolean): ProfileItem {
  const qualities = name in WEB_GROUPS ? [...WEB_GROUPS[name as keyof typeof WEB_GROUPS]] : [name]
  return { name, allowed, qualities: qualities as QualityName[] }
}

/**
 * `items` followed by every quality they leave out, not allowed, highest first, with WEB-DL and
 * WEBRip grouped: the full list Radarr and TRaSH keep in every profile.
 */
export function completeItems(items: ProfileItem[]): ProfileItem[] {
  const listed = new Set(items.flatMap((i) => i.qualities))
  const rest: ProfileItem[] = []
  for (const name of [...QUALITY_NAMES].reverse()) {
    if (listed.has(name)) continue
    const group = Object.entries(WEB_GROUPS).find(([, qs]) =>
      (qs as readonly string[]).includes(name),
    )
    if (group) {
      const members = (group[1] as readonly QualityName[]).filter((q) => !listed.has(q))
      for (const q of members) listed.add(q)
      if (members.length === group[1].length)
        rest.push({ name: group[0], allowed: false, qualities: members })
      else for (const q of members) rest.push({ name: q, allowed: false, qualities: [q] })
    } else {
      listed.add(name)
      rest.push({ name, allowed: false, qualities: [name] })
    }
  }
  return [...items, ...rest]
}

/**
 * The profiles a new server starts with: the prototype's, with its ids, names and scores. Each
 * lists what the prototype shows, then the rest of the qualities, not allowed.
 */
export const seedProfiles = (): QualityProfile[] => [
  {
    id: 'qp-uhd',
    name: 'Ultra HD',
    items: completeItems([
      item('Remux-2160p', true),
      item('Bluray-2160p', true),
      item('WEB 2160p', true),
      item('Bluray-1080p', false),
    ]),
    cutoff: 'WEB 2160p',
    upgradeAllowed: true,
    minFormatScore: 0,
    cutoffFormatScore: 1500,
    minUpgradeFormatScore: 1,
    formats: [
      { formatId: 'cf-dv', score: 1500 },
      { formatId: 'cf-hdr10', score: 1000 },
      { formatId: 'cf-x265', score: 100 },
      { formatId: 'cf-lq', score: -10000 },
    ],
    language: 'any',
  },
  {
    id: 'qp-hd',
    name: 'HD 1080p',
    items: completeItems([
      item('Bluray-1080p', true),
      item('WEB 1080p', true),
      item('HDTV-1080p', true),
      item('WEB 720p', false),
    ]),
    cutoff: 'Bluray-1080p',
    upgradeAllowed: true,
    minFormatScore: 0,
    cutoffFormatScore: 100,
    minUpgradeFormatScore: 1,
    formats: [
      { formatId: 'cf-x265', score: 100 },
      { formatId: 'cf-lq', score: -10000 },
    ],
    language: 'any',
  },
  {
    id: 'qp-any',
    name: 'Any',
    items: completeItems([item('WEB 1080p', true), item('WEB 720p', true), item('DVD', true)]),
    cutoff: 'WEB 1080p',
    upgradeAllowed: false,
    minFormatScore: -100,
    cutoffFormatScore: 0,
    minUpgradeFormatScore: 1,
    formats: [{ formatId: 'cf-lq', score: -10000 }],
    language: 'any',
  },
]

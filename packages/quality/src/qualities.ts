// SPDX-License-Identifier: AGPL-3.0-only
// The named qualities: a source, a resolution and a modifier together, ranked from Unknown to
// Remux-2160p. Names and meanings follow the Servarr wiki's "Qualities Defined"
// (https://wiki.servarr.com/radarr/settings#qualities-defined); the order follows Radarr's default
// profile order as the TRaSH Guides' profiles record it (docs/json/radarr/quality-profiles, MIT),
// with BR-DISK and Raw-HD moved below Remux-2160p (ADR 0031). Written from documentation, not code.
import type { Modifier, ParsedQuality, Resolution, Source } from '@highsea/parser'

export type QualityDefinition = {
  name: QualityName
  source: Source
  /** The resolution the quality stands for; `null` for qualities that don't fix one. */
  resolution: Resolution | null
  modifier: Modifier
}

const q = (
  name: QualityName,
  source: Source,
  resolution: Resolution | null,
  modifier: Modifier = 'none',
): QualityDefinition => ({ name, source, resolution, modifier })

/** Every quality, lowest first. A quality's index is its rank. */
export const QUALITY_NAMES = [
  'Unknown',
  'WORKPRINT',
  'CAM',
  'TELESYNC',
  'TELECINE',
  'REGIONAL',
  'DVDSCR',
  'SDTV',
  'DVD',
  'DVD-R',
  'WEBRip-480p',
  'WEBDL-480p',
  'Bluray-480p',
  'Bluray-576p',
  'HDTV-720p',
  'WEBRip-720p',
  'WEBDL-720p',
  'Bluray-720p',
  'HDTV-1080p',
  'Raw-HD',
  'WEBRip-1080p',
  'WEBDL-1080p',
  'Bluray-1080p',
  'Remux-1080p',
  'HDTV-2160p',
  'WEBRip-2160p',
  'WEBDL-2160p',
  'Bluray-2160p',
  'BR-DISK',
  'Remux-2160p',
] as const
export type QualityName = (typeof QUALITY_NAMES)[number]

export const QUALITIES: readonly QualityDefinition[] = [
  q('Unknown', 'unknown', null),
  q('WORKPRINT', 'workprint', null),
  q('CAM', 'cam', null),
  q('TELESYNC', 'telesync', null),
  q('TELECINE', 'telecine', null),
  q('REGIONAL', 'dvd', 480, 'regional'),
  q('DVDSCR', 'dvd', 480, 'screener'),
  q('SDTV', 'tv', 480),
  q('DVD', 'dvd', 480),
  q('DVD-R', 'dvd', 480, 'remux'),
  q('WEBRip-480p', 'webrip', 480),
  q('WEBDL-480p', 'webdl', 480),
  q('Bluray-480p', 'bluray', 480),
  q('Bluray-576p', 'bluray', 576),
  q('HDTV-720p', 'tv', 720),
  q('WEBRip-720p', 'webrip', 720),
  q('WEBDL-720p', 'webdl', 720),
  q('Bluray-720p', 'bluray', 720),
  q('HDTV-1080p', 'tv', 1080),
  q('Raw-HD', 'tv', 1080, 'rawhd'),
  q('WEBRip-1080p', 'webrip', 1080),
  q('WEBDL-1080p', 'webdl', 1080),
  q('Bluray-1080p', 'bluray', 1080),
  q('Remux-1080p', 'bluray', 1080, 'remux'),
  q('HDTV-2160p', 'tv', 2160),
  q('WEBRip-2160p', 'webrip', 2160),
  q('WEBDL-2160p', 'webdl', 2160),
  q('Bluray-2160p', 'bluray', 2160),
  q('BR-DISK', 'bluray', 1080, 'brdisk'),
  q('Remux-2160p', 'bluray', 2160, 'remux'),
]

const RANK = new Map<string, number>(QUALITY_NAMES.map((n, i) => [n, i]))

export const isQualityName = (s: string): s is QualityName => RANK.has(s)

/** 0 for Unknown up to the highest, Remux-2160p. */
export const qualityRank = (name: QualityName): number => RANK.get(name) ?? 0

export const qualityDefinition = (name: QualityName): QualityDefinition =>
  QUALITIES[qualityRank(name)] as QualityDefinition

/**
 * WEB-DL and WEBRip at the same resolution, treated as equals. Radarr's profiles and TRaSH's group
 * them this way ("Edit Groups": https://wiki.servarr.com/radarr/settings#quality-profiles).
 */
export const WEB_GROUPS = {
  'WEB 480p': ['WEBDL-480p', 'WEBRip-480p'],
  'WEB 720p': ['WEBDL-720p', 'WEBRip-720p'],
  'WEB 1080p': ['WEBDL-1080p', 'WEBRip-1080p'],
  'WEB 2160p': ['WEBDL-2160p', 'WEBRip-2160p'],
} as const satisfies Record<string, readonly QualityName[]>
export type WebGroupName = keyof typeof WEB_GROUPS

const hd = (res: Resolution | null): 720 | 1080 | 2160 | null =>
  res === 720 || res === 1080 || res === 2160 ? res : null

/**
 * The named quality for what the parser read. Where the name leaves something out, the result is
 * the lowest quality that fits what it does say: a WEB-DL without a resolution is WEBDL-480p, a
 * 1080p name without a source is HDTV-1080p. A name never earns a higher rank than it shows.
 */
export function qualityOf(
  parsed: Pick<ParsedQuality, 'source' | 'resolution' | 'modifier'>,
): QualityName {
  const { source, resolution, modifier } = parsed
  if (modifier === 'brdisk') return 'BR-DISK'
  if (modifier === 'rawhd') return 'Raw-HD'
  if (modifier === 'regional') return 'REGIONAL'
  if (modifier === 'screener') return 'DVDSCR'
  const r = hd(resolution)
  switch (source) {
    case 'cam':
      return 'CAM'
    case 'telesync':
      return 'TELESYNC'
    case 'telecine':
      return 'TELECINE'
    case 'workprint':
      return 'WORKPRINT'
    case 'dvd':
      return modifier === 'remux' ? 'DVD-R' : 'DVD'
    case 'tv':
      return r ? (`HDTV-${r}p` as const) : 'SDTV'
    case 'webdl':
      return `WEBDL-${r ?? 480}p` as const
    case 'webrip':
      return `WEBRip-${r ?? 480}p` as const
    case 'bluray':
      if (modifier === 'remux') return resolution === 2160 ? 'Remux-2160p' : 'Remux-1080p'
      if (r) return `Bluray-${r}p` as const
      return resolution === 576 || resolution === 540 ? 'Bluray-576p' : 'Bluray-480p'
    default:
      if (r) return `HDTV-${r}p` as const
      return resolution === null ? 'Unknown' : 'SDTV'
  }
}

/**
 * The prototype's quality strings ("Bluray 1080p", "WEB 2160p", "HDTV 720p", "DVD") as a profile
 * item: its name and the qualities in it. `null` for a string that isn't a quality ("4K", "HDR").
 * "WEB 1080p" is the WEB group; anything else is one quality, matched with or without the hyphen.
 */
export function fromPrototypeQuality(
  label: string,
): { name: string; qualities: QualityName[] } | null {
  const s = label.trim()
  if (s in WEB_GROUPS) return { name: s, qualities: [...WEB_GROUPS[s as WebGroupName]] }
  const hyphenated = s.replace(/^(\S+) (\d+p)$/, '$1-$2').toLowerCase()
  const name = QUALITY_NAMES.find((n) => n.toLowerCase() === hyphenated)
  return name ? { name, qualities: [name] } : null
}

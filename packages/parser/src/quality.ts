// SPDX-License-Identifier: AGPL-3.0-only
// Source, resolution, modifier and revision, plus the codec and dynamic range tags custom formats
// test. The vocabulary is the Servarr wiki's (Radarr › Settings › Qualities Defined,
// https://wiki.servarr.com/radarr/settings#qualities-defined); the spellings are the scene's
// (scenerules.org, 2020 x265 rules 17.1 and 17.2) and the common P2P ones the corpora show.

import { all, first, SEP, token } from './tokens.ts'
import type {
  DynamicRange,
  Modifier,
  ParsedQuality,
  Resolution,
  Revision,
  Source,
  VideoCodec,
} from './types.ts'

/** A source tag written straight onto the resolution: "TC1080P", "BD720p". */
function glued(tag: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${tag}(?=\\d{3,4}[pi](?![\\p{L}\\p{N}]))`, 'giu')
}

function either(a: RegExp, b: RegExp): RegExp {
  return new RegExp(`${a.source}|${b.source}`, 'giu')
}

type SourceRule = {
  source: Source
  modifier?: Modifier
  re: RegExp
  /** Pre-release sources (cam, telesync…) win over anything else the name says. */
  preRelease?: boolean
}

// Order matters only within a kind; between kinds, pre-release sources win, then the first in the
// name. "Hercules (2014) WEBDL DVDRip" is a WEB-DL.
const SOURCE_RULES: SourceRule[] = [
  // Pre-release (Qualities Defined: WORKPRINT, CAM, TELESYNC, TELECINE, DVDSCR).
  { source: 'workprint', re: token('WORKPRINT|WP'), preRelease: true },
  {
    source: 'cam',
    re: token(`(?:HD${SEP}?|NEW|HQ)?CAM(?:${SEP}?(?:Rip|HD))?|CAMRip|TS${SEP}?CAM`),
    preRelease: true,
  },
  {
    source: 'telesync',
    re: token(`TELESYNCH?|HD${SEP}?TS(?:${SEP}?Rip)?|TS${SEP}?Rip|TS`),
    preRelease: true,
  },
  {
    source: 'telecine',
    re: either(token(`TELECINE|HD${SEP}?TC(?:${SEP}?Rip)?|TC(?:${SEP}?Rip)?`), glued('TC')),
    preRelease: true,
  },
  // Every screener is Radarr's DVDSCR, whatever disc it claims: Qualities Defined has no other
  // screener quality. PreDVD and PDVD are the Indian market's name for the same pre-release copy.
  {
    source: 'dvd',
    modifier: 'screener',
    re: token(
      `(?:DVD|BD|BR|HD)${SEP}?SCR(?:EENER)?|SCR(?:EENER)?|P(?:re)?${SEP}?DVD(?:${SEP}?Rip)?|PRE${SEP}HDRip`,
    ),
    preRelease: true,
  },
  // Released.
  { source: 'tv', modifier: 'rawhd', re: token(`Raw${SEP}?HD`) },
  {
    source: 'bluray',
    re: token(
      [
        `(?:UHD${SEP}?|M)?Blu${SEP}?Ray(?:3D)?(?:${SEP}?(?:Rip|Mux))?`,
        `(?:UHD${SEP}?)?BD(?:Rip|Mux|R|3D|25|50|66|100|ISO|MV)`,
        `BD${SEP}(?:Rip|Mux|RM)`,
        // Bare BD in brackets, the fansub way: "[BD][1080p]".
        '(?<=[[(])BD(?=[\\])])',
        `UHD${SEP}?(?:Rip|BD)`,
        `BR${SEP}?(?:Rip|Mux)`,
        `HD${SEP}?DVD(?:${SEP}?Rip)?`,
        // Bare BD only beside a resolution: "1080p BD", "BD 720p" (PTN's "Movie 2014 BD 1080p").
        `BD(?=${SEP}(?:\\d{3,4}[pi]|\\d{3,4}x\\d{3,4}|x26[45]|AVC|HEVC|REMUX))`,
        `(?<=\\d{3,4}p${SEP})BD`,
      ].join('|'),
    ),
  },
  // Glued to a resolution: "BD1080p".
  { source: 'bluray', re: glued('BD') },
  // "BR1080P", "BR720P": BR glued to a resolution is a Blu-ray rip, as BRRip is.
  { source: 'bluray', re: glued('BR') },
  // Bare BR in capitals, beside a resolution or a codec: "VOSTF.BR.1080P", "1080p.BR.HEVC".
  {
    source: 'bluray',
    re: token(
      `BR(?=${SEP}(?:\\d{3,4}[pPi]|[xXhH]26[45]|AVC|HEVC|HD[lL]ight))|(?<=\\d{3,4}[pP]${SEP})BR`,
      true,
    ),
  },
  {
    // "WEB-DLRip" (a re-encode of a WEB-DL) before WEB-DL itself.
    source: 'webrip',
    re: token(`WEB${SEP}?(?:DL${SEP}?)?Rip|WEB${SEP}?Cap|HD${SEP}?Rip`),
  },
  {
    source: 'webdl',
    re: token(
      `WEB${SEP}?DL(?:${SEP}?Mux)?|WEB${SEP}?Mux|WEB${SEP}?(?:Light|HD)|WEB(?!${SEP}(?:DL|Rip|Cap|Mux)${'(?![\\p{L}\\p{N}])'})|iTunes(?:HD)?|AmazonHD|NetflixHD`,
    ),
  },
  {
    source: 'tv',
    re: token(
      `[AU]?HDTV(?:${SEP}?(?:Rip|Mux))?|PDTV|SDTV|DSR(?:ip)?|TV${SEP}?Rip(?:HD)?|SAT${SEP}?Rip|DVB(?:${SEP}?Rip)?|DTH(?:${SEP}?Rip)?|PPV${SEP}?Rip|IPTV(?:${SEP}?Rip)?`,
    ),
  },
  // DVD-R: "A remux of a retail DVD" (Qualities Defined), so DVD with the remux modifier.
  {
    source: 'dvd',
    modifier: 'remux',
    re: token(`DVD${SEP}?R|DVD${SEP}?(?:5|9)|DVD${SEP}?Full|Full${SEP}DVD|DVD${SEP}?ISO`),
  },
  {
    source: 'dvd',
    re: token(`DVD(?:${SEP}?(?:Rip|Mux))?|xvidvd|NTSC|PAL`),
  },
]

// REGIONAL: "A retail disc release intended for a specific geographic region" (Qualities Defined).
// R5 and its siblings are the regional retail discs; a CAM or TELESYNC that also says R6 is still
// a CAM, so the pre-release sources win.
const REGIONAL = token('R[1-9]|REGIONAL')

const REMUX = token(`(?:4K${SEP}?)?(?:BD|UHD|DVD)?${SEP}?REMUX`)

// BR-DISK, after TRaSH's BR-DISK custom format (MIT, docs/json/radarr/cf/br-disk.json): a Blu-ray
// that names the disc's own codec (AVC, HEVC, VC-1, MPEG-2) and no encoder, or calls itself a
// complete or full disc, BD25/50/66/100, an ISO or BDMV.
const BRDISK_TAGS = token(
  `COMPLETE${SEP}(?:UHD${SEP})?Blu${SEP}?Ray|Full${SEP}?Blu${SEP}?Ray|BR${SEP}?DISK|(?:BD|UHD)${SEP}?(?:25|50|66|100)|BDISO|BDMV|3D${SEP}?BD|BD3D`,
)
const DISC_CODEC = token(`AVC|HEVC|VC${SEP}?1|MVC|MPEG${SEP}?2`)
const ENCODED = token(
  `[xh]${SEP}?26[45]|XviD|DivX|MKV|WMV|720p|BDRip|BRRip|BD${SEP}Rip|DVD|REMUX|WEB${SEP}?(?:DL|Rip)?|HDTV|HDRip|HD${SEP}?DVD${SEP}?Rip`,
)
// TRaSH's BR-DISK format leaves out a 1080p HEVC name: no 1080p Blu-ray disc is HEVC.
const P1080 = token('1080[pi]')
const HEVC = token('HEVC')
// Encoders a DVD-R can't name: a DVD-R is the disc's own MPEG-2.
const DVD_ENCODED = token(`[xh]${SEP}?26[45]|XviD|DivX|DivXNL|AVC|HEVC`)

const RESOLUTIONS: Record<string, Resolution> = {
  '360': 360,
  '480': 480,
  '540': 540,
  '576': 576,
  '720': 720,
  '1080': 1080,
  '2160': 2160,
}
// Also glued to a source: "TC1080P", "m1080p", "BD720p".
const RESOLUTION_P =
  /(?:(?<![\p{L}\p{N}])|(?<=(?<![\p{L}\p{N}])(?:TC|TS|BD|BR|HD|m)))\d{3,4}[pi](?![\p{L}\p{N}])/giu
// "(720)" or "[1080]" alone in brackets.
const RESOLUTION_BRACKET = /[[(](720|1080|2160|480|576)[\])]/gu
const DIMENSIONS = token(`(\\d{3,4})${SEP}?[x×](?!26[45](?!\\d))${SEP}?(\\d{3,4})p?`)
const RESOLUTION_WORDS = token('4K|UHD|FHD|FullHD|2160|1080|720')

// Revisions. Servarr wiki, Radarr › Settings › File Management: PROPER is a fix by another group,
// REPACK one by the release's own group. Scene rules 17.2 add RERIP (a fresh rip by the same group)
// and REAL (a proper of a release that was itself wrong). TRaSH's Repack/Proper formats count
// "REPACK2" and "REAL.REPACK" as the next version.
const PROPER = token('PROPER(\\d)?')
const REPACK = token('(?:REPACK|RERIP)(\\d)?')
const REAL = token('REAL', true)
const VERSION = token('v([2-9])')

// Codecs, after TRaSH's x264, x265, AV1, VC-1 and MPEG2 formats (MIT).
const CODECS: [VideoCodec, RegExp][] = [
  // A bare 264 or 265 just before the group ("BluRay 264-Pop", "DDP.1.0.265-E.T").
  ['hevc', token(`[xh]${SEP}?265|HEVC(?:10)?|265(?=-|$)`)],
  ['avc', token(`[xh]${SEP}?264|AVC(?:x264)?|264(?=-|$)`)],
  ['av1', token('AV1')],
  ['vc1', token(`VC${SEP}?1`)],
  ['mpeg2', token(`MPEG${SEP}?2`)],
  ['xvid', token('XviD(?:HD)?')],
  ['divx', token('DivX')],
  ['vp9', token('VP9')],
]

// Dynamic range, after TRaSH's HDR formats (MIT, docs/json/radarr/cf/hdr.json and its siblings).
const HDR: [DynamicRange, RegExp][] = [
  ['dv', token(`DV|DoVi|Dolby${SEP}?Vision`)],
  ['hdr10plus', /(?<![\p{L}\p{N}])HDR10(?:\+|P(?:lus)?(?![\p{L}\p{N}]))/giu],
  ['hdr10', token('HDR10')],
  ['hdr', token('HDR')],
  ['hlg', token('HLG')],
  ['sdr', token('SDR')],
]

// 3D, after TRaSH's 3D format (MIT): 3D, SBS, OU and their half variants, or a 3D Blu-ray, plus
// SideBySide and OverUnder spelled out as Russian trackers write them.
const THREE_D = token(
  `3D|H${SEP}?SBS|Half${SEP}?(?:SBS|OU|Side${SEP}?By${SEP}?Side|Over${SEP}?Under)|SBS|H${SEP}?OU|Side${SEP}?By${SEP}?Side|Over${SEP}?Under|BluRay3D|BD3D|3D${SEP}?BD`,
)

export const DEFAULT_REVISION: Revision = { version: 1, real: 0, proper: false, repack: false }

export type QualityDetails = ParsedQuality & {
  codec: VideoCodec | null
  hdr: DynamicRange[]
  threeD: boolean
}

/** Reads the quality from `s`, looking only at `from` onwards (after the title). */
export function readQuality(s: string, from = 0): QualityDetails {
  const resolution = readResolution(s, from)

  let chosen: { rule: SourceRule; index: number } | null = null
  for (const rule of SOURCE_RULES) {
    const hit = first(rule.re, s, from)
    if (!hit) continue
    // A DVD-R that names an encoder ("DVDR DivXNL") is a DVD rip, not the disc.
    const encodedDisc =
      rule.modifier === 'remux' && rule.source === 'dvd' && first(DVD_ENCODED, s, from) !== null
    const effective: SourceRule = encodedDisc ? { source: 'dvd', re: rule.re } : rule
    // A name that says both WEB-DL and WEBRip was re-encoded: the WEBRip is what it is.
    if (rule.source === 'webdl' && chosen?.rule.source === 'webrip') continue
    // "PAL DVDR", "NTSC DVD9": the TV standard only says DVD; the disc tag says which kind.
    if (rule.source === 'dvd' && !rule.modifier && chosen?.rule.source === 'dvd') continue
    if (
      !chosen ||
      (rule.preRelease && !chosen.rule.preRelease) ||
      (!!rule.preRelease === !!chosen.rule.preRelease && hit.index < chosen.index)
    ) {
      chosen = { rule: effective, index: hit.index }
    }
  }

  let source: Source = chosen?.rule.source ?? 'unknown'
  let modifier: Modifier = chosen?.rule.modifier ?? 'none'

  if (!chosen?.rule.preRelease) {
    if (first(REMUX, s, from)) {
      // A remux keeps the disc's streams: of a Blu-ray unless the name says DVD.
      modifier = 'remux'
      if (source !== 'dvd') source = 'bluray'
    } else if (isBrDisk(s, from, source)) {
      source = 'bluray'
      modifier = 'brdisk'
    } else if (first(REGIONAL, s, from) && (source === 'unknown' || source === 'dvd')) {
      source = 'dvd'
      modifier = 'regional'
    }
  }

  return {
    source,
    resolution,
    modifier,
    revision: readRevision(s, from),
    codec: readCodec(s, from),
    hdr: readHdr(s, from),
    threeD: first(THREE_D, s, from) !== null,
  }
}

function isBrDisk(s: string, from: number, source: Source): boolean {
  if (first(P1080, s, from) && first(HEVC, s, from)) return false
  if (first(BRDISK_TAGS, s, from)) return !first(ENCODED, s, from)
  return source === 'bluray' && !!first(DISC_CODEC, s, from) && !first(ENCODED, s, from)
}

function readResolution(s: string, from: number): Resolution | null {
  for (const hit of all(RESOLUTION_P, s, from)) {
    const value = RESOLUTIONS[hit.text.slice(0, -1)]
    if (value) return value
  }
  const dims = first(DIMENSIONS, s, from)
  if (dims) {
    const [w = '0', h = '0'] = dims.text.split(/[ ._-]?[x×][ ._-]?/iu)
    const value = byWidth(Number(w)) ?? RESOLUTIONS[h.replace(/p$/i, '')]
    if (value) return value
  }
  const bracket = first(RESOLUTION_BRACKET, s, from)
  if (bracket) return RESOLUTIONS[bracket.text.slice(1, -1)] ?? null
  const word = first(RESOLUTION_WORDS, s, from)
  if (word) {
    const w = word.text.toUpperCase()
    if (w === '4K' || w === 'UHD' || w === '2160') return 2160
    if (w === 'FHD' || w === 'FULLHD' || w === '1080') return 1080
    if (w === '720') return 720
  }
  return null
}

/**
 * A frame counts as the standard resolution of its width class, so a cropped "1920x800" is 1080p
 * and "1280x544" is 720p: scope films keep the width and lose height.
 */
function byWidth(width: number): Resolution | null {
  if (width >= 3800) return 2160
  if (width >= 1900) return 1080
  if (width >= 1200) return 720
  if (width >= 700) return width >= 1000 ? 576 : 480
  return null
}

function readRevision(s: string, from: number): Revision {
  const proper = first(PROPER, s, from)
  const repack = first(REPACK, s, from)
  const version = first(VERSION, s, from)
  let v = 1
  // PROPER2 and REPACK2 are the third release; a bare PROPER or REPACK the second.
  for (const hit of [proper, repack]) {
    if (!hit) continue
    const n = /(\d)$/.exec(hit.text)
    v = Math.max(v, n ? Number(n[1]) + 1 : 2)
  }
  if (version) v = Math.max(v, Number(version.text.slice(1)))
  return {
    version: v,
    real: all(REAL, s, from).length,
    proper: proper !== null,
    repack: repack !== null,
  }
}

function readCodec(s: string, from: number): VideoCodec | null {
  let best: { codec: VideoCodec; index: number } | null = null
  for (const [codec, re] of CODECS) {
    const hit = first(re, s, from)
    if (hit && (!best || hit.index < best.index)) best = { codec, index: hit.index }
  }
  return best?.codec ?? null
}

function readHdr(s: string, from: number): DynamicRange[] {
  const found: { tag: DynamicRange; index: number }[] = []
  const taken: [number, number][] = []
  for (const [tag, re] of HDR) {
    for (const hit of all(re, s, from)) {
      if (taken.some(([a, b]) => hit.index < b && hit.end > a)) continue
      taken.push([hit.index, hit.end])
      if (!found.some((f) => f.tag === tag)) found.push({ tag, index: hit.index })
    }
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.tag)
}

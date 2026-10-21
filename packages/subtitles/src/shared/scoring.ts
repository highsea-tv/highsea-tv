// SPDX-License-Identifier: AGPL-3.0-only
// Scoring (judgement call 8), on Bazarr's movie weights, the established practice
// (subliminal_patch/score.py, https://github.com/morpheus65535/bazarr/blob/master/custom_libs/subliminal_patch/score.py):
// hash 179, title 60, year 40, source 30, edition 30, release group 15, and 1 each for resolution,
// video codec, audio codec, streaming service and hearing impaired, out of 180. A hash match counts
// only when the source and video codec also match, and then stands alone; a match on the TMDB or
// IMDb id counts as title and year. The percentage is `round(points × 100 / 180)`, as Bazarr's
// processing.py computes it, so a hash match is 99. With Prefer release matches off, only hash,
// title and year count. Bazarr is read for behaviour only; nothing is copied (ADR 0031's practice).
// The release fields come from @highsea/parser on both sides: the subtitle's release names and the
// library file's scene name (or its file name).

import type { ParsedRelease } from '@highsea/parser'
import { parse } from '@highsea/parser'
import { satisfies } from './languages.ts'
import type { LanguageRule, ProviderResult } from './types.ts'

export const WEIGHTS = {
  hash: 179,
  title: 60,
  year: 40,
  source: 30,
  edition: 30,
  releaseGroup: 15,
  resolution: 1,
  videoCodec: 1,
  audioCodec: 1,
  streamingService: 1,
  hearingImpaired: 1,
} as const

export const MAX_POINTS = 180

export type Match = keyof typeof WEIGHTS

/** The library file as scoring sees it. */
export type ScoredFile = {
  title: string
  year: number | null
  /** The release name it came from, or the file's name without its extension. */
  releaseName: string
  /** The probe's video codec as the parser spells it, when the name doesn't say. */
  videoCodec?: string | null
}

export type Scored = { score: number; points: number; matches: Match[] }

const fold = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^\p{L}\p{N}]+/gu, '')

const AUDIO: [string, RegExp][] = [
  ['truehd', /\btrue[ ._-]?hd\b/i],
  ['atmos', /\batmos\b/i],
  ['dts', /\bdts(?:[ ._-]?(?:hd|ma|x))*\b/i],
  ['eac3', /\b(?:e[ ._-]?ac[ ._-]?3|ddp|dd\+)/i],
  ['ac3', /\b(?:ac[ ._-]?3|dd(?:[ ._-]?[257][ ._.]?[01])?)\b/i],
  ['aac', /\baac/i],
  ['flac', /\bflac\b/i],
  ['opus', /\bopus\b/i],
]

/** Streaming services' tags in release names, as the scene and P2P groups write them. */
const SERVICES = /\b(AMZN|NF|DSNP|HMAX|MAX|ATVP|HULU|PCOK|PMTP|iT|CRAV|STAN|SHO|ROKU|MA)\b/

const audioOf = (name: string) => AUDIO.find(([, re]) => re.test(name))?.[0] ?? null
const serviceOf = (name: string) => SERVICES.exec(name)?.[1]?.toUpperCase() ?? null

function releaseMatches(
  file: ParsedRelease,
  fileName: string,
  sub: ParsedRelease,
  codec: string | null,
): Set<Match> {
  const m = new Set<Match>()
  const src = file.quality.source
  if (src !== 'unknown' && src === sub.quality.source) m.add('source')
  if ((file.edition ? fold(file.edition) : '') === (sub.edition ? fold(sub.edition) : '')) {
    m.add('edition')
  }
  // a release group counts only with the source (Bazarr's guess_matches)
  if (
    m.has('source') &&
    file.releaseGroup &&
    sub.releaseGroup &&
    fold(file.releaseGroup) === fold(sub.releaseGroup)
  ) {
    m.add('releaseGroup')
  }
  if (file.quality.resolution && file.quality.resolution === sub.quality.resolution) {
    m.add('resolution')
  }
  if (codec && codec === sub.codec) m.add('videoCodec')
  const audio = audioOf(fileName)
  if (audio && audio === audioOf(sub.name)) m.add('audioCodec')
  // edition and streaming service are optional: neither side naming one is a match, as Bazarr's
  // `_check_optional` has it (custom_libs/subliminal_patch/subtitle.py)
  if (serviceOf(fileName) === serviceOf(sub.name)) m.add('streamingService')
  return m
}

/**
 * A result's score for a file, against the rule it's wanted for. Every release name the provider
 * lists is tried and the best one kept.
 */
export function scoreResult(
  result: ProviderResult,
  file: ScoredFile,
  rule: Pick<LanguageRule, 'hi'> | null,
  options: { preferReleaseMatch: boolean },
): Scored {
  const fileRelease = parse(file.releaseName)
  const codec = fileRelease.codec ?? file.videoCodec ?? null
  let best: Scored = { score: 0, points: 0, matches: [] }
  for (const name of result.releases.length > 0 ? result.releases : [result.releaseName]) {
    const sub = parse(name)
    const release = releaseMatches(fileRelease, file.releaseName, sub, codec)
    const matches = new Set<Match>()
    if (result.idMatch || fold(sub.title) === fold(file.title)) matches.add('title')
    if (result.idMatch || (file.year !== null && sub.year === file.year)) matches.add('year')
    // a hash match stands alone, but only with the source and the codec (Bazarr's rule)
    const hash = result.hashMatch && release.has('source') && release.has('videoCodec')
    let points: number
    let found: Match[]
    if (hash) {
      points = WEIGHTS.hash
      found = ['hash']
    } else {
      if (options.preferReleaseMatch) for (const r of release) matches.add(r)
      if (rule && rule.hi !== 'no' && result.hi) matches.add('hearingImpaired')
      if (rule && rule.hi === 'no' && !result.hi) matches.add('hearingImpaired')
      found = [...matches]
      points = found.reduce((sum, k) => sum + WEIGHTS[k], 0)
    }
    const scored = {
      points,
      matches: found,
      score: Math.round((Math.min(points, MAX_POINTS) * 100) / MAX_POINTS),
    }
    if (scored.points > best.points) best = scored
  }
  return best
}

/** Whether a result can fill a rule at all: its language, its flags, and no translation. */
export function fitsRule(
  result: Pick<ProviderResult, 'language' | 'forced' | 'hi' | 'translated'>,
  wanted: { language: string; forced: boolean; hi: boolean },
  rule: LanguageRule,
): boolean {
  if (result.translated) return false
  if (!satisfies(result.language, wanted.language)) return false
  if (result.forced !== wanted.forced) return false
  // Without SDH takes an SDH track only as the fallback, cleaned (question 11); SDH only wants SDH
  if (rule.hi === 'only' && !result.hi) return false
  return true
}

/** Orders scored results: score, then the provider's ranking, then the provider order. */
export function compareResults(
  a: { score: number; downloads: number; rating: number; providerRank: number; fallback: boolean },
  b: { score: number; downloads: number; rating: number; providerRank: number; fallback: boolean },
): number {
  return (
    Number(a.fallback) - Number(b.fallback) ||
    b.score - a.score ||
    b.downloads - a.downloads ||
    b.rating - a.rating ||
    a.providerRank - b.providerRank
  )
}

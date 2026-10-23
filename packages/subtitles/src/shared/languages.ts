// SPDX-License-Identifier: AGPL-3.0-only
// Profile languages (judgement call 5): ISO 639-1 codes, plus `pt-BR`, `zh-Hans` and `zh-Hant`,
// which OpenSubtitles.com also tells apart. ffprobe reports a stream's language as Matroska stores
// it, ISO 639-2 (`eng`, and `fre` or `fra`), read through @highsea-tv/parser's table of the Library of
// Congress list (https://www.loc.gov/standards/iso639-2/php/code_list.php). Names come from
// `Intl.DisplayNames`.
import { iso6391Of, languageCode, ISO_639_1 as ONE } from '@highsea-tv/parser'

/** The regional codes a profile may use, beside ISO 639-1, and the base language each refines. */
export const REGIONAL: Record<string, string> = { 'pt-BR': 'pt', 'zh-Hans': 'zh', 'zh-Hant': 'zh' }

// Older and provider-specific tags for the regional codes, and 639-2's `fil` for Filipino.
const EXTRA: Record<string, string> = {
  pob: 'pt-BR',
  ptbr: 'pt-BR',
  'pt-br': 'pt-BR',
  chs: 'zh-Hans',
  'zh-cn': 'zh-Hans',
  'zh-hans': 'zh-Hans',
  cht: 'zh-Hant',
  'zh-tw': 'zh-Hant',
  'zh-hk': 'zh-Hant',
  'zh-hant': 'zh-Hant',
  ze: 'zh',
  fil: 'tl',
}

/** Every code a profile may use: ISO 639-1, then the regional ones. */
export const LANGUAGE_CODES: readonly string[] = [...ONE, ...Object.keys(REGIONAL)]

export function isLanguageCode(code: string): boolean {
  return ONE.has(code) || code in REGIONAL
}

/**
 * A profile code for a language tag from a stream, a provider or a file name: ISO 639-1 or 639-2
 * in any case, the regional tags, or an English name ("English", "Brazilian"). `null` when it's
 * none of those (`und`, `zxx`, a word that isn't a language).
 */
export function toLanguageCode(tag: string | null | undefined): string | null {
  if (!tag) return null
  const t = tag.trim()
  const lower = t.toLowerCase().replace(/_/g, '-')
  if (lower in EXTRA) return EXTRA[lower] ?? null
  for (const [code] of Object.entries(REGIONAL)) if (code.toLowerCase() === lower) return code
  if (lower.length === 2 && ONE.has(lower)) return lower
  if (lower.length === 3) return iso6391Of(lower) ?? null
  // An IETF tag such as `en-US`: its language, unless it's one of the regional codes above.
  const ietf = /^([a-z]{2,3})-[a-z0-9]{2,8}$/.exec(lower)
  if (ietf) return toLanguageCode(ietf[1])
  if (/^brazilian(?: portuguese)?$/.test(lower)) return 'pt-BR'
  if (/^(?:simplified chinese|chinese simplified)$/.test(lower)) return 'zh-Hans'
  if (/^(?:traditional chinese|chinese traditional)$/.test(lower)) return 'zh-Hant'
  return languageCode(t)
}

/**
 * Whether a track in `track`'s language satisfies a rule for `wanted`. A base language counts for
 * its regional codes, since ISO 639-2 has no tag for Brazilian Portuguese or a Chinese script and
 * a file's stream can't say which it is; a regional track doesn't count for the base language.
 */
export function satisfies(track: string, wanted: string): boolean {
  return track === wanted || REGIONAL[wanted] === track
}

const NAMES = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'code' })

/** The language's English name ("Brazilian Portuguese"). */
export function languageName(code: string): string {
  try {
    return NAMES.of(code) ?? code
  } catch {
    return code
  }
}

/** Every profile language with its name, sorted by name. */
export function languageList(): { code: string; name: string }[] {
  return LANGUAGE_CODES.map((code) => ({ code, name: languageName(code) })).sort((a, b) =>
    a.name.localeCompare(b.name, 'en'),
  )
}

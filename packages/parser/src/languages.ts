// SPDX-License-Identifier: AGPL-3.0-only
// Languages a release name tags, as ISO 639-1 codes. Scene rules (2020 x265, 18.5.7) require
// non-English releases to carry the language's full name (FRENCH, GERMAN, iTALiAN in the scene's
// mixed case); P2P names add abbreviations (ITA, ENG, RUS) and France's VFF, VFQ, VFI and VF2
// (TRaSH's French audio formats, MIT). A subtitle tag (SWESUB, VOSTFR, "En Subs") names a subtitle
// language, not an audio one, and goes to `subtitles`.
import { all, END, first, SEP, token } from './tokens.ts'

type Entry = {
  code: string
  /** Full names and long forms: matched in any case. */
  names: string
  /** Short codes: matched in any case, only after the title. */
  codes?: string
  /** Short codes matched only in capitals (`DE`, `EN`), since they're common words otherwise. */
  upper?: string
}

// Spanish from Latin America (LATINO) is `es`: ISO 639-1 has one code for Spanish. Brazilian
// Portuguese is `pt` for the same reason, and Flemish is `nl`.
const ENTRIES: Entry[] = [
  { code: 'en', names: 'English|Ingl[eéê]s', codes: 'ENG', upper: 'EN' },
  {
    code: 'fr',
    names: 'French|TRUEFRENCH|Fran[cç]ais',
    codes: 'VFF|VFQ|VFI|VF2|VFB|VOF|VF|FRA|FRE',
    upper: 'FR',
  },
  { code: 'de', names: 'German|Deutsch', codes: 'GER|DEU', upper: 'DE' },
  { code: 'it', names: 'Italian|Italiano', codes: 'ITA' },
  {
    code: 'es',
    names: 'Spanish|Espa[nñ]ola?|Castellano|Latino|Latin',
    codes: 'ESP|SPA|LAT',
    upper: 'ES',
  },
  {
    code: 'pt',
    names: 'Portuguese|Portugu[eê]sa?|Brazilian|Dublado',
    codes: `PT${SEP}?BR|PORT?${SEP}BR|POR`,
    upper: 'PT',
  },
  { code: 'ru', names: 'Russian', codes: 'RUS', upper: 'RU' },
  { code: 'uk', names: 'Ukrainian', codes: 'UKR' },
  {
    code: 'pl',
    names: `Polish|Polski|PL${SEP}?DUB|DUB${SEP}?PL|Lektor`,
    codes: 'POL',
    upper: 'PL',
  },
  { code: 'nl', names: 'Dutch|Flemish|Vlaams', codes: 'NLD|DUT|NL' },
  { code: 'da', names: 'Danish|Dansk|Danska', upper: 'DAN|DK' },
  { code: 'sv', names: 'Swedish|Svensk', codes: 'SWE', upper: 'SE' },
  { code: 'no', names: 'Norwegian|Norsk', codes: 'NOR' },
  { code: 'fi', names: 'Finnish|Suomi|Finsk', codes: 'FIN' },
  { code: 'is', names: 'Icelandic' },
  { code: 'ja', names: 'Japanese', codes: 'JAP|JPN', upper: 'JP' },
  { code: 'ko', names: 'Korean', codes: 'KOR' },
  { code: 'zh', names: 'Chinese|Mandarin|Cantonese|Taiwanese', codes: 'CHI|CHN|CHS|CHT' },
  { code: 'hi', names: 'Hindi', codes: 'HIN' },
  { code: 'ta', names: 'Tamil', codes: 'TAM' },
  { code: 'te', names: 'Telugu', codes: 'TEL' },
  { code: 'ml', names: 'Malayalam', codes: 'MAL' },
  { code: 'kn', names: 'Kannada', codes: 'KAN' },
  { code: 'bn', names: 'Bengali|Bangla' },
  { code: 'mr', names: 'Marathi' },
  { code: 'pa', names: 'Punjabi' },
  { code: 'ur', names: 'Urdu' },
  { code: 'gu', names: 'Gujarati' },
  { code: 'ar', names: 'Arabic|Arab', codes: 'ARA' },
  { code: 'tr', names: 'Turkish', codes: 'TUR' },
  { code: 'el', names: 'Greek', codes: 'GRE' },
  { code: 'he', names: 'Hebrew', codes: 'HEB' },
  { code: 'fa', names: 'Persian|Farsi' },
  { code: 'th', names: 'Thai' },
  { code: 'vi', names: 'Vietnamese', codes: 'VIE' },
  { code: 'id', names: 'Indonesian' },
  { code: 'ms', names: 'Malay' },
  { code: 'tl', names: 'Filipino|Tagalog' },
  { code: 'cs', names: 'Czech', codes: 'CZE|CZ' },
  { code: 'sk', names: 'Slovak|Slovakian' },
  { code: 'hu', names: 'Hungarian|Magyar', codes: 'HUN' },
  { code: 'ro', names: 'Romanian', codes: 'RUM|ROM' },
  { code: 'bg', names: 'Bulgarian', codes: 'BUL' },
  { code: 'sr', names: 'Serbian' },
  { code: 'hr', names: 'Croatian', codes: 'HRV|CRO' },
  { code: 'sl', names: 'Slovenian|Slovene' },
  { code: 'lt', names: 'Lithuanian' },
  { code: 'lv', names: 'Latvian' },
  { code: 'et', names: 'Estonian' },
  { code: 'ca', names: 'Catalan' },
]

const COMPILED = ENTRIES.map((e) => ({
  code: e.code,
  any: token([e.names, e.codes].filter(Boolean).join('|')),
  upper: e.upper ? token(e.upper, true) : null,
}))

/** Language tags that mark the end of a title even when it has no year: written in capitals, or
 * forms that are never words (TRUEFRENCH, VFF, MULTi). */
export const LANGUAGE_MARKER = token(
  [
    ...ENTRIES.map((e) => e.names),
    'VFF|VFQ|VFI|VF2|VF|VOSTFR?|VOST|STFR|SUBFRENCH|MULTi|NORDiC',
  ].join('|'),
)

// After a language: "Subs", "SUB", "Subtitles" and "Subbed" make it a subtitle language. Before
// one: SUBFRENCH, and the French VOSTFR/VOST.FR ("version originale sous-titrée").
const SUB_AFTER = new RegExp(`^${SEP}?Sub(?:s|titles?|bed)?${END}`, 'iu')
const SUB_BEFORE = new RegExp(`(?:Sub|VOST|ST|SRT)${SEP}?$`, 'iu')
// VOST alone and VOSTF are the same French tag, without the language spelled out.
const SUB_TAGS = token(`VOST${SEP}?FR|SUBFR(?:ENCH)?|STFR|VOSTFRA?|VOSTF|VOST(?!A|EN)`)
const SUB_TAGS_EN = token('VOSTA|VOSTEN')
// The scene's Nordic subtitle tag: Danish, Finnish, Norwegian and Swedish subtitles.
const NORDIC = token('NORDiC')
const NORDIC_CODES = ['da', 'fi', 'no', 'sv']
// Hardcoded: KORSUB is Korean hardsubs (handled in parse.ts), never a soft subtitle language.
// Subtitle tags glued to a code: SWESUB, DANSUB, FiNSUB, PLSUB, ENSUBBED, EngSub, ROSub, and
// SLOSUBS, where SLO is ISO 639-2/B for Slovak. KORSUB is Korea's hardcoded-subtitle tag, so it
// counts as a Korean subtitle as well as hardcoded (parse.ts).
const GLUED_SUBS: Record<string, string> = {
  // ESub is the Indian releases' English subtitle tag.
  E: 'en',
  SWE: 'sv',
  DAN: 'da',
  FIN: 'fi',
  NOR: 'no',
  PL: 'pl',
  SLO: 'sk',
  EN: 'en',
  ENG: 'en',
  KOR: 'ko',
  NL: 'nl',
  ITA: 'it',
  GER: 'de',
  RO: 'ro',
  SPA: 'es',
  ESP: 'es',
  POR: 'pt',
  RUS: 'ru',
  HEB: 'he',
  ARA: 'ar',
  CZ: 'cs',
  GR: 'el',
  TUR: 'tr',
}
const GLUED_SUB = token(`(${Object.keys(GLUED_SUBS).join('|')})SUB(?:S|BED)?`)

// A run of three or more two-letter codes ("En.De.Fr.It.Es", "IT EN FR DE ES") is a language list
// in any case; a lone "It" or "No" is a word.
const TWO_LETTER: Record<string, string> = {
  en: 'en',
  fr: 'fr',
  de: 'de',
  it: 'it',
  es: 'es',
  sp: 'es',
  pt: 'pt',
  ru: 'ru',
  pl: 'pl',
  nl: 'nl',
  da: 'da',
  dk: 'da',
  sv: 'sv',
  se: 'sv',
  no: 'no',
  fi: 'fi',
  ja: 'ja',
  jp: 'ja',
  ko: 'ko',
  zh: 'zh',
  hr: 'hr',
  ro: 'ro',
  cs: 'cs',
  cz: 'cs',
  hu: 'hu',
  el: 'el',
  he: 'he',
  tr: 'tr',
  ar: 'ar',
}
const TWO = `(?:${Object.keys(TWO_LETTER).join('|')})`
// Polish "napisy" are subtitles: NapisyPL, "Napisy PL".
const NAPISY = token(`Napisy${SEP}?PL`)
const CODE_RUN = token(`${TWO}(?:[ ._,/-]${TWO}){2,}`)
// Two codes are a list too when both are capitalised: "FR IT", "Fr En" (after the title only).
const TWO_CAP = Object.keys(TWO_LETTER)
  .map((c) => `${c.toUpperCase()}|${c[0]?.toUpperCase()}${c[1]}`)
  .join('|')
const CODE_PAIR = token(`(?:${TWO_CAP})[ .](?:${TWO_CAP})`, true)
const TWO_UPPER = Object.keys(TWO_LETTER).join('|').toUpperCase()
/** A run of language codes written in capitals ("IT EN FR DE ES"): a tag wherever it is. */
export const CODE_RUN_MARKER = token(`(?:${TWO_UPPER})(?:[ ._,/-](?:${TWO_UPPER})){2,}`, true)
const SUBS_BEFORE_RUN = /(?:Sub(?:s|titles?)?|Multi-?subs?)[\s.[(]*$/iu
const SUBS_AFTER_RUN = /^[\s.\])]*(?:Multi-?)?(?:Sub(?:s|titles?)?)(?![\p{L}])/iu
// A two-letter code in any case before "Subs": "En Subs", "Fr Subs".
const CODE_SUBS = token(`(${TWO})${SEP}Sub(?:s|titles?)?`)

// Codes joined by hyphens or plus signs are a language list in any case: "[FR-EN]", "VF2-ENG",
// "(VFF-VOA)", "[JPN-VOSTFR]". French names add VO (original version, no language named) and VOA
// (original English version).
const PAIR_PART = `(?:${TWO}|ENG|FRE|FRA|GER|DEU|ITA|SPA|ESP|JPN|JAP|KOR|RUS|POR|VFF|VFQ|VFI|VF2|VF|VOA|VO|VOSTFR|VOST|STFR)`
const PAIR = token(`${PAIR_PART}(?:${SEP}?[-+]${SEP}?${PAIR_PART})+`)
/** A hyphen-joined language list ("FR-EN"): a tag wherever it is. */
export const LANGUAGE_PAIR_MARKER = PAIR

const HARDSUB_AFTER = new RegExp(`^${SEP}?Hard${SEP}?Subs?${END}`, 'iu')

// MULTi, after TRaSH's MULTi format (MIT): `Multi` not followed by "subs". Dual audio is the same
// idea with two languages, and German "DL" (Dual Language) is TRaSH's German DL format.
const MULTI = token(
  `MULTi\\d?(?!${SEP}?Sub(?!forced))(?:${SEP}?(?:Audio|Lang(?:uage)?s?))?|(?:Dual|Tri(?:ple)?)${SEP}?(?:Audio|Lang(?:uage)?s?)|DUAL|DL`,
)
const MULTI_WITHOUT_DL = token(
  `MULTi\\d?(?!${SEP}?Sub(?!forced))(?:${SEP}?(?:Audio|Lang(?:uage)?s?))?|(?:Dual|Tri(?:ple)?)${SEP}?(?:Audio|Lang(?:uage)?s?)|DUAL`,
)

export type Languages = { languages: string[]; subtitles: string[]; multi: boolean }

/** Reads the languages from `s`, looking only at `from` onwards (after the title). */
export function readLanguages(s: string, from = 0): Languages {
  const audio: { code: string; index: number }[] = []
  const subs: { code: string; index: number }[] = []
  const taken: [number, number][] = []

  // French tags name the subtitles alone: "VOSTFR EN" is English audio with French subtitles.
  const noCarry = new Set<number>()
  for (const hit of all(SUB_TAGS, s, from)) {
    noCarry.add(hit.index)
    subs.push({ code: 'fr', index: hit.index })
    taken.push([hit.index, hit.end])
  }
  // The same tag for English subtitles: VOSTA ("sous-titrée anglais") and VOSTEN.
  for (const hit of all(SUB_TAGS_EN, s, from)) {
    noCarry.add(hit.index)
    subs.push({ code: 'en', index: hit.index })
    taken.push([hit.index, hit.end])
  }
  for (const hit of all(GLUED_SUB, s, from)) {
    const prefix = /^[a-z]+?(?=sub)/i.exec(hit.text)?.[0].toUpperCase() ?? ''
    const code = GLUED_SUBS[prefix]
    if (code) subs.push({ code, index: hit.index })
    taken.push([hit.index, hit.end])
  }
  for (const hit of all(NAPISY, s, from)) {
    subs.push({ code: 'pl', index: hit.index })
    taken.push([hit.index, hit.end])
  }
  for (const run of all(PAIR, s, from)) {
    const parts = run.text.split(/[ ._]*[-+][ ._]*/)
    let sub = false
    let at = run.index
    for (const part of parts) {
      const upper = part.toUpperCase()
      if (/^(?:VOSTFR|VOST|STFR)$/.test(upper)) {
        noCarry.add(at)
        subs.push({ code: 'fr', index: at })
      } else if (upper === 'ST') sub = true
      else if (upper === 'VOA') audio.push({ code: 'en', index: at })
      else if (upper !== 'VO') {
        const code = TWO_LETTER[part.toLowerCase()] ?? languageCode(part)
        if (code) (sub ? subs : audio).push({ code, index: at })
      }
      at += part.length + 1
    }
    taken.push([run.index, run.end])
  }
  for (const run of all(CODE_PAIR, s, from)) {
    if (taken.some(([a, b]) => run.index < b && run.end > a)) continue
    // Only a pair on its own, not the start of a longer run (CODE_RUN reads those).
    if (/^[ ._,/-][A-Za-z]{2}(?![\p{L}\p{N}])/u.test(s.slice(run.end))) continue
    if (/(?<![\p{L}\p{N}])[A-Za-z]{2}[ ._,/-]$/u.test(s.slice(0, run.index))) continue
    const isSub = SUBS_AFTER_RUN.test(s.slice(run.end, run.end + 12))
    let at = run.index
    for (const part of run.text.split(/[ .]/)) {
      const code = TWO_LETTER[part.toLowerCase()]
      if (code) (isSub ? subs : audio).push({ code, index: at })
      at += part.length + 1
    }
    taken.push([run.index, run.end])
  }
  for (const run of all(CODE_RUN, s, from)) {
    if (taken.some(([a, b]) => run.index < b && run.end > a)) continue
    const isSub =
      SUBS_BEFORE_RUN.test(s.slice(Math.max(0, run.index - 12), run.index)) ||
      SUBS_AFTER_RUN.test(s.slice(run.end, run.end + 12))
    let at = run.index
    for (const part of run.text.split(/[ ._,/-]/)) {
      const code = TWO_LETTER[part.toLowerCase()]
      if (code) (isSub ? subs : audio).push({ code, index: at })
      at += part.length + 1
    }
    taken.push([run.index, run.end])
  }
  for (const hit of all(CODE_SUBS, s, from)) {
    const code = TWO_LETTER[hit.text.slice(0, 2).toLowerCase()]
    if (code) subs.push({ code, index: hit.index })
    taken.push([hit.index, hit.end])
  }
  for (const hit of all(NORDIC, s, from)) {
    for (const code of NORDIC_CODES) subs.push({ code, index: hit.index })
    taken.push([hit.index, hit.end])
  }

  for (const entry of COMPILED) {
    const hits = all(entry.any, s, from)
    if (entry.upper) hits.push(...all(entry.upper, s, from))
    for (const hit of hits) {
      if (taken.some(([a, b]) => hit.index < b && hit.end > a)) continue
      const after = s.slice(hit.end, hit.end + 12)
      if (HARDSUB_AFTER.test(after)) continue
      const isSub =
        (SUB_AFTER.test(after) && !languageFollows(after)) ||
        SUB_BEFORE.test(s.slice(Math.max(0, hit.index - 5), hit.index))
      ;(isSub ? subs : audio).push({ code: entry.code, index: hit.index })
      taken.push([hit.index, hit.end])
    }
  }

  // "Sub Ita Eng": a subtitle tag carries over to the languages listed straight after it.
  const all_ = [
    ...audio.map((a) => ({ ...a, sub: false })),
    ...subs.map((x) => ({ ...x, sub: true })),
  ]
  all_.sort((a, b) => a.index - b.index)
  for (let i = 1; i < all_.length; i++) {
    const prev = all_[i - 1]
    const cur = all_[i]
    if (!prev || !cur || !prev.sub || cur.sub || noCarry.has(prev.index)) continue
    const gap = s.slice(prev.index, cur.index)
    if (/^[\p{L}]+[ ._,/+-]{1,3}$/u.test(gap)) {
      cur.sub = true
      audio.splice(
        audio.findIndex((a) => a.index === cur.index),
        1,
      )
      subs.push({ code: cur.code, index: cur.index })
    }
  }

  // German DL only counts next to German.
  const hasGerman = audio.some((a) => a.code === 'de')
  const multi = first(hasGerman ? MULTI : MULTI_WITHOUT_DL, s, from) !== null

  return { languages: ordered(audio), subtitles: ordered(subs), multi }
}

/** Whether a "Sub" word right after a language is itself followed by one ("fre.sub.Eng"). */
function languageFollows(after: string): boolean {
  const next = /^[ ._-]?Sub(?:s|titles?|bed)?[ ._-]([\p{L}]{2,})/iu.exec(after)?.[1]
  return next !== undefined && languageCode(next) !== null
}

function ordered(found: { code: string; index: number }[]): string[] {
  const out: string[] = []
  for (const f of [...found].sort((a, b) => a.index - b.index)) {
    if (!out.includes(f.code)) out.push(f.code)
  }
  return out
}

/** The ISO 639-1 code for a language name or tag ("FRENCH", "iTALiAN", "VFF"), or `null`. */
export function languageCode(tag: string): string | null {
  for (const entry of COMPILED) {
    entry.any.lastIndex = 0
    const m = entry.any.exec(tag)
    if (m && m.index === 0 && m[0].length === tag.length) return entry.code
    if (entry.upper) {
      entry.upper.lastIndex = 0
      const u = entry.upper.exec(tag)
      if (u && u.index === 0 && u[0].length === tag.length) return entry.code
    }
  }
  return null
}

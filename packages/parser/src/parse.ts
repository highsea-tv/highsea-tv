// SPDX-License-Identifier: AGPL-3.0-only
// A release name into its parts. Scene rules give the shape (2020 x265 rules 18.4.1:
// "Feature.Title.<YEAR>.<TAGS>.[LANGUAGE].<RESOLUTION>.<FORMAT>.<x264|x265>-GROUP"), and P2P names
// keep to it loosely: the title comes first and ends at the year or at the first tag, and the group
// comes last, after a hyphen. So the parser finds the tags first and reads the title as whatever
// precedes the first of them. Every other field is read from the rest of the name, so a word like
// "French" or "Extended" inside the film's name is never mistaken for a tag.
import { DC_MARKER, EDITION_MARKER, PRE_YEAR_EDITION, readEdition } from './edition.ts'
import {
  CODE_RUN_MARKER,
  LANGUAGE_MARKER,
  LANGUAGE_PAIR_MARKER,
  languageCode,
  readLanguages,
} from './languages.ts'
import { readQuality } from './quality.ts'
import { cleanTitle } from './title.ts'
import { all, first, type Hit, SEP, shouty, token, words } from './tokens.ts'
import type { ParsedQuality, ParsedRelease } from './types.ts'

const S = SEP

// ---- Clean-up before parsing

// Container and download extensions, also when a site has turned the dot into a space
// ("… x265-EDGE2020 mkv"). `.ts` only in lower case: in capitals it's TELESYNC.
const EXTENSION =
  /(?:\.|\s)(?:mkv|mp4|avi|m4v|mov|wmv|mpe?g|m2ts|iso|flv|webm|ogm|divx|rmvb|nzb|torrent|rar)$/i
const TS_EXTENSION = /\.ts$/
// "www.Torrenting.com - ", "[ www.Torrenting.com ] - ", "www 1TamilBlasters tel - ".
const SITE_PREFIX =
  /^\s*[[(]?\s*w{2,3}[ .,][\p{L}\p{N}-]+(?:[ .][\p{L}\p{N}-]+){0,2}\s*[\])]?\s*(?:_?-_?\s*)?|^\s*[\p{L}\p{N}-]+\.(?:com|org|net|to|tv|me|ru|nu|info|cc|se|io|xyz|club|li|ws|in|co)\s+-\s+/iu
// Distributor retags after the group, after TRaSH's Retags format (MIT): [rartv], [rarbg],
// [eztv], [TGx] and the like, and any bracketed site after "-GROUP".
const TRAILING_TAG =
  /(?<=-(?=[\p{N}_]*\p{L})[\p{L}\p{N}_]+)-?\s*\[[^\]]*\]\s*$|\s*\[(?:rartv|rarbg|eztvx?(?:[ ._-]?(?:io|re|to))?|TGx|ettv|ETRG|EtHD|PublicHD)\]\s*$/iu
// After the group, French names add the title in another language or the uploader's site:
// "x264-PopHD (The Deer Hunter)", "x264-NEO.(Cash Express)", "x264-ZEST-zone-telechargement.pw".
// A bracket there counts only when tags precede the group, so "Spider-Man (2002)" keeps its year.
const TRAILING_PAREN = /(?<=-\s?(?=[\p{N}_]*\p{L})[\p{L}\p{N}_]+)\.?\s*\([^()]*\)[\s.]*$/u
const TRAILING_SITE =
  /(?<=-[\p{L}\p{N}]+)[-._ ]+(?:www\.)?[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:com|net|org|to|pw|top|video|info|me|cc|ws|nu|tv)$/iu
// Usenet posters' suffixes after the group, after TRaSH's Obfuscated format (MIT).
const POSTER_SUFFIX =
  /-(?:4P|4Planet|AsRequested|BUYMORE|Chamele0n|GEROV|iNC0GNiTO|NZBGeek|Obfuscated|postbot|Rakuv|Scrambled|WhiteRev|xpost|WRTEAM|CAPTCHA)$|_nzb$/i
// A leading "[Group] " (the fansub convention), "【site】", "[2006]" or "(2000)".
const LEADING = /^\s*(?:\[([^[\]]*)\]|【([^】]*)】|\(((?:18|19|20)\d\d)\)|\{([^{}]*)\})[\s._-]*/u
// A bracket that holds a site: one with "www." in it, or nothing but a domain ("[YTS.MX]").
const SITE_BLOCK =
  /[[(【{][^\])】}]*w{3}\.[^\])】}]*[\])】}]|[[(【{]\s*[\p{L}\p{N}-]{3,}(?:\.[\p{L}\p{N}-]+)*\.(?:com|net|org|info|to|tv|me|cc|io|nu|se|nl|ch|fi|cz|my|mx|lt|tw|ru|yt|li|ws|co|in|is|pics|world|link|site|club|xyz)\s*[\])】}]/giu
const LAST_BRACKET = /\s*\[[^[\]]*\]\s*$/u
const SITE_LIKE =
  /(?:^|[\s.])(?:www|com|net|org|nu|to|tv|ru|info)(?:$|[\s.])|^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.(?:com|net|org|info|to|tv|me|cc|io|nu|se|nl|ch|fi|cz|my|mx|lt|tw|ru|yt|li|ws|co|in|is|pics|world|link|site|club|xyz)$/iu

// ---- Title terminators

const YEAR_BODY = '(?:18[89]\\d|19\\d\\d|20\\d\\d)'
// "2006г." is Russian for "the year 2006".
const YEAR = new RegExp(`(?<![\\p{L}\\p{N}])${YEAR_BODY}(?=г|(?![\\p{L}\\p{N}]))`, 'gu')
// A span of years is a collection's, not a film's: "2001-2011", "(1988 - 89)". A date isn't one.
const YEAR_RANGE = new RegExp(
  `(?<![\\p{L}\\p{N}])${YEAR_BODY}(?:[-–]|\\s[-–]\\s)(?:${YEAR_BODY}|\\d{2})(?![\\p{L}\\p{N}]|[-.]\\d)`,
  'gu',
)
// A date ("2019.10.25", "2019 10 25") belongs to an episode, not a film's year.
const DATE = new RegExp(
  `(?<![\\p{L}\\p{N}])${YEAR_BODY}([-. ])[01]\\d\\1[0-3]\\d(?![\\p{L}\\p{N}])`,
  'gu',
)

// Tags no film title contains: resolutions, sources, codecs, audio formats, episode numbering and
// ids. The first one ends the title wherever it is.
const STRONG = token(
  [
    '(?:BD|BR|TC|TS|HD|m)?\\d{3,4}[pi]',
    // "HD 720p": HD in front of a resolution.
    `HD(?=${S}\\d{3,4}[pi])`,
    `\\d{3,4}${S}?[x×](?!26[45](?!\\d))${S}?\\d{3,4}`,
    `(?:UHD${S}?|M)?Blu${S}?Ray(?:3D)?`,
    `(?:UHD${S}?)?BD(?:Rip|Mux|R|3D|25|50|66|100|ISO|MV|${S}Rip|SCR|${S}RM)`,
    `BD(?=${S}(?:\\d{3,4}[pi]|\\d{3,4}x\\d{3,4}|x26|AVC|HEVC|REMUX|FLAC))`,
    '[[(]BD(?=[\\])\\s])',
    `BR${S}?(?:Rip|Mux|DISK|Screener)`,
    `WEB${S}?(?:DL|Rip|Cap|Mux)(?:${S}?(?:Rip|Mux))?`,
    `HD${S}?(?:Rip|DVD|CAM|TS|TC|TV|SCR)(?:${S}?Rip)?`,
    `A?HDTV(?:Rip|Mux)?|PDTV|SDTV|DSR|TV${S}?Rip(?:HD)?|SAT${S}?Rip|DVB${S}?Rip|PPV${S}?Rip|VHS${S}?Rip|VHS`,
    `DVD(?:${S}?(?:Rip|Mux|R|5|9|SCR(?:EENER)?|Full|ISO))?`,
    `(?:HQ|NEW|HD)CAM(?:${S}?(?:Rip|HD))?|CAM${S}?(?:Rip|HD)|TELESYNCH?|TELECINE|WORKPRINT|TS${S}?(?:Rip|Screener)|P(?:re)?${S}?DVD(?:${S}?Rip)?|PRE${S}HDRip`,
    'R[5-6]',
    `(?:4K${S}?)?(?:BD|UHD)?${S}?REMUX`,
    `Raw${S}?HD`,
    `[xh]${S}?26[45]|HEVC|AVC(?:x264)?|XviD|DivX|VC${S}?1|MPEG${S}?2|Hi10P?|10${S}?bit`,
    `AC${S}?3|E${S}?AC3|DTS(?:${S}?HD)?|AAC(?:\\d(?:\\.\\d)?)?|DDP?${S}?\\d\\.\\d|DD\\+|TrueHD|FLAC|LPCM`,
    'HDR10(?:\\+|Plus)?|HDR',
    // 3D layouts, after TRaSH's 3D format: "3D SBS", "H-OU", "Half-SBS".
    `3D(?=${S}(?:H${S}?SBS|H${S}?OU|Half|Full|SBS|OU))|H${S}?SBS|H${S}?OU|(?:Half|Full)${S}?(?:SBS|OU)`,
    // A resolution alone in brackets: "(1080)", "[720]".
    '[[(](?:480|576|720|1080|2160)[\\])]',
    'MKV|MP4|AVI',
    // France's light re-encodes: HDLight, mHD.
    `HD${S}?Light|mHD`,
    // Episodes and seasons: a TV release in a movie feed still ends its title here. "Episode N"
    // with a year after it is a film's title ("Star Wars Episode 4 Un Nouvel espoir 1977").
    `S\\d{1,3}(?:${S}?E\\d{1,4})*|S(?:19|20)\\d\\dE\\d{1,3}|(?:E\\d{2,4})+|\\d{1,2}x\\d{2,3}|(?:Season|Sezon)${S}?\\d{1,2}(?!\\d)(?![ ._]*[([]?(?:18|19|20)\\d\\d)|\\d{1,2}[ªº]${S}Temporada|Saisons?${S}?\\d{1,2}(?!\\d)|Temporada${S}?\\d{1,2}(?!\\d)|Ep\\.?${S}?\\d{1,4}`,
    `(?:The${S})?Complete${S}(?:Collection|Series|Seasons?)|Complete(?=${S}S\\d)|Seasons?(?=${S}S\\d)|Episode${S}?\\d+(?!.*(?<![\\p{L}\\p{N}])(?:18|19|20)\\d\\d(?![\\p{L}\\p{N}]))|Cap\\.?${S}?\\d{3,4}|Batch(?=${S}?\\d)|SP\\d{1,2}|\\d{1,2}(?:st|nd|rd|th)${S}Season`,
    `tt\\d{7,9}|(?:tmdb|imdb)(?:id)?${S}?=?\\d+`,
  ].join('|'),
)
const EPISODE = token(
  `S\\d{1,3}${S}?E\\d{1,4}|S\\d{1,3}|\\d{1,2}x\\d{2,3}|Season${S}?\\d|Saison${S}?\\d|Episode${S}?\\d|E\\d{2,4}`,
)
// Marks of TV and anime numbering and bundles: " - 05 [1080p]", "+ OVA", "11/11 [Япония…]",
// "Dub[EN,ES]".
const STRONG_EXTRA =
  /(?<=[\s_])-[\s_]\d{1,4}(?:v\d)?(?=[\s_]|$|[[(])|(?<=\s)-\sVol(?:ume)?\.?\s?\d|(?<=\S\s?)\+\s?(?:OVA|OAD|ONA|SP|Specials?|Extras?|Novel|Movies?)(?![\p{L}])|(?<=\s)plus[ ._-]Extras?(?![\p{L}])|(?<=\s)\d{1,4}\s?\/\s?\d{1,4}(?=\s*\[|$)|(?<![\p{L}])(?:Dub|Sub)(?=\[)|(?<=\s)\d{1,4}-\d{1,4}(?=\s*\[)/giu
// A genre after " - " on PTN-style names ("The Deep Blue Sea - Drama 2011") ends the title before
// its year.
const GENRE =
  /(?<=\s-\s)(?:Drama|Comedy|Action|Horror|Thriller|Western|Documentary|Romance|Animation)(?=\s)/giu

// Tags that end the title before its year only when they're written as tags: in capitals (or in
// lower case in a name that has capitals), or a language followed by "dubbed" or "subs".
const TAG_WORDS = token(
  [
    'CUSTOM|PROPER|REPACK|RERIP|INTERNAL|LIMITED|MULTi|DUBBED|SUBBED|HC|KORSUB|HARDSUBS?',
    'TS|TC|CAM|SCR|WEB|PPV|INTEGRALE?|COMPLETE|UHD|4K|SBS|EXTENDED|THEATRICAL|IMAX|REMASTER(?:ED)?',
    'UNCUT|UNRATED|UNCENSORED|RESTORED',
  ].join('|'),
)
const LANGUAGE_WITH = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${LANGUAGE_MARKER.source.replace(/^\(\?<!\[\\p\{L\}\\p\{N\}\]\)/, '')})${S}?(?:Dub(?:bed)?|Subs?|Subtitles?|Audio|Language)(?![\\p{L}\\p{N}])`,
  'giu',
)
// In a name written all in lower case, "hindi movie" is a tag too ("ram teri ganga maili hindi
// movie 1985"); "A Serbian Film" is a title.
const LANGUAGE_MOVIE = new RegExp(
  `${LANGUAGE_WITH.source.replace(/\(\?:Dub\(\?:bed\)\?\|Subs\?\|Subtitles\?\|Audio\|Language\)/, '(?:movie|film)')}`,
  'giu',
)

// More tags that end a title before its year: German DL (TRaSH's German DL format), "AKA" before
// a second title, and DC in capitals right before the year ("Daredevil DC. (2003)"). Not 3D: it's
// often the title's own ("Saw 3D", "Step Up 3D").
const PRE_YEAR_MARKS = token(`German${S}DL|AKA`)
const PRE_YEAR_CAPS = /(?<![\p{L}\p{N}])DC\.?(?=[ ._]+[([]?(?:18|19|20)\d\d(?![\p{L}\p{N}]))/gu
// A second title in square brackets after the first: "Miracle.Mile.[Appel.d'urgence].1988",
// "Talk To Her [Hable Con Ella]". Square brackets aren't part of film titles.
const ALT_BRACKET = /(?<=[\p{L}\p{N}.!?'’)][ ._-]*)\[(?=[^\]]*\p{L}{2})[^\]\d]*\]/gu

// Tags that end a title with no year at all: anything that reads as a tag.
const SOFT = [
  EDITION_MARKER,
  DC_MARKER,
  LANGUAGE_MARKER,
  CODE_RUN_MARKER,
  token('PROPER|REPACK|RERIP|v[2-9]'),
  token('REAL', true),
  token(
    `HC|KORSUB(?:BED)?|HARDSUBS?|SUBBED|DUBBED|MULTi|DUAL${S}?Audio|INTERNAL|LIMITED|READNFO|CUSTOM|INTEGRALE?`,
  ),
  token('3D|4K|UHD|WEB|CAM|TS|TC|SCR|WP|PPV|COMPLETE|DOCU|NFOFIX|DIRFIX|PAL|NTSC', true),
]

// ---- Fields read from the rest of the name

// Hardcoded subtitles. HC and KORSUB are the P2P tags; SUBBED is the scene's tag for subtitles
// burned into the picture (2020 x265 rules 17.2). Radarr's "Allow Hardcoded Subs" indexer option
// (Servarr wiki, Radarr › Settings › Indexers › Options) is what consumes this.
const HARDCODED = token(
  [
    `HC(?:${S}?SUBS?)?`,
    'KORSUB(?:BED)?',
    `(?:[\\p{L}]{2,10}${S}?)?HARD${S}?SUB(?:S|BED)?`,
    `Hard${S}?coded(?:${S}Subs?)?`,
    'SUBBED',
  ].join('|'),
)
const HC_CASE = token('HC', true)

// Ids, as Radarr and Plex write them into names: tt0111161, {tmdb-278}, [tmdbid-278], tmdbid=278.
const IMDB = token('tt\\d{7,9}')
const TMDB = token(`tmdb(?:id)?${S}?=?(\\d+)`)

// ---- The release group

// Scene rules (13.5.1, 18.4.1): the group is the last part, after a hyphen. A few groups have a
// hyphen in their own name; TRaSH's tier lists spell them that way.
// Anime raw groups all end in "-Raws" (Erai-raws, Tsundere-Raws, Ohys-Raws).
const HYPHENATED_GROUPS = /-(D-Z0N3|Fight-BB|VARYG-KZ|Dread-Team|[\p{L}\p{N}]+-raws)$/iu
const GROUP = /(?:[^\s-]-\s?|\s-\s?)([\p{L}\p{N}_][\p{L}\p{N}_&@]*)$/u
// Encoders who tag inside the closing bracket: "(1080p BDRip x265 10bit EAC3 5.1 - xtrem3x)".
const PAREN_GROUP = /\s-\s([\p{L}\p{N}_][\p{L}\p{N}_&@]*)\)(?:\s*\[[^\]]*\])?$/u
const SIZE = /^\d+(?:[.,]\d+)?\s?[MG]i?B$/i
// What a trailing hyphen can hold that isn't a group: the second half of WEB-DL, Blu-Ray, DTS-HD,
// a tag, or the subtitle and voice-over words Polish and Indian names end on.
const NOT_GROUPS = new Set(
  [
    'dl rip ray hd ma x audio dub dubbed sub subs cam ts tc mux disk sbs ou web webdl webrip',
    'bluray hdtv dvd dvdrip bdrip brrip hdrip remux x264 x265 h264 h265 hevc avc xvid divx aac',
    'ac3 dts flac atmos truehd ddp dd eac3 hdr sdr dv en eng multi dual vf2 vff vostfr proper',
    'repack internal extended unrated uncut imax rerip esub esubs msub msubs napisypl napisy',
    'lektorpl dubpl hq',
  ]
    .join(' ')
    .split(' '),
)

export function parse(name: string): ParsedRelease {
  const { s, tail } = prepare(name)

  // Leading brackets: a fansub group, a site, a year, or a block of tags. A bracket holding the
  // title and its year ("[Taxi 1998]") is the title.
  let start = 0
  let leadingGroup: string | null = null
  let leadingYear: number | null = null
  let bracketEnd = s.length
  // "1966 - Le rideau déchiré", "1941-Ball.Of.Fire.720p": a collector's year prefix, when the name
  // has no other year and a title follows it.
  const prefix = /^((?:18|19|20)\d\d)(?:\s*-\s*|\.)(?=\p{L})/u.exec(s)
  if (prefix?.[1]) {
    const rest = s.slice(prefix[0].length)
    const tag = first(STRONG, rest)
    if (!new RegExp(YEAR.source, 'u').test(rest) && tag?.index !== 0) {
      leadingYear = Number(prefix[1])
      start = prefix[0].length
    }
  }
  for (let i = 0; i < 4; i++) {
    const m = LEADING.exec(s.slice(start))
    if (!m) break
    const rest = s.slice(start + m[0].length)
    if (!/[\p{L}\p{N}]/u.test(rest)) break
    const inner = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? '').trim()
    if (/^(?:18|19|20)\d\d$/.test(inner)) {
      leadingYear ??= Number(inner)
    } else if (first(STRONG, inner) || SITE_LIKE.test(inner)) {
      // tags or a site: skipped
    } else if (new RegExp(YEAR.source, 'u').test(inner)) {
      // "[Taxi 1998] [BDRemux]": the bracket is the title's; read on from inside it.
      start += m[0].indexOf(m[0].trimStart()[0] ?? '') + 1
      break
    } else if (leadingGroup !== null) {
      // "[SweetSub][Mutafukaz / MFKZ][Movie][BDRip]": after the group, a bracket of plain words
      // followed by more brackets is the title.
      if (m[1] && /^\s*\[/.test(rest) && /\p{L}/u.test(inner)) {
        const open = start + m[0].indexOf('[')
        bracketEnd = start + m[0].lastIndexOf(']')
        start = open + 1
      }
      break
    } else {
      leadingGroup = inner || null
    }
    start += m[0].length
  }

  // The title ends at the year, or at the first tag before it.
  const strong = earliest([
    firstAfter(STRONG, s, start),
    firstAfter(STRONG_EXTRA, s, start),
    firstAfter(YEAR_RANGE, s, start),
    firstAfter(DATE, s, start),
  ])
  const preYearTag = earliest([
    firstTagLike(TAG_WORDS, s, start),
    firstTagLike(LANGUAGE_MARKER, s, start),
    firstAfter(LANGUAGE_WITH, s, start),
    firstAfter(LANGUAGE_PAIR_MARKER, s, start),
    firstAfter(PRE_YEAR_MARKS, s, start),
    firstAfter(PRE_YEAR_CAPS, s, start),
    firstAfter(ALT_BRACKET, s, start),
    /\p{Lu}/u.test(s) ? null : firstAfter(LANGUAGE_MOVIE, s, start),
    firstAfter(PRE_YEAR_EDITION, s, start),
    firstAfter(GENRE, s, start),
  ])
  const firstTag = Math.min(strong?.index ?? s.length, preYearTag?.index ?? s.length, bracketEnd)
  const year = chooseYear(s, start, strong?.index ?? s.length)

  let titleEnd: number
  if (year && year.index < firstTag) {
    titleEnd = year.index
  } else {
    titleEnd = firstTag
    for (const re of SOFT) {
      const hit = firstAfter(re, s, start)
      if (hit && hit.index < titleEnd && softEnds(re, hit, s)) titleEnd = hit.index
    }
    // A last bracket after the title with nothing else to place it: "… Tokyo Drift [CR-Bt]".
    const last = LAST_BRACKET.exec(s)
    if (last && last.index > start && last.index < titleEnd) titleEnd = last.index
  }
  const title = cleanTitle(s.slice(start, titleEnd))

  // Everything else comes from the name with the title blanked out, up to the group.
  const group = readGroup(s, titleEnd)
  // Sites in brackets ("[wWw.EliteTorrent.NL]") are blanked too: their domains read as languages.
  const rest = (s.slice(0, start) + ' '.repeat(titleEnd - start) + s.slice(titleEnd))
    .slice(0, group ? group.index : s.length)
    .replace(SITE_BLOCK, (m) => ' '.repeat(m.length))

  const q = readQuality(rest)
  const quality: ParsedQuality = {
    source: q.source,
    resolution: q.resolution,
    modifier: q.modifier,
    revision: q.revision,
  }
  const langs = readLanguages(rest)

  return {
    name,
    title,
    year: year ? Number(year.text) : leadingYear,
    // A trailing bracket after the group can still name the edition: "x264-Pop (Director's Cut)".
    edition: readEdition(tail ? `${rest} ${tail}` : rest),
    quality,
    languages: langs.languages,
    multi: langs.multi,
    subtitles: langs.subtitles,
    releaseGroup: group?.name ?? leadingGroup,
    hardcodedSubs: readHardcoded(rest),
    ids: readIds(s),
    codec: q.codec,
    hdr: q.hdr,
    threeD: q.threeD,
  }
}

/** The quality alone, for names already known to be about a given movie. */
export function parseQuality(name: string): ParsedQuality {
  return parse(name).quality
}

/** The languages alone (ISO 639-1), with whether the name says MULTi. */
export function parseLanguages(name: string): { languages: string[]; multi: boolean } {
  const { languages, multi } = parse(name)
  return { languages, multi }
}

function prepare(name: string): { s: string; tail: string } {
  let s = name.trim()
  // Twice, for names saved with the extension doubled ("….mkv.mkv").
  for (let i = 0; i < 2; i++)
    if (!/\.TS$/.test(s) || TS_EXTENSION.test(s)) s = s.replace(EXTENSION, '')
  s = s.replace(SITE_PREFIX, '')
  for (let i = 0; i < 2; i++) s = s.replace(TRAILING_TAG, '')
  // Trailing dots and a trademark sign aren't part of the group: "-AZAZE..", "-TAD™".
  s = s.replace(/[\s.™]+$/u, '')
  let tail = ''
  const paren = TRAILING_PAREN.exec(s)
  if (
    paren &&
    first(STRONG, s.slice(0, paren.index)) &&
    !first(STRONG, paren[0]) &&
    !/dual|multi|subs?\b|audio/i.test(paren[0])
  ) {
    tail = paren[0]
    s = s.slice(0, paren.index)
  }
  s = s.replace(TRAILING_SITE, '').trimEnd()
  while (POSTER_SUFFIX.test(s)) s = s.replace(POSTER_SUFFIX, '')
  return { s, tail }
}

function earliest(hits: (Hit | null)[]): Hit | null {
  let best: Hit | null = null
  for (const h of hits) if (h && (!best || h.index < best.index)) best = h
  return best
}

function firstAfter(re: RegExp, s: string, start: number): Hit | null {
  let hit = first(re, s, start)
  // A tag at the very start isn't the end of a title (the name starts with it: "Uncut Gems").
  while (hit && hit.index <= start) hit = first(re, s, hit.end)
  return hit
}

/** The first hit written as a tag: in capitals in a name with lower case, or the reverse. */
function firstTagLike(re: RegExp, s: string, start: number): Hit | null {
  const hasLower = /\p{Ll}/u.test(s)
  const hasUpper = /\p{Lu}/u.test(s)
  for (let hit = firstAfter(re, s, start); hit; hit = first(re, s, hit.end)) {
    // A title written in capitals ("THE ITALIAN JOB 2003 1080p BluRay") has no tags in it.
    const before = s.slice(start, hit.index)
    if (hasLower && shouty(hit.text) && !shouty(before)) return hit
    if (hasUpper && !/\p{Lu}/u.test(hit.text) && /\p{Lu}/u.test(before)) return hit
  }
  return null
}

/** Soft tags end a title; a language name only when it's written as a tag. */
function softEnds(re: RegExp, hit: Hit, s: string): boolean {
  if (re !== LANGUAGE_MARKER) return true
  return shouty(hit.text) || !/\p{Ll}/u.test(s) || !/\p{Lu}/u.test(hit.text)
}

/**
 * The film's year: the last year before the first tag, so "Blade Runner 2049 2017 1080p" is 2017
 * and its title keeps 2049. A year the name starts with is the title ("1917 2019", "2012 2009"):
 * scene names put the year after the title (rule 18.4.1). Failing that, the first year after the
 * tags ("Guardians of the Galaxy (CamRip / 2014)").
 */
function chooseYear(s: string, start: number, firstTag: number): Hit | null {
  const years: Hit[] = []
  const ranges: [number, number][] = []
  YEAR_RANGE.lastIndex = start
  for (let m = YEAR_RANGE.exec(s); m; m = YEAR_RANGE.exec(s)) {
    ranges.push([m.index, m.index + m[0].length])
  }
  DATE.lastIndex = start
  for (let m = DATE.exec(s); m; m = DATE.exec(s)) ranges.push([m.index, m.index + m[0].length])
  // Nor is a year inside a tag: "S2019E05", "Cap.1905".
  for (const t of all(STRONG, s, start)) ranges.push([t.index + 1, t.end])
  YEAR.lastIndex = start
  for (let m = YEAR.exec(s); m; m = YEAR.exec(s)) {
    if (ranges.some(([a, b]) => m.index >= a && m.index < b)) continue
    years.push({ index: m.index, end: m.index + m[0].length, text: m[0] })
  }
  const before = years.filter((y) => y.index < firstTag && y.index > start)
  const last = before[before.length - 1]
  if (last) return last
  // A year after the tags: P2P names put it there ("Argo [1080p] MULTi 2012 BluRay"). Only for a
  // film, though: after an episode tag, a year is an air date or the show's.
  const episode = first(EPISODE, s, start)
  return years.find((y) => y.index >= firstTag && (delimited(s, y.index) || !episode)) ?? null
}

/** Inside brackets, or between pipes: "(CamRip / 2014)", "| 1959 |". */
function delimited(s: string, i: number): boolean {
  return inBrackets(s, i) || /\|\s*$/.test(s.slice(0, i))
}

function inBrackets(s: string, i: number): boolean {
  let depth = 0
  for (let j = 0; j < i; j++) {
    if ('([{'.includes(s[j] as string)) depth++
    else if (')]}'.includes(s[j] as string)) depth = Math.max(0, depth - 1)
  }
  return depth > 0
}

function readGroup(s: string, titleEnd: number): { name: string; index: number } | null {
  const hyphenated = HYPHENATED_GROUPS.exec(s)
  if (hyphenated?.[1] && hyphenated.index >= titleEnd) {
    return { name: hyphenated[1], index: hyphenated.index }
  }
  const m = GROUP.exec(s) ?? PAREN_GROUP.exec(s)
  if (!m?.[1]) return null
  const name = m[1]
  const index = s.lastIndexOf('-', m.index + m[0].length - m[1].length)
  if (index < titleEnd) return null
  if (NOT_GROUPS.has(name.toLowerCase())) return null
  if (/^\d+$/.test(name) || /^\d{3,4}[pi]$/i.test(name) || SIZE.test(name)) return null
  if (languageCode(name) && name.length > 3) return null
  // Group names are ASCII (scene rules 13.5.1), and a tag isn't one: " - S02E03", " - OVA".
  if (/[^\x20-\x7e]/.test(name)) return null
  // mHD is a tag in that spelling; MHD in capitals is the scene group of that name.
  const tag = name === 'MHD' ? null : first(STRONG, name)
  if (
    (tag && tag.index === 0 && tag.end === name.length) ||
    /^(?:OVA|OAD|ONA|SP\d*)$/i.test(name)
  ) {
    return null
  }
  return { name, index }
}

function readHardcoded(s: string): string | null {
  const hit = first(HARDCODED, s)
  if (!hit) return null
  // "HC" is too common a pair of letters to read in lower case.
  if (/^hc$/i.test(hit.text) && !first(HC_CASE, s)) return null
  return words(hit.text)
}

function readIds(s: string): ParsedRelease['ids'] {
  const imdb = first(IMDB, s)
  TMDB.lastIndex = 0
  const tmdb = TMDB.exec(s)
  return {
    imdb: imdb ? imdb.text.toLowerCase() : null,
    tmdb: tmdb?.[1] ? Number(tmdb[1]) : null,
  }
}

// SPDX-License-Identifier: AGPL-3.0-only
// Profile languages (judgement call 5): ISO 639-1 codes, plus `pt-BR`, `zh-Hans` and `zh-Hant`,
// which OpenSubtitles.com also tells apart. ffprobe reports a stream's language as Matroska stores
// it, ISO 639-2 (`eng`, and `fre` or `fra`), so each code carries its 639-2 bibliographic and
// terminology forms from the Library of Congress list
// (https://www.loc.gov/standards/iso639-2/php/code_list.php). Names come from `Intl.DisplayNames`.
import { languageCode } from '@highsea/parser'

/** `639-1:639-2/B[/639-2/T]`, from the Library of Congress list; `bh` is withdrawn and left out. */
const TABLE =
  'aa:aar ab:abk ae:ave af:afr ak:aka am:amh an:arg ar:ara as:asm av:ava ay:aym az:aze ba:bak ' +
  'be:bel bg:bul bi:bis bm:bam bn:ben bo:tib/bod br:bre bs:bos ca:cat ce:che ch:cha co:cos cr:cre ' +
  'cs:cze/ces cu:chu cv:chv cy:wel/cym da:dan de:ger/deu dv:div dz:dzo ee:ewe el:gre/ell en:eng ' +
  'eo:epo es:spa et:est eu:baq/eus fa:per/fas ff:ful fi:fin fj:fij fo:fao fr:fre/fra fy:fry ga:gle ' +
  'gd:gla gl:glg gn:grn gu:guj gv:glv ha:hau he:heb hi:hin ho:hmo hr:hrv ht:hat hu:hun hy:arm/hye ' +
  'hz:her ia:ina id:ind ie:ile ig:ibo ii:iii ik:ipk io:ido is:ice/isl it:ita iu:iku ja:jpn jv:jav ' +
  'ka:geo/kat kg:kon ki:kik kj:kua kk:kaz kl:kal km:khm kn:kan ko:kor kr:kau ks:kas ku:kur kv:kom ' +
  'kw:cor ky:kir la:lat lb:ltz lg:lug li:lim ln:lin lo:lao lt:lit lu:lub lv:lav mg:mlg mh:mah ' +
  'mi:mao/mri mk:mac/mkd ml:mal mn:mon mr:mar ms:may/msa mt:mlt my:bur/mya na:nau nb:nob nd:nde ' +
  'ne:nep ng:ndo nl:dut/nld nn:nno no:nor nr:nbl nv:nav ny:nya oc:oci oj:oji om:orm or:ori os:oss ' +
  'pa:pan pi:pli pl:pol ps:pus pt:por qu:que rm:roh rn:run ro:rum/ron ru:rus rw:kin sa:san sc:srd ' +
  'sd:snd se:sme sg:sag si:sin sk:slo/slk sl:slv sm:smo sn:sna so:som sq:alb/sqi sr:srp ss:ssw ' +
  'st:sot su:sun sv:swe sw:swa ta:tam te:tel tg:tgk th:tha ti:tir tk:tuk tl:tgl tn:tsn to:ton ' +
  'tr:tur ts:tso tt:tat tw:twi ty:tah ug:uig uk:ukr ur:urd uz:uzb ve:ven vi:vie vo:vol wa:wln ' +
  'wo:wol xh:xho yi:yid yo:yor za:zha zh:chi/zho zu:zul'

/** The regional codes a profile may use, beside ISO 639-1, and the base language each refines. */
export const REGIONAL: Record<string, string> = { 'pt-BR': 'pt', 'zh-Hans': 'zh', 'zh-Hant': 'zh' }

const BY_THREE = new Map<string, string>()
const ONE = new Set<string>()
for (const entry of TABLE.split(' ')) {
  const [one, three] = entry.split(':') as [string, string]
  ONE.add(one)
  for (const code of three.split('/')) BY_THREE.set(code, one)
}
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
  if (lower.length === 3) return BY_THREE.get(lower) ?? null
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

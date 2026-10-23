// SPDX-License-Identifier: AGPL-3.0-only
// ISO 639-1 codes and their ISO 639-2 bibliographic and terminology forms, from the Library of
// Congress list (https://www.loc.gov/standards/iso639-2/php/code_list.php). ffprobe reports a
// stream's language as the container stores it, ISO 639-2 (`eng`, and `fre` or `fra`); highsea
// stores ISO 639-1, as TMDB gives a movie's `original_language`. `bh` is withdrawn and left out.

/** `639-1:639-2/B[/639-2/T]`. */
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

const BY_THREE = new Map<string, string>()
const ONE = new Set<string>()
for (const entry of TABLE.split(' ')) {
  const [one, three] = entry.split(':') as [string, string]
  ONE.add(one)
  for (const code of three.split('/')) BY_THREE.set(code, one)
}

/** Every ISO 639-1 code. */
export const ISO_639_1: ReadonlySet<string> = ONE

/** The ISO 639-1 code for an ISO 639-2 code (B or T, lower case), or `undefined`. */
export const iso6391Of = (three: string): string | undefined => BY_THREE.get(three)

/**
 * ISO 639-1 for a stream's language tag: 639-1 or 639-2 in any case, or an IETF tag (`en-US`)'s
 * language. `null` for `und`, `zxx`, `mis` and anything else.
 */
export function streamLanguage(tag: string | null | undefined): string | null {
  if (!tag) return null
  const lower = tag.trim().toLowerCase().replace(/_/g, '-')
  const base = /^([a-z]{2,3})(?:-[a-z0-9]{2,8})*$/.exec(lower)?.[1]
  if (!base) return null
  if (base.length === 2) return ONE.has(base) ? base : null
  return BY_THREE.get(base) ?? null
}

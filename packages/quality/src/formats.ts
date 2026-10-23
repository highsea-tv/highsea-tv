// SPDX-License-Identifier: AGPL-3.0-only
// Custom formats: named sets of conditions a release matches or doesn't, each scored by the
// profile. The kinds and the matching rule follow the Servarr wiki's "Custom Format Conditions"
// (https://wiki.servarr.com/radarr/settings#custom-format-conditions):
// - conditions of the same kind are alternatives, and different kinds must all hold;
// - a required condition must hold on its own, whatever the others of its kind do;
// - negate inverts a condition;
// - regular expressions are case-insensitive.
// Written from that page, not from Radarr's code (ADR 0031).
import type { ParsedRelease } from '@highsea-tv/parser'
import { z } from 'zod'
import { languageName, type QualityT, qualityT } from './messages.ts'

export const SOURCES = [
  'unknown',
  'cam',
  'telesync',
  'telecine',
  'workprint',
  'dvd',
  'tv',
  'webdl',
  'webrip',
  'bluray',
] as const
export const MODIFIERS = ['none', 'regional', 'screener', 'rawhd', 'brdisk', 'remux'] as const
export const RESOLUTIONS = [360, 480, 540, 576, 720, 1080, 2160] as const

/** The indexer flags the Servarr wiki lists (Indexers › Indexer Flags), plus Internal. */
export const INDEXER_FLAGS = [
  'freeleech',
  'halfleech',
  'doubleUpload',
  'golden',
  'approved',
  'internal',
  'scene',
  'freeleech75',
  'freeleech25',
] as const
export type IndexerFlag = (typeof INDEXER_FLAGS)[number]

export const CONDITION_KINDS = [
  'title',
  'edition',
  'releaseGroup',
  'language',
  'indexerFlag',
  'source',
  'resolution',
  'modifier',
  'size',
  'year',
] as const
export type ConditionKind = (typeof CONDITION_KINDS)[number]

const base = {
  /** What the condition is called, as TRaSH names its specifications ("DV", "Not 2160p"). */
  name: z.string().max(200).default(''),
  negate: z.boolean().default(false),
  required: z.boolean().default(false),
}
const range = z.object({ min: z.number().min(0), max: z.number().min(0) })

/** `'original'` is the movie's original language; anything else an ISO 639-1 code. */
export const languageCodeSchema = z.union([z.literal('original'), z.string().regex(/^[a-z]{2}$/)])

export const conditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('title'), value: z.string().min(1).max(4000), ...base }),
  z.object({ kind: z.literal('edition'), value: z.string().min(1).max(4000), ...base }),
  z.object({ kind: z.literal('releaseGroup'), value: z.string().min(1).max(4000), ...base }),
  z.object({
    kind: z.literal('language'),
    /** `except`: matches a release in any language but this one (TRaSH's `exceptLanguage`). */
    value: z.object({ language: languageCodeSchema, except: z.boolean().default(false) }),
    ...base,
  }),
  z.object({ kind: z.literal('indexerFlag'), value: z.enum(INDEXER_FLAGS), ...base }),
  z.object({ kind: z.literal('source'), value: z.enum(SOURCES), ...base }),
  z.object({
    kind: z.literal('resolution'),
    value: z.literal(RESOLUTIONS),
    ...base,
  }),
  z.object({ kind: z.literal('modifier'), value: z.enum(MODIFIERS), ...base }),
  /** In GiB, as Radarr converts the release size "to gigabytes". Both ends included. */
  z.object({ kind: z.literal('size'), value: range, ...base }),
  /** Both ends included. */
  z.object({ kind: z.literal('year'), value: range, ...base }),
])
export type Condition = z.infer<typeof conditionSchema>
export type ConditionInput = z.input<typeof conditionSchema>

export const customFormatSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  /** `preset` came from the catalog (TRaSH); `custom` is the owner's own. */
  source: z.enum(['preset', 'custom']),
  /** The TRaSH Guides' id, for presets, so an update can find the format it came from. */
  trashId: z.string().nullable().default(null),
  conditions: z.array(conditionSchema),
})
export type CustomFormat = z.infer<typeof customFormatSchema>

/** What formats are matched against: the parsed name plus the facts that aren't in it. */
export type FormatInput = {
  release: ParsedRelease
  /** Bytes; `null` when unknown, and then a size condition doesn't hold. */
  size?: number | null
  /** From the indexer, from checkpoint 5. */
  indexerFlags?: readonly IndexerFlag[]
  /** The movie's original language, for `original` conditions and MULTi names. */
  originalLanguage?: string | null
  /** What MULTi means on the release's indexer, from checkpoint 5. */
  multiLanguages?: readonly string[]
}

/**
 * The languages a release is in:
 * - the ones its name tags;
 * - with MULTi, also the movie's original language and the indexer's "Multi Languages", as Radarr
 *   reads it since v4.1 (Servarr wiki, Radarr FAQ › How does Radarr handle "multi" in names);
 * - English when the name tags none and isn't MULTi, since scene names tag a language only when
 *   it isn't English.
 */
export function releaseLanguages(
  release: ParsedRelease,
  context: { originalLanguage?: string | null; multiLanguages?: readonly string[] } = {},
): string[] {
  if (!release.multi) return release.languages.length > 0 ? release.languages : ['en']
  const extra = [context.originalLanguage, ...(context.multiLanguages ?? [])]
  return [...new Set([...release.languages, ...extra.filter((l): l is string => !!l)])]
}

// Regexes compile once per condition. An invalid one is `null`: its condition never holds, even
// negated, and `validateFormat` reports it.
const compiled = new WeakMap<object, RegExp | null>()
function regexOf(c: { value: string }): RegExp | null {
  let re = compiled.get(c)
  if (re === undefined) {
    try {
      re = new RegExp(c.value, 'i')
    } catch {
      re = null
    }
    compiled.set(c, re)
  }
  return re
}

const GIB = 1024 ** 3

/** Whether the condition's test holds, before `negate`; `null` when it can't be evaluated. */
function test(c: Condition, input: FormatInput): boolean | null {
  const r = input.release
  switch (c.kind) {
    case 'title':
    case 'edition':
    case 'releaseGroup': {
      const re = regexOf(c)
      if (!re) return null
      const subject =
        c.kind === 'title' ? r.name : c.kind === 'edition' ? r.edition : r.releaseGroup
      return subject !== null && re.test(subject)
    }
    case 'language': {
      const wanted = c.value.language === 'original' ? input.originalLanguage : c.value.language
      if (!wanted) return false
      const langs = releaseLanguages(r, input)
      return c.value.except ? langs.some((l) => l !== wanted) : langs.includes(wanted)
    }
    case 'indexerFlag':
      return (input.indexerFlags ?? []).includes(c.value)
    case 'source':
      return r.quality.source === c.value
    case 'resolution':
      return r.quality.resolution === c.value
    case 'modifier':
      return r.quality.modifier === c.value
    case 'size': {
      if (input.size == null) return false
      const gib = input.size / GIB
      return gib >= c.value.min && gib <= c.value.max
    }
    case 'year':
      return r.year !== null && r.year >= c.value.min && r.year <= c.value.max
  }
}

/** Whether one condition holds, with `negate` applied. An invalid regex never holds. */
export function conditionHolds(c: Condition, input: FormatInput): boolean {
  const t = test(c, input)
  if (t === null) return false
  return c.negate ? !t : t
}

/** Whether a release matches a format. A format without conditions matches nothing. */
export function matchesFormat(format: CustomFormat, input: FormatInput): boolean {
  if (format.conditions.length === 0) return false
  const byKind = new Map<ConditionKind, Condition[]>()
  for (const c of format.conditions) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c])
  for (const group of byKind.values()) {
    const holds = group.map((c) => conditionHolds(c, input))
    if (group.some((c, i) => c.required && !holds[i])) return false
    if (!holds.some(Boolean)) return false
  }
  return true
}

/** The formats a release matches, in the order given. */
export const matchingFormats = (formats: readonly CustomFormat[], input: FormatInput) =>
  formats.filter((f) => matchesFormat(f, input))

export type FormatIssue = { condition: number | null; message: string }

/** What's wrong with a format: invalid regexes, upside-down ranges, no conditions at all. */
export function validateFormat(format: CustomFormat, t: QualityT = qualityT()): FormatIssue[] {
  const issues: FormatIssue[] = []
  if (format.conditions.length === 0) issues.push({ condition: null, message: t('invalid.empty') })
  format.conditions.forEach((c, i) => {
    if ((c.kind === 'title' || c.kind === 'edition' || c.kind === 'releaseGroup') && !regexOf(c))
      issues.push({ condition: i, message: t('invalid.regex', { value: c.value }) })
    if ((c.kind === 'size' || c.kind === 'year') && c.value.min > c.value.max)
      issues.push({ condition: i, message: t('invalid.range') })
  })
  return issues
}

const SOURCE_LABELS: Record<(typeof SOURCES)[number], string> = {
  unknown: 'Unknown',
  cam: 'CAM',
  telesync: 'TELESYNC',
  telecine: 'TELECINE',
  workprint: 'WORKPRINT',
  dvd: 'DVD',
  tv: 'TV',
  webdl: 'WEB-DL',
  webrip: 'WEBRip',
  bluray: 'Blu-ray',
}
const MODIFIER_LABELS: Record<(typeof MODIFIERS)[number], string> = {
  none: 'none',
  regional: 'Regional',
  screener: 'Screener',
  rawhd: 'Raw HD',
  brdisk: 'BR-DISK',
  remux: 'Remux',
}

/** One condition in a line: "Title matches \b(dv|dovi)\b", "Not: Resolution is 2160p". */
export function describeCondition(c: Condition, locale = 'en', t = qualityT(locale)): string {
  let s: string
  switch (c.kind) {
    case 'title':
    case 'edition':
    case 'releaseGroup':
      s = t(`condition.${c.kind}`, { value: c.value })
      break
    case 'language': {
      const language =
        c.value.language === 'original'
          ? t('condition.original')
          : languageName(c.value.language, locale)
      s = t(c.value.except ? 'condition.languageExcept' : 'condition.language', { language })
      break
    }
    case 'indexerFlag':
      s = t('condition.indexerFlag', { flag: c.value })
      break
    case 'source':
      s = t('condition.source', { source: SOURCE_LABELS[c.value] })
      break
    case 'resolution':
      s = t('condition.resolution', { resolution: c.value })
      break
    case 'modifier':
      s = t('condition.modifier', { modifier: MODIFIER_LABELS[c.value] })
      break
    case 'size':
    case 'year':
      s = t(`condition.${c.kind}`, { min: c.value.min, max: c.value.max })
      break
  }
  if (c.negate) s = t('condition.negated', { condition: s })
  return c.required ? t('condition.required', { condition: s }) : s
}

/**
 * A format in a few lines, for the formats table. A long list of alternatives of one kind (TRaSH's
 * low-quality groups list a hundred) reads as one line with its count.
 */
export function describeFormat(format: CustomFormat, locale = 'en'): string[] {
  const t = qualityT(locale)
  const lines: string[] = []
  for (const kind of CONDITION_KINDS) {
    const group = format.conditions.filter((c) => c.kind === kind)
    const optional = group.filter((c) => !c.required && !c.negate)
    const pattern = kind === 'title' || kind === 'edition' || kind === 'releaseGroup'
    if (pattern && optional.length > 3) {
      for (const c of group.filter((c) => !optional.includes(c)))
        lines.push(describeCondition(c, locale, t))
      lines.push(t('condition.anyOf', { kind: t(`kind.${kind}`), count: optional.length }))
    } else for (const c of group) lines.push(describeCondition(c, locale, t))
  }
  return lines
}

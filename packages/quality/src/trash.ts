// SPDX-License-Identifier: AGPL-3.0-only
// TRaSH Guides custom formats (MIT, https://github.com/TRaSH-Guides/Guides, docs/json/radarr/cf)
// into highsea's condition model. A TRaSH format is Radarr's export shape: `specifications`, each
// with an `implementation`, `negate`, `required` and `fields.value`. Numbers in `fields.value` are
// Radarr API enum values: sources and modifiers count up from the API's enum order
// (unknown, cam, … bluray; none, regional, … remux), which the presets' own names confirm
// ("5 DVD", "9 BLURAY", "5 Remux"); languages and indexer flags are the ids the presets use.
import { z } from 'zod'
import {
  type Condition,
  type CustomFormat,
  type IndexerFlag,
  MODIFIERS,
  RESOLUTIONS,
  SOURCES,
} from './formats.ts'

const specificationSchema = z.object({
  name: z.string().default(''),
  implementation: z.string(),
  negate: z.boolean().default(false),
  required: z.boolean().default(false),
  fields: z.record(z.string(), z.unknown()),
})

export const trashFormatSchema = z.object({
  trash_id: z.string().min(1),
  name: z.string().min(1),
  /** TRaSH's suggested scores, by profile set; `default` is the one most profiles use. */
  trash_scores: z.record(z.string(), z.number()).optional(),
  specifications: z.array(specificationSchema),
})
export type TrashFormat = z.infer<typeof trashFormatSchema>

/**
 * Radarr's language ids that TRaSH's presets use, each confirmed by the preset's own name
 * ("1 English", "21 Korean Language"); `-2` is the movie's original language. Others are skipped.
 */
const LANGUAGES: Record<number, string> = {
  [-2]: 'original',
  1: 'en',
  2: 'fr',
  4: 'de',
  8: 'ja',
  10: 'zh',
  21: 'ko',
}

/** Radarr's indexer flag bits that TRaSH's presets use. */
const FLAGS: Record<number, IndexerFlag> = { 1: 'freeleech', 32: 'internal' }

const REGEX_KINDS = {
  ReleaseTitleSpecification: 'title',
  EditionSpecification: 'edition',
  ReleaseGroupSpecification: 'releaseGroup',
} as const

export type SkippedSpecification = { name: string; implementation: string; reason: string }

export type TrashImport = {
  format: CustomFormat
  /** Specifications highsea can't express, left out. A format missing any may match differently. */
  skipped: SkippedSpecification[]
  /** TRaSH's default score, for a profile that adopts the format. */
  defaultScore: number | null
}

type Spec = z.infer<typeof specificationSchema>

function conditionOf(spec: Spec): Condition | string {
  const flags = { name: spec.name, negate: spec.negate, required: spec.required }
  const value = spec.fields.value
  const regexKind = REGEX_KINDS[spec.implementation as keyof typeof REGEX_KINDS]
  if (regexKind) {
    if (typeof value !== 'string' || value === '') return 'The pattern is missing'
    return { kind: regexKind, value, ...flags }
  }
  const n = typeof value === 'number' ? value : Number(value)
  switch (spec.implementation) {
    case 'LanguageSpecification': {
      const language = LANGUAGES[n]
      if (!language) return `Language ${String(value)} isn’t one highsea knows`
      return {
        kind: 'language',
        value: { language, except: spec.fields.exceptLanguage === true },
        ...flags,
      }
    }
    case 'IndexerFlagSpecification': {
      const flag = FLAGS[n]
      return flag ? { kind: 'indexerFlag', value: flag, ...flags } : `Flag ${String(value)}`
    }
    case 'SourceSpecification': {
      const source = SOURCES[n]
      return source ? { kind: 'source', value: source, ...flags } : `Source ${String(value)}`
    }
    case 'QualityModifierSpecification': {
      const modifier = MODIFIERS[n]
      return modifier ? { kind: 'modifier', value: modifier, ...flags } : `Modifier ${value}`
    }
    case 'ResolutionSpecification': {
      const r = RESOLUTIONS.find((x) => x === n)
      return r ? { kind: 'resolution', value: r, ...flags } : `Resolution ${String(value)}`
    }
    case 'SizeSpecification':
    case 'YearSpecification': {
      const min = Number(spec.fields.min ?? 0)
      const max = Number(spec.fields.max ?? 0)
      if (!Number.isFinite(min) || !Number.isFinite(max)) return 'The range isn’t numbers'
      const kind = spec.implementation === 'SizeSpecification' ? 'size' : 'year'
      return { kind, value: { min, max }, ...flags }
    }
    default:
      return `${spec.implementation} isn’t a condition highsea has`
  }
}

/**
 * A TRaSH custom format as a highsea preset. Throws a ZodError when `json` isn't TRaSH's shape.
 * `id` defaults to `trash-{trash_id}`.
 */
export function importTrashFormat(json: unknown, options: { id?: string } = {}): TrashImport {
  const trash = trashFormatSchema.parse(json)
  const conditions: Condition[] = []
  const skipped: SkippedSpecification[] = []
  for (const spec of trash.specifications) {
    const c = conditionOf(spec)
    if (typeof c === 'string')
      skipped.push({ name: spec.name, implementation: spec.implementation, reason: c })
    else conditions.push(c)
  }
  return {
    format: {
      id: options.id ?? `trash-${trash.trash_id}`,
      name: trash.name,
      source: 'preset',
      trashId: trash.trash_id,
      conditions,
    },
    skipped,
    defaultScore: trash.trash_scores?.default ?? null,
  }
}

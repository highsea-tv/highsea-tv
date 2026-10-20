// SPDX-License-Identifier: AGPL-3.0-only
// The decision engine: a parsed release and its context in, `{ approved, reasons }` out, in the
// prototype's `DecisionReason` shape. Each rule is a specification in a registry, run in order;
// a release is approved when none rejects it. The rules are written from the Servarr wiki's
// profile, quality and custom format pages, not from Radarr's code (ADR 0031).
//
// Later checkpoints fill the named slots (seeders, minimum age, blocked indexer, already queued,
// already imported, blocklisted) with `withSpecification`, once they have the facts.
import { bytes, duration } from '@highsea/core/format'
import type { ParsedRelease, Revision } from '@highsea/parser'
import {
  type CustomFormat,
  type FormatInput,
  type IndexerFlag,
  matchesFormat,
  releaseLanguages,
} from './formats.ts'
import { languageName, type QualityT, qualityT } from './messages.ts'
import { isAllowed, meetsCutoff, preference, profileItem, type QualityProfile } from './profiles.ts'
import { type QualityName, qualityOf } from './qualities.ts'
import { compareRevisions } from './ranking.ts'
import { type QualitySize, sizeLimits } from './sizes.ts'

export type DecisionReason = { kind: 'accepted' | 'rejected' | 'warning'; message: string }

export type MovieFacts = {
  title: string
  year: number | null
  /** `null` or 0 when unknown: sizes then assume 110 minutes. */
  runtimeMinutes: number | null
  /** ISO 639-1. */
  originalLanguage: string | null
}

/** The version's current file, if it has one. */
export type ExistingFile = { quality: QualityName; revision: Revision; formatScore: number }

/** What the indexer says about the release. Checkpoint 5 provides it. */
export type IndexerFacts = {
  indexerId?: string
  protocol?: 'torrent' | 'usenet'
  flags?: IndexerFlag[]
  /** What MULTi means on this indexer (its "Multi Languages" setting), as ISO 639-1 codes. */
  multiLanguages?: string[]
  seeders?: number | null
  /** Since the indexer published it. */
  ageMinutes?: number | null
  /** The indexer's name, for the reasons. */
  indexerName?: string
  /** A torrent with fewer seeders is rejected; unset or null checks nothing. */
  minimumSeeders?: number | null
  /** A Usenet release younger than this is rejected (Radarr's Minimum Age); unset checks nothing. */
  minimumAgeMinutes?: number | null
  /** Set while the indexer can't be used (it's failing): its releases are rejected. */
  blocked?: boolean
}

export type DecisionInput = {
  release: ParsedRelease
  /** Bytes; `null` when unknown, which skips the size checks. */
  size: number | null
  movie: MovieFacts
  /** The version's profile. */
  profile: QualityProfile
  /** Every custom format; the profile scores the ones it names, the rest score 0. */
  formats: readonly CustomFormat[]
  sizes: readonly QualitySize[]
  existing?: ExistingFile | null
  indexer?: IndexerFacts | null
}

export type MatchedFormat = { id: string; name: string; score: number }

export type Decision = {
  approved: boolean
  reasons: DecisionReason[]
  quality: QualityName
  /** The formats the release matches, with the profile's score for each. */
  formats: MatchedFormat[]
  formatScore: number
}

/** What a specification sees: the input plus what the engine worked out once. */
export type Evaluation = DecisionInput & {
  quality: QualityName
  formats: readonly CustomFormat[]
  matched: MatchedFormat[]
  formatScore: number
  /** The release's languages, as `releaseLanguages` reads them. */
  languages: string[]
  locale: string
  t: QualityT
}

export type Specification = {
  id: string
  evaluate: (e: Evaluation) => DecisionReason[]
}

/** The formats a release matches and the profile's total score for them. */
export function scoreFormats(
  profile: Pick<QualityProfile, 'formats'>,
  formats: readonly CustomFormat[],
  input: FormatInput,
): { formats: MatchedFormat[]; formatScore: number } {
  const scores = new Map(profile.formats.map((f) => [f.formatId, f.score]))
  const matched = formats
    .filter((f) => matchesFormat(f, input))
    .map((f) => ({ id: f.id, name: f.name, score: scores.get(f.id) ?? 0 }))
  return { formats: matched, formatScore: matched.reduce((s, f) => s + f.score, 0) }
}

const accepted = (message: string): DecisionReason => ({ kind: 'accepted', message })
const rejected = (message: string): DecisionReason => ({ kind: 'rejected', message })
const warning = (message: string): DecisionReason => ({ kind: 'warning', message })

const qualitySpec: Specification = {
  id: 'quality',
  evaluate: ({ profile, quality, t }) => {
    if (!isAllowed(profile, quality))
      return [rejected(t('quality.notAllowed', { quality, profile: profile.name }))]
    const target = profileItem(profile, quality)?.item.name === profile.cutoff
    return [accepted(t(target ? 'quality.target' : 'quality.allowed', { quality }))]
  },
}

const sizeSpec: Specification = {
  id: 'size',
  evaluate: ({ size, sizes, quality, movie, locale, t }) => {
    if (!size) return []
    const limits = sizeLimits(sizes, quality, movie.runtimeMinutes)
    const length = duration(limits.minutes * 60, locale)
    const runtime = limits.assumed ? t('size.runtimeAssumed', { runtime: length }) : length
    if (limits.max !== null && size > limits.max)
      return [
        rejected(t('size.tooLarge', { size: bytes(size), limit: bytes(limits.max), runtime })),
      ]
    if (size < limits.min)
      return [
        rejected(t('size.tooSmall', { size: bytes(size), limit: bytes(limits.min), runtime })),
      ]
    return []
  },
}

const formatScoreSpec: Specification = {
  id: 'formatScore',
  evaluate: ({ matched, formatScore, profile, t }) => {
    const reasons = matched
      .filter((f) => f.score !== 0)
      .map((f) =>
        (f.score > 0 ? accepted : warning)(t('format.score', { format: f.name, score: f.score })),
      )
    if (formatScore < profile.minFormatScore)
      reasons.push(
        rejected(
          t('format.belowMinimum', {
            score: String(formatScore),
            minimum: String(profile.minFormatScore),
            profile: profile.name,
          }),
        ),
      )
    return reasons
  },
}

const languageSpec: Specification = {
  id: 'language',
  evaluate: ({ profile, movie, languages, locale, t }) => {
    if (profile.language === 'any') return []
    const original = profile.language === 'original'
    const wanted = original ? movie.originalLanguage : profile.language
    if (!wanted) return []
    const language = languageName(wanted, locale)
    if (languages.includes(wanted)) return [accepted(t('language.matches', { language }))]
    const list = new Intl.ListFormat(locale, { type: 'conjunction' }).format(
      languages.map((l) => languageName(l, locale)),
    )
    return [
      rejected(
        t(original ? 'language.wrongOriginal' : 'language.wrong', {
          languages: list,
          profile: profile.name,
          language,
        }),
      ),
    ]
  },
}

const sameItem = (profile: QualityProfile, a: QualityName, b: QualityName) =>
  preference(profile, a) === preference(profile, b)

/** A newer revision of the file's own quality, which "Prefer and Upgrade" always takes. */
const isRevisionUpgrade = (e: Evaluation, existing: ExistingFile) =>
  sameItem(e.profile, e.quality, existing.quality) &&
  compareRevisions(e.release.quality.revision, existing.revision) > 0

const cutoffMet = (e: Evaluation, existing: ExistingFile) =>
  meetsCutoff(e.profile, existing.quality) &&
  existing.formatScore >= e.profile.cutoffFormatScore &&
  !isRevisionUpgrade(e, existing)

const upgradeAllowedSpec: Specification = {
  id: 'upgradeAllowed',
  evaluate: ({ existing, profile, t }) =>
    existing && !profile.upgradeAllowed
      ? [rejected(t('upgrade.notAllowed', { profile: profile.name }))]
      : [],
}

const cutoffSpec: Specification = {
  id: 'cutoff',
  evaluate: (e) => {
    const { existing, profile, t } = e
    if (!existing || !profile.upgradeAllowed || !cutoffMet(e, existing)) return []
    return [
      rejected(
        t('upgrade.cutoffMet', { quality: existing.quality, score: String(existing.formatScore) }),
      ),
    ]
  },
}

const upgradeSpec: Specification = {
  id: 'upgrade',
  evaluate: (e) => {
    const { existing, profile, quality, formatScore, t } = e
    if (!existing || !profile.upgradeAllowed || cutoffMet(e, existing)) return []
    const byQuality = preference(profile, quality) - preference(profile, existing.quality)
    if (byQuality > 0)
      return [accepted(t('upgrade.quality', { from: existing.quality, to: quality }))]
    if (byQuality === 0) {
      const byRevision = compareRevisions(e.release.quality.revision, existing.revision)
      if (byRevision > 0) return [accepted(t('upgrade.revision', { quality }))]
      if (byRevision === 0 && formatScore >= existing.formatScore + profile.minUpgradeFormatScore)
        return [
          accepted(
            t('upgrade.score', { from: String(existing.formatScore), to: String(formatScore) }),
          ),
        ]
    }
    return [
      rejected(
        t('upgrade.notWanted', {
          quality: existing.quality,
          score: String(existing.formatScore),
        }),
      ),
    ]
  },
}

/** A slot a later checkpoint fills: it says nothing until then. */
const slot = (id: string): Specification => ({ id, evaluate: () => [] })

/**
 * Radarr's Minimum Seeders, per torrent indexer (wiki.servarr.com/radarr/settings#indexers). Only
 * when both the count and the minimum are known: an indexer that doesn't report seeders isn't
 * penalized for it.
 */
const seedersSpec: Specification = {
  id: 'seeders',
  evaluate: ({ indexer, t }) => {
    const seeders = indexer?.seeders
    const minimum = indexer?.minimumSeeders
    if (indexer?.protocol === 'usenet' || seeders == null || minimum == null) return []
    return seeders < minimum ? [rejected(t('seeders.tooFew', { seeders, minimum }))] : []
  },
}

/** Minimum Age, Usenet only, as the Servarr wiki defines it (wiki.servarr.com/sonarr/settings#options). */
const minimumAgeSpec: Specification = {
  id: 'minimumAge',
  evaluate: ({ indexer, locale, t }) => {
    const age = indexer?.ageMinutes
    const minimum = indexer?.minimumAgeMinutes
    if (indexer?.protocol !== 'usenet' || age == null || !minimum) return []
    return age < minimum
      ? [
          rejected(
            t('age.tooNew', {
              age: duration(Math.max(0, age) * 60, locale),
              minimum: duration(minimum * 60, locale),
            }),
          ),
        ]
      : []
  },
}

/** An indexer that's failing can't be grabbed from until it recovers. */
const blockedIndexerSpec: Specification = {
  id: 'blockedIndexer',
  evaluate: ({ indexer, t }) =>
    indexer?.blocked
      ? [
          rejected(
            t('indexer.blocked', { indexer: indexer.indexerName ?? indexer.indexerId ?? '' }),
          ),
        ]
      : [],
}

/** The specifications, in the order their reasons are listed. */
export const defaultSpecifications: readonly Specification[] = [
  qualitySpec,
  sizeSpec,
  formatScoreSpec,
  languageSpec,
  upgradeAllowedSpec,
  cutoffSpec,
  upgradeSpec,
  // Checkpoint 5: the indexer's facts.
  seedersSpec,
  minimumAgeSpec,
  blockedIndexerSpec,
  // Checkpoint 6: the queue and history.
  slot('alreadyQueued'),
  slot('alreadyImported'),
  slot('blocklisted'),
]

export const SPECIFICATION_IDS = defaultSpecifications.map((s) => s.id)

/** `specs` with `spec` in place of the one with its id, or added at the end when there's none. */
export function withSpecification(
  specs: readonly Specification[],
  spec: Specification,
): Specification[] {
  return specs.some((s) => s.id === spec.id)
    ? specs.map((s) => (s.id === spec.id ? spec : s))
    : [...specs, spec]
}

/** Whether the profile wants the release, and why. */
export function decide(
  input: DecisionInput,
  options: { locale?: string; specifications?: readonly Specification[] } = {},
): Decision {
  const locale = options.locale ?? 'en'
  const quality = qualityOf(input.release.quality)
  const { formats: matched, formatScore } = scoreFormats(input.profile, input.formats, {
    release: input.release,
    size: input.size,
    indexerFlags: input.indexer?.flags ?? [],
    originalLanguage: input.movie.originalLanguage,
    multiLanguages: input.indexer?.multiLanguages ?? [],
  })
  const evaluation: Evaluation = {
    ...input,
    quality,
    matched,
    formatScore,
    languages: releaseLanguages(input.release, {
      originalLanguage: input.movie.originalLanguage,
      multiLanguages: input.indexer?.multiLanguages ?? [],
    }),
    locale,
    t: qualityT(locale),
  }
  const reasons = (options.specifications ?? defaultSpecifications).flatMap((s) =>
    s.evaluate(evaluation),
  )
  return {
    approved: !reasons.some((r) => r.kind === 'rejected'),
    reasons,
    quality,
    formats: matched,
    formatScore,
  }
}

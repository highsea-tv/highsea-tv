// SPDX-License-Identifier: AGPL-3.0-only
// What the decision engine and the format summaries say (ADR 0021). The reasons follow the
// prototype's copy ("Bluray-1080p isn’t allowed in HD 1080p"); sizes and runtimes arrive formatted
// by @highsea/core/format, so they read as everywhere else in highsea.
import { createT, defineMessages, type T } from '@highsea/i18n'

export const qualityMessages = defineMessages({
  // The quality
  'quality.target': 'Matches target {quality}',
  'quality.allowed': 'Matches {quality}',
  'quality.notAllowed': '{quality} isn’t allowed in {profile}',
  // Sizes
  'size.tooLarge': 'Too large: {size}, the limit is {limit} for {runtime}',
  'size.tooSmall': 'Too small: {size}, the minimum is {limit} for {runtime}',
  'size.runtimeAssumed': '{runtime}, as the runtime isn’t known',
  // Custom formats
  'format.score': '{format} format score {score, number, ::sign-always group-off}',
  'format.belowMinimum': 'Format score {score} is below the minimum of {minimum} in {profile}',
  // Language
  'language.matches': 'In {language}',
  'language.wrong': 'In {languages}; {profile} wants {language}',
  'language.wrongOriginal': 'In {languages}; {profile} wants the original language, {language}',
  // Upgrades
  'upgrade.notAllowed': 'There’s a file already, and {profile} doesn’t allow upgrades',
  'upgrade.cutoffMet': 'The file already meets the cutoff: {quality}, format score {score}',
  'upgrade.quality': 'Upgrades {from} to {to}',
  'upgrade.revision': 'A newer revision of {quality}',
  'upgrade.score': 'Raises the format score from {from} to {to}',
  'upgrade.notWanted': 'Not an upgrade: the file is {quality} with format score {score}',
  // The indexer's facts
  'seeders.tooFew': '{seeders, plural, one {# seeder} other {# seeders}}; the minimum is {minimum}',
  'age.tooNew': 'Posted {age} ago; the minimum age is {minimum}',
  'indexer.blocked': '{indexer} is failing, so its releases can’t be taken',
  // Condition summaries, for Settings › Profiles and formats
  'condition.title': 'Title matches {value}',
  'condition.edition': 'Edition matches {value}',
  'condition.releaseGroup': 'Release group matches {value}',
  'condition.language': 'In {language}',
  'condition.languageExcept': 'In a language other than {language}',
  'condition.indexerFlag': 'Flagged {flag}',
  'condition.source': 'Source is {source}',
  'condition.resolution': 'Resolution is {resolution}p',
  'condition.modifier': 'Modifier is {modifier}',
  'condition.size': 'Size between {min} and {max} GB',
  'condition.year': 'Year between {min} and {max}',
  'condition.anyOf': '{kind}: any of {count} patterns',
  'condition.negated': 'Not: {condition}',
  'condition.required': '{condition} (required)',
  'condition.original': 'the original language',
  'kind.title': 'Title',
  'kind.edition': 'Edition',
  'kind.releaseGroup': 'Release group',
  // Validation
  'invalid.regex': '“{value}” isn’t a valid regular expression',
  'invalid.empty': 'A format needs at least one condition',
  'invalid.range': 'The range’s minimum is above its maximum',
})

export type QualityT = T<typeof qualityMessages>

/** The catalog formatted in `locale`, English where a translation is missing. */
export const qualityT = (locale = 'en'): QualityT => createT(qualityMessages, locale)

/** "French", from the ISO 639-1 code; the code itself when Intl doesn't know it. */
export function languageName(code: string, locale = 'en'): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

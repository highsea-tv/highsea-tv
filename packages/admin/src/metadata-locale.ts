// SPDX-License-Identifier: AGPL-3.0-only
// The metadata language and region (checkpoint 4, decisions 1 and 5): what setup sends from the
// owner's locale, and the choices Settings › General › Metadata offers. Plain functions, so setup,
// Settings and the tests share them.
//
// - TMDB's `language` takes ISO 639-1, optionally with an ISO 3166-1 region (`pt-BR`), and its
//   `region` takes ISO 3166-1 alpha-2 (https://developer.themoviedb.org/docs/languages,
//   https://developer.themoviedb.org/docs/region-support).
// - Names come from Intl.DisplayNames in the admin's locale, so no catalog has to list them.

/** BCP 47 as TMDB takes it (the contract's pattern). */
const LANGUAGE = /^[a-z]{2}(-[A-Z]{2})?$/
const REGION = /^[A-Z]{2}$/

/**
 * The owner's locale as metadata settings: `en-GB` gives language `en-GB` and region `GB`. A
 * locale without a region takes the likely one (`fr` → `FR`, Intl.Locale's maximize). Anything
 * TMDB wouldn't take is left out, and the server keeps its default.
 */
export function metadataLocale(tag: string | undefined): { language?: string; region?: string } {
  if (!tag) return {}
  try {
    const locale = new Intl.Locale(tag)
    const region = locale.region ?? locale.maximize().region
    const language = region ? `${locale.language}-${region}` : locale.language
    return {
      ...(LANGUAGE.test(language)
        ? { language }
        : LANGUAGE.test(locale.language)
          ? { language: locale.language }
          : {}),
      ...(region && REGION.test(region) ? { region } : {}),
    }
  } catch {
    return {}
  }
}

/**
 * The languages TMDB has the most translations in, as `language-REGION`. The saved value joins the
 * list when it isn't one of them, so a choice made elsewhere still shows.
 */
export const METADATA_LANGUAGES = [
  'ar-SA',
  'cs-CZ',
  'da-DK',
  'de-DE',
  'el-GR',
  'en-AU',
  'en-CA',
  'en-GB',
  'en-US',
  'es-ES',
  'es-MX',
  'fi-FI',
  'fr-CA',
  'fr-FR',
  'he-IL',
  'hi-IN',
  'hu-HU',
  'id-ID',
  'it-IT',
  'ja-JP',
  'ko-KR',
  'nb-NO',
  'nl-NL',
  'pl-PL',
  'pt-BR',
  'pt-PT',
  'ro-RO',
  'ru-RU',
  'sv-SE',
  'th-TH',
  'tr-TR',
  'uk-UA',
  'vi-VN',
  'zh-CN',
  'zh-TW',
] as const

/** Regions with their own release dates and certifications at TMDB. */
export const METADATA_REGIONS = [
  'AR',
  'AT',
  'AU',
  'BE',
  'BR',
  'CA',
  'CH',
  'CL',
  'CN',
  'CO',
  'CZ',
  'DE',
  'DK',
  'ES',
  'FI',
  'FR',
  'GB',
  'GR',
  'HK',
  'HU',
  'ID',
  'IE',
  'IL',
  'IN',
  'IT',
  'JP',
  'KR',
  'MX',
  'MY',
  'NL',
  'NO',
  'NZ',
  'PH',
  'PL',
  'PT',
  'RO',
  'RU',
  'SE',
  'SG',
  'TH',
  'TR',
  'TW',
  'UA',
  'US',
  'VN',
  'ZA',
] as const

const displayName = (locale: string, type: 'language' | 'region', code: string) => {
  try {
    return new Intl.DisplayNames([locale], { type }).of(code) ?? code
  } catch {
    return code
  }
}

/** The choices for a select, named in `locale` and sorted by name, with `current` among them. */
export function metadataOptions(
  type: 'language' | 'region',
  current: string,
  locale: string,
): { value: string; label: string }[] {
  const codes: string[] = [...(type === 'language' ? METADATA_LANGUAGES : METADATA_REGIONS)]
  if (current && !codes.includes(current)) codes.push(current)
  return codes
    .map((value) => ({ value, label: displayName(locale, type, value) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale))
}

/** The last four characters as the key's field shows them: `••••3f9a`. */
export const maskedKey = (last4: string | null) => `••••${last4 ?? ''}`

/** A failed call's `details.reason` (METADATA_REASONS, a root folder's check), if the server gave one. */
export function errorReason(error: unknown): string | undefined {
  const details = (error as { details?: unknown } | null)?.details
  const reason = (details as { reason?: unknown } | undefined)?.reason
  return typeof reason === 'string' ? reason : undefined
}

/** TMDB refused the key (400 `tmdb-key-rejected`). */
export const keyRejected = (reason: string | undefined) => reason === 'tmdb-key-rejected'

/** TMDB isn't answering (503 `tmdb-unreachable`) or is limiting (429 `tmdb-rate-limited`): try again in a moment. */
export const tmdbBusy = (reason: string | undefined) =>
  reason === 'tmdb-unreachable' || reason === 'tmdb-rate-limited'

/** Where TMDB's API key and Read Access Token are (TMDB's Getting Started guide). */
export const TMDB_KEY_PAGE = 'https://www.themoviedb.org/settings/api'

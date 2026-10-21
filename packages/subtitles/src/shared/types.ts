// SPDX-License-Identifier: AGPL-3.0-only
// The shapes every part of @highsea/subtitles shares: language profiles and their rules, the
// settings row, and the provider interface each adapter implements (ADR 0043). A provider is code,
// one adapter each; it's handed the fetch seam (ADR 0029), a clock and a store for what it keeps
// between calls (its credentials, opened; its token; its quota; an in-flight download's link).
import type { Clock, Fetch } from '@highsea/core'
import type { SUBTITLE_PROVIDER_IDS } from '@highsea/db/schema'

// ---------------------------------------------------------------- profiles

/** Forced: `no` wants a regular track, `also` a regular and a forced one, `only` a forced one. */
export type ForcedRule = 'no' | 'also' | 'only'
/** SDH: `no` wants one without (an SDH one is cleaned as a fallback), `also` either, `only` SDH. */
export type HiRule = 'no' | 'also' | 'only'

export type LanguageRule = { code: string; forced: ForcedRule; hi: HiRule }

export type LanguageProfile = {
  id: string
  name: string
  /** In order of preference. */
  languages: LanguageRule[]
  /** Stop upgrading once this language is present; null to keep looking. */
  cutoff: string | null
  minScore: number
}

/** Settings › Subtitles' Scoring and sync: the `subtitles` settings row. */
export type SubtitleSettings = {
  minScore: number
  autoSync: boolean
  minConfidence: number
  upgradeDays: number
  preferReleaseMatch: boolean
}

// ---------------------------------------------------------------- providers

export type ProviderId = (typeof SUBTITLE_PROVIDER_IDS)[number]

/** Text formats highsea processes; image subtitles (`sup`, `idx`) are copied unchanged. */
export type TextFormat = 'srt' | 'vtt' | 'ass' | 'ssa'

/** One search: a library file and the languages it wants. */
export type SubtitleQuery = {
  tmdbId: number
  /** `tt0123456`, or null when TMDB has none. */
  imdbId: string | null
  title: string
  year: number | null
  /** OpenSubtitles.com's hash of the file (moviehash.ts), or null outside its size range. */
  moviehash: string | null
  /** Profile codes: ISO 639-1 plus `pt-BR`, `zh-Hans` and `zh-Hant`. */
  languages: string[]
}

/** A subtitle a provider offers, in highsea's terms. Scoring reads it; Use downloads it by `ref`. */
export type ProviderResult = {
  provider: ProviderId
  /** What `download` needs: OpenSubtitles.com's `file_id`, Subdl's zip path, SubSource's id. */
  ref: string
  /** A profile code (languages.ts), mapped from the provider's own. */
  language: string
  /** The release the subtitle was made for, as the provider names it. */
  releaseName: string
  /** Every release name the provider says it fits, the first being `releaseName`. */
  releases: string[]
  forced: boolean
  hi: boolean
  /** The provider matched the file's moviehash. */
  hashMatch: boolean
  /** The provider matched on the TMDB or IMDb id, so title and year count. */
  idMatch: boolean
  /** The format when the provider says it; otherwise it's read from the file. */
  format: TextFormat | null
  /** The provider's own ranking, for ties: downloads, then rating. */
  downloads: number
  rating: number
  /** Machine- or AI-translated, where the provider says (judgement call 9): never downloaded. */
  translated: boolean
}

/** A downloaded subtitle file: its name (a base name only) and bytes. */
export type DownloadedFile = { name: string; bytes: Uint8Array }

/** What a provider reports about its account. */
export type ProviderAccount = {
  /** What A10's Account column shows: the username, or a masked key. */
  account: string
  /** Downloads (OpenSubtitles.com) left today, when the provider reports them. */
  remaining: number | null
  limit: number | null
  /** When the provider's day resets (epoch ms), when it says. */
  resetsAt: number | null
}

export type ProviderToken = { value: string; expiresAt: number; baseUrl: string | null }

/** What an adapter keeps between calls. The service backs it with `subtitle_providers` rows. */
export type ProviderStore = {
  /** The account's fields by key (`username`, `password`, `apiKey`), opened; null when unset. */
  credentials(): Record<string, string> | null
  token(): ProviderToken | null
  saveToken(token: ProviderToken | null): void
  /**
   * The provider's own count, when it reports one (OpenSubtitles.com's `remaining`); `remaining`
   * is null when it gave only the allowance, as a sign-in does.
   */
  saveQuota(quota: {
    remaining: number | null
    limit: number | null
    resetsAt: number | null
  }): void
  /** An in-flight download's link, stored before it's fetched (`subtitle_downloads`). */
  link(key: string): string | null
  saveLink(key: string, link: string, expiresAt: number): void
  dropLink(key: string): void
}

export type ProviderDeps = {
  fetch: Fetch
  clock: Clock
  /** `highsea v{version}`, as OpenSubtitles.com requires. */
  userAgent: string
  store: ProviderStore
}

export type Provider = {
  id: ProviderId
  search(query: SubtitleQuery, signal?: AbortSignal): Promise<ProviderResult[]>
  download(result: ProviderResult, signal?: AbortSignal): Promise<DownloadedFile>
  /** Signs in where needed and reports the account; throws a ProviderError when it can't. */
  account(signal?: AbortSignal): Promise<ProviderAccount>
}

/**
 * Why a provider call failed, which decides its throttle (throttle.ts):
 * - `rate-limited`: too many requests (429); `retryAfterMs` when the provider says;
 * - `quota`: out of downloads until `resetsAt`;
 * - `auth`: the account or key was refused; never retried until it's changed;
 * - `unavailable`: a timeout, a network error or a 5xx;
 * - `no-account`: the provider needs an account (or highsea's key) it doesn't have;
 * - `invalid`: the provider answered something highsea can't read, or a file it won't take.
 */
export type ProviderErrorKind =
  | 'rate-limited'
  | 'quota'
  | 'auth'
  | 'unavailable'
  | 'no-account'
  | 'invalid'

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind
  readonly retryAfterMs: number | null
  readonly resetsAt: number | null
  constructor(
    kind: ProviderErrorKind,
    message: string,
    options: { retryAfterMs?: number | null; resetsAt?: number | null } = {},
  ) {
    super(message)
    this.name = 'ProviderError'
    this.kind = kind
    this.retryAfterMs = options.retryAfterMs ?? null
    this.resetsAt = options.resetsAt ?? null
  }
}

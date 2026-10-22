// SPDX-License-Identifier: AGPL-3.0-only
export * from './context.ts'
export {
  baseUrlOf,
  type RunResult,
  runSearch,
  type SearchQuery,
  type SettingValue,
} from './engine.ts'
export { type Caps, readCaps, readItems } from './feed.ts'
export { type Fetched, fetchRelease, MAX_TORRENT_BYTES } from './grab.ts'
export {
  BACKOFF_STEPS_MS,
  backoffDelay,
  FAILING_AFTER_MS,
  type Health,
  type IndexerStats,
} from './health.ts'
export { type FailureKind, IndexerError, joinUrl, redact } from './http.ts'
export type { IndexerRelease } from './release.ts'
export {
  DEFAULT_MINIMUM_SEEDERS,
  flagsOf,
  matchesMovie,
  RELEASES_TTL_MS,
  type ReleaseView,
  RSS_SEEN_MS,
  type RssResult,
  type RssTarget,
  rssMatcher,
  type SearchInput,
  type SearchResult,
} from './search.ts'
export * from './service.ts'
export type { SettingsView } from './settings.ts'
export { parseDate, parseSize } from './values.ts'

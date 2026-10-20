// SPDX-License-Identifier: AGPL-3.0-only
// @highsea/media/shared: what every media type shares (ADR 0036). Media types today: movies;
// planned: shows and music, perhaps books and games. Anything here works for all of them; anything
// one type alone needs lives in its folder (movies/).
//
// The services, created once by the runtime and handed to each media type:
//
//   const media = createMedia({ db, clock, logger })
//   media.seed()                           first boot: profiles, formats, quality sizes; idempotent
//   media.profiles.list / get, customFormats(), qualitySizes(), languageProfiles()
//   media.rootFolders.list / find / add / remove
//   const movies = createMovies(deps, media)
//
// And the pure pieces each type builds on: names (fold, sort titles, folders), keyset paging over
// `media_items`, the API's common shapes (stars, ISO times, credits, videos, watch progress),
// search ranking, and each person's watch positions.
//
// Errors are AppErrors with `details.reason`: `unknown-quality-profile` (404); `not-absolute`,
// `not-found` and `not-writable` (400, adding a root folder), `exists` and `overlaps` (409), and
// `in-use` (409, removing one with titles filed under it, with `details.counts` by type);
// `bad-cursor` (400); `no-indexers` (409).
import type { MediaDeps } from './context.ts'
import { createProfiles } from './profiles.ts'
import { createRootFolders } from './root-folders.ts'

export function createMedia(deps: MediaDeps) {
  const profiles = createProfiles(deps)
  const rootFolders = createRootFolders(deps)
  return {
    seed: profiles.seed,
    profiles: profiles.profiles,
    customFormats: profiles.customFormats,
    qualitySizes: profiles.qualitySizes,
    languageProfiles: profiles.languageProfiles,
    rootFolders,
  }
}

export type Media = ReturnType<typeof createMedia>

export { invalid, type MediaDeps, noIndexers } from './context.ts'
export {
  artOf,
  type ItemRow,
  isoOf,
  isoTime,
  progressOf,
  stars,
  toApiCredit,
  toApiVideo,
  type VersionRow,
  WATCHED_AT,
  type WatchState,
} from './map.ts'
export { dayOf, fold, folderName, matchKey, safeName, sortTitleOf, titlePath } from './names.ts'
export { type Dir, defaultDir, pageRows, SORTS, type Sort } from './paging.ts'
export { LANGUAGE_PROFILES, profileNotFound, QUALITY_SIZES_KEY } from './profiles.ts'
export { type FiledCounts, normalizeFolder, type RootFolders } from './root-folders.ts'
export { matchScore } from './search.ts'
export { CHUNK, chunks, escapeLike } from './sql.ts'
export { watchOf } from './watch.ts'

// SPDX-License-Identifier: AGPL-3.0-only
// @highsea/media/shared: what every media type shares (ADR 0036). Media types today: movies;
// planned: shows and music, perhaps books and games. Anything here works for all of them; anything
// one type alone needs lives in its folder (movies/).
//
// The services, created once by the runtime and handed to each media type:
//
//   const media = createMedia({ db, clock, logger })
//   media.seed()                           first boot: profiles, formats, quality sizes; idempotent
//   media.profiles.list / get / add / save / remove / order       the editors (8c)
//   media.customFormats() / .get / .add / .save / .remove
//   media.qualitySizes() / .save
//   (language profiles are @highsea/subtitles/shared's, since checkpoint 7)
//   media.rootFolders.list / find / add / setLanguageProfile / remove
//   media.tags.list / add / rename / remove, check, ofItems, apply   tags (checkpoint 8c)
//   media.mediaManagement.get / save       the `mediaManagement` settings row: naming and importing
//   media.history.write / forItem / list   what happened to each title, cursor-paged on (date, id)
//   const movies = createMovies(deps, media)
//
// And the pure pieces each type builds on: names (fold, sort titles, folders), keyset paging over
// `media_items`, the API's common shapes (stars, ISO times, credits, videos, watch progress),
// search ranking, and each person's watch positions. Importing's pieces (checkpoint 6): ffprobe
// through one wrapper (ffprobe.ts, read by probe.ts), Radarr's naming tokens (naming.ts),
// transfers with their fallbacks (transfer.ts), the allowed-roots check (paths.ts), what to import
// and what to refuse (files.ts), the recycle bin and permissions (housekeeping.ts) and Kodi's NFO
// (nfo.ts).
//
// Errors are AppErrors with `details.reason`: `unknown-quality-profile` (404); `not-absolute`,
// `not-found` and `not-writable` (400, adding a root folder), `exists` and `overlaps` (409), and
// `in-use` (409, removing one with titles filed under it, with `details.counts` by type);
// `bad-cursor` (400); `no-indexers` (409); `outside-roots` (400, a path outside the root folders
// and the downloads folder); a settings key (400, saving `mediaManagement` with a bad value).
import type { MediaDeps } from './context.ts'
import { createHistory } from './history.ts'
import { createProfiles } from './profiles.ts'
import { createRootFolders } from './root-folders.ts'
import { createMediaManagement } from './settings.ts'
import { createTags } from './tags.ts'

export function createMedia(deps: MediaDeps) {
  const profiles = createProfiles(deps)
  const rootFolders = createRootFolders(deps)
  return {
    seed: profiles.seed,
    profiles: profiles.profiles,
    customFormats: profiles.customFormats,
    qualitySizes: profiles.qualitySizes,
    rootFolders,
    mediaManagement: createMediaManagement(deps),
    history: createHistory(deps),
    tags: createTags(deps),
  }
}

export type Media = ReturnType<typeof createMedia>

export { invalid, type MediaDeps, noIndexers } from './context.ts'
export {
  archivesIn,
  createExtractor,
  EXTRACT_MESSAGES,
  type Extract,
  ExtractError,
  type ExtractFailure,
  extractDownload,
  removeUnpacked,
  UNAR_ARGS,
  unarAvailable,
  unarBinary,
  unpackedFolder,
} from './extract.ts'
export { createProbe, ffprobeBinary, PROBE_ARGS } from './ffprobe.ts'
export {
  deriveAllFileFacts,
  FILE_FACTS_STATE_KEY,
  FILE_FACTS_VERSION,
  type FileHdr,
  fileColumns,
  fileFactsCurrent,
  fileLanguages,
  probeOf,
  writeFileFacts,
} from './file-facts.ts'
export {
  blockedMessage,
  DANGEROUS_EXTENSIONS,
  EXECUTABLE_EXTENSIONS,
  type FoundFile,
  findBlocked,
  isBlocked,
  isVideo,
  listFiles,
  minimumRuntimeSeconds,
  sampleReason,
  skipBeforeProbe,
  VIDEO_EXTENSIONS,
  vetFiles,
} from './files.ts'
export {
  HISTORY_LIMIT,
  type History,
  type HistoryEvent,
  type HistoryInput,
  type HistoryPage,
  type HistoryType,
} from './history.ts'
export { applyPermissions, emptyRecycleBin, modesOf, recycle } from './housekeeping.ts'
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
export {
  buildFileName,
  buildFolderName,
  checkFormat,
  cleanFileName,
  cleanTitle,
  editionToken,
  type NamingFile,
  type NamingMovie,
  type NamingOptions,
  titleThe,
} from './naming.ts'
export { movieNfo, type NfoMovie, nfoPath, writeArtwork, writeNfo } from './nfo.ts'
export { type Dir, defaultDir, pageRows, SORTS, type Sort } from './paging.ts'
export { checkPath, isWithin, outsideRoots, realOrParent } from './paths.ts'
export {
  type AudioInfo,
  audioChannelsOf,
  audioCodecName,
  dynamicRangeType,
  type HdrFormat,
  type MediaInfo,
  type Probe,
  ProbeError,
  parseProbe,
  resolutionOf,
  type Stream,
  type SubtitleInfo,
  streamsOf,
  type VideoInfo,
  videoCodecName,
} from './probe.ts'
export {
  type CustomFormatInput,
  formatNotFound,
  type ProfileInput,
  profileNotFound,
  QUALITY_SIZES_KEY,
  type StoredFormat,
  type StoredProfile,
} from './profiles.ts'
export { type FiledCounts, normalizeFolder, type RootFolders } from './root-folders.ts'
export { matchScore } from './search.ts'
export {
  COLON_REPLACEMENTS,
  type ColonReplacement,
  defaultMediaManagement,
  MEDIA_MANAGEMENT_KEY,
  type MediaManagement,
  type MediaManagementSettings,
  mediaManagementSchema,
} from './settings.ts'
export { CHUNK, chunks, escapeLike } from './sql.ts'
export { type TagMode, type Tags, tagsMatch } from './tags.ts'
export {
  nodeFs,
  type TransferFs,
  type TransferMethod,
  type TransferMode,
  type TransferResult,
  transfer,
  transferMessage,
} from './transfer.ts'
export { watchOf } from './watch.ts'
export {
  createLibraryWatch,
  type LibraryWatch,
  type LibraryWatchOptions,
  type WatchFn,
  type WatchProblem,
  watchFailure,
} from './watching.ts'

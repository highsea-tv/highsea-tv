// SPDX-License-Identifier: AGPL-3.0-only
// Episode names for Settings › Media management's previews (prototype-gaps.md's stage 6, drafted
// with D3's answer 5), moved from the prototype's naming.ts. The names themselves are
// @highsea-tv/media/naming's `buildEpisodeName` (Phase 5 C1), which the episode import uses too;
// `checkEpisodeNaming` is the screen's check before saving.
import type { EpisodeNaming } from '@highsea-tv/api-contract'
import {
  buildEpisodeName,
  type MultiEpisodeStyle,
  type NamingEpisode,
  type NamingEpisodeFile,
  type NamingShow,
} from '@highsea-tv/media/naming'

export type { MultiEpisodeStyle }

type Naming = typeof EpisodeNaming._output

const PREVIEW_SHOW: NamingShow = { title: 'The Lantern Keepers', year: 2019 }
const PREVIEW_EPISODE_FILE: NamingEpisodeFile = { quality: 'WEBDL-1080p', releaseGroup: 'NTb' }
const PREVIEW_ONE: NamingEpisode[] = [
  { season: 2, episode: 5, title: 'The Keeper’s Log', aired: '2021-03-14' },
]
/** A double-length opener in one file, as releases often have it: three episodes, one file. */
const PREVIEW_MULTI: NamingEpisode[] = [
  { season: 1, episode: 1, title: 'First Light', aired: '2019-10-06' },
  { season: 1, episode: 2, title: 'The Fog Bell', aired: '2019-10-06' },
  { season: 1, episode: 3, title: 'Low Water', aired: '2019-10-13' },
]

/** Settings' previews: The Lantern Keepers' S02E05, and S01E01 to E03 in one file. */
export const previewEpisodeFile = (format: string, style: MultiEpisodeStyle, multi = false) =>
  buildEpisodeName(
    format,
    PREVIEW_SHOW,
    multi ? PREVIEW_MULTI : PREVIEW_ONE,
    PREVIEW_EPISODE_FILE,
    style,
  )

export const previewSeriesFolder = (format: string) => buildEpisodeName(format, PREVIEW_SHOW)

export const previewSeasonFolder = (format: string) =>
  buildEpisodeName(format, PREVIEW_SHOW, PREVIEW_ONE)

/** Why a format can't be saved: blank, or missing what tells its episodes apart. */
export type EpisodeNamingProblem = 'blank' | 'needsEpisode' | 'needsAirDate'

const FORMATS = [
  'standardFormat',
  'dailyFormat',
  'seriesFolderFormat',
  'seasonFolderFormat',
] as const

/**
 * The formats' problems, by field: each needs something in it; an episode's file needs
 * `{episode}` and a daily one's `{Air-Date}`, or two episodes would get one name, as Sonarr refuses.
 */
export function checkEpisodeNaming(
  v: Naming,
): Partial<Record<(typeof FORMATS)[number], EpisodeNamingProblem>> {
  const out: Partial<Record<(typeof FORMATS)[number], EpisodeNamingProblem>> = {}
  for (const k of FORMATS) if (!v[k].trim()) out[k] = 'blank'
  if (!out.standardFormat && !/\{episode(:0+)?\}/i.test(v.standardFormat))
    out.standardFormat = 'needsEpisode'
  if (!out.dailyFormat && !/\{air[- .]?date\}/i.test(v.dailyFormat))
    out.dailyFormat = 'needsAirDate'
  return out
}

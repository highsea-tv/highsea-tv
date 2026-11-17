// SPDX-License-Identifier: AGPL-3.0-only
// Episode names for Settings › Media management's previews (prototype-gaps.md's stage 6, drafted
// with D3's answer 5), moved from the prototype's naming.ts. @highsea-tv/media/naming has no
// episode naming yet, so `buildEpisodeName` follows Sonarr's
// (https://wiki.servarr.com/sonarr/settings#episode-naming) with the package's own cleaning, until
// the TV series phase builds it there. `checkEpisodeNaming` is the screen's check before saving,
// for the same reason.
import type { EpisodeNaming, MULTI_EPISODE_STYLES } from '@highsea-tv/api-contract'
import { cleanFileName, cleanTitle } from '@highsea-tv/media/naming'

export type MultiEpisodeStyle = (typeof MULTI_EPISODE_STYLES)[number]
type Naming = typeof EpisodeNaming._output

export type NamingShow = { title: string; year: number }
export type NamingEpisode = { season: number; episode: number; title: string; aired: string }
export type NamingEpisodeFile = { quality: string; releaseGroup: string | null }

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

/** Sonarr's season-and-episode part, `S{season:00}E{episode:00}` or `{season}x{episode:00}`. */
const SEASON_EPISODE = /(s?\{season(?::0+)?\})([- ._]?[ex])(\{episode(?::0+)?\})/i
const TOKEN = /\{([^{}:]+)(?::([^{}]+))?\}/g

const pad = (n: number, format: string | undefined) =>
  format && /^0+$/.test(format) ? String(n).padStart(format.length, '0') : String(n)

/**
 * The extra episodes of a multi-episode file, by Sonarr's Multi Episode Style: after
 * `S01E01`, extend adds `-02-03`, duplicate ` - S01E02 - S01E03` (the format's own separator),
 * repeat `E02E03`, scene `-E02-E03`, range `-03` and prefixed range `-E03`.
 */
function multiEpisode(format: string, episodes: NamingEpisode[], style: MultiEpisodeStyle) {
  const m = SEASON_EPISODE.exec(format)
  if (!m || episodes.length < 2) return format
  const [all, season = '', separator = '', episodeToken = ''] = m
  const digits = /:(0+)\}/.exec(episodeToken)?.[1]
  const letter = separator.slice(-1)
  const rest = episodes.slice(1).map((e) => pad(e.episode, digits))
  const last = rest[rest.length - 1] ?? ''
  const before = format.slice(0, m.index)
  const between = /[- ._]+$/.exec(before)?.[0] ?? ' - '
  const extra = {
    extend: rest.map((n) => `-${n}`).join(''),
    duplicate: rest.map((n) => `${between}${season}${separator}${n}`).join(''),
    repeat: rest.map((n) => `${letter}${n}`).join(''),
    scene: rest.map((n) => `-${letter}${n}`).join(''),
    range: `-${last}`,
    'prefixed-range': `-${letter}${last}`,
  }[style]
  return `${before}${all}${extra}${format.slice(m.index + all.length)}`
}

const key = (token: string) => token.replace(/[\s._-]/g, '').toLowerCase()

/**
 * An episode file's name, a show's folder or a season's, from Sonarr's tokens: `{Series Title}`,
 * `{Series TitleYear}`, `{Series CleanTitle}`, `{Series Year}`, `{season:00}`, `{episode:00}`,
 * `{Episode Title}`, `{Episode CleanTitle}`, `{Air-Date}`, `{Air Date}`, `{Quality Full}`,
 * `{Quality Title}` and `{Release Group}`. Several episodes take the style's numbers and their
 * titles joined by " + ", as Sonarr's.
 */
export function buildEpisodeName(
  format: string,
  show: NamingShow,
  episodes: NamingEpisode[] = [],
  file: NamingEpisodeFile | null = null,
  style: MultiEpisodeStyle = 'prefixed-range',
) {
  const first = episodes[0]
  const titles = episodes.map((e) => e.title)
  const values: Record<string, (f?: string) => string> = {
    seriestitle: () => show.title,
    seriestitleyear: () => `${show.title} (${show.year})`,
    seriescleantitle: () => cleanTitle(show.title),
    seriescleantitleyear: () => `${cleanTitle(show.title)} ${show.year}`,
    seriesyear: () => String(show.year),
    season: (f) => (first ? pad(first.season, f) : ''),
    episode: (f) => (first ? pad(first.episode, f) : ''),
    episodetitle: () => titles.join(' + '),
    episodecleantitle: () => cleanTitle(titles.join(' and ')),
    airdate: () => first?.aired ?? '',
    qualityfull: () => file?.quality ?? '',
    qualitytitle: () => file?.quality ?? '',
    releasegroup: () => file?.releaseGroup ?? '',
  }
  return multiEpisode(format, episodes, style)
    .split(/[\\/]/)
    .map((piece) =>
      piece
        .replace(TOKEN, (_, token: string, f?: string) => {
          // {Air-Date} is 2019-10-06; {Air Date}, 2019 10 06
          if (key(token) === 'airdate' && first)
            return first.aired.replaceAll('-', token.includes(' ') ? ' ' : '-')
          return cleanFileName(values[key(token)]?.(f) ?? '')
        })
        .replace(/ {2,}/g, ' ')
        .replace(/(\s-)+\s*$|^\s*(-\s)+/g, '')
        .trim(),
    )
    .filter(Boolean)
    .join('/')
}

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

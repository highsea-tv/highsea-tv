// SPDX-License-Identifier: AGPL-3.0-only
// Seasons and episodes as Sonarr's naming writes them (Phase 5's part B, ADR 0064): `S01E01`, the
// multi-episode styles of its Episode Naming settings (Repeat `S01E01E02`, Scene `S01E01-E02`, Range
// `S01E01-02`, Prefixed Range `S01E01-E02`, Extend `S01E01-02-03`, Duplicate `S01E01.S01E02`), the
// `1x01` style, `Season 01` folders with `Specials` as season 0, and full-season packs (`S01`,
// `Season 1`, `S01-S03`) for monitoring later (C1). Daily (`2019.10.25`) and absolute (`- 05`)
// numbering are anime's and daily shows', which wait for their phase: such names give null.
//
// A hyphen joins episodes only when it touches them (`E01-02`), as Sonarr writes them: " - 24 Hours"
// after an episode is its title, not a range.

/** A show's episode file or release, as its name numbers it. */
export type ParsedEpisode = {
  /** The show's title: what precedes the numbering, separators made spaces. */
  title: string
  /** A year beside the title (`Doctor Who (2005)`), else null. */
  year: number | null
  /** The season, 0 for specials; for a pack of several seasons, the first. */
  season: number
  /** Its episodes in the season, ascending; empty for a full-season pack. */
  episodes: number[]
  /** A whole season, or several, with no episode named. */
  fullSeason: boolean
  /** The seasons it holds: `[season]` for episodes, every one for a pack (`S01-S03` is 1, 2, 3). */
  seasons: number[]
}

/** A range longer than this isn't a range: `S01E01-2160` is a resolution gone wrong. */
const MAX_RANGE = 50
/** Seasons are numbered from 0; the long ones (`S2010E01`) are years, as Sonarr allows. */
const SEASON = '(\\d{1,3}|(?:19|20)\\d\\d)'

const START = '(?<![\\p{L}\\p{N}])'
const END = '(?![\\p{L}\\p{N}])'

/** `S01E01`, `S01 E01`, `s1e1`; the continuation is read after it. */
const STANDARD = new RegExp(`${START}S${SEASON}[ ._]?E(\\d{1,4})(?![\\p{N}])`, 'iu')
/** `1x01`; never a resolution (`1920x1080`), whose digits run on either side. */
const CROSS = new RegExp(`${START}(\\d{1,2})x(\\d{2,3})(?![\\p{N}])`, 'iu')
/** `S01`, `S01-S03`, `S01-03` alone: a pack. */
const PACK = new RegExp(`${START}S${SEASON}(?:-S?(\\d{1,3}))?${END}`, 'iu')
/** `Season 1`, `Season 01-03`, `Seasons 1-3`. */
const PACK_WORDS = new RegExp(
  `${START}Seasons?[ ._]?(\\d{1,3})(?:[ ._]?-[ ._]?(\\d{1,3}))?${END}`,
  'iu',
)

/**
 * What follows a standard episode: another `E02`, a touching range `-03` or `-E03`, or the whole
 * number again (`.S01E02`, or ` - S01E02` as Sonarr's Duplicate style repeats the pattern).
 */
const REPEAT = /^E(\d{1,4})(?!\p{N})/iu
const RANGE = /^-E?(\d{1,4})(?![\p{L}\p{N}])/iu
const DUPLICATE = /^(?:\s-\s|[ ._-])?S(\d{1,4})[ ._]?E(\d{1,4})(?!\p{N})/iu
/** After `1x01`: `x02`, `-02`, `-1x02`, `.1x02`. */
const CROSS_REPEAT = /^x(\d{2,3})(?!\p{N})/iu
const CROSS_RANGE = /^-(\d{2,3})(?![\p{L}\p{N}])/iu
const CROSS_DUPLICATE = /^(?:\s-\s|[ ._-])?(\d{1,2})x(\d{2,3})(?!\p{N})/iu

const EXTENSION = /\.(?:mkv|mp4|m4v|avi|ts|m2ts|wmv|mov|mpe?g|webm|flv|ogm|divx|rmvb|nfo|srt)$/i
/** A fansub group or site in front: "[Group] ", "【site】". */
const LEADING = /^\s*(?:\[[^\]]*\]|【[^】]*】)[\s._-]*/u

/** The episodes a standard or `1x01` match starts, with whatever continues them. */
function readContinuation(
  rest: string,
  season: number,
  first: number,
  rules: { repeat: RegExp; range: RegExp; duplicate: RegExp },
): number[] {
  const episodes = [first]
  let s = rest
  for (;;) {
    const last = episodes[episodes.length - 1] as number
    const repeat = rules.repeat.exec(s)
    if (repeat?.[1]) {
      const n = Number(repeat[1])
      if (n <= last) break
      episodes.push(n)
      s = s.slice(repeat[0].length)
      continue
    }
    const range = rules.range.exec(s)
    if (range?.[1]) {
      const n = Number(range[1])
      if (n <= last || n - last > MAX_RANGE) break
      for (let e = last + 1; e <= n; e++) episodes.push(e)
      s = s.slice(range[0].length)
      continue
    }
    const duplicate = rules.duplicate.exec(s)
    if (duplicate?.[1] && duplicate[2] && Number(duplicate[1]) === season) {
      const n = Number(duplicate[2])
      if (n <= last) break
      episodes.push(n)
      s = s.slice(duplicate[0].length)
      continue
    }
    break
  }
  return episodes
}

/** The show's title and year from what precedes the numbering. */
function titleOf(before: string): { title: string; year: number | null } {
  let s = before
    .replace(LEADING, '')
    .replace(/[._]+/g, ' ')
    .replace(/[\s-]+$/u, '')
    .trim()
  let year: number | null = null
  const paren = /\s*\(((?:19|20)\d\d)\)$/u.exec(s)
  if (paren?.[1]) {
    year = Number(paren[1])
    s = s.slice(0, paren.index).trim()
  } else {
    // "Show Name 2019 S01E01": a trailing year, unless it's the whole title ("1923")
    const bare = /\s((?:19|20)\d\d)$/u.exec(s)
    if (bare?.[1] && bare.index > 0) {
      year = Number(bare[1])
      s = s.slice(0, bare.index).trim()
    }
  }
  return { title: s.replace(/\s+/g, ' ').replace(/\s-$/u, '').trim(), year }
}

const seasonsFrom = (a: number, b: number | null) => {
  if (b === null || b <= a || b - a > MAX_RANGE) return [a]
  return Array.from({ length: b - a + 1 }, (_, i) => a + i)
}

/**
 * The season and episodes a file or release name gives, Sonarr's way, or null when it has none
 * this parser reads (a film, a daily or an absolute number). Give the file's name, not its path.
 */
export function parseEpisode(name: string): ParsedEpisode | null {
  const s = name.replace(EXTENSION, '')

  const standard = STANDARD.exec(s)
  if (standard?.[1] && standard[2]) {
    const season = Number(standard[1])
    const episodes = readContinuation(
      s.slice(standard.index + standard[0].length),
      season,
      Number(standard[2]),
      { repeat: REPEAT, range: RANGE, duplicate: DUPLICATE },
    )
    return {
      ...titleOf(s.slice(0, standard.index)),
      season,
      episodes,
      fullSeason: false,
      seasons: [season],
    }
  }

  const cross = CROSS.exec(s)
  if (cross?.[1] && cross[2]) {
    const season = Number(cross[1])
    const episodes = readContinuation(
      s.slice(cross.index + cross[0].length),
      season,
      Number(cross[2]),
      { repeat: CROSS_REPEAT, range: CROSS_RANGE, duplicate: CROSS_DUPLICATE },
    )
    return {
      ...titleOf(s.slice(0, cross.index)),
      season,
      episodes,
      fullSeason: false,
      seasons: [season],
    }
  }

  const pack = PACK.exec(s) ?? PACK_WORDS.exec(s)
  if (pack?.[1]) {
    const seasons = seasonsFrom(Number(pack[1]), pack[2] ? Number(pack[2]) : null)
    return {
      ...titleOf(s.slice(0, pack.index)),
      season: seasons[0] as number,
      episodes: [],
      fullSeason: true,
      seasons,
    }
  }
  return null
}

const SEASON_FOLDER = /^(?:Season|Series|Saison|Staffel|Temporada)[ ._-]*(\d{1,4})$/iu
const SHORT_SEASON_FOLDER = /^S(\d{1,4})$/iu
const SPECIALS_FOLDER = /^Specials?$/iu

/**
 * The season a folder holds, as Sonarr's Season Folder Format writes it (`Season 01`, `Season 1`),
 * `S01`, or `Specials` as season 0; null for any other folder.
 */
export function parseSeasonFolder(name: string): number | null {
  const s = name.trim()
  if (SPECIALS_FOLDER.test(s)) return 0
  const m = SEASON_FOLDER.exec(s) ?? SHORT_SEASON_FOLDER.exec(s)
  return m?.[1] ? Number(m[1]) : null
}

/** A show's folder: its title and year, and the ids Sonarr, Jellyfin or Plex wrote into it. */
export type ParsedShowFolder = {
  title: string
  year: number | null
  ids: { tvdb: number | null; tmdb: number | null; imdb: string | null }
}

/** `[tvdb-81189]`, `{tvdb-81189}`, `[tvdbid-81189]`, `[tvdbid=81189]`, as each app writes them. */
const idTag = (name: string) =>
  new RegExp(`[\\[{]\\s*${name}(?:id)?[-=](\\d{1,10})\\s*[\\]}]`, 'iu')
const TVDB_TAG = idTag('tvdb')
const TMDB_TAG = idTag('tmdb')
const IMDB_TAG = /[[{]\s*imdb(?:id)?[-=](tt\d{7,10})\s*[\]}]/iu
const ANY_ID_TAG = /[[{]\s*(?:tvdb|tmdb|imdb)(?:id)?[-=][^\]}]*[\]}]/giu

/**
 * A show folder's name as Sonarr's Series Folder Format writes it (`{Series TitleYear}`, with
 * `[tvdb-…]` when set): `Brooklyn Nine-Nine (2013) [tvdb-269586]` is the title, the year and the
 * TVDB id.
 */
export function parseShowFolder(name: string): ParsedShowFolder {
  const tvdb = TVDB_TAG.exec(name)?.[1]
  const tmdb = TMDB_TAG.exec(name)?.[1]
  const imdb = IMDB_TAG.exec(name)?.[1]
  let s = name.replace(ANY_ID_TAG, ' ').replace(/\s+/g, ' ').trim()
  let year: number | null = null
  const paren = /\s*\(((?:18|19|20)\d\d)\)$/u.exec(s)
  if (paren?.[1]) {
    year = Number(paren[1])
    s = s.slice(0, paren.index).trim()
  }
  return {
    title: s,
    year,
    ids: {
      tvdb: tvdb ? Number(tvdb) : null,
      tmdb: tmdb ? Number(tmdb) : null,
      imdb: imdb ? imdb.toLowerCase() : null,
    },
  }
}

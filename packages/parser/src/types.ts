// SPDX-License-Identifier: AGPL-3.0-only
// What the parser reads out of a release name. The vocabulary (sources, modifiers, resolutions)
// follows the Servarr wiki's quality definitions; @highsea/quality combines the three into named
// qualities ("Bluray-1080p", "WEB-2160p") and ranks them.

/** Where the video came from. `webdl` is a lossless capture of a stream, `webrip` a re-encode. */
export type Source =
  | 'unknown'
  | 'cam'
  | 'telesync'
  | 'telecine'
  | 'workprint'
  | 'dvd'
  | 'tv'
  | 'webdl'
  | 'webrip'
  | 'bluray'

/** What was done to the source. `brdisk` is a full disc image; `remux` the disc's streams, untouched. */
export type Modifier = 'none' | 'regional' | 'screener' | 'rawhd' | 'brdisk' | 'remux'

/** Vertical lines. `null` when the name doesn't say. */
export type Resolution = 360 | 480 | 540 | 576 | 720 | 1080 | 2160

export type Revision = {
  /** 1, or 2 and up for PROPER, REPACK, v2…: each re-release counts one. */
  version: number
  /** REAL (a fix of a release from another group), counted separately, as the Servarr wiki does. */
  real: number
  proper: boolean
  repack: boolean
}

/** The video codec, whichever way the name spells it (`x264`, `H.264` and `AVC` are all `avc`). */
export type VideoCodec = 'avc' | 'hevc' | 'av1' | 'vc1' | 'mpeg2' | 'xvid' | 'divx' | 'vp9'

/** Dynamic range tags, as TRaSH's HDR formats name them. */
export type DynamicRange = 'dv' | 'hdr10plus' | 'hdr10' | 'hdr' | 'hlg' | 'sdr'

export type ParsedQuality = {
  source: Source
  resolution: Resolution | null
  modifier: Modifier
  revision: Revision
}

export type ParsedRelease = {
  /** The name as given. */
  name: string
  /** Whatever precedes the first year, quality or edition token, with separators made spaces. */
  title: string
  year: number | null
  /** "Director's Cut", "Extended", "IMAX"…, as written in the name; `null` when there's none. */
  edition: string | null
  quality: ParsedQuality
  /** ISO 639-1 codes in the order they appear (`['fr', 'en']`). Empty when the name names none. */
  languages: string[]
  /**
   * The name says MULTi (or Dual audio): more than one audio language, without saying which. Radarr
   * reads it as the movie's original language plus what the indexer's "Multi Languages" setting
   * lists (Servarr wiki, Radarr FAQ › How does Radarr handle "multi" in names); the parser only
   * reports it, since it knows neither.
   */
  multi: boolean
  /** Subtitle languages the name tags (`SWESUB`, `VOSTFR`, `En Subs`), as ISO 639-1 codes. */
  subtitles: string[]
  /** `null` when the name has no group. */
  releaseGroup: string | null
  /** The hardcoded subtitles' language or tag ("Korean", "HC"); `null` when there are none. */
  hardcodedSubs: string | null
  /** Ids written into the name (`tt0111161`, `tmdbid-278`). */
  ids: { imdb: string | null; tmdb: number | null }
  /** `null` when the name doesn't say. */
  codec: VideoCodec | null
  /** In the order they appear; empty when the name names none. */
  hdr: DynamicRange[]
  /** 3D, SBS or OU, or a 3D Blu-ray. */
  threeD: boolean
}

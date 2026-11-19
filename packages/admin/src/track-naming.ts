// SPDX-License-Identifier: AGPL-3.0-only
// Track names for Settings › Media management's previews (HT-68, Phase 5's part D, drafted with
// the admin's music). @highsea-tv/media/naming has no music naming yet, so `buildTrackName`
// follows Lidarr's track naming (https://wiki.servarr.com/lidarr/settings#track-naming) with the
// package's own cleaning, until the music part builds it there, as episode-naming.ts does for
// Sonarr's. `checkTrackNaming` is the screen's check before saving, for the same reason.
import type { TrackNaming } from '@highsea-tv/api-contract'
import { cleanFileName, cleanTitle } from '@highsea-tv/media/naming'

export type NamingAlbum = {
  artist: string
  title: string
  year: number
  /** "CD", "Vinyl" or "Digital Media", as MusicBrainz names a medium. */
  medium: string
}
export type NamingTrack = { disc: number; number: number; title: string; artist: string }

/** One of the owner's albums, as its files are named now: Blur's Parklife. */
const PREVIEW_ALBUM: NamingAlbum = { artist: 'Blur', title: 'Parklife', year: 1994, medium: 'CD' }
const PREVIEW_TRACK: NamingTrack = { disc: 1, number: 1, title: 'Girls & Boys', artist: 'Blur' }
/** A second disc's first track, for the multi-disc preview. */
const PREVIEW_DISC_TWO: NamingTrack = { disc: 2, number: 1, title: 'Magic America', artist: 'Blur' }

const TOKEN = /\{([^{}:]+)(?::([^{}]+))?\}/g
const pad = (n: number, format: string | undefined) =>
  format && /^0+$/.test(format) ? String(n).padStart(format.length, '0') : String(n)
const key = (token: string) => token.replace(/[\s._-]/g, '').toLowerCase()

/**
 * A track's file, an album's folder or an artist's, from Lidarr's tokens: `{Artist Name}`,
 * `{Artist CleanName}`, `{Album Title}`, `{Album CleanTitle}`, `{Release Year}`,
 * `{Medium Format}`, `{medium:00}`, `{track:00}`, `{Track Title}`, `{Track CleanTitle}` and
 * `{Track ArtistName}`.
 */
export function buildTrackName(format: string, album: NamingAlbum, track: NamingTrack | null) {
  const values: Record<string, (f?: string) => string> = {
    artistname: () => album.artist,
    artistcleanname: () => cleanTitle(album.artist),
    albumtitle: () => album.title,
    albumcleantitle: () => cleanTitle(album.title),
    releaseyear: () => String(album.year),
    mediumformat: () => album.medium,
    medium: (f) => (track ? pad(track.disc, f) : ''),
    track: (f) => (track ? pad(track.number, f) : ''),
    tracktitle: () => track?.title ?? '',
    trackcleantitle: () => cleanTitle(track?.title ?? ''),
    trackartistname: () => track?.artist ?? '',
  }
  return format
    .split(/[\\/]/)
    .map((piece) =>
      piece
        .replace(TOKEN, (_, token: string, f?: string) =>
          cleanFileName(values[key(token)]?.(f) ?? ''),
        )
        .replace(/ {2,}/g, ' ')
        .replace(/(\s-)+\s*$|^\s*(-\s)+/g, '')
        .trim(),
    )
    .filter(Boolean)
    .join('/')
}

/** Settings' previews: Parklife's first track, and the first of a second disc. */
export const previewTrackFile = (format: string, multiDisc = false) =>
  buildTrackName(format, PREVIEW_ALBUM, multiDisc ? PREVIEW_DISC_TWO : PREVIEW_TRACK)

export const previewArtistFolder = (format: string) => buildTrackName(format, PREVIEW_ALBUM, null)

/** Why a format can't be saved: blank, or without the track number that tells tracks apart. */
export type TrackNamingProblem = 'blank' | 'needsTrack'

const FORMATS = ['standardFormat', 'multiDiscFormat', 'artistFolderFormat'] as const

/** The formats' problems, by field: each needs something in it, and a track's file `{track}`. */
export function checkTrackNaming(
  v: TrackNaming,
): Partial<Record<(typeof FORMATS)[number], TrackNamingProblem>> {
  const out: Partial<Record<(typeof FORMATS)[number], TrackNamingProblem>> = {}
  for (const k of FORMATS) if (!v[k].trim()) out[k] = 'blank'
  for (const k of ['standardFormat', 'multiDiscFormat'] as const)
    if (!out[k] && !/\{track(:0+)?\}/i.test(v[k])) out[k] = 'needsTrack'
  return out
}

export const TRACK_TOKENS =
  '{Artist Name} {Album Title} {Release Year} {Medium Format} {medium:00} {track:00} {Track Title} {Track ArtistName}'

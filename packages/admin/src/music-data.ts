// SPDX-License-Identifier: AGPL-3.0-only
// What Music's screens share (docs/product/music.md, HT-68): their addresses, where an artist's or
// album's details came from, and how a file's format reads ("FLAC · 16-bit · 44.1 kHz").
import type {
  LibraryAlbum,
  MusicMetadataSource,
  TrackFile,
  UnmatchedReason,
} from '@highsea-tv/api-contract'
import type { BadgeTone } from '@highsea-tv/ui/native'

/** Music's own pages, each at its own address; Artists is Music's first. */
export const MUSIC_TABS = ['artists', 'albums', 'unmatched'] as const
export type MusicTab = (typeof MUSIC_TABS)[number]

export const musicPath = (tab: MusicTab = 'artists') =>
  tab === 'artists' ? '/music' : `/music/${tab}`
export const artistPath = (id: string) => `/music/artists/${id}`
export const albumPath = (id: string) => `/music/albums/${id}`

/** An album's tabs: Tracks at its address, Files at `/music/albums/{id}/files`. */
export const ALBUM_TABS = ['tracks', 'files'] as const
export type AlbumTab = (typeof ALBUM_TABS)[number]

export const MUSIC_TOPICS = ['music.updated']

/** MusicBrainz's badge in accent; tags alone are neutral, a fact rather than a fault. */
export const sourceBadge: Record<
  MusicMetadataSource,
  { label: `source.${MusicMetadataSource}`; tone: BadgeTone }
> = {
  musicbrainz: { label: 'source.musicbrainz', tone: 'info' },
  tags: { label: 'source.tags', tone: 'neutral' },
}

/** MusicBrainz's own page for an artist or a release group. */
export const musicBrainzUrl = (kind: 'artist' | 'release-group', id: string) =>
  `https://musicbrainz.org/${kind}/${id}`

/** Why the scan set a folder aside, and how loud: a file it couldn't open is the one to look at. */
export const unmatchedTone: Record<UnmatchedReason, BadgeTone> = {
  'no-tags': 'warning',
  'no-album': 'warning',
  'many-albums': 'info',
  unreadable: 'danger',
}

/** "44.1 kHz", "96 kHz". */
export const kilohertz = (hz: number) => `${Number((hz / 1000).toFixed(1))} kHz`

/** A lossless file's depth and rate ("16-bit · 44.1 kHz"), a lossy one's bitrate ("320 kbps"). */
export const formatDetail = (f: Pick<TrackFile, 'bitDepth' | 'sampleRate' | 'bitrate'>) =>
  f.bitDepth ? `${f.bitDepth}-bit · ${kilohertz(f.sampleRate)}` : `${f.bitrate} kbps`

/** "1:02:14" or "4:05": an album's or a track's length. */
export function clock(seconds: number) {
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** "FLAC", or "MP3 + FLAC" for an album of both. */
export const formatsLine = (a: Pick<LibraryAlbum, 'formats'>) => a.formats.join(' + ')

export { basename, dirname } from './show-data.ts'

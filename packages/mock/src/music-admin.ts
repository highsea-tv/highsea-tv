// SPDX-License-Identifier: AGPL-3.0-only
// Music as the admin keeps it (HT-68, Phase 5's part D, docs/product/music.md): the apps' music
// library (music.ts) with what only the admin sees, the same on every load. Laid out as the owner's
// library is (phase-5-real-use.md, "What the owner's library looks like"): `Artist/Album (Year)/`
// folders under /data/media/music, a few albums split into `CD1` and `CD2`, track files named
// `Artist_Album_01_Title.flac`, about half FLAC and half MP3 with one AAC album, a few `.lrc`
// lyrics, and MusicBrainz ids on about half the albums; the rest are read from their tags alone.
// Unmatched holds four folders the scan couldn't read as an album, one for each reason.
import { coverArt } from '@highsea-tv/fixtures'
import { albumDetail, artistDetail, songsOf } from './music.ts'
import type { ClientAlbum, ClientArtist, ClientMusic } from './types.ts'

export type MusicSourceKind = 'musicbrainz' | 'tags'

export type AdminTrackFile = {
  path: string
  format: string
  bitrate: number
  sampleRate: number
  bitDepth: number | null
  size: number
  lyrics: boolean
}

export type AdminTrack = {
  id: string
  disc: number
  number: number
  title: string
  artist: string | null
  duration: number
  file: AdminTrackFile
}

export type AdminDisc = { number: number; folder: string | null; tracks: AdminTrack[] }

export type AdminAlbum = {
  id: string
  title: string
  sortTitle: string
  artist: { id: string; name: string }
  year: number | null
  kind: ClientAlbum['kind']
  cover: string | null
  genres: string[]
  tracks: number
  discs: number
  duration: number
  size: number
  formats: string[]
  path: string
  source: MusicSourceKind
  musicBrainzId: string | null
  addedAt: string
}

export type AdminAlbumDetail = AdminAlbum & {
  released: string | null
  label: string | null
  discList: AdminDisc[]
  extras: { coverFile: string | null; nfo: boolean }
}

export type AdminArtist = {
  id: string
  name: string
  sortName: string
  photo: string | null
  genres: string[]
  albums: number
  tracks: number
  size: number
  path: string
  source: MusicSourceKind
  musicBrainzId: string | null
  addedAt: string
}

export type AdminArtistDetail = AdminArtist & {
  bio: string | null
  albumList: AdminAlbum[]
  videos: number
}

export type UnmatchedFolder = {
  id: string
  path: string
  files: number
  size: number
  reason: 'no-tags' | 'no-album' | 'many-albums' | 'unreadable'
  guess: { artist: string | null; album: string | null; year: number | null }
  /** Days before now the scan found it. */
  days: number
}

/** Where the mock's music lives: the seeded Music root folder (settings.ts's `rf-music`). */
export const MUSIC_ROOT = '/data/media/music'

function hash(s: string) {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619)
  return h >>> 0
}

/** A MusicBrainz-shaped id (a UUID), the same for the same name on every load. */
const mbid = (seed: string) => {
  const hex = [0, 1, 2, 3].map((i) => hash(`${seed}:${i}`).toString(16).padStart(8, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** A name as a folder or file holds it: what a filesystem can't keep becomes a space. */
const safe = (s: string) =>
  s
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
/** A name in a track's file name, as the owner's files have them: words joined by underscores. */
const under = (s: string) => safe(s).replace(/\s/g, '_')

/** Albums the owner's library splits into `CD1` and `CD2`, and where the second disc starts. */
const TWO_DISCS: Record<string, number> = {
  'nocturne-michi-chopin-nocturnes': 11,
  'the-marble-rooms-rooms-b-sides': 8,
  'marisol-vega-live-at-the-corner-room': 7,
}

/** A guest on one track, so a track's own artist shows. */
const GUESTS: Record<string, string> = {
  'marisol-vega-live-at-the-corner-room-5': 'Marisol Vega feat. Ollie Ward',
  'mara-lune-satellite-heart-4': 'Mara Lune & Corvid Line',
}

/** The artists with their own `.lrc` lyrics beside some tracks. */
const LYRICS = new Set(['mara-lune', 'ollie-ward'])

/** Artists with no MusicBrainz id anywhere: their albums are read from tags alone. */
const TAGS_ONLY = new Set([
  'aurora-fields',
  'ferrous-loom',
  'halcyon-freight',
  'juniper-wide',
  '8-bit-harbour',
  'corvid-line',
  'ivory-kettle',
])

/** Albums whose folder has music videos beside them (`.mp4`), set aside for later (answer 11). */
const VIDEOS: Record<string, number> = { 'mara-lune': 3, 'the-hollow-pines': 2, 'cinder-ash': 1 }

type Format = Pick<AdminTrackFile, 'format' | 'bitrate' | 'sampleRate' | 'bitDepth'>
const FLAC_CD: Format = { format: 'FLAC', bitrate: 0, sampleRate: 44_100, bitDepth: 16 }
const FLAC_HI: Format = { format: 'FLAC', bitrate: 0, sampleRate: 96_000, bitDepth: 24 }
const MP3_320: Format = { format: 'MP3', bitrate: 320, sampleRate: 44_100, bitDepth: null }
const MP3_V0: Format = { format: 'MP3', bitrate: 245, sampleRate: 44_100, bitDepth: null }
const AAC_256: Format = { format: 'AAC', bitrate: 256, sampleRate: 44_100, bitDepth: null }

/** An album's files' format, from the album: about half lossless, one AAC album, one mixed. */
function formatOf(a: ClientAlbum, track: number): Format {
  if (a.id === 'ollie-ward-sunday-kitchen') return AAC_256
  // bought as MP3 first, then two tracks replaced with FLAC
  if (a.id === 'cinder-ash-ember-days') return track <= 2 ? FLAC_CD : MP3_V0
  if (a.genres.includes('Classical') || a.id === 'jan-morgenstern-sintel-original-score')
    return FLAC_HI
  const h = hash(a.id) % 10
  return h < 5 ? FLAC_CD : h < 8 ? MP3_320 : MP3_V0
}

/** A lossless file's average bitrate, as ffprobe gives it: it varies with the music. */
const losslessRate = (f: Format, seed: string) =>
  f.bitDepth === 24 ? 2_600 + (hash(seed) % 900) : 780 + (hash(seed) % 340)

/** The folder of an album: `Artist/Album (Year)`. */
const albumFolder = (a: ClientAlbum) =>
  `${MUSIC_ROOT}/${safe(a.artist.name)}/${safe(a.title)}${a.year ? ` (${a.year})` : ''}`

const ext = (format: string) =>
  format === 'FLAC' ? 'flac' : format === 'AAC' ? 'm4a' : format === 'ALAC' ? 'm4a' : 'mp3'

/** An album's discs and tracks, each with its file. */
function discsOf(a: ClientAlbum): AdminDisc[] {
  const songs = songsOf(a)
  const split = TWO_DISCS[a.id]
  const folder = albumFolder(a)
  const tracks = songs.map((s, i): AdminTrack => {
    const disc = split && i >= split ? 2 : 1
    const number = split && i >= split ? i - split + 1 : i + 1
    const f = formatOf(a, number)
    const bitrate = f.bitrate || losslessRate(f, s.id)
    const name = `${under(a.artist.name)}_${under(a.title)}_${String(number).padStart(2, '0')}_${under(s.title)}.${ext(f.format)}`
    return {
      id: s.id,
      disc,
      number,
      title: s.title,
      artist: GUESTS[s.id] ?? null,
      duration: s.duration,
      file: {
        path: `${folder}${split ? `/CD${disc}` : ''}/${name}`,
        ...f,
        bitrate,
        size: Math.round((bitrate * 1000 * s.duration) / 8) + 40_000,
        lyrics: LYRICS.has(a.artist.id) && hash(s.id) % 3 === 0,
      },
    }
  })
  const discs = split ? [1, 2] : [1]
  return discs.map((n) => ({
    number: n,
    folder: split ? `CD${n}` : null,
    tracks: tracks.filter((t) => t.disc === n),
  }))
}

/** Each format among the files, the most first. */
function formatsOf(discs: AdminDisc[]) {
  const counts = new Map<string, number>()
  for (const t of discs.flatMap((d) => d.tracks))
    counts.set(t.file.format, (counts.get(t.file.format) ?? 0) + 1)
  return [...counts].sort((x, y) => y[1] - x[1]).map(([f]) => f)
}

const albumSource = (a: ClientAlbum): MusicSourceKind =>
  TAGS_ONLY.has(a.artist.id) || hash(`${a.id}:mb`) % 5 === 0 ? 'tags' : 'musicbrainz'

function albumOf(a: ClientAlbum): AdminAlbum & { discList: AdminDisc[] } {
  const discList = discsOf(a)
  const all = discList.flatMap((d) => d.tracks)
  const source = albumSource(a)
  return {
    id: a.id,
    title: a.title,
    sortTitle: a.sortTitle,
    artist: a.artist,
    year: a.year,
    kind: a.kind,
    // a tags-only album has the folder's own cover (folder.jpg) when it has one; one here has none
    cover: a.id === 'halcyon-freight-cargo' ? null : a.cover,
    genres: a.genres,
    tracks: all.length,
    discs: discList.length,
    duration: all.reduce((n, t) => n + t.duration, 0),
    size: all.reduce((n, t) => n + t.file.size, 0),
    formats: formatsOf(discList),
    path: albumFolder(a),
    source,
    musicBrainzId: source === 'musicbrainz' ? mbid(a.id) : null,
    addedAt: a.addedAt,
    discList,
  }
}

const strip = ({ discList: _, ...a }: AdminAlbum & { discList: AdminDisc[] }): AdminAlbum => a

/** The admin's music, built from the apps' library (and any albums the owner matched since). */
export function musicAdmin(music: ClientMusic) {
  const full = music.albums.map(albumOf)
  const albums = full.map(strip)
  const artistsOf = (id: string) => albums.filter((a) => a.artist.id === id)

  const artists: AdminArtist[] = music.artists.map((x) => {
    const mine = artistsOf(x.id)
    const source: MusicSourceKind = mine.some((a) => a.source === 'musicbrainz')
      ? 'musicbrainz'
      : 'tags'
    return {
      id: x.id,
      name: x.name,
      sortName: x.sortName,
      // MusicBrainz's picture, or the folder's artist art; a tags-only artist without art has none
      photo: (source === 'tags' && hash(x.id) % 2 === 0) || !x.photo ? null : x.photo,
      genres: x.genres,
      albums: mine.length,
      tracks: mine.reduce((n, a) => n + a.tracks, 0),
      size: mine.reduce((n, a) => n + a.size, 0),
      path: `${MUSIC_ROOT}/${safe(x.name)}`,
      source,
      musicBrainzId: source === 'musicbrainz' ? mbid(x.id) : null,
      addedAt: x.addedAt,
    }
  })

  return {
    artists,
    albums,
    artist(id: string): AdminArtistDetail | null {
      const a = artists.find((x) => x.id === id)
      if (!a) return null
      const d = artistDetail(music, id)
      return {
        ...a,
        // a biography comes from MusicBrainz, so a tags-only artist has none
        bio: a.source === 'musicbrainz' ? (d?.bio ?? null) : null,
        albumList: artistsOf(id).sort(
          (x, y) => (y.year ?? 0) - (x.year ?? 0) || x.sortTitle.localeCompare(y.sortTitle),
        ),
        videos: VIDEOS[id] ?? 0,
      }
    },
    album(id: string): AdminAlbumDetail | null {
      const a = full.find((x) => x.id === id)
      if (!a) return null
      const d = albumDetail(music, id)
      return {
        ...a,
        // MusicBrainz's release date; the tags carry only the year
        released: a.source === 'musicbrainz' ? (d?.released ?? null) : null,
        label: a.source === 'musicbrainz' ? (d?.label ?? null) : null,
        extras: {
          coverFile: a.cover ? `${a.path}/folder.jpg` : null,
          nfo: a.source === 'musicbrainz',
        },
      }
    },
    /** Bytes every track takes. */
    size: albums.reduce((n, a) => n + a.size, 0),
  }
}

/** The folders the scan set aside, one for each reason. */
export function unmatchedSeed(kind: 'populated' | 'empty'): UnmatchedFolder[] {
  if (kind === 'empty') return []
  return [
    {
      id: 'um-summer-mix',
      path: `${MUSIC_ROOT}/Various Artists/Summer Mix 2019`,
      files: 18,
      size: 142_000_000,
      reason: 'many-albums',
      guess: { artist: 'Various Artists', album: 'Summer Mix 2019', year: 2019 },
      days: 1,
    },
    {
      id: 'um-live-bootleg',
      path: `${MUSIC_ROOT}/Ferrous Loom/Live at Halle 6 (2022)`,
      files: 7,
      size: 61_000_000,
      reason: 'no-album',
      guess: { artist: 'Ferrous Loom', album: 'Live at Halle 6', year: 2022 },
      days: 3,
    },
    {
      id: 'um-untitled',
      path: `${MUSIC_ROOT}/Unsorted/new folder (2)`,
      files: 9,
      size: 74_000_000,
      reason: 'no-tags',
      guess: { artist: null, album: null, year: null },
      days: 6,
    },
    {
      id: 'um-demos',
      path: `${MUSIC_ROOT}/The Hollow Pines/Demos`,
      files: 3,
      size: 21_000_000,
      reason: 'unreadable',
      guess: { artist: 'The Hollow Pines', album: 'Demos', year: null },
      days: 12,
    },
  ]
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * A matched folder as an album of the apps' library: its files become its tracks, its artist the
 * one named (made when they aren't here), and its details are the owner's, as tags would give them.
 */
export function matchedAlbum(
  music: ClientMusic,
  folder: UnmatchedFolder,
  match: { artist: string; album: string; year: number | null },
  addedAt: string,
): ClientMusic {
  const known = music.artists.find((a) => a.name.toLowerCase() === match.artist.toLowerCase())
  const artist: ClientArtist = known ?? {
    id: slug(match.artist),
    name: match.artist,
    sortName: match.artist.replace(/^(the|a)\s+/i, ''),
    // no picture yet: the admin shows none (`photo: null`) until a refresh finds one
    photo: '',
    albums: 0,
    genres: [],
    addedAt,
  }
  const album: ClientAlbum = {
    id: slug(`${artist.name} ${match.album}`),
    title: match.album,
    sortTitle: match.album.replace(/^(the|a)\s+/i, ''),
    artist: { id: artist.id, name: artist.name },
    year: match.year ?? new Date(addedAt).getUTCFullYear(),
    cover: coverArt(`${artist.name} ${match.album}`),
    genres: artist.genres,
    tracks: folder.files,
    kind: folder.reason === 'many-albums' ? 'compilation' : 'album',
    addedAt,
  }
  return {
    artists: known
      ? music.artists.map((a) => (a.id === known.id ? { ...a, albums: a.albums + 1 } : a))
      : [...music.artists, { ...artist, albums: 1 }],
    albums: [...music.albums.filter((a) => a.id !== album.id), album],
  }
}

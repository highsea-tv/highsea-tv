// SPDX-License-Identifier: AGPL-3.0-only
// What's on disk in a Music root folder (Phase 5 D, ADR 0065): its album folders, read where they
// are and never written to. An album is a folder holding audio files, with any `CD1`, `Disc 2`
// folders inside it read as its discs, as Lidarr lays them out (`Artist/Album (Year)/CD1/…`) and
// Plex and Jellyfin read them. Beside the tracks, as the owner's library has them:
//
// - the album's cover file (`cover.jpg`, `folder.jpg`, `front.jpg`) and the artist's picture in the
//   artist's folder (`artist.jpg`, `folder.jpg`), Kodi's names (https://kodi.wiki/view/Music_artwork);
// - Kodi's `album.nfo` and `artist.nfo`, which Lidarr writes, read for their MusicBrainz ids
//   (https://kodi.wiki/view/NFO_files/Music): `<musicbrainzalbumid>`, `<musicbrainzreleasegroupid>`
//   and `<musicbrainzartistid>`;
// - a `.lrc` beside a track with its name: its lyrics;
// - music videos (`.mp4` and other video files), counted and set aside (the owner's answer 11).
//
// Folders starting with `.` or `@` (Synology's `@eaDir`) and `#recycle` are passed by.
import { promises as fsp } from 'node:fs'
import { basename, dirname, extname, join, relative, sep } from 'node:path'

/** The audio formats ffprobe reads that people keep music in. */
export const AUDIO_EXTENSIONS = new Set([
  '.flac',
  '.mp3',
  '.m4a',
  '.aac',
  '.ogg',
  '.oga',
  '.opus',
  '.wav',
  '.aif',
  '.aiff',
  '.wma',
  '.ape',
  '.wv',
])
/** Music videos, set aside for a later part. */
export const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.mkv', '.mov', '.avi', '.webm'])
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']
const ALBUM_COVERS = ['cover', 'folder', 'front', 'album']
const ARTIST_PICTURES = ['artist', 'folder', 'thumb', 'poster']

/** `CD1`, `CD 2`, `Disc 1`, `Disk 02`, `cd1 - bonus`: a disc's folder and its number. */
const DISC_FOLDER = /^(?:cd|disc|disk)\s*[-_.]?\s*(\d{1,2})(?!\d)/i

export const discOfFolder = (name: string): number | null => {
  const m = DISC_FOLDER.exec(name.trim())
  const n = m ? Number(m[1]) : 0
  return n > 0 ? n : null
}

const skipped = (name: string) =>
  name.startsWith('.') || name.startsWith('@') || name.toLowerCase() === '#recycle'

export type FoundTrack = {
  path: string
  /** The disc folder's name, when the track is in one. */
  discFolder: string | null
  discOfFolder: number | null
  size: number
  mtime: number
  /** A `.lrc` beside it with its name. */
  lyricsFile: string | null
}

export type AlbumFolder = {
  path: string
  tracks: FoundTrack[]
  coverFile: string | null
  /** `album.nfo` when it's there. */
  nfo: string | null
}

export type MusicFolderScan = {
  albums: AlbumFolder[]
  /** Every video file found, for each artist's count. */
  videos: string[]
}

type Listing = { files: Map<string, { size: number; mtime: number }>; dirs: string[] }

async function list(dir: string): Promise<Listing | null> {
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => null)
  if (!entries) return null
  const files = new Map<string, { size: number; mtime: number }>()
  const dirs: string[] = []
  for (const e of entries) {
    if (skipped(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) dirs.push(full)
    else if (e.isFile()) {
      const st = await fsp.stat(full).catch(() => null)
      if (st) files.set(full, { size: st.size, mtime: Math.trunc(st.mtimeMs) })
    }
  }
  dirs.sort()
  return { files, dirs }
}

const isAudio = (path: string) => AUDIO_EXTENSIONS.has(extname(path).toLowerCase())
const isVideo = (path: string) => VIDEO_EXTENSIONS.has(extname(path).toLowerCase())

/** The first of `names` (any case, any image extension) among a folder's files. */
function pictureIn(files: Iterable<string>, names: string[]): string | null {
  const byName = new Map<string, string>()
  for (const f of files) {
    const ext = extname(f).toLowerCase()
    if (IMAGE_EXTENSIONS.includes(ext)) byName.set(basename(f, extname(f)).toLowerCase(), f)
  }
  for (const n of names) {
    const hit = byName.get(n)
    if (hit) return hit
  }
  return null
}

const nfoIn = (files: Iterable<string>, name: string) =>
  [...files].find((f) => basename(f).toLowerCase() === name) ?? null

function tracksIn(listing: Listing, disc: { folder: string; number: number } | null): FoundTrack[] {
  const lrc = new Map<string, string>()
  for (const f of listing.files.keys())
    if (extname(f).toLowerCase() === '.lrc') lrc.set(f.slice(0, -4).toLowerCase(), f)
  return [...listing.files]
    .filter(([f]) => isAudio(f))
    .map(([path, st]) => ({
      path,
      discFolder: disc?.folder ?? null,
      discOfFolder: disc?.number ?? null,
      size: st.size,
      mtime: st.mtime,
      lyricsFile: lrc.get(path.slice(0, -extname(path).length).toLowerCase()) ?? null,
    }))
}

/**
 * Every album folder under `dir` (a root folder, or a folder in one), each with its tracks, discs
 * included, sorted by path. Null when `dir` can't be read.
 */
export async function scanMusicFolder(dir: string): Promise<MusicFolderScan | null> {
  const top = await list(dir)
  if (!top) return null
  const albums: AlbumFolder[] = []
  const videos: string[] = []

  async function walk(path: string, listing: Listing) {
    for (const f of listing.files.keys()) if (isVideo(f)) videos.push(f)
    const tracks = tracksIn(listing, null)
    const others: [string, Listing][] = []
    for (const sub of listing.dirs) {
      const inner = await list(sub)
      if (!inner) continue
      const number = discOfFolder(basename(sub))
      const discTracks = number ? tracksIn(inner, { folder: basename(sub), number }) : []
      if (number && discTracks.length) {
        tracks.push(...discTracks)
        for (const f of inner.files.keys()) if (isVideo(f)) videos.push(f)
        // anything deeper in a disc folder is its own
        for (const deeper of inner.dirs) {
          const l = await list(deeper)
          if (l) others.push([deeper, l])
        }
      } else others.push([sub, inner])
    }
    if (tracks.length)
      albums.push({
        path,
        tracks: tracks.sort((a, b) => a.path.localeCompare(b.path)),
        coverFile: pictureIn(listing.files.keys(), ALBUM_COVERS),
        nfo: nfoIn(listing.files.keys(), 'album.nfo'),
      })
    for (const [sub, l] of others) await walk(sub, l)
  }

  await walk(dir, top)
  albums.sort((a, b) => a.path.localeCompare(b.path))
  return { albums, videos }
}

/** The artist's folder an album sits in (`Artist/Album`), or null when it sits at the root. */
export function artistFolderOf(root: string, album: string): string | null {
  const parts = relative(root, album).split(sep).filter(Boolean)
  return parts.length >= 2 ? join(root, parts[0] as string) : null
}

/** An artist's folder's picture and `artist.nfo`, read where they are. */
export async function artistFolderFiles(
  folder: string,
): Promise<{ photoFile: string | null; nfo: string | null }> {
  const listing = await list(folder)
  if (!listing) return { photoFile: null, nfo: null }
  return {
    photoFile: pictureIn(listing.files.keys(), ARTIST_PICTURES),
    nfo: nfoIn(listing.files.keys(), 'artist.nfo'),
  }
}

const NFO_TAG = (name: string) => new RegExp(`<${name}>\\s*([0-9a-f-]{36})\\s*</${name}>`, 'i')
const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const idIn = (text: string, tag: string) => {
  const id = NFO_TAG(tag).exec(text)?.[1]?.toLowerCase() ?? null
  return id && MBID.test(id) ? id : null
}

export type NfoIds = {
  releaseId: string | null
  releaseGroupId: string | null
  artistId: string | null
}

/** The MusicBrainz ids in Kodi's `album.nfo` or `artist.nfo`; nulls when it can't be read. */
export async function readMusicNfo(path: string | null): Promise<NfoIds> {
  const text = path ? await fsp.readFile(path, 'utf8').catch(() => '') : ''
  return {
    releaseId: idIn(text, 'musicbrainzalbumid'),
    releaseGroupId: idIn(text, 'musicbrainzreleasegroupid'),
    artistId: idIn(text, 'musicbrainzartistid'),
  }
}

/**
 * What an album folder's names suggest, Lidarr's `Artist/Album (Year)`: the album and its year
 * from the folder, the artist from the folder above it when that isn't the root.
 */
export function guessFromFolder(
  root: string,
  folder: string,
): { artist: string | null; album: string | null; year: number | null } {
  const parent = dirname(folder)
  const name = basename(folder)
  const m = /^(.*?)\s*[([](\d{4})[)\]]\s*(.*)$/.exec(name)
  const album = (m ? `${m[1]} ${m[3]}` : name).replace(/\s+/g, ' ').trim() || null
  const year = m ? Number(m[2]) : null
  const artist =
    folder !== root && parent !== root && relative(root, parent) ? basename(parent) : null
  return { artist: artist || null, album, year }
}

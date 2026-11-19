// SPDX-License-Identifier: AGPL-3.0-only
// Albums' covers and artists' pictures (`/api/v1/images/music/{album|artist}/{id}`, HT-101), from
// the best source each has, in this order:
//
// - an album: the cover file in its folder (`cover.jpg`, `folder.jpg`…, as Plex, Jellyfin and
//   Lidarr read them), served as it is; else the picture in one of its files (the `attached_pic`
//   stream ffprobe reported), copied out once with ffmpeg; else the Cover Art Archive's front cover
//   for its release group, fetched once (https://musicbrainz.org/doc/Cover_Art_Archive/API);
// - an artist: the picture in their folder (`artist.jpg`…); else fanart.tv's artist thumb for their
//   MusicBrainz id, fetched once (ADR 0070's section of 2026-11-19).
//
// What's copied or fetched is kept under the data folder's `images/music/`, named by the album or
// artist and a hash of where it came from, so a new cover in the folder or a new address is a new
// file, and the old one is removed. Paths come only from the library's rows, never the request.
// Copying a picture out of a file follows ffmpeg's documentation: `-map 0:v:0` picks the attached
// picture (it's a video stream with the `attached_pic` disposition), `-c copy` keeps its bytes as
// they are, and the image2 muxer with `-update 1` writes them to one file
// (https://ffmpeg.org/ffmpeg-formats.html#image2-1).
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import { extname, isAbsolute, join } from 'node:path'
import { AppError, newId } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { eq } from 'drizzle-orm'
import type { MusicDeps } from './context.ts'

const { musicAlbums, musicArtists } = schema

/** No cover comes near this; anything larger isn't one. */
const MAX_BYTES = 10 * 1024 * 1024

export type MusicImage = {
  /** The file on disk, absolute. */
  path: string
  contentType: string
  /** Changes when the picture does: the file's size and time, or the cached copy's name. */
  etag: string
}

const TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

/** A picture's type from its first bytes (JPEG's SOI, PNG's signature, RIFF…WEBP); else null. */
export function sniffImage(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return 'image/webp'
  return null
}

/** Copies the picture in an audio file out to `out`; rejects when there's none or ffmpeg fails. */
export type CoverExtractor = (track: string, out: string) => Promise<void>

export const ffmpegCoverExtractor =
  (ffmpeg: string, timeoutMs = 20_000): CoverExtractor =>
  (track, out) =>
    new Promise((resolve, reject) => {
      if (!isAbsolute(track) || !isAbsolute(out)) {
        reject(new Error('Only full paths are read and written.'))
        return
      }
      execFile(
        ffmpeg,
        // biome-ignore format: ffmpeg's options read best in their pairs
        ['-v', 'error', '-nostdin', '-y', '-i', track, '-map', '0:v:0', '-frames:v', '1',
          '-c', 'copy', '-f', 'image2', '-update', '1', out],
        { timeout: timeoutMs, windowsHide: true },
        (error) => (error ? reject(error) : resolve()),
      )
    })

export function createMusicImages(
  ctx: MusicDeps,
  opts: {
    /** Where copies and fetched pictures are kept (the data folder's `images/music`). */
    dir: string
    extract?: CoverExtractor
  },
) {
  const { db } = ctx
  const log = ctx.logger.child('music-images')
  const inFlight = new Map<string, Promise<MusicImage>>()
  const notFound = () => new AppError('not-found', 'There’s no picture for that.')

  /** A file in the folder, served where it is. */
  async function local(path: string): Promise<MusicImage | null> {
    const type = TYPES[extname(path).toLowerCase()]
    if (!type) return null
    const st = await fsp.stat(path).catch(() => null)
    if (!st?.isFile() || st.size === 0 || st.size > MAX_BYTES) return null
    return {
      path,
      contentType: type,
      etag: `"${st.size.toString(36)}-${Math.trunc(st.mtimeMs).toString(36)}"`,
    }
  }

  /** The kept copy for `key` (`album-al_x`) from `source`, made by `make` the first time. */
  async function kept(
    key: string,
    source: string,
    make: () => Promise<Uint8Array>,
  ): Promise<MusicImage> {
    const hash = createHash('sha256').update(source).digest('hex').slice(0, 16)
    const base = `${key}-${hash}`
    for (const [ext, type] of [
      ['.jpg', 'image/jpeg'],
      ['.png', 'image/png'],
      ['.webp', 'image/webp'],
    ] as const) {
      const path = join(opts.dir, `${base}${ext}`)
      const st = await fsp.stat(path).catch(() => null)
      if (st?.isFile() && st.size > 0) return { path, contentType: type, etag: `"${hash}"` }
    }
    let pending = inFlight.get(base)
    if (!pending) {
      pending = (async () => {
        const bytes = await make()
        const type = sniffImage(bytes)
        if (!type || bytes.length > MAX_BYTES) throw notFound()
        const ext = type === 'image/png' ? '.png' : type === 'image/webp' ? '.webp' : '.jpg'
        await fsp.mkdir(opts.dir, { recursive: true })
        // the older copies of this album's or artist's picture go
        for (const name of await fsp.readdir(opts.dir).catch(() => [] as string[]))
          if (name.startsWith(`${key}-`) && !name.startsWith(base))
            await fsp.rm(join(opts.dir, name), { force: true })
        const path = join(opts.dir, `${base}${ext}`)
        // written beside, then renamed: a reader never sees half a file
        const temp = `${path}.${newId('tmp')}`
        await fsp.writeFile(temp, bytes)
        await fsp.rename(temp, path)
        return { path, contentType: type, etag: `"${hash}"` }
      })().finally(() => inFlight.delete(base))
      inFlight.set(base, pending)
    }
    return pending
  }

  /** The picture in an audio file, copied out with ffmpeg. */
  async function embedded(key: string, track: string): Promise<MusicImage | null> {
    if (!opts.extract || !opts.dir) return null
    const st = await fsp.stat(track).catch(() => null)
    if (!st) return null
    return kept(key, `file:${track}:${st.size}:${Math.trunc(st.mtimeMs)}`, async () => {
      await fsp.mkdir(opts.dir, { recursive: true })
      const out = join(opts.dir, `${key}.${newId('tmp')}.img`)
      try {
        await (opts.extract as CoverExtractor)(track, out)
        return new Uint8Array(await fsp.readFile(out))
      } finally {
        await fsp.rm(out, { force: true })
      }
    }).catch((e: Error) => {
      log.info('couldn’t copy the picture out of a file', { track, error: e.message })
      return null
    })
  }

  /** A picture fetched from an address (the Cover Art Archive's, fanart.tv's). */
  function fetched(key: string, url: string, get: (url: string) => Promise<Response>) {
    return kept(key, `url:${url}`, async () => {
      const res = await get(url)
      if (res.status === 404) {
        await res.body?.cancel()
        throw notFound()
      }
      if (!res.ok) {
        await res.body?.cancel()
        throw new AppError('unavailable', 'That picture’s source isn’t answering. Try again later.')
      }
      const length = Number(res.headers.get('content-length') ?? 0)
      if (length > MAX_BYTES) {
        await res.body?.cancel()
        throw notFound()
      }
      return new Uint8Array(await res.arrayBuffer())
    })
  }

  async function album(id: string): Promise<MusicImage> {
    const a = db.select().from(musicAlbums).where(eq(musicAlbums.id, id)).get()
    if (!a) throw notFound()
    const key = `album-${id}`
    const found =
      (a.coverFile ? await local(a.coverFile) : null) ??
      (a.embeddedCover ? await embedded(key, a.embeddedCover) : null)
    if (found) return found
    if (a.coverUrl && opts.dir) return fetched(key, a.coverUrl, ctx.metadata.music.coverImage)
    throw notFound()
  }

  async function artist(id: string): Promise<MusicImage> {
    const a = db.select().from(musicArtists).where(eq(musicArtists.id, id)).get()
    if (!a) throw notFound()
    const found = a.photoFile ? await local(a.photoFile) : null
    if (found) return found
    if (a.photoUrl && opts.dir)
      return fetched(`artist-${id}`, a.photoUrl, ctx.metadata.music.artistImage)
    throw notFound()
  }

  return {
    /** The picture's file, its type and its ETag; not-found when there's none. */
    get: (kind: 'album' | 'artist', id: string) => (kind === 'album' ? album(id) : artist(id)),
  }
}

export type MusicImages = ReturnType<typeof createMusicImages>

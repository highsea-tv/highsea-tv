// SPDX-License-Identifier: AGPL-3.0-only
// Images cached by the server (owner's decision 4): fetched from TMDB's image server on first use,
// kept under `/data/images/{size}/{file}`, and served from `/api/v1/images/…`. Clients never contact
// TMDB. A file's path is built only from parts `parseImageRef` accepted, and checked to stay inside
// the folder (docs/plans/phase-3-server.md, Known pitfalls › Paths). fanart.tv's files (`/ftv_…`,
// HT-74) come from its asset server, at an address its answer for the title gave, and are resized
// to the size asked for as uploads are.
import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { AppError, newId } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { and, eq } from 'drizzle-orm'
import { type Artwork, UPLOAD_PREFIX } from './artwork.ts'
import type { MetadataDeps } from './context.ts'
import { isFanartFile } from './fanart/source.ts'
import { contentTypeOf, type ImageRef, parseImageRef } from './image-url.ts'
import type { TmdbClient } from './tmdb/client.ts'

const { images } = schema

/** TMDB's image server, as `/3/configuration` gives it (`images.secure_base_url`). */
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/'

/** No poster or backdrop at the sizes served comes near this. */
const MAX_BYTES = 10 * 1024 * 1024

export type CachedImage = {
  /** The file on disk, absolute. */
  path: string
  contentType: string
  bytes: number
}

export function createImages(
  deps: Pick<MetadataDeps, 'db' | 'clock' | 'logger' | 'imagesDir' | 'resizeImage'>,
  client: TmdbClient,
  baseUrl: () => string,
  artwork?: Pick<Artwork, 'uploaded'>,
  fanart?: {
    /** The address of a fanart file for a title at a width, from its cached answer; null if none. */
    url: (owner: string, ownerId: number, file: string, width: number) => string | null
    image: (url: string) => Promise<Response>
  },
) {
  const { db, clock, imagesDir } = deps
  const root = resolve(imagesDir)
  const inFlight = new Map<string, Promise<CachedImage>>()

  function fileFor(size: string, file: string) {
    const path = resolve(join(root, size, file.slice(1)))
    if (!path.startsWith(root + sep)) throw new AppError('invalid', 'That isn’t an image address.')
    return path
  }

  const notFound = () => new AppError('not-found', 'There’s no image at that address.')

  /**
   * An uploaded image at a size (HT-66): made from the original in the database, no larger than
   * it, as TMDB's sizes are a width (`w342`) or a height (`h632`). Without a resizer (no ffmpeg),
   * the original serves at every size.
   */
  async function rendition(
    ref: ImageRef,
    original: { data: Uint8Array; contentType: string },
  ): Promise<Uint8Array> {
    const n = Number(ref.size.slice(1))
    if (!deps.resizeImage) return original.data
    try {
      return await deps.resizeImage(original.data, {
        [ref.size.startsWith('h') ? 'height' : 'width']: n,
        type: original.contentType === 'image/png' ? 'image/png' : 'image/jpeg',
      })
    } catch (e) {
      deps.logger.warn('couldn’t resize artwork; serving the original', {
        file: ref.file,
        error: (e as Error).message,
      })
      return original.data
    }
  }

  async function fetchAndStore(ref: ImageRef): Promise<CachedImage> {
    const path = fileFor(ref.size, ref.file)
    const original = artwork?.uploaded(ref.file)
    if (original) return store(ref, path, await rendition(ref, original))
    // an upload's name is highsea's own: once replaced or reset, TMDB has nothing by it
    if (ref.file.startsWith(`/${UPLOAD_PREFIX}_`)) throw notFound()
    if (isFanartFile(ref.file)) return fromFanart(ref, path)
    const res = await client.image(`${baseUrl()}${ref.size}${ref.file}`)
    if (res.status === 404) throw notFound()
    if (!res.ok)
      throw new AppError('unavailable', 'TMDB’s images aren’t answering. Try again in a moment.', {
        reason: 'tmdb-unreachable',
      })
    const type = res.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
    if (!/^image\/(jpeg|png|webp)$/.test(type)) throw notFound()
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length === 0 || bytes.length > MAX_BYTES) throw notFound()
    return store(ref, path, bytes)
  }

  /**
   * A fanart.tv file: only one its answer for this title lists (so no other address is fetched),
   * then made the size asked for, as an upload is. fanart.tv down is the same as TMDB's images down.
   */
  async function fromFanart(ref: ImageRef, path: string): Promise<CachedImage> {
    const n = Number(ref.size.slice(1)) || 0
    const url = fanart?.url(ref.owner, Number(ref.ownerId), ref.file, n)
    if (!fanart || !url) throw notFound()
    let res: Response
    try {
      res = await fanart.image(url)
    } catch (e) {
      if (e instanceof AppError) throw e
      throw new AppError('unavailable', 'fanart.tv’s images aren’t answering. Try again later.', {
        reason: 'fanart-unavailable',
      })
    }
    if (res.status === 404) throw notFound()
    if (!res.ok)
      throw new AppError('unavailable', 'fanart.tv’s images aren’t answering. Try again later.', {
        reason: 'fanart-unavailable',
      })
    const type = res.headers.get('content-type')?.split(';')[0]?.trim() ?? ''
    if (!/^image\/(jpeg|png)$/.test(type)) throw notFound()
    const data = new Uint8Array(await res.arrayBuffer())
    if (data.length === 0 || data.length > MAX_BYTES) throw notFound()
    return store(ref, path, await rendition(ref, { data, contentType: type }))
  }

  function store(ref: ImageRef, path: string, bytes: Uint8Array): CachedImage {
    mkdirSync(join(root, ref.size), { recursive: true })
    // written beside, then renamed: a reader never sees half a file
    const temp = `${path}.${newId('tmp')}`
    writeFileSync(temp, bytes)
    renameSync(temp, path)
    const row = {
      path: ref.file,
      size: ref.size,
      kind: ref.kind,
      ownerType: ref.owner,
      ownerId: ref.ownerId,
      file: `${ref.size}${ref.file}`,
      contentType: contentTypeOf(ref.file),
      bytes: bytes.length,
      fetchedAt: clock.now(),
    }
    db.insert(images)
      .values(row)
      .onConflictDoUpdate({ target: [images.path, images.size], set: row })
      .run()
    return { path, contentType: row.contentType, bytes: row.bytes }
  }

  return {
    /**
     * The cached file for an image address's parts (`owner`, `ownerId`, `kind`, `size`, `file`),
     * fetched from TMDB the first time. Throws not-found for any part highsea doesn't serve.
     */
    async get(parts: {
      owner: string
      ownerId: string | number
      kind: string
      size: string
      file: string
    }): Promise<CachedImage> {
      const ref = parseImageRef(parts)
      if (!ref) throw notFound()
      const row = db
        .select()
        .from(images)
        .where(and(eq(images.path, ref.file), eq(images.size, ref.size)))
        .get()
      if (row) {
        const path = fileFor(row.size, row.path)
        try {
          if (statSync(path).size === row.bytes)
            return { path, contentType: row.contentType, bytes: row.bytes }
        } catch {
          // the file went missing: fetch it again
        }
      }
      const key = `${ref.size}${ref.file}`
      let pending = inFlight.get(key)
      if (!pending) {
        pending = fetchAndStore(ref).finally(() => inFlight.delete(key))
        inFlight.set(key, pending)
      }
      return pending
    },

    /** Removes every size of one file (an upload replaced or reset). */
    removeFile(file: string) {
      const rows = db
        .select({ path: images.path, size: images.size })
        .from(images)
        .where(eq(images.path, file))
        .all()
      for (const r of rows) {
        db.delete(images)
          .where(and(eq(images.path, r.path), eq(images.size, r.size)))
          .run()
        rmSync(fileFor(r.size, r.path), { force: true })
      }
      return rows.length
    },

    /** Removes image rows and their files. */
    remove(rows: { path: string; size: string }[]) {
      for (const r of rows) {
        db.delete(images)
          .where(and(eq(images.path, r.path), eq(images.size, r.size)))
          .run()
        rmSync(fileFor(r.size, r.path), { force: true })
      }
      return rows.length
    },
  }
}

export type Images = ReturnType<typeof createImages>

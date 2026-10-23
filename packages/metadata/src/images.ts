// SPDX-License-Identifier: AGPL-3.0-only
// Images cached by the server (owner's decision 4): fetched from TMDB's image server on first use,
// kept under `/data/images/{size}/{file}`, and served from `/api/v1/images/…`. Clients never contact
// TMDB. A file's path is built only from parts `parseImageRef` accepted, and checked to stay inside
// the folder (docs/plans/phase-3-server.md, Known pitfalls › Paths).
import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { AppError, newId } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { and, eq } from 'drizzle-orm'
import type { MetadataDeps } from './context.ts'
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
  deps: Pick<MetadataDeps, 'db' | 'clock' | 'logger' | 'imagesDir'>,
  client: TmdbClient,
  baseUrl: () => string,
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

  async function fetchAndStore(ref: ImageRef): Promise<CachedImage> {
    const path = fileFor(ref.size, ref.file)
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

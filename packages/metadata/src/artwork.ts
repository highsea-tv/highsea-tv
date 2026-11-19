// SPDX-License-Identifier: AGPL-3.0-only
// Artwork an admin chose (HT-66, ADR 0030's 2026-11-18 section): a title's poster, backdrop or logo
// picked from TMDB's other images or fanart.tv's (HT-74, ADR 0070), or uploaded, in place of highsea's automatic choice. The choice
// is a row in `artwork`, applied wherever the title's art is mapped (map.ts's `ArtPick`), so a
// refresh, which replaces only the cached TMDB response, never undoes it; Reset deletes the row.
// An upload's checks are artwork-check.ts's.
import { newId } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { and, eq } from 'drizzle-orm'
import { type ArtworkKind, type ArtworkOwner, checkArtwork } from './artwork-check.ts'
import type { ArtPick } from './map.ts'
import type { TmdbImage, TmdbImages } from './tmdb/types.ts'

export * from './artwork-check.ts'

const { artwork } = schema

export type ArtworkChoice = {
  kind: ArtworkKind
  source: 'tmdb' | 'fanart' | 'upload'
  file: string
  language: string | null
  width: number | null
  height: number | null
  chosenBy: string | null
  chosenAt: number
}

/** One of TMDB's or fanart.tv's images for a kind, as the picker lists it. */
export type ArtworkOption = {
  source: 'tmdb' | 'fanart'
  file: string
  language: string | null
  width: number
  height: number
  /** TMDB's votes; null for fanart.tv's. */
  voteAverage: number | null
  voteCount: number | null
  /** fanart.tv's likes; null for TMDB's. */
  likes: number | null
}

const RASTER = /^\/[A-Za-z0-9_-]{1,100}\.(jpg|jpeg|png|webp)$/

/** TMDB's images for a kind, best voted first, raster only (SVG isn't served). */
export function optionsOf(images: TmdbImages, kind: ArtworkKind): ArtworkOption[] {
  const list: TmdbImage[] =
    (kind === 'poster' ? images.posters : kind === 'backdrop' ? images.backdrops : images.logos) ??
    []
  return list
    .filter((i) => RASTER.test(i.file_path))
    .sort(
      (a, b) =>
        (b.vote_average ?? 0) - (a.vote_average ?? 0) || (b.vote_count ?? 0) - (a.vote_count ?? 0),
    )
    .map((i) => ({
      source: 'tmdb' as const,
      file: i.file_path,
      language: i.iso_639_1 ?? null,
      width: i.width,
      height: i.height,
      voteAverage: i.vote_average ?? 0,
      voteCount: i.vote_count ?? 0,
      likes: null,
    }))
}

/** Uploads' file names start `hs_`, which TMDB's never do. */
export const UPLOAD_PREFIX = 'hs'

type Deps = { db: import('@highsea-tv/db').Db; clock: { now(): number } }

export function createArtwork({ db, clock }: Deps) {
  /** Every choice, by `owner:id:kind`: a few rows, read once and kept until one changes. */
  let byKey: Map<string, string> | null = null
  const key = (owner: string, id: number, kind: string) => `${owner}:${id}:${kind}`

  const pick: ArtPick = (owner, id, kind) => {
    if (!byKey)
      byKey = new Map(
        db
          .select({
            ownerType: artwork.ownerType,
            ownerId: artwork.ownerId,
            kind: artwork.kind,
            file: artwork.file,
          })
          .from(artwork)
          .all()
          .map((r) => [key(r.ownerType, r.ownerId, r.kind), r.file]),
      )
    return byKey.get(key(owner, id, kind))
  }

  const where = (owner: ArtworkOwner, id: number, kind: ArtworkKind) =>
    and(eq(artwork.ownerType, owner), eq(artwork.ownerId, id), eq(artwork.kind, kind))

  function choices(owner: ArtworkOwner, id: number): ArtworkChoice[] {
    return db
      .select({
        kind: artwork.kind,
        source: artwork.source,
        file: artwork.file,
        language: artwork.language,
        width: artwork.width,
        height: artwork.height,
        chosenBy: artwork.chosenBy,
        chosenAt: artwork.chosenAt,
      })
      .from(artwork)
      .where(and(eq(artwork.ownerType, owner), eq(artwork.ownerId, id)))
      .all()
      .flatMap((r) =>
        r.kind === 'poster' || r.kind === 'backdrop' || r.kind === 'logo' ? [r] : [],
      )
  }

  /** Writes a choice in place of any before it; returns the replaced upload's file, to remove. */
  function put(
    owner: ArtworkOwner,
    id: number,
    kind: ArtworkKind,
    row: Omit<typeof artwork.$inferInsert, 'ownerType' | 'ownerId' | 'kind' | 'chosenAt'>,
  ) {
    const before = db
      .select({ source: artwork.source, file: artwork.file })
      .from(artwork)
      .where(where(owner, id, kind))
      .get()
    const values = { ...row, ownerType: owner, ownerId: id, kind, chosenAt: clock.now() }
    db.insert(artwork)
      .values(values)
      .onConflictDoUpdate({
        target: [artwork.ownerType, artwork.ownerId, artwork.kind],
        set: values,
      })
      .run()
    byKey = null
    return before?.source === 'upload' && before.file !== row.file ? before.file : null
  }

  return {
    pick,
    choices,
    /** Chooses one of TMDB's or fanart.tv's images (already checked to be among the title's). */
    chooseOption(
      owner: ArtworkOwner,
      id: number,
      kind: ArtworkKind,
      option: ArtworkOption,
      by: string | null,
    ) {
      return put(owner, id, kind, {
        source: option.source,
        file: option.file,
        language: option.language,
        width: option.width,
        height: option.height,
        data: null,
        contentType: null,
        chosenBy: by,
      })
    },
    /** Keeps an upload, under a name of its own, so its address is new. */
    upload(
      owner: ArtworkOwner,
      id: number,
      kind: ArtworkKind,
      bytes: Uint8Array,
      by: string | null,
    ) {
      const checked = checkArtwork(kind, bytes)
      const file = `/${newId(UPLOAD_PREFIX)}.${checked.type === 'image/png' ? 'png' : 'jpg'}`
      const replaced = put(owner, id, kind, {
        source: 'upload',
        file,
        language: null,
        width: checked.width,
        height: checked.height,
        data: Buffer.from(bytes),
        contentType: checked.type,
        chosenBy: by,
      })
      return { file, replaced }
    },
    /** Back to the automatic choice; returns the upload's file when one was removed. */
    reset(owner: ArtworkOwner, id: number, kind: ArtworkKind) {
      const before = db
        .select({ source: artwork.source, file: artwork.file })
        .from(artwork)
        .where(where(owner, id, kind))
        .get()
      if (!before) return { removed: false, upload: null }
      db.delete(artwork)
        .where(where(owner, id, kind))
        .run()
      byKey = null
      return { removed: true, upload: before.source === 'upload' ? before.file : null }
    },
    /** An upload's original, by its file name; null when it isn't one. */
    uploaded(file: string) {
      const row = db
        .select({ data: artwork.data, contentType: artwork.contentType, width: artwork.width })
        .from(artwork)
        .where(and(eq(artwork.file, file), eq(artwork.source, 'upload')))
        .get()
      return row?.data
        ? {
            data: new Uint8Array(row.data),
            contentType: row.contentType ?? 'image/png',
            width: row.width,
          }
        : null
    },
  }
}

export type Artwork = ReturnType<typeof createArtwork>
